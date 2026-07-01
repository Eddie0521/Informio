# Fonts

Informio provides three independent font family selectors — **Chinese**, **English**, and **Code** — so you can tune the reading experience for each language and content type separately.

## Font family selectors

Each selector is found in **Settings → Appearance → Font** and lists every font installed on your system. The dropdown includes a search field to filter by family name, full name, or style.

- **Chinese font** — used for CJK characters in the editor.
- **English font** — used for Latin characters in the editor.
- **Code font** — used for inline code and code blocks.

Fonts are loaded lazily — the system font list is fetched only when you first open a font selector.

## Editor font size

Controls the base text size in the editor area. Adjustable via a slider in **Settings → Appearance → Editor**.

- **Range**: 12–19 px
- Changes apply in real time as you drag the slider.

## Line height

Sets the vertical spacing between lines of text in the editor. Defined as a numeric multiplier (e.g. 1.6).

## Content width

Sets the maximum width of the editor text area in pixels. A narrower width keeps long lines readable; a wider width gives more horizontal space for large screens.

- **Range**: 410–1100 px
- Adjustable via a slider in **Settings → Appearance → Editor**.

## Chat font size

Controls the text size in the Agent conversation panel. This is a separate setting from the editor font size because the Agent panel has different density needs.

- **Range**: 10–18 px
- Adjustable via a slider in **Settings → Appearance → Chat**.

## Tips

- Use a monospace font for the **Code** selector to keep code blocks aligned.
- If Chinese and English text look mismatched, try pairing a sans-serif Chinese font with a similar-weight Latin font.
- The content width slider is a good place to start if the editor feels too wide or too narrow on your display.

## See also

- [Themes](./themes.md) — color themes and the custom color picker
- [Editor Settings](./editor-settings.md) — spellcheck, typewriter mode, tab size
- [Appearance](./appearance.md) — panel layout and language
