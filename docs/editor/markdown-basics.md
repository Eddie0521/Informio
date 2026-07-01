# Markdown Basics

Informio uses a Tiptap-based rich text editor that reads and writes standard Markdown. You write visually; the file stays clean Markdown.

## Text Formatting

| Action          | Shortcut       | Markdown syntax  |
|-----------------|----------------|------------------|
| Bold            | Cmd+B          | `**text**`       |
| Italic          | Cmd+I          | `*text*`         |
| Underline       | Cmd+U          | `++text++`       |
| Strikethrough   | Shift+Cmd+X    | `~~text~~`       |
| Highlight       | Shift+Cmd+M    | `==text==`       |
| Inline code     | Cmd+E          | `` `text` ``     |
| Subscript       | —              | `x_{1}`          |
| Superscript     | —              | `x^{2}`          |

Subscript and superscript also support parenthesized values: `x_{abc}`, `x^{abc}`.

## Headings

Type `#` through `######` followed by a space at the start of a line. The editor converts it to a heading on Enter or when the line is committed.

## Lists

- **Bullet list**: type `- ` or `* ` at the start of a line.
- **Ordered list**: type `1. ` at the start of a line.
- **Task list**: type `- [ ] ` for an unchecked item, `- [x] ` for checked.

All three list types are available from the Insert toolbar.

## Typora-style Markdown Input

The editor converts common Markdown syntax as you type:

- `**bold**` → bold text
- `*italic*` → italic text
- `` `code` `` → inline code
- `~~strike~~` → strikethrough
- `++underline++` → underline
- `[text](url)` → link
- `![alt](src)` → image

Conversions happen automatically when you close the closing delimiter.

## Block Creation

Type one of these on a plain paragraph and press Enter:

- `---` or `***` → horizontal rule
- `` ``` `` or `` ```lang `` → code block (optionally with language)
- `$$` → math block
- A pipe-separated header row (e.g. `| Name | Age |`) → table

## Placeholder

An empty document shows placeholder text to guide first-time users. It disappears once you start typing.

## Selection Toolbar

Select any text to see a floating toolbar with formatting actions (bold, italic, underline, strikethrough, subscript, superscript, highlight, link) plus translate and encrypt options.

## See also

- [Tables](tables.md) — GFM pipe tables with resize and alignment
- [Code Blocks](code-blocks.md) — syntax-highlighted code
- [Math & Diagrams](math-diagrams.md) — KaTeX and Mermaid
- [Clipboard Paste](clipboard-paste.md) — how pasted content is normalized
