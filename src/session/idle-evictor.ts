import type { Logger } from '../types.js';
import type { SessionManager } from './manager.js';

export class IdleEvictor {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly manager: SessionManager,
    private readonly timeoutMs: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timeoutMs <= 0 || this.timer) return;
    const interval = Math.min(Math.max(Math.floor(this.timeoutMs / 2), 60_000), 5 * 60_000);
    this.timer = setInterval(() => {
      void this.manager.evictIdle(Date.now() - this.timeoutMs).catch(error => {
        this.logger.warn(`idle eviction failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, interval);
    this.timer.unref?.();
  }

  dispose(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
