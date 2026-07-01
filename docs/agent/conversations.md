# Conversations

## Creating conversations

Each conversation is tied to a **workspace scope** — the combination of workspace path and active provider. When you send your first message, Informio creates an `AgentConversation` record with:

- A unique ID
- The workspace scope ID and label
- The provider ID
- A title (derived from the first user message)
- Timestamps for creation and last update

## Switching conversations

Use the **History** button in the Agent panel header to browse past conversations. Selecting a conversation loads its message history. You can also start a **New Session** at any time.

Only conversations for the currently active provider are shown. Switching providers does not delete conversations — they remain available when you switch back.

## Thread persistence

Each conversation stores a `runtimeThreadId` that maps to the provider's native session or thread. When you resume a conversation, Informio passes this ID to the provider so it can continue in the same runtime context.

If the provider cannot resume the thread (for example, after a CLI upgrade or timeout), Informio falls back to starting a fresh runtime thread and injects recent conversation history as context.

## Retention and cleanup

Two settings in **Settings → Agent** control conversation retention:

| Setting | Description |
|---|---|
| **conversationRetentionLimit** | Maximum number of conversations to keep (default varies) |
| **conversationRetentionDays** | Age-based cleanup — conversations older than this are removed |

Cleanup runs automatically. Oldest conversations are removed first when the limit is exceeded.

## Storage

Conversations are persisted as part of AppData alongside documents and settings. Message history includes role, content, permission mode, status, error messages, reasoning traces, and action records.

## See also

- [Context](./context.md) — what the Agent sees when you send a message
- [Permission Modes](./permission-modes.md) — per-message permission tracking
- [Overview](./overview.md) — architecture overview
