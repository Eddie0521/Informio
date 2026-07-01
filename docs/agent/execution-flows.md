# Execution Flows

## Why provider-specific renderers

Each Agent has its own stages, pacing, and intermediate output. Claude Code streams thinking blocks and tool_use events. Codex emits command executions, file changes, and plan updates. OpenCode uses a part-based event model with reasoning, text, tool, and patch parts.

Rather than flattening these into a generic progress bar, Informio gives each built-in provider its own execution flow renderer that matches the provider's native feel.

## Provider renderers

### ClaudeCodeExecutionFlow

Renders Anthropic's execution stages:

- **Thinking / reasoning** — streamed as `thinking_delta` events, shown under "Visible Process"
- **Tool use** — each `PreToolUse`/`PostToolUse` hook produces a trace action with kind classification (`command`, `file_change`, `search`, `read`, `tool`)
- **Message** — assistant text streamed as `text_delta` events
- **Subtasks** — `task_started`/`task_progress`/`task_notification` messages rendered as nested tool actions

Status labels: Processing, Executing, Pending Approval, Partial Failure, Completed, Cancelled.

### CodexExecutionFlow

Renders OpenAI's execution model:

- **Command execution** — shell commands with `outputDelta` streaming and exit codes
- **File changes** — patch-based edits with change summaries (add/delete/move/update)
- **Plans** — plan updates rendered as structured step lists
- **Verification** — test/lint/build/verify commands grouped separately for visibility
- **MCP tool calls** — external tool invocations with result streaming

Actions are grouped into Inspect, Command, Edit, Verify, and Other sections.

### OpenCodeExecutionFlow

Renders OpenCode's part-based event model:

- **Reasoning parts** — streamed thinking content
- **Text parts** — assistant reply text with visible-text sanitization
- **Tool parts** — bash, edit, search, read with state transitions (pending → completed/error)
- **Patch parts** — file change groups with verification
- **Step parts** — step-start/step-finish execution markers
- **Permissions/Questions** — interactive approval and question cards

### GenericExecutionFlow

A fallback renderer for unsupported providers or when event mapping is incomplete. Shows a flat list of actions with basic status indicators.

## Internal prompt injection

Informio injects workspace context, conversation history, and permission instructions into the prompt before sending it to the provider. This injection is **hidden** in the UI unless the provider natively exposes that stage to the user. The execution flow only shows what the provider's own runtime surfaces.

## Collapsed vs expanded

Each execution flow starts collapsed, showing:

- A status label (Processing, Executing, etc.)
- The most recent step description
- A summary badge row (action counts by category)
- Elapsed duration

Click to expand and see the full trace: reasoning output, approval cards, and every action with its input/output details.

## See also

- [Overview](./overview.md) — architecture and provider table
- [Permission Modes](./permission-modes.md) — how approval cards work
- [Supported Agents](./supported-agents.md) — provider capabilities
