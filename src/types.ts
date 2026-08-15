import type { Context } from '@deepseek-ai/cordis';
import type { ReplyHeartbeatController } from './transport/heartbeat.js';

export type ChatScope = 'c2c' | 'group';

export type Logger = {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
};

export type AccessMode = 'open' | 'allowlist' | 'disabled';

export type AccessControlConfig = {
  c2cMode: AccessMode;
  c2cAllow: string[];
  groupMode: AccessMode;
  groupAllow: string[];
};

export type YuanbaoDshConfig = {
  appKey: string;
  appSecret: string;
  token?: string;
  apiDomain: string;
  wsGatewayUrl: string;
  routeEnv?: string;
  botId?: string;
  provider?: string;
  model?: string;
  preset?: string;
  cwd: string;
  requireMention: boolean;
  directPrompt?: string;
  groupPrompt?: string;
  textChunkLimit: number;
  sessionIdleTimeout: number;
  processingTimeoutMs: number;
  maxReconnectAttempts: number;
  access: AccessControlConfig;
  debug: boolean;
};

export type YuanbaoLogInfoExt = {
  trace_id?: string;
};

export type ImMsgSeq = {
  msg_seq?: number;
  msg_id?: string;
  msgId?: string;
};

export enum EnumCLawMsgType {
  CLAW_MSG_UNKNOWN = 0,
  CLAW_MSG_GROUP = 1,
  CLAW_MSG_PRIVATE = 2,
}

export type YuanbaoMsgBodyElement = {
  msg_type: string;
  msg_content: {
    text?: string;
    uuid?: string;
    image_format?: number;
    data?: string;
    desc?: string;
    ext?: string;
    sound?: string;
    image_info_array?: Array<{ type?: number; size?: number; width?: number; height?: number; url?: string }>;
    index?: number;
    url?: string;
    file_size?: number;
    file_name?: string;
    ext_map?: Record<string, string>;
    [key: string]: unknown;
  };
};

export type YuanbaoInboundMessage = {
  callback_command?: string;
  from_account?: string;
  to_account?: string;
  sender_nickname?: string;
  group_id?: string;
  group_code?: string;
  group_name?: string;
  msg_seq?: number;
  msg_random?: number;
  msg_time?: number;
  msg_key?: string;
  msg_id?: string;
  msg_body?: YuanbaoMsgBodyElement[];
  cloud_custom_data?: string;
  event_time?: number;
  bot_owner_id?: string;
  recall_msg_seq_list?: ImMsgSeq[];
  claw_msg_type?: EnumCLawMsgType;
  private_from_group_code?: string;
  trace_id?: string;
  seq_id?: string;
};

export type ResolvedYuanbaoAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  appKey?: string;
  appSecret?: string;
  apiDomain: string;
  wsGatewayUrl: string;
  token?: string;
  botId?: string;
  botOwnerId?: string;
  routeEnv?: string;
  wsMaxReconnectAttempts: number;
  config: YuanbaoDshConfig;
};

export type ReplyTarget = {
  scope: ChatScope;
  targetId: string;
  groupCode?: string;
  fromAccount?: string;
  refMsgId?: string;
  refFromAccount?: string;
  traceId?: string;
};

export type AgentSetup = (agentCtx: Context) => Promise<void> | void;

export type SessionEventLike = {
  type: string;
  seq?: number;
  data?: Record<string, unknown>;
  message?: {
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type DshAgent = {
  readonly id: string;
  readonly ctx: Context;
  readonly session: {
    readonly id: string;
    readonly events?: readonly SessionEventLike[];
  };
  cancel(cause: { kind: string }): void;
  followup(message: unknown): void;
  whenIdle(): Promise<void>;
};

export type DshAgentHandle = {
  agent: DshAgent;
  dispose(): Promise<void>;
};

export type DshAgentRegistry = {
  get(sessionId: string): DshAgent | undefined;
  resume(options: {
    resumeSessionId: string;
    agentOptions?: { provider?: string; model?: string };
    setup?: AgentSetup;
  }): Promise<DshAgentHandle>;
  create(options: {
    sessionId: string;
    meta?: { cwd?: string; parentSession?: string; seedLength?: number; agentPreset?: string };
    seed?: readonly unknown[];
    agentOptions?: { provider?: string; model?: string };
    setup?: AgentSetup;
  }): Promise<DshAgentHandle>;
};

export type AgentDefaultModelLike = {
  currentSelection(): { provider?: string; model?: string; reasoningEffort?: string };
};

export type AgentPresetsLike = {
  readonly defaultId: string;
  resolve(id?: string): Promise<{ id: string }>;
  mount(agentCtx: Context, id?: string): Promise<unknown>;
};

export type SessionRecord = {
  sessionKey: string;
  sessionId: string;
  agent: DshAgent;
  handle: DshAgentHandle;
  replyTarget: ReplyTarget;
  scope: ChatScope;
  peerId: string;
  senderId: string;
  lastActivity: number;
  agentPreset?: string;
  replyHeartbeat?: ReplyHeartbeatController;
};
