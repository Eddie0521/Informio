# Quick Tour

A hands-on walkthrough of Informio's core features. Follow along after [installing](./installation.md) and [opening the app](./first-launch.md) for the first time.

## 1. Write Markdown

Click in the center editor and start typing. Informio uses a Tiptap-based editor with full Markdown support — headings, lists, code blocks, tables, and more.

Save your work with **Cmd+S** (macOS) or **Ctrl+S** (Windows).

## 2. Format text

Select any text and apply formatting:

- **Bold**: **Cmd+B** / **Ctrl+B**
- *Italic*: **Cmd+I** / **Ctrl+I**
- ~~Strikethrough~~, `inline code`, and other styles are available from the toolbar or via standard Markdown syntax.

## 3. Insert and resize an image

Drag an image file from your file manager into the editor, or use Markdown syntax:

```markdown
![description](./path/to/image.png)
```

Once placed, drag the image handles directly on the canvas to resize it. The saved Markdown stays a standard image reference — resize metadata is editor-session only.

## 4. Open a PDF side-by-side

Drag a PDF file into the library panel or open it from the file tree. The PDF renders in a preview pane next to your editor. You can highlight text in the PDF and write notes in the Markdown editor at the same time.

## 5. Use the command palette

Press **Cmd+P** (macOS) or **Ctrl+P** (Windows) to open the command palette. Type to search for commands, files, and actions — it's the fastest way to navigate Informio without reaching for the mouse.

## 6. Ask an Agent

Select text in the editor or focus the right Agent panel, then ask a question. The Agent sees your current document and workspace context.

For example, select a paragraph and ask:

> Summarize this section in two bullet points.

Make sure your preferred Agent CLI (Claude Code, Codex, or another supported provider) is installed and configured in Informio settings before using this feature.

## 7. Encrypt a note

For sensitive content, lock a note with a passphrase. Open the note's menu and choose the encrypt option. The content is stored as encrypted Markdown — Agents can see the document exists but cannot read its contents, keeping private text out of Agent context while still allowing it to participate in your workspace.

## See also

- [Installation](./installation.md) — download or build Informio
- [First Launch](./first-launch.md) — what you see on first open
