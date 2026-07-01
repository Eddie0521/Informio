# Agent Integration Overview

Informio is an MCP Host/Client that connects your writing workspace to locally installed Agent CLIs. It stores local server configurations, starts stdio MCP servers, discovers tools, and routes chat-capable tool calls to the right provider.

## Local-first design

Informio ships without built-in API keys or hosted model endpoints. Instead, it relies on Agent CLIs already installed and authenticated on your machine. You bring the runtime; Informio provides the workspace context, conversation management, and UI.

## Supported providers

| Provider | Transport | SDK |
|---|---|---|
| Claude Code | `claude-agent-sdk` | `@anthropic-ai/claude-agent-sdk` |
| OpenCode | `opencode-sdk` | `@opencode-ai/sdk` |
| Codex | `codex-app-server` | Custom JSON-RPC over stdio |

Each provider has a dedicated execution flow renderer that matches its native stage feel and pacing, rather than forcing a single generic UI. Claude Code shows Anthropic's thinking/tool_use/message stages. Codex shows OpenAI's command/file_change/approval stages. OpenCode renders its own event model with part-level streaming.

## Architecture at a glance

```
┌─────────────────────────────────────┐
│  Renderer (AgentPanel)              │
│  ┌─ ClaudeCodeExecutionFlow         │
│  ├─ CodexExecutionFlow              │
│  ├─ OpenCodeExecutionFlow           │
│  └─ GenericExecutionFlow (fallback) │
└──────────────┬──────────────────────┘
               │ IPC
┌──────────────▼──────────────────────┐
│  AgentRuntimeManager (main process) │
│  ├─ ClaudeAgentSdkManager           │
│  ├─ CodexAppServerManager           │
│  └─ OpenCodeSdkManager              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Local Agent CLI (stdio / SDK)      │
└─────────────────────────────────────┘
```

The `AgentRuntimeManager` in the main process dispatches every operation — connect, send, stream, approve, cancel — to the correct provider manager based on the `AgentProvider.transport` field.

## See also

- [Setup](./setup.md) — install and configure an Agent provider
- [Supported Agents](./supported-agents.md) — provider-specific details and capabilities
- [Conversations](./conversations.md) — how conversations are created and persisted
- [Execution Flows](./execution-flows.md) — how each provider renders its runtime stages
