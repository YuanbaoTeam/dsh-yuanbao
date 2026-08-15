import type { Logger, SessionRecord, SessionEventLike, YuanbaoDshConfig } from '../types.js';
import type { SessionManager } from '../session/manager.js';
import { OutboundBuffer } from './outbound-buffer.js';
import type { YuanbaoSender } from './sender.js';
import { chunkText } from './chunker.js';

export type SessionLike = { header?: { id?: string }; id?: string };

export function createOutboundHandler(
  manager: SessionManager,
  sender: YuanbaoSender,
  config: YuanbaoDshConfig,
  logger: Logger,
): (session: SessionLike, event: SessionEventLike) => void {
  const buffers = new Map<string, OutboundBuffer>();

  return (session, event) => {
    const sessionId = session.header?.id ?? session.id;
    if (!sessionId) {
      logger.warn(`outbound event dropped: missing sessionId; type=${event.type}`);
      return;
    }
    const record = manager.findBySessionId(sessionId);
    if (!record) return;
    if (event.type === 'assistant/message' || event.type === 'turn/end') {
      logger.info(`outbound event: type=${event.type}; session=${sessionId}; target=${record.replyTarget.scope}:${record.replyTarget.targetId}`);
    }

    switch (event.type) {
      case 'assistant/chunk':
        handleChunk(sessionId, record, event, buffers, sender, config, logger);
        break;
      case 'assistant/message':
        handleMessage(sessionId, record, event, buffers, sender, config, logger);
        break;
      case 'turn/end':
        handleTurnEnd(sessionId, record, event, buffers, sender, logger);
        break;
      default:
        break;
    }
  };
}

function handleChunk(
  sessionId: string,
  record: SessionRecord,
  event: SessionEventLike,
  buffers: Map<string, OutboundBuffer>,
  sender: YuanbaoSender,
  config: YuanbaoDshConfig,
  logger: Logger,
): void {
  const data = event.data ?? event;
  const chunk = data.chunk as { type?: string; text?: string } | undefined;
  if (!chunk || chunk.type !== 'text-delta' || !chunk.text) {
    return;
  }
  logger.info(`outbound text delta: session=${sessionId}; chars=${chunk.text.length}`);

  let buffer = buffers.get(sessionId);
  if (!buffer) {
    buffer = new OutboundBuffer(record, sender, config.textChunkLimit, logger);
    buffers.set(sessionId, buffer);
  }
  buffer.append(chunk.text);
}

function handleMessage(
  sessionId: string,
  record: SessionRecord,
  event: SessionEventLike,
  buffers: Map<string, OutboundBuffer>,
  sender: YuanbaoSender,
  config: YuanbaoDshConfig,
  logger: Logger,
): void {
  const buffer = buffers.get(sessionId);
  if (buffer && buffer.text.trim()) {
    void buffer.flush();
    buffers.delete(sessionId);
    return;
  }

  const data = event.data ?? event;
  const message = (data.message ?? event.message) as { content?: Array<{ type: string; text?: string }> } | undefined;
  const blocks = message?.content;
  if (!Array.isArray(blocks)) {
    logger.warn(`outbound assistant/message ignored: missing content blocks; session=${sessionId}`);
    return;
  }

  const text = blocks
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n')
    .trim();
  if (!text) {
    logger.warn(`outbound assistant/message ignored: empty text; session=${sessionId}; blocks=${blocks.length}`);
    return;
  }

  logger.info(`outbound assistant/message text: session=${sessionId}; chars=${text.length}; blocks=${blocks.length}`);
  void (async () => {
    for (const chunk of chunkText(text, config.textChunkLimit)) {
      await sender.sendText(record.replyTarget, chunk);
    }
  })().catch(error => {
    logger.error(`send assistant message failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function handleTurnEnd(
  sessionId: string,
  record: SessionRecord,
  event: SessionEventLike,
  buffers: Map<string, OutboundBuffer>,
  sender: YuanbaoSender,
  logger: Logger,
): void {
  const data = event.data ?? event;
  const reason = data.reason as { kind?: string; error?: { message?: string; code?: string }; reason?: { kind?: string } } | undefined;
  logger.info(`turn end reason: session=${sessionId}; reason=${safeJson(reason)}`);

  const buffer = buffers.get(sessionId);
  if (buffer) {
    void buffer.flush();
    buffers.delete(sessionId);
  }

  record.replyHeartbeat?.finishIfNeeded();
  record.replyHeartbeat = undefined;

  if (reason?.kind === 'error') {
    const message = reason.error?.message ?? 'Unknown agent error';
    void sender.sendText(record.replyTarget, `Agent error: ${message}`).catch(error => {
      logger.error(`send turn error failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
