# Wiki Links

Informio supports Obsidian-compatible `[[wiki-link]]` syntax for linking between documents in your project.

## Syntax

```markdown
[[Document Title]]
[[Document Title|Display Text]]
```

- `[[Document Title]]` — links to a document by its title.
- `[[Document Title|Display Text]]` — links with custom display text (the alias).

## How Links Resolve

Wiki links resolve to documents within the current project workspace. The editor uses a lookup index built from all open documents. Matching is case-insensitive and handles partial titles.

- **Resolved links** appear styled and clickable.
- **Unresolved links** appear with a distinct style indicating no matching document was found.

## Creating Links

Type `[[` followed by a document name. A suggestion dropdown appears showing matching documents from your project. Use arrow keys to navigate and Enter to select.

If no matching document exists, pressing Enter creates a link that will resolve once a document with that title is added.

## Opening Links

Cmd+Click (or Ctrl+Click) a wiki link to navigate to the linked document. For unresolved links, Cmd+Click creates a new document with that title.

## Use Cases

Wiki links are useful for building a personal knowledge base:

- Link meeting notes to project documents
- Connect research references to summaries
- Build a network of interconnected ideas

## Markdown Output

Wiki links save as standard `[[...]]` syntax in Markdown, compatible with Obsidian and other tools that support wiki-style links.

## See also

- [Markdown Basics](markdown-basics.md) — standard link syntax `[text](url)`
- [Callouts, Details & Footnotes](callouts-details-footnotes.md) — footnotes for references
- [Clipboard Paste](clipboard-paste.md) — how pasted links are handled
