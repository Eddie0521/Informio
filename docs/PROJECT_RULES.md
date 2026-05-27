# Informio Project Rules

## Product Direction

Informio is a minimal desktop Markdown editor with contextual Agent assistance. The center writing surface is the product. The Agent should feel adjacent to writing, not louder than writing.

## Technology Choices

- Runtime: Electron
- Language: TypeScript
- Renderer: React + Vite
- Package manager: pnpm
- Styling: Tailwind CSS v4 only, with small global layers for tokens and editor internals
- UI primitives: Radix UI-compatible patterns and shadcn-style local components
- Markdown editor: Tiptap
- Agent bridge: MCP stdio clients in Electron main process

## UX Rules

- The editor must be immediately usable after launch with a sample document.
- The left library and right Agent panel are optional context. Users can collapse both.
- AI actions should start from selected text or current document context.
- Table controls should stay latent: show only the nearby `+` insertion affordance when the pointer is close to a table edge, and resize only the specific row or column being dragged.
- Images in the editor should support direct drag-to-resize from the canvas, with aspect ratio preserved and the saved size surviving reopen.
- PDF highlighting remains available through `pdf.js` native highlight mode from the PDF toolbar; default PDF mode remains plain browsing and text selection.
- PDF annotation management surfaces such as comment dialogs, annotation side panels, and PDF-to-Markdown backlink management should stay out of the PDF viewer unless intentionally reintroduced with a new rule update first.
- Settings must be discoverable from the main shell and should expose practical controls without forcing setup before writing.
- Errors must explain what happened and the next action, especially for missing or failed MCP servers.
- Agent runtime infrastructure may be shared, but execution flow presentation must follow each provider's native stage feel and pacing.
- `Opencode`, `Claude Code`, and `Codex` must use provider-specific execution flow renderers instead of forcing a single generic process UI.
- Shared fallbacks are allowed only for unsupported providers or missing event mappings; they are not the primary UX for built-in providers.
- Provider-specific execution flows must hide internal prompt injection and host-only context unless the provider natively exposes that stage to the user.
- Default permission modes must be enforced by the runtime when the provider supports it; prompt wording alone is not an acceptable safety boundary for file edits, shell commands, or leaving the workspace.

## Visual Direction

- Visual thesis: quiet writing cockpit, white paper, thin dividers, green status accents, low visual noise.
- Content plan: orient through file tabs and side rail, show document state, enable writing, reveal Agent only when useful.
- Interaction thesis: panel expand/collapse, selected text Agent card, and small press feedback on controls.
- Brand assets: keep app icon source files in `src/renderer/public/`. The default icon should stay minimal, mostly white and light gray, and avoid accent colors unless the UI needs a specific status signal.

## Radius Scale

- `xs`: 4px
- `sm`: 6px
- `md`: 8px
- `lg`: 12px
- `xl`: 18px
- `pill`: 999px

## MCP Boundary

The app is an MCP Host/Client. It stores local server configurations, starts stdio MCP servers, discovers tools, and calls a selected chat-capable tool. It does not assume that every branded CLI has the same command syntax. Presets are editable starting points.

## Verification

Before delivery, run:

```bash
corepack pnpm typecheck
corepack pnpm build
```
