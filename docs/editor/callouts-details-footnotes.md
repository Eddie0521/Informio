# Callouts, Details & Footnotes

Informio supports three specialized block types for structured content.

## Callouts

Callouts are admonition-style blocks used to highlight information. They use Obsidian-compatible syntax:

```markdown
> [!NOTE]
> This is a note callout.

> [!TIP]
> Helpful tip goes here.

> [!WARNING]
> Be careful with this.
```

Supported callout types: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`.

Insert a callout from the Insert toolbar (quote icon). The editor shows a styled preview with the callout type label.

## Details (Collapsible Blocks)

Details blocks create collapsible sections with a summary. Use the Obsidian callout syntax with a `-` suffix:

```markdown
> [!note]- Click to expand
> Hidden content goes here.
```

Or use HTML `<details>` syntax:

```html
<details>
<summary>Click to expand</summary>
Content here.
</details>
```

The editor renders the block with the summary visible and content collapsible. Click to expand or collapse.

## Footnotes

Footnotes let you add references and notes without cluttering the main text.

### Inserting a Footnote

Use the Insert toolbar (footnote icon) to insert a footnote. This adds:

1. A footnote marker in the text (e.g., `[^1]`)
2. A footnote definition block at the bottom (e.g., `[^1]: Footnote text`)

### Markdown Syntax

Inline marker:

```markdown
This claim needs a source[^1].
```

Definition (typically at the end of the document):

```markdown
[^1]: Source details go here.
```

The editor renders the marker as a superscript number and the definition as a labeled block.

## Source Editing

Click any of these blocks to toggle into source-editing mode. The raw Markdown syntax becomes editable. Click outside to return to the rendered preview.

## See also

- [Markdown Basics](markdown-basics.md) — blockquote syntax (used by callouts)
- [Math & Diagrams](math-diagrams.md) — other specialized blocks
- [Wiki Links](wiki-links.md) — linking between documents
