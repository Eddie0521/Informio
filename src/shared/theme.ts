import type { ThemeName } from "./types.js";

export const SUPPORTED_THEMES: ThemeName[] = ["white", "paper", "night", "custom"];

export const DEFAULT_CUSTOM_THEME_COLOR = "#159447";

export const LEGACY_THEME_COLORS = {
  mint: "#0d8f55",
  sepia: "#8a6d3b"
} as const;

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === "string" && SUPPORTED_THEMES.includes(value as ThemeName);

export const migrateThemeName = (value: unknown): ThemeName => {
  if (value === "mint" || value === "sepia") return "custom";
  return isThemeName(value) ? value : "paper";
};

export const normalizeThemeColor = (value: unknown, fallback = DEFAULT_CUSTOM_THEME_COLOR) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
};
