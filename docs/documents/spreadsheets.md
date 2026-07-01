# Spreadsheets

Informio provides in-app editing for spreadsheet files using a cell-level grid editor.

## Supported formats

- `.xlsx` (Excel workbook)
- `.xls` (legacy Excel workbook)
- `.csv` (comma-separated values)

## Source of truth

The binary workbook file is the source of truth. The `markdown` field in the library is only a link reference — all actual data lives in the spreadsheet file itself.

## Editing

Cell editing happens in the `SpreadsheetGrid` component. Click a cell to select it, type to edit, and press Enter or click away to confirm.

## Zoom

Pinch gesture and mouse wheel control zoom level. Zoom is clamped between a minimum and maximum to prevent unusable scales.

## Auto-save

After each edit, a 900ms debounce timer starts. When it fires, the workbook is exported to a blob and written back to disk automatically. You do not need to save manually.

## External modification detection

Informio polls the file's fingerprint (mtime + size) every 30 seconds while a spreadsheet is open. If an external application modifies the file, a conflict dialog appears.

## Conflict resolution

When an external change is detected, three options are available:

| Action | Effect |
|---|---|
| **Reload** | Discard local edits and load the disk version |
| **Keep local** | Accept the external fingerprint but retain your edits |
| **Save as** | Write your local edits to a new file |

The dialog also warns if you have unsaved local changes.

## File extension preservation

Saving a `.xls` file writes it back as `.xls` — Informio does not silently convert legacy formats to `.xlsx`.

## See also

- [PDF Viewer](pdf-viewer.md) — previewing PDF files
- [Outline](outline.md) — navigating Markdown document structure
