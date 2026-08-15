import { getSignToken, clearTokenCache } from './auth.js';
import { decodeInboundMessage } from './protocol/biz-codec.js';
import { YuanbaoWsClient } from './protocol/client.js';
import type { WsAuthBindResult, WsClientState, WsPushEvent } from './protocol/types.js';
import type { Logger, ResolvedYuanbaoAccount, YuanbaoDshConfig, YuanbaoInboundMessage, YuanbaoMsgBodyElement } from '../types.js';
import type { LogSink } from '../logger.js';

export type GatewayDispatch = {
  msg: YuanbaoInboundMessage;
  isGroup: boolean;
  client: YuanbaoWsClient;
  account: ResolvedYuanbaoAccount;
};

export class YuanbaoGateway {
  private client: YuanbaoWsClient | undefined;

  constructor(
    private readonly config: YuanbaoDshConfig,
    private readonly logger: Logger,
    private readonly logSink: LogSink,
    private readonly onDispatch: (event: GatewayDispatch) => void,
  ) {}

  async start(): Promise<YuanbaoWsClient | undefined> {
    const account = this.resolveAccount();
    this.logger.info(`gateway start; configured=${account.configured}; ws=${account.wsGatewayUrl}`);
    if (!account.enabled || !account.configured) {
      this.logger.warn('channel inactive: missing YUANBAO_APP_KEY/YUANBAO_APP_SECRET or YUANBAO_TOKEN');
      return undefined;
    }

    const auth = await this.resolveAuth(account);
    this.logger.info(`Yuanbao WS state: connecting; botId=${auth.uid || 'pending'}`);
    let client: YuanbaoWsClient;
    client = new YuanbaoWsClient({
      connection: {
        gatewayUrl: account.wsGatewayUrl,
        auth,
      },
      config: {
        maxReconnectAttempts: account.wsMaxReconnectAttempts,
      },
      callbacks: {
        onReady: data => this.onReady(account, data),
        onDispatch: pushEvent => this.handlePush(account, client, pushEvent),
        onStateChange: state => this.onStateChange(state),
        onError: error => this.logger.error(`WebSocket error: ${error.message}`),
        onClose: (code, reason) => this.logger.info(`WebSocket closed: code=${code}, reason=${reason}`),
        onKickout: data => this.logger.warn(`Yuanbao gateway kickout: status=${data.status}, reason=${data.reason}`),
        onAuthFailed: async code => {
          this.logger.warn(`Yuanbao auth failed: code=${code}, refreshing token`);
          clearTokenCache(account.accountId);
          const tokenData = await getSignToken(account, this.logger);
          if (tokenData.bot_id) account.botId = tokenData.bot_id;
          return {
            bizId: 'ybBot',
            uid: tokenData.bot_id || account.botId || '',
            source: tokenData.source || 'bot',
            token: tokenData.token,
            routeEnv: account.routeEnv,
          };
        },
      },
      log: this.logSink,
    });

    this.client = client;
    client.connect();
    return client;
  }

  stop(): void {
    this.client?.disconnect();
    this.client = undefined;
  }

  getClient(): YuanbaoWsClient | undefined {
    return this.client;
  }

  private resolveAccount(): ResolvedYuanbaoAccount {
    const token = this.config.token?.trim();
    return {
      accountId: 'default',
      enabled: true,
      configured: Boolean(token || (this.config.appKey && this.config.appSecret)),
      appKey: this.config.appKey || undefined,
      appSecret: this.config.appSecret || undefined,
      token: token || undefined,
      botId: this.config.botId || undefined,
      apiDomain: this.config.apiDomain,
      wsGatewayUrl: this.config.wsGatewayUrl,
      routeEnv: this.config.routeEnv,
      wsMaxReconnectAttempts: this.config.maxReconnectAttempts,
      config: this.config,
    };
  }

  private async resolveAuth(account: ResolvedYuanbaoAccount) {
    const tokenData = await getSignToken(account, this.logger);
    if (tokenData.bot_id) account.botId = tokenData.bot_id;
    return {
      bizId: 'ybBot',
      uid: tokenData.bot_id || account.botId || '',
      source: tokenData.source || 'bot',
      token: tokenData.token,
      routeEnv: account.routeEnv,
    };
  }

  private onReady(account: ResolvedYuanbaoAccount, data: WsAuthBindResult): void {
    this.logger.info(`Yuanbao WS ready: connectId=${data.connectId}`);
    this.logger.info(`[${account.accountId}] Yuanbao WS ready: connectId=${data.connectId}`);
  }

  private onStateChange(state: WsClientState): void {
    this.logger.info(`Yuanbao WS state: ${state}`);
    this.logger.info(`Yuanbao WS state: ${state}`);
  }

  private handlePush(account: ResolvedYuanbaoAccount, client: YuanbaoWsClient, pushEvent: WsPushEvent): void {
    this.logger.info(`gateway dispatch received: cmd=${pushEvent.cmd ?? ''}; module=${pushEvent.module ?? ''}; type=${pushEvent.type ?? ''}; msgId=${pushEvent.msgId ?? ''}; raw=${pushEvent.rawData?.length ?? 0}; conn=${pushEvent.connData?.length ?? 0}; content=${typeof pushEvent.content === 'string' ? pushEvent.content.length : 0}`);
    const converted = wsPushToInboundMessage(pushEvent, this.logger);
    if (!converted) {
      this.logger.warn('gateway dispatch dropped: decode failed');
      return;
    }
    this.logger.info(`gateway dispatch decoded: chat=${converted.chatType}; from=${converted.msg.from_account ?? ''}; to=${converted.msg.to_account ?? ''}; group=${converted.msg.group_code ?? ''}; body=${converted.msg.msg_body?.length ?? 0}; callback=${converted.msg.callback_command ?? ''}`);
    this.onDispatch({ msg: converted.msg, isGroup: converted.chatType === 'group', client, account });
  }
}

