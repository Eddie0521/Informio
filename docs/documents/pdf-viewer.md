# PDF Viewer

Informio renders PDF files using EmbedPDF (pdfium-based), providing fast in-app preview without an external viewer.

## Default mode

The PDF viewer opens in plain browsing mode. You can scroll, zoom, and select text normally. No annotation tools are active by default.

## Highlight mode

PDF highlight mode is available from the PDF toolbar (pdf.js native). Activate it to highlight passages directly within the PDF. Highlights are saved back to the source file automatically.

## Text selection and Agent context

Selecting text in a PDF surfaces a "Translate" button in the selection menu. The selected text, along with its page number and bounding rectangles, can be sent to the Agent as context for translation or analysis.

The selection payload includes:

- The selected text content
- Page number (1-indexed)
- Bounding rects (x, y, width, height) for each selection range

## PDF annotation management is intentionally excluded

Comment dialogs, annotation side panels, and PDF-to-Markdown backlink management are **not** part of the PDF viewer. This is a deliberate product decision (see `PROJECT_RULES.md`): these surfaces stay out unless reintroduced with a rule update.

## View state persistence

The viewer remembers your scroll position and zoom level per document. When you reopen a PDF, it restores where you left off.

## Embedded PDF blocks

PDFs can also appear as inline blocks within a Markdown document. In this compact mode, the viewer supports the same browsing and selection features, plus a floating menu with "Open in system app" and "Remove PDF" options.

## See also

- [Spreadsheets](spreadsheets.md) — editing `.xlsx` / `.csv` files in-app
- [Outline](outline.md) — navigating document structure
