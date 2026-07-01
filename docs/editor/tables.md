# Tables

Informio supports GFM (GitHub Flavored Markdown) pipe tables with rich editing controls.

## Creating a Table

- Use the Insert toolbar (table icon), or
- Type a pipe-separated header row on a plain paragraph and press Enter:
  ```
  | Name | Age | City |
  ```
  The editor converts it into a full table with a separator row.

## Column Alignment

Set alignment in the separator row using colons:

```markdown
| Left    | Center  | Right   |
|:--------|:-------:|--------:|
| data    | data    | data    |
```

- `:---` — left-aligned (default)
- `:---:` — center-aligned
- `---:` — right-aligned

## Resizing Columns and Rows

- **Column resize**: drag the handle on the right edge of a column header.
- **Row resize**: drag the handle on the bottom edge of a row header.
- Minimum column width is enforced to keep tables readable.

## Adding Rows and Columns

Hover near a table edge (between columns or between rows) to reveal a `+` button. Click it to insert a new column or row at that position.

## Table Toolbar

When a table is selected or actively hovered, a formatting toolbar appears above it. It provides:

- **Horizontal alignment**: left, center, right
- **Vertical alignment**: top, middle, bottom
- **Merge cells** and **split cells**
- **Delete row**, **delete column**, **delete table**

## Row and Column Selection

- Click a column header (A, B, C…) to select an entire column.
- Click a row header (1, 2, 3…) to select an entire row.
- Click the corner button to select the whole table.
- With a row or column selected, press Delete or Backspace to remove it.

## Session-only Layout

Column widths, row heights, and merged cells are editor-session layout only. The saved Markdown file keeps standard GFM pipe table syntax with cell content and per-column alignment markers. No HTML tables or presentation-only metadata are written to the file.

## See also

- [Markdown Basics](markdown-basics.md) — general editing and formatting
- [Code Blocks](code-blocks.md) — tables inside code blocks are not parsed
- [Clipboard Paste](clipboard-paste.md) — how pasted tables are handled
