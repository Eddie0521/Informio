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
- Markdown files are the source of truth and must stay clean: do not write presentation-only HTML, text-color spans, app-private file URLs, or media iframe/video/audio tags by default. Use standard Markdown links/images and Obsidian-compatible block syntax; encrypted content is the only allowed Informio-specific Markdown extension because it needs cryptographic metadata.
- The left library and right Agent panel are optional context. Users can collapse both.
- AI actions should start from selected text or current document context.
- Table controls should stay latent: show only the nearby `+` insertion affordance when the pointer is close to a table edge, and resize only the specific row or column being dragged. The formatting toolbar and row/column chrome should appear only when the table is selected or actively hovered.
- Table column widths, row heights, and merged cells are editor-session layout only (same policy as image resize width): saved Markdown keeps standard GFM pipe tables, cell content, and per-column alignment via separator syntax (`:---`, `:---:`, `---:`); do not write HTML tables or presentation-only width/height metadata into Markdown files.
- Clipboard paste must normalize external HTML before it reaches the editor: extract `StartFragment`/`EndFragment` content, strip site-only styling and unsafe attributes, preserve semantic links/images/tables, and keep source-mode paste readable. Add a regression fixture before changing paste behavior.
- Images in the editor should support direct drag-to-resize from the canvas when it can be represented without dirtying Markdown; the saved Markdown must remain a standard image reference.
- PDF highlighting remains available through `pdf.js` native highlight mode from the PDF toolbar; default PDF mode remains plain browsing and text selection.
- PDF annotation management surfaces such as comment dialogs, annotation side panels, and PDF-to-Markdown backlink management should stay out of the PDF viewer unless intentionally reintroduced with a new rule update first.
- Spreadsheet documents use the binary workbook file as the source of truth; the `markdown` field is only an in-library link reference.
- Spreadsheet saves preserve the original file extension (for example `.xls` stays `.xls`).
- External changes to an open spreadsheet must be confirmed by the user (reload, keep local edits, or save as) before overwriting local editor state.
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
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
```
