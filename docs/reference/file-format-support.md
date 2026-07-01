# File Format Support

Matrix of all file formats Informio can open, preview, or edit.

---

## Format matrix

| Format | Extension(s) | Editable | Auto-save | Conflict Detection | Notes |
|---|---|---|---|---|---|
| **Markdown** | `.md` | Yes | Yes (on edit) | No (file is in-library) | Primary document format. Stored in the Informio library with full version history support. |
| **Plain Text** | `.txt` | Yes | Yes (on edit) | No | Opened in the Markdown editor as plain text. |
| **PDF** | `.pdf` | No (preview only) | — | — | Rendered in a built-in PDF viewer with page navigation, zoom, and text selection. |
| **Spreadsheet** | `.xlsx` `.xls` `.csv` | Yes | Yes (900 ms debounce) | Yes (30 s fingerprint polling) | Editable spreadsheet grid powered by an embedded sheet engine. External modifications detected via file-size + mtime fingerprint polling every 30 seconds; a conflict dialog prompts reload, keep-local, or save-as. |
| **Image** | `.png` `.jpg` `.jpeg` `.gif` `.svg` `.webp` | No (preview only) | — | — | Displayed inline with zoom. Supports drag-to-resize in Markdown documents. |
| **Video** | `.mp4` `.mov` `.webm` | No (preview only) | — | — | Embedded `<video>` player with standard controls. |
| **Audio** | `.mp3` `.wav` `.m4a` `.ogg` | No (preview only) | — | — | Embedded `<audio>` player with standard controls. |

---

## Auto-save behavior

- **Markdown / Text**: saves automatically on each edit when `settings.markdown.autoSave` is `true` (default). No debounce — changes are written to the library on the next save cycle.
- **Spreadsheet**: saves automatically with a 900 ms debounce after the last edit. The debounce timer resets on every keystroke or cell edit to avoid excessive disk writes.

## Conflict detection

Conflict detection applies only to **external file formats** (Spreadsheet) that live outside the Informio library and may be modified by other applications.

- **Mechanism**: file-size + mtime fingerprint comparison, polled every 30 seconds.
- **On conflict**: a dialog offers three options:
  - **Reload** — discard local changes and load the external version.
  - **Keep Local** — overwrite the external file with your current version.
  - **Save As** — save your version to a new file, preserving both.
- **Markdown documents** do not use fingerprint-based conflict detection because they are stored within the Informio library.

## Import behavior

When a file is dragged into the editor or imported via the file picker, the `editor.assetImportMode` setting determines the behavior:

| Mode | Behavior |
|---|---|
| `copy-to-attachment` (default) | Copies the file into the project's attachment folder and links from there. |
| `link-original-file` | Keeps a reference to the original file path without copying. |
