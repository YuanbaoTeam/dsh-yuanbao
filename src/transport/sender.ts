import type { YuanbaoWsClient } from '../gateway/protocol/client.js';
import type { WsHeartbeatValue } from '../gateway/protocol/types.js';
import { WS_HEARTBEAT_GROUP_DISSOLVED_CODE } from '../gateway/protocol/types.js';
import type { Logger, ReplyTarget, ResolvedYuanbaoAccount, YuanbaoMsgBodyElement } from '../types.js';

export class YuanbaoSender {
  constructor(
    private readonly client: YuanbaoWsClient,
    private readonly account: ResolvedYuanbaoAccount,
    private readonly logger: Logger,
  ) {}

  async sendText(target: ReplyTarget, text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.logger.info(`sender sendText: target=${target.scope}:${target.targetId}; chars=${trimmed.length}`);
    await this.sendRaw(target, [{ msg_type: 'TIMTextElem', msg_content: { text: trimmed } }]);
  }

  async sendRaw(target: ReplyTarget, msgBody: YuanbaoMsgBodyElement[]): Promise<void> {
    if (target.scope === 'group') {
      const groupCode = target.groupCode ?? target.targetId;
      this.logger.info(`sender sendGroupMessage: group=${groupCode}; body=${msgBody.length}`);
      const result = await this.client.sendGroupMessage({
        group_code: groupCode,
        msg_body: msgBody,
        random: String(Math.floor(Math.random() * 4294967295)),
        ...(target.fromAccount ? { from_account: target.fromAccount } : {}),
        ...(target.refMsgId ? { ref_msg_id: target.refMsgId, msg_id: target.refMsgId } : {}),
        ...(target.traceId ? { trace_id: target.traceId } : {}),
      });
      if (result.code !== 0) {
        this.logger.warn(`send group message failed: code=${result.code}, message=${result.message}`);
      }
      return;
    }

    this.logger.info(`sender sendC2CMessage: to=${target.targetId}; body=${msgBody.length}`);
    const result = await this.client.sendC2CMessage({
      to_account: target.targetId,
      msg_body: msgBody,
      msg_random: Math.floor(Math.random() * 4294967295),
      ...(target.fromAccount ? { from_account: target.fromAccount } : {}),
      ...(target.groupCode ? { group_code: target.groupCode } : {}),
      ...(target.traceId ? { trace_id: target.traceId } : {}),
    });
    if (result.code !== 0) {
      this.logger.warn(`send c2c message failed: code=${result.code}, message=${result.message}`);
    }
  }

  async sendHeartbeat(target: ReplyTarget, heartbeat: WsHeartbeatValue, sendTime: number): Promise<void> {
    const fromAccount = target.fromAccount || this.account.botId || '';
    if (!fromAccount) {
      this.logger.warn(`reply heartbeat skipped: missing fromAccount; target=${target.scope}:${target.targetId}`);
      return;
    }

    if (target.scope === 'group') {
      const groupCode = target.groupCode ?? target.targetId;
      this.logger.debug(`sender sendGroupHeartbeat: group=${groupCode}; heartbeat=${heartbeat}`);
      const result = await this.client.sendGroupHeartbeat({
        from_account: fromAccount,
        to_account: target.refFromAccount || target.targetId,
        group_code: groupCode,
        send_time: sendTime,
        heartbeat,
      });
      if (result.code !== 0) {
        this.logger.warn(`send group heartbeat failed: code=${result.code}, message=${result.msg ?? result.message ?? ''}`);
        if (result.code === WS_HEARTBEAT_GROUP_DISSOLVED_CODE) {
          this.logger.warn(`send group heartbeat stopped: group dissolved; group=${groupCode}`);
        }
      }
      return;
    }

    this.logger.debug(`sender sendPrivateHeartbeat: to=${target.targetId}; heartbeat=${heartbeat}`);
    const result = await this.client.sendPrivateHeartbeat({
      from_account: fromAccount,
      to_account: target.targetId,
      heartbeat,
    });
    if (result.code !== 0) {
      this.logger.warn(`send c2c heartbeat failed: code=${result.code}, message=${result.msg ?? result.message ?? ''}`);
    }
  }

  getAccount(): ResolvedYuanbaoAccount {
    return this.account;
  }
}
