import type { Context } from '@deepseek-ai/cordis';
import type { DshAgentRegistry, Logger, ResolvedYuanbaoAccount, YuanbaoDshConfig } from './types.js';
import { createLog, type LogSink } from './logger.js';
import { YuanbaoGateway } from './gateway/index.js';
import { SessionManager } from './session/manager.js';
import { YuanbaoSender } from './transport/sender.js';
import { createOutboundHandler } from './transport/outbound.js';
import { handleInbound } from './inbound.js';

export class YuanbaoDshBridge {
  private gateway: YuanbaoGateway | undefined;
  private manager: SessionManager | undefined;
  private disposeOutbound: (() => void) | undefined;
  private readonly logger: Logger;

  constructor(
    private readonly ctx: Context,
    private readonly agents: DshAgentRegistry,
    private readonly config: YuanbaoDshConfig,
    private readonly logSink: LogSink,
  ) {
    this.logger = createLog('bridge', logSink);
  }

  async start(): Promise<void> {
    const sessionLogger = createLog('session', this.logSink);
    const inboundLogger = createLog('inbound', this.logSink);
    const senderLogger = createLog('sender', this.logSink);
    const outboundLogger = createLog('outbound', this.logSink);
    const gatewayLogger = createLog('gateway', this.logSink);
    const manager = new SessionManager(this.ctx, this.agents, this.config, sessionLogger);
    this.manager = manager;

    const gateway = new YuanbaoGateway(this.config, gatewayLogger, this.logSink, ({ msg, isGroup, client, account }) => {
      const sender = new YuanbaoSender(client, account, senderLogger);
      void handleInbound({ msg, isGroup, manager, sender, config: this.config, logger: inboundLogger })
        .catch(error => {
          this.logger.error(`handle inbound failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        });
    });
    this.gateway = gateway;

    const client = await gateway.start();
    if (!client) return;

    const account = gatewayAccountFromConfig(this.config);
    const sender = new YuanbaoSender(client, account, senderLogger);
    const outboundHandler = createOutboundHandler(manager, sender, this.config, outboundLogger);
    const dispose = (this.ctx as unknown as { on(event: string, handler: (...args: unknown[]) => void): void | (() => void) })
      .on('session/event', outboundHandler as (...args: unknown[]) => void);
    this.disposeOutbound = typeof dispose === 'function' ? dispose : undefined;
  }

  async stop(): Promise<void> {
    this.disposeOutbound?.();
    this.disposeOutbound = undefined;
    this.gateway?.stop();
    this.gateway = undefined;
    await this.manager?.disposeAll();
    this.manager = undefined;
  }
}

function gatewayAccountFromConfig(config: YuanbaoDshConfig): ResolvedYuanbaoAccount {
  return {
    accountId: 'default',
    enabled: true,
    configured: Boolean(config.token || (config.appKey && config.appSecret)),
    appKey: config.appKey || undefined,
    appSecret: config.appSecret || undefined,
    token: config.token || undefined,
    botId: config.botId || undefined,
    apiDomain: config.apiDomain,
    wsGatewayUrl: config.wsGatewayUrl,
    routeEnv: config.routeEnv,
    wsMaxReconnectAttempts: config.maxReconnectAttempts,
    config,
  };
}
