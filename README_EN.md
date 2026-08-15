# @tencent-connect/dsh-yuanbao

[中文](./README.md) | English

A Yuanbao IM channel plugin for [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). It connects Yuanbao Open Platform WebSocket messages to the dsh agent runtime.

## Architecture

```text
Yuanbao User → Yuanbao WebSocket Gateway → dsh-yuanbao → ctx.agents → dsh agent loop → LLM / Tools
                                           ↑                           │
                                           └── session/event ──────────┘
                                                 assistant reply → Yuanbao send API
```

`dsh-yuanbao` runs as a Cordis plugin inside the deepseek-harness process:

- Inbound: Yuanbao WebSocket push → Yuanbao message decoding → `agent.followup()`
- Outbound: listen to `session/event` → aggregate `assistant/chunk` → send Yuanbao C2C / group messages
- Status: send Yuanbao heartbeat `RUNNING` / `FINISH` to drive the Yuanbao loading / thinking bubble

## Installation

### Option 1: Install from npm registry

```bash
# Install into an independent profile
dsh plugin --profile yuanbao add @tencent-connect/dsh-yuanbao

# Start
dsh --profile yuanbao
```

### Option 2: Install from local path

```bash
# Build plugin
cd /path/to/dsh-yuanbao
pnpm install
pnpm build

# Install into a deepseek-harness profile
cd /path/to/deepseek-harness
pnpm dsh plugin --profile yuanbao add /path/to/dsh-yuanbao

# Start
pnpm dsh --profile yuanbao
```

To run together with the Web UI, install it into the `web` profile:

```bash
pnpm dsh plugin --profile web add /path/to/dsh-yuanbao
pnpm dsh --profile web
```

## Environment Variables

It is recommended to place `.env` in the deepseek-harness launch directory:

```env
YUANBAO_APP_KEY=your-yuanbao-app-key
YUANBAO_APP_SECRET=your-yuanbao-app-secret
# Optional: use a pre-signed WebSocket token directly
YUANBAO_TOKEN=

# Optional: Agent working directory
DSH_YUANBAO_CWD=/path/to/workspace
```

If you use the official DeepSeek model provider, also configure:

```env
DEEPSEEK_API_KEY=your-deepseek-api-key
```

If you use a local Ollama model, configure `agent-default-model` in `~/.dsh/settings.yaml` to point to an Ollama provider.

## Model Configuration

`dsh-yuanbao` does not bind to a model by default. It inherits the host default model from deepseek-harness:

```yaml
agent-default-model:
  provider: <provider-id>
  model: <model-id>
```

Model providers are usually configured in:

```text
~/.dsh/settings.yaml
```

If `DSH_HOME` is set, the file is located at:

```text
$DSH_HOME/settings.yaml
```

### OpenAI Example

Configure this in `.env` under the deepseek-harness launch directory:

```env
OPENAI_API_KEY=your-openai-api-key
```

Configure this in `~/.dsh/settings.yaml`:

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

### Claude Example

Configure this in `.env` under the deepseek-harness launch directory:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key
```

Configure this in `~/.dsh/settings.yaml`:

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

### Ollama Example

Configure a dummy key in `.env` under the deepseek-harness launch directory:

```env
OLLAMA_API_KEY=ollama
```

Configure this in `~/.dsh/settings.yaml`:

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

You can also explicitly set the model in `cordis.patch.yml` for `dsh-yuanbao`, overriding the host default model:

```yaml
- insert:
    - id: dsh-yuanbao
      name: '@tencent-connect/dsh-yuanbao'
      config:
        provider: openai
        model: gpt-4o-mini
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appKey` | string | `''` | Yuanbao AppKey, usually from `YUANBAO_APP_KEY` |
| `appSecret` | string | `''` | Yuanbao AppSecret, usually from `YUANBAO_APP_SECRET` |
| `token` | string | - | Pre-signed Yuanbao WebSocket token, usually from `YUANBAO_TOKEN` |
| `apiDomain` | string | `bot.yuanbao.tencent.com` | Yuanbao Open Platform API domain |
| `wsGatewayUrl` | string | `wss://bot-wss.yuanbao.tencent.com/wss/connection` | Yuanbao WebSocket Gateway URL |
| `routeEnv` | string | - | Yuanbao route environment |
| `botId` | string | - | Known Yuanbao bot id |
| `provider` | string | - | DSH LLM provider; inherits host default model when empty |
| `model` | string | - | DSH model; inherits host default model when empty |
| `preset` | string | - | Agent preset id |
| `cwd` | string | `process.cwd()` | Agent working directory |
| `requireMention` | boolean | `true` | Require @bot in group chats |
| `directPrompt` | string | - | Extra system prompt for direct chats |
| `groupPrompt` | string | - | Extra system prompt for group chats |
| `textChunkLimit` | number | `3000` | Max characters per outbound message |
| `sessionIdleTimeout` | number | `1800000` | Idle session eviction timeout, 30 minutes by default |
| `processingTimeoutMs` | number | `120000` | Agent processing timeout |
| `maxReconnectAttempts` | number | `100` | Maximum WebSocket reconnect attempts |
| `access.c2cMode` | `open` / `allowlist` / `disabled` | `open` | Direct chat access control |
| `access.c2cAllow` | string[] | `[]` | Direct chat allowlist |
| `access.groupMode` | `open` / `allowlist` / `disabled` | `open` | Group chat access control |
| `access.groupAllow` | string[] | `[]` | Group chat allowlist |
| `debug` | boolean | `false` | Debug mode |

