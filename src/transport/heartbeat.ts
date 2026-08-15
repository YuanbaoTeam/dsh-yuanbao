import { WS_HEARTBEAT } from '../gateway/protocol/types.js';
import type { Logger, ReplyTarget } from '../types.js';
import type { YuanbaoSender } from './sender.js';

const DEFAULT_RUNNING_HEARTBEAT_INTERVAL_MS = 2_000;

export interface ReplyHeartbeatController {
  emitRunning(): void;
  finishIfNeeded(): void;
  stop(): void;
}

export function createReplyHeartbeatController(params: {
  sender: YuanbaoSender;
  target: ReplyTarget;
  logger: Logger;
  runningIntervalMs?: number;
}): ReplyHeartbeatController {
  const { sender, target, logger } = params;
  const runningIntervalMs = params.runningIntervalMs ?? DEFAULT_RUNNING_HEARTBEAT_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let startedAt = 0;
  let runningEverStarted = false;
  let finishEmitted = false;

  const clearTimer = (): void => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const stop = (): void => {
    active = false;
    startedAt = 0;
    clearTimer();
  };

  const sendRunning = (): void => {
    if (!active || finishEmitted) return;

    void sender.sendHeartbeat(target, WS_HEARTBEAT.RUNNING, startedAt).catch(error => {
      logger.warn(`reply heartbeat RUNNING failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    timer = setTimeout(sendRunning, runningIntervalMs);
  };

  const emitRunning = (): void => {
    if (finishEmitted) return;
    runningEverStarted = true;
    if (active) return;
    active = true;
    startedAt = Date.now();
    logger.info(`reply heartbeat started: target=${target.scope}:${target.targetId}`);
    sendRunning();
  };

  const finishIfNeeded = (): void => {
    stop();
    if (!runningEverStarted || finishEmitted) return;
    finishEmitted = true;
    logger.info(`reply heartbeat finished: target=${target.scope}:${target.targetId}`);
    void sender.sendHeartbeat(target, WS_HEARTBEAT.FINISH, Date.now()).catch(error => {
      logger.warn(`reply heartbeat FINISH failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  };

  return {
    emitRunning,
    finishIfNeeded,
    stop,
  };
}
