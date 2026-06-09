import type { CSSProperties } from "react";
import {
  Palette,
  Text,
  Unplug,
  Search,
  Keyboard,
  Info,
} from "lucide-react";
import type { ThemeName, LocalFontOption } from "../../../shared/types";
import { themeOptions } from "../constants";

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
