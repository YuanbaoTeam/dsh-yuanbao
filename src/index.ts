import type { Context } from '@deepseek-ai/cordis';
import { ConfigSchema } from './config.js';
import type { DshAgentRegistry, YuanbaoDshConfig } from './types.js';
import { createLog } from './logger.js';
import { YuanbaoDshBridge } from './bridge.js';
import { loadLocalEnv, resolveEnvConfig } from './env-loader.js';

export const name = 'dsh-yuanbao';
export const inject = ['agents', 'sessionPersistence', 'agentDefaultModel'];
export const Config = ConfigSchema;

export async function apply(ctx: Context, config: YuanbaoDshConfig): Promise<void> {
  const rootSink = ((ctx as unknown as Record<string, unknown>).logger as Partial<Console>) ?? undefined;
  const logger = createLog('main', rootSink);
  const loadedEnvFiles = loadLocalEnv();
  const resolvedConfig = resolveEnvConfig(config);
  logger.info(`apply() called; envFiles=${loadedEnvFiles.length}; appKey=${resolvedConfig.appKey ? 'set' : 'missing'}; secret=${resolvedConfig.appSecret ? 'set' : 'missing'}; token=${resolvedConfig.token ? 'set' : 'missing'}`);

  const agents = (ctx as unknown as Record<string, unknown>).agents as DshAgentRegistry | undefined;
  if (!agents) {
    logger.error('ctx.agents is required but unavailable');
    return;
  }

  const bridge = new YuanbaoDshBridge(ctx, agents, resolvedConfig, rootSink);
  ctx.effect(() => {
    void bridge.start().catch(error => {
      logger.error(`failed to start Yuanbao DSH bridge: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      void bridge.stop().catch(error => {
        logger.warn(`failed to stop Yuanbao DSH bridge: ${error instanceof Error ? error.message : String(error)}`);
      });
    };
  });
}
