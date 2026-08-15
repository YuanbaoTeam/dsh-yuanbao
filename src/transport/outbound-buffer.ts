import type { Logger, SessionRecord } from '../types.js';
import { chunkText } from './chunker.js';
import type { YuanbaoSender } from './sender.js';

export class OutboundBuffer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  text = '';

  constructor(
    private readonly record: SessionRecord,
    private readonly sender: YuanbaoSender,
    private readonly limit: number,
    private readonly logger: Logger,
    private readonly idleMs = 1200,
  ) {}

  append(delta: string): void {
    if (this.closed) return;
    this.text += delta;
    if (this.text.length >= this.limit) {
      void this.flush();
      return;
    }
    this.schedule();
  }

  async flush(): Promise<void> {
    if (this.closed) return;
    const body = this.text;
    this.text = '';
    this.clearTimer();
    if (!body.trim()) return;
    this.logger.info(`outbound buffer flush: session=${this.record.sessionId}; chars=${body.length}`);
    for (const chunk of chunkText(body, this.limit)) {
      await this.sender.sendText(this.record.replyTarget, chunk).catch(error => {
        this.logger.error(`send chunk failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  cancel(): void {
    this.closed = true;
    this.clearTimer();
    this.text = '';
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => void this.flush(), this.idleMs);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