Default bundle patch:

```yaml
- insert:
    - id: dsh-yuanbao
      name: '@tencent-connect/dsh-yuanbao'
      config:
        appKey: !!js process.env.YUANBAO_APP_KEY ?? ''
        appSecret: !!js process.env.YUANBAO_APP_SECRET ?? ''
        token: !!js process.env.YUANBAO_TOKEN ?? ''
        cwd: !!js process.env.DSH_YUANBAO_CWD ?? process.cwd()
        requireMention: true
        textChunkLimit: 3000
        sessionIdleTimeout: 1800000
```

## Built-in Commands

| Command | Description |
|---------|-------------|
| `/yb-help` / `/yuanbao-help` | Show all commands |
| `/yb-status` / `/yuanbao-status` | Show current session status |
| `/yb-reset` / `/yuanbao-reset` | Reset current conversation context |

## Core Modules

```text
src/
├── index.ts                    # Cordis plugin entry
├── bridge.ts                   # Gateway / SessionManager / inbound-outbound bridge
├── config.ts                   # Configuration schema
├── types.ts                    # Global type definitions
├── env-loader.ts               # Local .env loader
├── logger.ts                   # Unified logging entry
├── inbound.ts                  # Yuanbao inbound message → agent.followup()
├── commands.ts                 # Built-in commands
├── gateway/                    # Yuanbao Gateway layer
│   ├── index.ts                # WebSocket lifecycle and push dispatching
│   ├── auth.ts                 # appKey / appSecret ticket-signing auth
│   ├── env.ts                  # User-Agent / device info
│   └── protocol/               # WebSocket / protobuf codecs
├── session/                    # Session management layer
│   ├── manager.ts              # Yuanbao peer → dsh Agent mapping
│   └── idle-evictor.ts         # Idle eviction
└── transport/                  # Outbound transport layer
    ├── sender.ts               # C2C / group message / heartbeat sending
    ├── outbound.ts             # session/event → Yuanbao message
    ├── outbound-buffer.ts      # Streaming output buffer
    ├── heartbeat.ts            # Loading / thinking bubble heartbeat control
    └── chunker.ts              # Text chunking
```

## Session Routing

Each Yuanbao direct chat or group chat is deterministically mapped to a dsh session:

```text
sessionKey = yuanbao:${accountId}:${scope}:${peerId}
sessionId  = sha256(sessionKey)
```

Resolution strategy:

```text
in-process reuse → persistent resume → create new session
```

This ensures:

- Continuous context for the same Yuanbao direct chat user
- Continuous context for the same Yuanbao group chat
- Session recovery after dsh restarts
- No direct exposure of Yuanbao user identifiers

## Design Principles

- **Pure Cordis plugin** — no changes to the deepseek-harness agent loop
- **Independent channel adapter** — Yuanbao protocol conversion stays inside this plugin, while Agent runtime remains managed by dsh
- **Session isolation** — each direct chat / group chat maps to an independent Agent session
- **Model inheritance** — inherits host `agent-default-model` by default; `provider` / `model` can also be configured explicitly
- **Streaming buffer** — aggregates `assistant/chunk` to avoid token-by-token spam in IM
- **Thinking bubble** — uses Yuanbao heartbeat `RUNNING` / `FINISH` to drive the loading state
- **Secure by default** — secrets are read from environment variables only, and secret / token fields are redacted in logs

## Local Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Watch
pnpm dev

# Install locally into a dsh profile
cd /path/to/deepseek-harness
pnpm dsh plugin --profile yuanbao add /path/to/dsh-yuanbao
pnpm dsh --profile yuanbao
```

## License

MIT
