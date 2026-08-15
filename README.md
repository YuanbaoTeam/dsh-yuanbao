# dsh-yuanbao

中文 | [English](./README_EN.md)

基于 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 的元宝 IM 通道插件，将元宝开放平台 WebSocket 消息接入 dsh agent runtime。

## 架构

```text
元宝用户 → 元宝 WebSocket Gateway → dsh-yuanbao → ctx.agents → dsh agent loop → LLM / Tools
                                      ↑                           │
                                      └── session/event ──────────┘
                                            assistant reply → 元宝发送接口
```

`dsh-yuanbao` 作为 Cordis 插件运行在 deepseek-harness 进程内：

- 入站：元宝 WebSocket push → 元宝消息解码 → `agent.followup()`
- 出站：监听 `session/event` → 聚合 `assistant/chunk` → 发送元宝 C2C / 群消息
- 状态：通过元宝 heartbeat 发送 `RUNNING` / `FINISH`，驱动元宝 loading / 思考气泡

## 安装

### 方式一：从 npm registry 安装

```bash
# 安装到独立 profile
dsh plugin --profile yuanbao add dsh-yuanbao

# 启动
dsh --profile yuanbao
```

### 方式二：本地路径安装

```bash
# 构建插件
cd /path/to/dsh-yuanbao
pnpm install
pnpm build

# 安装到 deepseek-harness profile
cd /path/to/deepseek-harness
pnpm dsh plugin --profile yuanbao add /path/to/dsh-yuanbao

# 启动
pnpm dsh --profile yuanbao
```

如果需要和 Web UI 一起使用，也可以安装到 `web` profile：

```bash
pnpm dsh plugin --profile web add /path/to/dsh-yuanbao
pnpm dsh --profile web
```

## 环境变量

推荐在 deepseek-harness 启动目录放置 `.env`：

```env
YUANBAO_APP_KEY=你的元宝AppKey
YUANBAO_APP_SECRET=你的元宝AppSecret
# 可选：如果已经有预签名 token，可直接配置
YUANBAO_TOKEN=

# 可选：Agent 工作目录
DSH_YUANBAO_CWD=/path/to/workspace
```

如果使用 DeepSeek 官方模型，还需要：

```env
DEEPSEEK_API_KEY=你的DeepSeek API Key
```

如果使用 Ollama 本地模型，可在 `~/.dsh/settings.yaml` 中配置 `agent-default-model` 指向 Ollama provider。

## 模型配置

`dsh-yuanbao` 默认不直接绑定模型，而是继承 deepseek-harness 的宿主默认模型：

```yaml
agent-default-model:
  provider: <provider-id>
  model: <model-id>
```

模型 provider 通常配置在：

```text
~/.dsh/settings.yaml
```

如果设置了 `DSH_HOME`，则配置文件位于：

```text
$DSH_HOME/settings.yaml
```

### OpenAI 示例

在 deepseek-harness 启动目录的 `.env` 中配置：

```env
OPENAI_API_KEY=你的OpenAI API Key
```

在 `~/.dsh/settings.yaml` 中配置：

```yaml
llm-pi-ai:
  providers:
    openai:
      displayName: OpenAI
      apiKeyEnv: OPENAI_API_KEY
      api: openai-completions
      baseURL: https://api.openai.com/v1
      models:
        - id: gpt-4o-mini
          name: GPT-4o mini
          contextWindow: 128000
          maxTokens: 16384
          input:
            - text

agent-default-model:
  provider: openai
  model: gpt-4o-mini
```

### Claude 示例

在 deepseek-harness 启动目录的 `.env` 中配置：

```env
ANTHROPIC_API_KEY=你的Anthropic API Key
```

在 `~/.dsh/settings.yaml` 中配置：

```yaml
llm-pi-ai:
  providers:
    anthropic:
      displayName: Anthropic
      apiKeyEnv: ANTHROPIC_API_KEY
      api: anthropic-messages
      baseURL: https://api.anthropic.com
      models:
        - id: claude-3-5-sonnet-20241022
          name: Claude 3.5 Sonnet
          contextWindow: 200000
          maxTokens: 8192
          input:
            - text

agent-default-model:
  provider: anthropic
  model: claude-3-5-sonnet-20241022
```

### Ollama 示例

在 deepseek-harness 启动目录的 `.env` 中配置一个占位 key：

```env
OLLAMA_API_KEY=ollama
```

在 `~/.dsh/settings.yaml` 中配置：

```yaml
llm-pi-ai:
  providers:
    ollama:
      displayName: Ollama
      apiKeyEnv: OLLAMA_API_KEY
      api: openai-completions
      baseURL: http://127.0.0.1:11434/v1
      models:
        - id: qwen3.5
          name: Qwen3.5
          contextWindow: 32768
          maxTokens: 4096
          input:
            - text

agent-default-model:
  provider: ollama
  model: qwen3.5
```

也可以在 `cordis.patch.yml` 中给 `dsh-yuanbao` 显式指定模型，覆盖宿主默认模型：

```yaml
- insert:
    - id: dsh-yuanbao
      name: 'dsh-yuanbao'
      config:
        provider: openai
        model: gpt-4o-mini
```

