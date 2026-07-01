# Supported Agents

## Claude Code

| Property | Value |
|---|---|
| **Transport** | `claude-agent-sdk` |
| **SDK** | `@anthropic-ai/claude-agent-sdk` |
| **Default command** | `claude` |
| **Resume support** | Yes — `runtimeThreadId` maps to Claude's `session_id` |

**Setup**: Install `@anthropic-ai/claude-code` globally and run `claude` to authenticate. In Settings → Agent, add a provider with transport `claude-agent-sdk` and command `claude`.

**Model detection**: Informio probes the Anthropic models endpoint (or custom `ANTHROPIC_BASE_URL`) using the configured API key. It also reads Claude Code's own resolved settings and runtime model list. Models are de-duplicated and prettified (e.g. `claude-sonnet-4-20250514` → "Claude Sonnet 4").

**Permission mapping**:
- `read_only` → SDK `dontAsk` mode; read/search tools allowed, all others silently denied
- `default` → SDK `default` mode; `canUseTool` callback intercepts each call for approval
- `full_access` → SDK `bypassPermissions` mode with `allowDangerouslySkipPermissions`

**Hooks**: PreToolUse, PostToolUse, and PostToolUseFailure hooks are registered to track tool execution lifecycle and emit trace events.

**File change verification**: Every file-change tool call is audited. Informio records pre-edit paths and verifies post-edit that changes occurred within workspace roots.

## OpenCode

| Property | Value |
|---|---|
| **Transport** | `opencode-sdk` |
| **SDK** | `@opencode-ai/sdk` |
| **Default command** | `opencode` |
| **Resume support** | Partial — attempts to resume via `session.get`, falls back to new session |

**Setup**: Install the `opencode` binary and configure a provider. Informio starts a local OpenCode server on a random port using `createOpencode()`.

**Model detection**: Models are extracted from OpenCode's provider config response. Model IDs follow the `provider/model` format (e.g. `anthropic/claude-sonnet-4-20250514`).

**Permission mapping**: Translated to OpenCode's permission rule system:
- `read_only` → `read`, `list`, `glob`, `grep`, `lsp` allowed; `edit`, `bash`, `task`, `external_directory`, `repo_clone` denied
- `default` → read/search allowed; `edit`, `bash`, `task`, `repo_clone` set to `ask`
- `full_access` → all permissions allowed

**Event model**: OpenCode streams events over SSE. Informio handles `message.part.updated`, `message.part.delta`, `permission.updated`, `permission.asked`, `question.asked`, `session.next.shell.started/ended`, `session.next.tool.called`, `session.status`, and `session.idle`.

## Codex

| Property | Value |
|---|---|
| **Transport** | `codex-app-server` |
| **SDK** | Custom JSON-RPC over stdio |
| **Default command** | `codex` |
| **Default args** | `app-server --listen stdio://` |
| **Resume support** | Yes — `runtimeThreadId` maps to Codex's `threadId` |

**Setup**: Install the `codex` CLI and authenticate with OpenAI. Add a provider with transport `codex-app-server`. Informio spawns the Codex process and communicates via JSON-RPC over stdin/stdout.

**Model detection**: Models are listed via the `model/list` JSON-RPC method with pagination support.

**Permission mapping**:
- `read_only` → sandbox `readOnly`, approval policy `never`
- `default` → sandbox `workspaceWrite`, approval policy `on-request`, approvals reviewer `user`
- `full_access` → sandbox `dangerFullAccess`, approval policy `never`

**Approval flow**: Codex sends `requestApproval` server requests for commands, file changes, and permissions. Informio renders approval cards and sends the decision back via JSON-RPC response.

**Thread lifecycle**: Informio manages threads via `thread/start` and `thread/resume`. Turns are started with `turn/start` and tracked via `turn/started`, `item/started`, `item/completed`, and `turn/completed` notifications.

## Capability comparison

| Feature | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Resume sessions | Full | Partial (fallback) | Full |
| Permission modes | 3 tiers | 3 tiers (rules) | 3 tiers (sandbox) |
| Model selection | Auto-detect + manual | From provider config | Auto-detect + manual |
| File change verification | Yes | Yes | Yes |
| Subtask tracking | Yes | No | No |
| Plan visualization | No | No | Yes |
| Streaming text deltas | Yes | Yes (part-level) | Yes (item-level) |

## See also

- [Setup](./setup.md) — installation and configuration
- [Permission Modes](./permission-modes.md) — how permissions map to each provider
- [Execution Flows](./execution-flows.md) — how each provider renders in the UI
- [Overview](./overview.md) — architecture and provider table
