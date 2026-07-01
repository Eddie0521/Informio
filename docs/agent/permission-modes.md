# Permission Modes

## Three tiers

Every message you send is tagged with a permission mode that controls what the Agent can do during that turn.

| Mode | Behavior |
|---|---|
| `read_only` | No file edits, no shell commands, no workspace-external access. Read and search tools are allowed. |
| `default` | Read/search auto-approved. File edits, shell commands, and tool calls require explicit user approval. |
| `full_access` | Unrestricted — all tools auto-approved without prompting. |

Select the mode from the permission dropdown in the composer bar before sending. Switching to `full_access` from a lower mode shows a confirmation dialog.

## How permissions are enforced

Permissions are enforced at the **runtime level**, not just through prompt wording. Each provider maps the Informio permission mode to its native permission system:

**Claude Code** — Maps to SDK permission modes (`dontAsk` for read-only, `default` for default, `bypassPermissions` for full access). The `canUseTool` callback intercepts every tool call and applies read-only denials, workspace boundary checks, and approval flows.

**Codex** — Maps to `sandbox` and `approvalPolicy` parameters (`read-only`/`workspace-write`/`danger-full-access` and `never`/`on-request`).

**OpenCode** — Translates to a set of permission rules per session (`allow`/`deny`/`ask` for each permission type like `read`, `edit`, `bash`, `task`, `external_directory`).

## Approval flow

When the Agent needs to perform a restricted action in `default` mode, it emits an `approval_request` event. The UI renders an approval card showing:

- What the Agent wants to do (command, file change, tool call, permission request)
- The command text or file path (when applicable)
- Available decisions

### Four decisions

| Decision | Effect |
|---|---|
| `accept` | Allow this single action. The Agent continues. |
| `acceptForSession` | Allow this action and remember the pattern for the rest of the session. Subsequent identical requests are auto-approved. |
| `decline` | Deny this action. The Agent is told the user refused. |
| `cancel` | Deny and abort the current run. |

The `acceptForSession` pattern is scoped to the current runtime thread. Starting a new conversation resets the approval cache.

## Workspace boundaries

In `default` and `read_only` modes, Informio checks whether file paths fall within the workspace roots. Accessing paths outside the workspace triggers an approval request (in `default` mode) or a denial (in `read_only` mode), regardless of the tool being used.

In `full_access` mode, the runtime grants access to the entire filesystem including the home directory.

## See also

- [Conversations](./conversations.md) — per-message permission tracking in history
- [Execution Flows](./execution-flows.md) — how approval cards appear in the UI
- [Supported Agents](./supported-agents.md) — provider-specific permission mapping
