# Clipboard Paste

Informio normalizes external HTML before it reaches the editor, ensuring clean and consistent content.

## HTML Normalization Pipeline

When you paste content from a web page or another application:

1. **Fragment extraction**: the editor extracts content between `StartFragment` and `EndFragment` markers that rich HTML sources provide.
2. **Style stripping**: site-only CSS styling, classes, and inline styles are removed.
3. **Attribute cleanup**: unsafe or application-specific attributes are stripped.
4. **Semantic preservation**: links, images, tables, and structural elements are kept.

## What Is Preserved

- **Links**: `<a href="...">` tags with their URLs
- **Images**: `<img src="...">` tags (referenced images, not inline data)
- **Tables**: HTML tables are converted to GFM pipe tables
- **Lists**: ordered and unordered lists
- **Text formatting**: bold, italic, code, and other semantic marks

## What Is Removed

- Inline CSS styles and class names
- Application-specific `data-*` attributes (except recognized ones)
- `<script>` and `<style>` tags
- Site-specific layout wrappers

## Source-mode Paste

When pasting in source mode, content stays readable. The raw text is inserted as-is without rich formatting.

## Pasting Images

Pasting image files from the clipboard saves them as attachments. The image is written to the app's attachment folder and referenced with a relative path in Markdown.

## Pasting Markdown

If the clipboard contains `text/markdown` content, the editor parses it as Markdown directly, preserving structure.

## Pasting URLs

Plain HTTP/HTTPS URLs on the clipboard are automatically converted to clickable links.

## Regression Fixtures

Per project rules: a regression fixture must be added before changing paste behavior. This ensures that normalization changes do not break existing workflows.

## See also

- [Markdown Basics](markdown-basics.md) — Typora-style input rules
- [Images & Media](images-media.md) — image handling and asset import modes
- [Tables](tables.md) — how pasted tables render
