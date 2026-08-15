import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type {
  ChatScope,
  Logger,
  ReplyTarget,
  YuanbaoDshConfig,
  YuanbaoInboundMessage,
  YuanbaoMsgBodyElement,
} from './types.js';
import type { SessionManager } from './session/manager.js';
import type { YuanbaoSender } from './transport/sender.js';
import { createReplyHeartbeatController } from './transport/heartbeat.js';
import { handleBuiltinCommand } from './commands.js';

export async function handleInbound(params: {
  msg: YuanbaoInboundMessage;
  isGroup: boolean;
  manager: SessionManager;
  sender: YuanbaoSender;
  config: YuanbaoDshConfig;
  logger: Logger;
}): Promise<void> {
  const { msg, isGroup, manager, sender, config, logger } = params;
  const scope: ChatScope = isGroup ? 'group' : 'c2c';
  const peerId = isGroup ? msg.group_code : msg.from_account;
  const senderId = msg.from_account;
  logger.info(`inbound received: scope=${scope}; peer=${peerId ?? ''}; sender=${senderId ?? ''}; to=${msg.to_account ?? ''}; msgId=${msg.msg_id ?? ''}; body=${msg.msg_body?.length ?? 0}`);
  if (!peerId || !senderId) {
    logger.warn(`inbound dropped: missing peerId or senderId; scope=${scope}; peer=${peerId ?? ''}; sender=${senderId ?? ''}`);
    logger.warn('drop inbound message: missing peerId or senderId');
    return;
  }

  if (!allowed(config, scope, peerId, senderId)) {
    logger.warn(`inbound dropped: access denied; scope=${scope}; peer=${peerId}; sender=${senderId}`);
    logger.warn(`drop inbound message by access policy: scope=${scope}, peer=${peerId}, sender=${senderId}`);
    return;
  }

  const msgBody = msg.msg_body ?? [];
  const extracted = extractText(msgBody);
  const botIdentity = config.botId || msg.to_account || '';
  const mentioned = detectMention(msgBody, extracted, botIdentity);
  logger.info(`inbound text extracted: chars=${extracted.length}; requireMention=${scope === 'group' && config.requireMention ? 'yes' : 'no'}; mentioned=${mentioned ? 'yes' : 'no'}; botIdentity=${botIdentity || 'empty'}`);
  if (scope === 'group' && config.requireMention && !mentioned) {
    logger.warn(`inbound dropped: group message without mention; group=${peerId}; textPreview=${preview(extracted)}`);
    logger.debug(`drop group message without mention: group=${peerId}`);
    return;
  }

  const text = stripMention(extracted, botIdentity).trim();
  const replyTarget: ReplyTarget = {
    scope,
    targetId: peerId,
    groupCode: msg.group_code,
    fromAccount: msg.to_account || sender.getAccount().botId,
    refMsgId: msg.msg_id,
    refFromAccount: msg.from_account,
    traceId: msg.trace_id,
  };

  if (await handleBuiltinCommand({ text, scope, peerId, replyTarget, manager, sender, logger })) {
    logger.info(`inbound handled by builtin command: ${preview(text)}`);
    return;
  }

  const body = buildAgentBody({ msg, text, scope, mentioned, config });
  if (!body.trim()) {
    logger.warn('inbound dropped: empty agent body');
    return;
  }

  logger.info(`inbound enqueue: scope=${scope}; peer=${peerId}; bodyChars=${body.length}; preview=${preview(text)}`);
  await manager.enqueue(scope, peerId, async () => {
    const record = await manager.getOrCreate(scope, peerId, senderId, replyTarget);
    const content: ContentBlock[] = [{ type: 'text', text: body }];
    const message = createUserMessage({
      content,
      source: { kind: 'user' as const },
    });
    record.replyHeartbeat?.finishIfNeeded();
    record.replyHeartbeat = createReplyHeartbeatController({ sender, target: replyTarget, logger });
    record.replyHeartbeat.emitRunning();

    logger.info(`agent followup start: session=${record.sessionId}; scope=${scope}; peer=${peerId}`);
    record.agent.followup(message);
    logger.info(`agent followup sent: session=${record.sessionId}; scope=${scope}; peer=${peerId}`);
    logger.info(`followup sent: scope=${scope}, peer=${peerId}, session=${record.sessionId}`);
  });
}

function allowed(config: YuanbaoDshConfig, scope: ChatScope, peerId: string, senderId: string): boolean {
  if (scope === 'group') {
    if (config.access.groupMode === 'disabled') return false;
    if (config.access.groupMode === 'allowlist') return config.access.groupAllow.includes(peerId);
    return true;
  }
  if (config.access.c2cMode === 'disabled') return false;
  if (config.access.c2cMode === 'allowlist') return config.access.c2cAllow.includes(senderId);
  return true;
}

function extractText(body: YuanbaoMsgBodyElement[]): string {
  const parts: string[] = [];
  for (const elem of body) {
    const content = elem.msg_content ?? {};
    if (elem.msg_type === 'TIMTextElem' && content.text) {
      parts.push(String(content.text));
      continue;
    }
    if (content.text) parts.push(String(content.text));
    if (content.desc) parts.push(`[${elem.msg_type}: ${content.desc}]`);
    if (content.url) parts.push(`[${elem.msg_type}: ${content.file_name ?? content.url}]`);
    if (content.sound) parts.push('[voice message]');
  }
  return parts.join('\n').trim();
}

function detectMention(body: YuanbaoMsgBodyElement[], text: string, botId: string): boolean {
  if (botId && (text.includes(botId) || text.includes(`@${botId}`))) return true;
  return body.some(elem => {
    const content = elem.msg_content ?? {};
    if (elem.msg_type !== 'TIMCustomElem') return false;
    const desc = typeof content.desc === 'string' ? content.desc.trim() : '';
    return desc.startsWith('@');
  });
}

function stripMention(text: string, botId: string): string {
  const withoutKnownBot = botId
    ? text.replaceAll(`@${botId}`, '').replaceAll(botId, '')
    : text;
  return withoutKnownBot.replace(/\[TIMCustomElem:\s*.*?\]\s*/g, '').trim();
}

function preview(text: string, max = 120): string {
  return text.replace(/\s+/g, ' ').slice(0, max);
}

function buildAgentBody(params: {
  msg: YuanbaoInboundMessage;
  text: string;
  scope: ChatScope;
  mentioned: boolean;
  config: YuanbaoDshConfig;
}): string {
  const { msg, text, scope, mentioned, config } = params;
  const prompt = scope === 'group' ? config.groupPrompt : config.directPrompt;
  const header = scope === 'group'
    ? `[Yuanbao group message from ${msg.sender_nickname ?? msg.from_account ?? 'unknown'} in group ${msg.group_name ?? msg.group_code ?? 'unknown'}${mentioned ? ', mentioned bot' : ''}]`
    : `[Yuanbao direct message from ${msg.sender_nickname ?? msg.from_account ?? 'unknown'}]`;
  const metadata = [
    msg.msg_id ? `message_id: ${msg.msg_id}` : '',
    msg.trace_id ? `trace_id: ${msg.trace_id}` : '',
  ].filter(Boolean).join('\n');
  return [prompt, header, metadata ? `<metadata>\n${metadata}\n</metadata>` : '', text].filter(Boolean).join('\n\n');
}
