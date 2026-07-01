# Editor Settings

Found in **Settings → Editor**, these controls shape the writing experience.

## Font size

Base text size for the editor. Adjustable via slider.

- **Range**: 12–19 px

## Line height

Vertical spacing between lines of text, expressed as a numeric multiplier.

## Content width

Maximum width of the editor text area in pixels. Keeps long lines comfortable to read on wide displays.

- **Range**: 410–1100 px

## Spellcheck

Toggle the browser-level spell checker for the editor surface. Useful for catching typos in prose; many users disable it when writing code-heavy documents.

## Typewriter mode

When enabled, the current line stays vertically centered in the editor viewport as you type. This keeps your eye focus near the middle of the screen and reduces visual fatigue during long writing sessions.

## Asset import mode

Controls what happens when you drag or paste an image (or other file) into the editor.

| Mode | Behavior |
|------|----------|
| **Copy to attachment** | Copies the file into an `assets/` folder alongside your document. The Markdown references the local copy. |
| **Link original file** | Inserts a reference to the file at its original filesystem path. No copy is made. |

"Copy to attachment" is the safer default for portability — your document and its images stay together. "Link original file" avoids duplication when you control the file's location.

## Tab size

Number of spaces the editor inserts when you press Tab. Adjustable from 2 to 8.

## Auto-save

When enabled, Informio saves your document automatically as you type. When disabled, you save manually with Cmd+S (or your custom binding).

## Export format

Sets the default format when exporting a document:

- **Markdown** — exports the raw `.md` file.
- **HTML** — exports a rendered HTML file.

## See also

- [Fonts](./fonts.md) — font family, size, and line height controls
- [Themes](./themes.md) — color themes
- [Keyboard Shortcuts](./keyboard-shortcuts.md) — configurable key bindings
