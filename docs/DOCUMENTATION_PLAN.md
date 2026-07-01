# Informio Documentation Plan

## Problem

Current `docs/` only contains `PROJECT_RULES.md` (internal dev rules) and compose plans. User-facing documentation is limited to README's Quick Start + Tech Stack, covering roughly 10% of actual product features.

## Reference Analysis: Otty Docs

Otty's documentation strength comes from three principles:

1. **One concept per page** — each page is self-contained and searchable
2. **Value-behavior tables** — for every setting, list each possible value and what it does
3. **See also cross-links** — every page ends with related pages, forming a navigation mesh

They do NOT write long prose. Pages are short, structured, and visual.

## Proposed Structure

7 categories, ~40 pages. Page count is based on actual features found in code — not invented.

---

### Category 1: Getting Started (3 pages)

| Page | What to cover |
|---|---|
| **Installation** | macOS (unsigned, xattr workaround), Windows (NSIS), build-from-source. Prereqs: Node 20+, corepack enable, Git. |
| **First Launch** | Initial UI layout: center editor, left library panel, right agent panel. Adding a project folder. Sample document behavior. |
| **Quick Tour** | End-to-end: write Markdown → insert image → resize on canvas → open PDF side-by-side → ask Agent to summarize → encrypt a note. |

### Category 2: Editor (8 pages)

| Page | What to cover |
|---|---|
| **Markdown Basics** | Tiptap-based editing. Headings, lists, task lists, bold/italic/underline/strikethrough/highlight. Typora-style Markdown input shortcuts. |
| **Tables** | Resizable GFM tables. Column alignment syntax (`:---`, `:---:`, `---:`). Hover-reveal `+` affordance. Toolbar appears only on selection/hover. Width stays session-only — saved Markdown uses standard pipe tables. |
| **Images and Media** | Drag-to-resize images on canvas. Image dialog. Video and audio embedding via media extension. Asset import modes: copy-to-attachment vs link-original. |
| **Math and Diagrams** | KaTeX inline (`$...$`) and block (`$$...$$`) math. Mermaid diagram rendering in code blocks. |
| **Code Blocks** | Lowlight syntax highlighting. Language selector. |
| **Callouts, Details, Footnotes** | Callout blocks (admonition-style). Collapsible `<details>` blocks. Footnote insertion and navigation. |
| **Wiki Links** | Obsidian-compatible `[[wiki-link]]` syntax. How they resolve within the project. |
| **Clipboard and Paste** | HTML normalization pipeline: StartFragment/EndFragment extraction, unsafe attribute stripping, semantic preservation of links/images/tables. |

### Category 3: Documents (4 pages)

| Page | What to cover |
|---|---|
| **PDF Viewer** | EmbedPDF integration. Text selection mode. Highlight/annotation toolbar. PDF stays in browse mode by default. |
| **Spreadsheets** | .xlsx / .xls / .csv editing. Pinch + scroll zoom. Auto-save with 900ms debounce. External modification detection (30s fingerprint polling). Conflict resolution dialog (reload / keep local / save-as). File extension preservation on save. |
| **Outline** | Automatic h1–h6 extraction. Click-to-jump. Active heading tracking as cursor moves. |

### Category 4: Agent Integration (7 pages)

| Page | What to cover |
|---|---|
| **Overview** | Informio as MCP Host/Client. Local-first architecture. No built-in API keys — relies on locally installed Agent CLIs. |
| **Setup** | Detecting installed Agent CLIs. Configuring providers in Settings. Model selection. API provider kinds (OpenAI-compatible vs Anthropic). |
| **Conversations** | Creating, switching, resuming conversations. Retention limit (`conversationRetentionLimit`) and retention days (`conversationRetentionDays`). Thread persistence across sessions. |
| **Permission Modes** | Three tiers: `read_only`, `default`, `full_access`. How each affects file edits and shell commands. Approval flow: accept / accept-for-session / decline / cancel. |
| **Execution Flows** | Provider-specific renderers: `ClaudeCodeExecutionFlow`, `CodexExecutionFlow`, `OpenCodeExecutionFlow`. Each shows native stage feel. Shared `GenericExecutionFlow` fallback for unsupported providers. |
| **Context Passing** | What the Agent sees: workspace path, project roots, current document, selected text, PDF selection (page + rects), open tabs, note list, references, file attachments. |
| **Supported Agents** | Claude Agent SDK (Anthropic transport), OpenCode SDK, Codex App Server. Capability differences, runtime support for resume, permission modes. |

### Category 5: Workspace (5 pages)

| Page | What to cover |
|---|---|
| **Projects and Folders** | Project-based model (no fixed directory). Adding/removing/pinning projects. Folder tree in left panel. File type icons. |
| **File Operations** | Right-click context menu: rename, duplicate, delete, reveal in Finder, move. Inline rename. Drag-and-drop import of external files. |
| **Split View** | Recursive horizontal/vertical splits. Panel activation, maximize, close. Drag dividers to resize. Drop targets: document, browser pane, agent panel. |
| **Command Palette** | `Cmd/Ctrl+P`. 10 built-in commands: new document, new window, open file, open project, close tab, close window, save, save-as, find, settings. Fuzzy search. |
| **Quick Capture** | Global hotkey (`Control+Space`). Opens a minimal window with both panels collapsed for instant note-taking. |

### Category 6: Customization (5 pages)

| Page | What to cover |
|---|---|
| **Themes** | Four built-in themes: paper, white, night, custom. Custom theme color picker. Live preview. |
| **Fonts** | Separate Chinese / English / Code font family selectors. Local font enumeration. Font size and line height controls. |
| **Keyboard Shortcuts** | Three categories: Window & File, Find & Edit, Text Formatting. 17 registered shortcuts. Configurable bindings with conflict detection. Platform-aware display (Cmd vs Ctrl). |
| **Editor Settings** | Font size, line height, content width, spellcheck, typewriter mode. Asset import mode toggle. Tab size. Auto-save toggle. |
| **Appearance** | Left/right panel default mode (collapsed/expanded). Panel widths. Status bar auto-hide. Title bar document name. Chat font size. Language (zh-CN / en-US). |

### Category 7: Reference (3 pages)

| Page | What to cover |
|---|---|
| **Settings Reference** | Complete `AppSettings` schema: every field, every type, every default. Grouped by section (agentRuntime, api, appearance, editor, markdown, shortcuts, language, agents). |
| **Keyboard Shortcuts Reference** | Full table of all 17 shortcuts with ID, command, default accelerator, scope (window/global), category. |
| **File Format Support** | Matrix: Markdown, PDF, XLSX/XLS/CSV, DOCX/DOC, images, video, audio — for each: editable? preview-only? auto-save? conflict detection? |

---

## Implementation Notes

- **Language**: Write in English (matches README). Can add Chinese versions later.
- **Format**: Markdown files, one per page, organized in subdirectories matching categories.
- **No screenshots yet**: Structure and text first. Screenshots can be added after the skeleton is solid.
- **Cross-references**: Every page ends with `## See also` linking to related pages.
- **Config tables**: For settings-related pages, use a three-column table: Setting | Values | Default.
- **Shortcut tables**: Use a four-column table: Action | Default | Scope | Command ID.

## Priority Order

1. **Getting Started** (highest — blocks new users)
2. **Agent Integration** (differentiator — most complex feature)
3. **Editor** (core product)
4. **Documents** (PDF/Spreadsheet are unique capabilities)
5. **Workspace** (file management patterns)
6. **Customization** (settings are discoverable in-app, docs are supplementary)
7. **Reference** (can be auto-generated from types later)