## 配置项

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `appKey` | string | `''` | 元宝 AppKey，默认读取 `YUANBAO_APP_KEY` |
| `appSecret` | string | `''` | 元宝 AppSecret，默认读取 `YUANBAO_APP_SECRET` |
| `token` | string | - | 预签名元宝 WebSocket token，默认读取 `YUANBAO_TOKEN` |
| `apiDomain` | string | `bot.yuanbao.tencent.com` | 元宝开放平台 API 域名 |
| `wsGatewayUrl` | string | `wss://bot-wss.yuanbao.tencent.com/wss/connection` | 元宝 WebSocket Gateway 地址 |
| `routeEnv` | string | - | 元宝路由环境 |
| `botId` | string | - | 已知元宝 bot id |
| `provider` | string | - | DSH LLM provider；为空时继承宿主默认模型 |
| `model` | string | - | DSH model；为空时继承宿主默认模型 |
| `preset` | string | - | Agent preset id |
| `cwd` | string | `process.cwd()` | Agent 工作目录 |
| `requireMention` | boolean | `true` | 群聊是否需要 @bot 才触发 |
| `directPrompt` | string | - | 私聊额外 system prompt |
| `groupPrompt` | string | - | 群聊额外 system prompt |
| `textChunkLimit` | number | `3000` | 单条出站消息最大字符数 |
| `sessionIdleTimeout` | number | `1800000` | 会话闲置超时，默认 30 分钟 |
| `processingTimeoutMs` | number | `120000` | Agent 处理超时 |
| `maxReconnectAttempts` | number | `100` | WebSocket 最大重连次数 |
| `access.c2cMode` | `open` / `allowlist` / `disabled` | `open` | 私聊访问控制 |
| `access.c2cAllow` | string[] | `[]` | 私聊 allowlist |
| `access.groupMode` | `open` / `allowlist` / `disabled` | `open` | 群聊访问控制 |
| `access.groupAllow` | string[] | `[]` | 群聊 allowlist |
| `debug` | boolean | `false` | 调试模式 |

默认 bundle patch：

```yaml
- insert:
    - id: dsh-yuanbao
      name: 'dsh-yuanbao'
      config:
        appKey: !!js process.env.YUANBAO_APP_KEY ?? ''
        appSecret: !!js process.env.YUANBAO_APP_SECRET ?? ''
        token: !!js process.env.YUANBAO_TOKEN ?? ''
        cwd: !!js process.env.DSH_YUANBAO_CWD ?? process.cwd()
        requireMention: true
        textChunkLimit: 3000
        sessionIdleTimeout: 1800000
```

## 内置命令

| 命令 | 说明 |
|------|------|
| `/yb-help` / `/yuanbao-help` | 查看所有指令 |
| `/yb-status` / `/yuanbao-status` | 查看当前会话状态 |
| `/yb-reset` / `/yuanbao-reset` | 重置当前会话上下文 |

## 核心模块

```text
src/
├── index.ts                    # Cordis 插件入口
├── bridge.ts                   # Gateway / SessionManager / 出入站桥接
├── config.ts                   # 配置 Schema
├── types.ts                    # 全局类型定义
├── env-loader.ts               # 本地 .env 加载
├── logger.ts                   # 统一日志入口
├── inbound.ts                  # 元宝入站消息 → agent.followup()
├── commands.ts                 # 内置命令
├── gateway/                    # 元宝 Gateway 层
│   ├── index.ts                # WebSocket 生命周期与 push 分发
│   ├── auth.ts                 # appKey / appSecret 签票鉴权
│   ├── env.ts                  # User-Agent / 设备信息
│   └── protocol/               # WebSocket / protobuf 协议编解码
├── session/                    # 会话管理层
│   ├── manager.ts              # 元宝 peer → dsh Agent 映射
│   └── idle-evictor.ts         # 闲置回收
└── transport/                  # 出站传输层
    ├── sender.ts               # C2C / 群消息 / heartbeat 发送
    ├── outbound.ts             # session/event → 元宝消息
    ├── outbound-buffer.ts      # 流式输出缓冲
    ├── heartbeat.ts            # loading / 思考气泡心跳控制
    └── chunker.ts              # 文本切分
```

## 会话路由

元宝私聊或群聊会稳定映射到一个 dsh session：

```text
sessionKey = yuanbao:${accountId}:${scope}:${peerId}
sessionId  = sha256(sessionKey) 派生
```

解析策略：

```text
进程内复用 → 持久化恢复 → 全新创建
```

这样可以保证：

- 同一个元宝私聊用户上下文连续
- 同一个元宝群聊上下文连续
- dsh 重启后可恢复历史 session
- 不直接暴露元宝用户标识

## 设计原则

- **纯 Cordis 插件** — 不修改 deepseek-harness agent loop
- **通道适配独立** — 元宝协议转换在插件内完成，Agent runtime 仍由 dsh 管理
- **会话隔离** — 每个私聊 / 群聊独立映射 Agent session
- **模型继承** — 默认继承宿主 `agent-default-model`，也可显式配置 `provider` / `model`
- **流式缓冲** — 聚合 `assistant/chunk`，避免 IM 侧逐 token 刷屏
- **思考气泡** — 用元宝 heartbeat `RUNNING` / `FINISH` 驱动 loading 状态
- **安全默认** — 密钥只从环境变量读取，日志会对 secret / token 等字段脱敏

## 本地开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# watch
pnpm dev

# 本地安装到 dsh profile
cd /path/to/deepseek-harness
pnpm dsh plugin --profile yuanbao add /path/to/dsh-yuanbao
pnpm dsh --profile yuanbao
```

## License

MIT
