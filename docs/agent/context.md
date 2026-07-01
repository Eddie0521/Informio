# Agent Context

When you send a message, Informio packages your current workspace state into an `AgentSessionContext` object and passes it to the provider. This gives the Agent awareness of where you are and what you're working on.

## What the Agent sees

### Workspace

- **workspacePath** — the root directory of the current workspace
- **projectRoots** — additional project directories linked to the workspace

### Current document

- Document ID, title, and file path
- Full markdown content of the active document

### Selected text

If you have text selected in the editor when you send a message, the selection is included as context:

- **Markdown selection** — the selected text as markdown, with `from` and `to` character offsets in the source document
- **PDF selection** — the selected text, page number, bounding rectangles, and file path

The Agent panel shows a green "Selection included" indicator when a selection is active.

### Open tabs

A list of all open document tabs with their IDs, titles, and file paths. This helps the Agent understand which files you're actively working with.

### Note list

All documents in your library with their IDs, titles, file paths, and last-updated timestamps. This gives the Agent a map of your entire knowledge base.

### References

Documents explicitly linked to the current conversation, with optional markdown content included inline.

### File attachments

Images and files attached to the current message:

- File name and path
- Kind (`image` or `file`)
- MIME type
- Size

Attachments are added via the paperclip button in the composer or by dragging files onto the composer area.

## How to send context to the Agent

1. Open the document you want the Agent to see
2. Optionally select specific text — the selection is highlighted in the Agent panel
3. Optionally attach files via the paperclip button or drag-and-drop
4. Type your message and send

The Agent receives all of the above context automatically. You don't need to manually specify what to include.

## Context and privacy

Context is sent only when you explicitly send a message. Informio does not continuously stream your editor state to any provider. All context is assembled in the main process and transmitted over the provider's local connection (stdio or SDK).

## See also

- [Conversations](./conversations.md) — how context relates to conversation history
- [Permission Modes](./permission-modes.md) — what the Agent can do with the context it receives
- [Overview](./overview.md) — architecture overview
