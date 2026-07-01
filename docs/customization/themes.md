# Themes

Informio ships with four built-in themes. Switch between them in **Settings → Appearance → Theme** — changes apply instantly with a live preview.

## Built-in themes

| Theme | Style |
|-------|-------|
| **Paper** | Warm off-white background. The default. |
| **White** | Pure white background with neutral tones. |
| **Night** | Dark background for low-light environments. |
| **Custom** | Pick any accent color; Informio derives the palette automatically. |

The type signature is `ThemeName = 'paper' | 'white' | 'night' | 'custom'`.

## Visual direction

Informio's themes follow a consistent visual thesis: **quiet writing cockpit, white paper, thin dividers, green status accents, low visual noise.** Every theme prioritizes readability and keeps the editor surface calm — the writing area is the product, not the chrome around it.

## Custom theme

When you select **Custom**, a color picker appears below the theme swatches. Pick any hex color and Informio generates the surrounding palette — surface tones, divider colors, and accent shades — from that single value.

- The default custom color is `#159447` (green).
- The picker shows the current hex value next to the swatch.
- If the chosen color is dark enough, check marks and contrast-sensitive elements switch to white automatically.

To set a custom theme:

1. Open **Settings → Appearance**.
2. Click the **Custom** swatch (the fourth circle).
3. Use the color picker to choose your accent color.
4. The preview updates immediately across the entire UI.

## How themes work

Each theme defines CSS custom properties (e.g. `--surface-sidebar`, `--text-main`, `--accent`, `--divider`) that every component reads. When you switch themes, these variables change and the UI repaints without reloading.

Legacy theme names `mint` and `sepia` are automatically migrated to `custom` on load.

## See also

- [Appearance](./appearance.md) — panel layout, status bar, and language settings
- [Fonts](./fonts.md) — font family, size, and line height controls
- [Editor Settings](./editor-settings.md) — spellcheck, typewriter mode, and more
