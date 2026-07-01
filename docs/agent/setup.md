# Agent Setup

## Prerequisites

Install at least one Agent CLI on your system before enabling the runtime:

- **Claude Code** — `npm install -g @anthropic-ai/claude-code` then run `claude` to complete authentication.
- **OpenCode** — install the `opencode` binary and configure a provider.
- **Codex** — install the `codex` CLI and authenticate with OpenAI.

Informio does not manage CLI installation or authentication. If the CLI is missing or not logged in, the connection will fail with a descriptive error.

## Enable the runtime

Open **Settings → Agent** and toggle **Enable agent runtime**. This starts the background runtime that manages provider connections.

Set **Auto-start** if you want the runtime to initialize when Informio launches.

## Configure a provider

Each provider entry has these fields:

| Field | Description |
|---|---|
| **Name** | Display name shown in the Agent panel |
| **Transport** | `claude-agent-sdk`, `opencode-sdk`, or `codex-app-server` |
| **Command** | Path to the CLI executable (e.g. `claude`, `opencode`, `codex`) |
| **Args** | Additional CLI arguments. Codex defaults to `app-server --listen stdio://` |
| **CWD** | Working directory for the CLI process |

Enable the provider with the toggle. Only one provider is active at a time; switch between them from the Agent panel header.

## API settings

The **Settings → API** section configures the model endpoint used for translation and other non-Agent features:

- **Provider kind** — `openai-compatible` or `anthropic`
- **Base URL** — API endpoint (e.g. `https://api.anthropic.com`)
- **API key** — stored locally, never transmitted to Informio servers
- **Model** — select from auto-detected models or enter a model ID manually

## Model detection

When you configure a Claude Code provider, Informio probes the Anthropic models endpoint (or a custom base URL) to discover available models. Codex and OpenCode providers report their models from the runtime's own model list.

If detection fails, you can still type a model ID manually in the model selector.

## See also

- [Supported Agents](./supported-agents.md) — provider-specific configuration details
- [Permission Modes](./permission-modes.md) — control what the Agent can do
- [Overview](./overview.md) — architecture and provider table
