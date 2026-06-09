import type { CSSProperties } from "react";
import {
  Palette,
  Text,
  Unplug,
  Search,
  Keyboard,
  Info,
} from "lucide-react";
import type { ThemeName, LocalFontOption, AppSettings } from "../../../shared/types";
import { themeOptions, CODE_FONT_FALLBACK, CHINESE_FONT_FALLBACK, ENGLISH_FONT_FALLBACK } from "../constants";
import { DEFAULT_CUSTOM_THEME_COLOR } from "../../../shared/theme";

export const getThemeSwatchStyle = (themeId: ThemeName, customThemeColor: string): CSSProperties => {
  const option = themeOptions.find((item) => item.id === themeId) ?? themeOptions[0];
  const accent = themeId === "custom" ? customThemeColor : option.accent;
  return {
    background: `linear-gradient(140deg, ${option.surface} 0 64%, ${accent} 64% 100%)`,
    boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.12)"
  };
};

export const isDarkColor = (color: string) => {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) return false;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance < 150;
};

export const settingsNav = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "editor", label: "编辑器", icon: Text },
  { id: "agent", label: "Agent", icon: Unplug },
  { id: "api", label: "API", icon: Search },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
  { id: "about", label: "关于", icon: Info }
] as const;

export const mergeFontOptions = (fonts: LocalFontOption[], ...currentFamilies: Array<string | undefined>) => {
  const deduped = new Map<string, LocalFontOption>();
  fonts.forEach((font) => {
    const family = font.family.trim();
    if (!family || deduped.has(family)) return;
    deduped.set(family, { ...font, family });
  });
  currentFamilies.forEach((family) => {
    const trimmed = family?.trim();
    if (!trimmed || deduped.has(trimmed)) return;
    deduped.set(trimmed, { family: trimmed });
  });
  return Array.from(deduped.values()).sort((left, right) => left.family.localeCompare(right.family));
};

// Shared mutable state for selection toolbar text.
// Captured on mouseup inside TranslationResultText so that Cmd+C can still
// honor a partial drag even when the DOM Selection collapses before the
// Electron menu accelerator fires `edit:copy`.
export let lastToolbarSelectionText = "";

export const setLastToolbarSelectionText = (value: string) => {
  lastToolbarSelectionText = value;
};

export const quoteFontFamily = (family: string) => `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
export const buildConfiguredFontStack = (family: string | undefined, fallback: string) => {
  const trimmed = family?.trim();
  return trimmed ? `${quoteFontFamily(trimmed)}, ${fallback}` : fallback;
};
export const buildUiFontStack = (
  englishFontFamily: string | undefined,
  chineseFontFamily: string | undefined
) => {
  const orderedFamilies = [
    englishFontFamily?.trim() ? quoteFontFamily(englishFontFamily.trim()) : null,
    chineseFontFamily?.trim() ? quoteFontFamily(chineseFontFamily.trim()) : null,
    `"PingFang SC"`,
    `"Hiragino Sans GB"`,
    `"Microsoft YaHei"`,
    `"Noto Sans CJK SC"`,
    `"Helvetica Neue"`,
    `-apple-system`,
    `BlinkMacSystemFont`,
    `"Segoe UI"`,
    `Arial`,
    `sans-serif`
  ].filter(Boolean);
  return Array.from(new Set(orderedFamilies)).join(", ");
};
export const buildShellStyle = (appearance: AppSettings["appearance"]): CSSProperties => {
  const style: CSSProperties & Record<string, string> = {
    "--informio-font-family": buildUiFontStack(
      appearance.englishFontFamily,
      appearance.chineseFontFamily
    ),
    "--informio-code-font-family": buildConfiguredFontStack(appearance.codeFontFamily, CODE_FONT_FALLBACK)
  };
  if (appearance.theme === "custom") {
    style["--custom-theme-color"] = appearance.customThemeColor || DEFAULT_CUSTOM_THEME_COLOR;
  }
  return style;
};


export const syncDocumentAppearanceVariables = (appearance: AppSettings["appearance"]) => {
  const root = document.documentElement;
  const style = buildShellStyle(appearance) as Record<string, string>;
  Object.entries(style).forEach(([key, value]) => root.style.setProperty(key, value));
  root.style.setProperty("--font-sans", "var(--informio-font-family)");
  root.style.setProperty("--font-mono", "var(--informio-code-font-family)");
};