type InboundResult = { msg: YuanbaoInboundMessage; chatType: 'c2c' | 'group' };

function parsePushContentToMsgBody(content: unknown): YuanbaoMsgBodyElement[] | undefined {
  if (typeof content !== 'string' || !content.trim()) return undefined;
  try {
    const parsed = JSON.parse(content) as { msg_body?: YuanbaoMsgBodyElement[]; text?: string };
    if (Array.isArray(parsed.msg_body)) return parsed.msg_body;
    if (parsed.text) return [{ msg_type: 'TIMTextElem', msg_content: { text: parsed.text } }];
  } catch {
    return [{ msg_type: 'TIMTextElem', msg_content: { text: content } }];
  }
  return undefined;
}

function inferChatType(msg: Record<string, unknown>): 'c2c' | 'group' {
  if (msg.group_code) return 'group';
  const cmd = msg.callback_command as string | undefined;
  if (cmd?.startsWith('Group.')) return 'group';
  return 'c2c';
}

function hasValidMsgFields(msg: Record<string, unknown>): boolean {
  return Boolean(msg.callback_command || msg.from_account || msg.msg_body);
}

function decodeFromProtobuf(rawData: Uint8Array, pushType: string, logger?: Logger): InboundResult | null {
  const decoded = decodeInboundMessage(rawData) as Record<string, unknown> | null;
  if (!decoded || !hasValidMsgFields(decoded)) return null;
  logger?.debug(`WS push decoded from protobuf: type=${pushType}`);
  return { msg: decoded as YuanbaoInboundMessage, chatType: inferChatType(decoded) };
}

function decodeFromRawDataJson(rawData: Uint8Array, pushType: string, logger?: Logger): InboundResult | null {
  try {
    const rawJson = JSON.parse(new TextDecoder().decode(rawData)) as Record<string, unknown>;
    if (!rawJson || !hasValidMsgFields(rawJson)) return null;
    if (!rawJson.trace_id) rawJson.trace_id = (rawJson.log_ext as { trace_id?: string } | undefined)?.trace_id;
    logger?.debug(`WS push decoded from json: type=${pushType}`);
    return { msg: rawJson as YuanbaoInboundMessage, chatType: inferChatType(rawJson) };
  } catch {
    return null;
  }
}

function decodeFromContent(pushEvent: WsPushEvent): InboundResult | null {
  const msgBody = parsePushContentToMsgBody(pushEvent.content);
  if (!msgBody) return null;
  let parsedContent: Record<string, unknown> = {};
  try {
    parsedContent = JSON.parse(pushEvent.content as string) as Record<string, unknown>;
  } catch {
    parsedContent = {};
  }
  const chatType = parsedContent.group_code ? 'group' : 'c2c';
  const logExt = parsedContent.log_ext as { trace_id?: string } | undefined;
  return {
    msg: {
      callback_command: chatType === 'group' ? 'Group.CallbackAfterSendMsg' : 'C2C.CallbackAfterSendMsg',
      from_account: parsedContent.from_account as string | undefined,
      to_account: parsedContent.to_account as string | undefined,
      group_code: parsedContent.group_code as string | undefined,
      msg_body: msgBody,
      msg_key: parsedContent.msg_key as string | undefined,
      msg_id: parsedContent.msg_id as string | undefined,
      msg_seq: parsedContent.msg_seq as number | undefined,
      msg_time: parsedContent.msg_time as number | undefined,
      trace_id: logExt?.trace_id ?? (parsedContent.trace_id as string | undefined),
      seq_id: parsedContent.seq_id as string | undefined,
    },
    chatType,
  };
}

export function wsPushToInboundMessage(pushEvent: WsPushEvent, logger?: Logger): InboundResult | null {
  logger?.info(`decode push: cmd=${pushEvent.cmd ?? ''}; module=${pushEvent.module ?? ''}; type=${pushEvent.type ?? ''}; raw=${pushEvent.rawData?.length ?? 0}; conn=${pushEvent.connData?.length ?? 0}; content=${typeof pushEvent.content === 'string' ? pushEvent.content.length : 0}`);
  if (pushEvent.connData && pushEvent.connData.length > 0) {
    const result = decodeFromProtobuf(pushEvent.connData, String(pushEvent.type ?? 'connData'), logger);
    if (result) return result;
  }

  if (pushEvent.rawData && pushEvent.rawData.length > 0) {
    const pushType = String(pushEvent.type ?? 'rawData');
    const result = decodeFromProtobuf(pushEvent.rawData, pushType, logger)
      ?? decodeFromRawDataJson(pushEvent.rawData, pushType, logger);
    if (result) return result;
    logger?.warn(`WS push decode failed: type=${pushType}`);
  }

  if (pushEvent.content) return decodeFromContent(pushEvent);
  return null;
}
