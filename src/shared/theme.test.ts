import { describe, expect, it } from "vitest";

import {
  SUPPORTED_THEMES,
  DEFAULT_CUSTOM_THEME_COLOR,
  LEGACY_THEME_COLORS,
  isThemeName,
  migrateThemeName,
  normalizeThemeColor
} from "./theme.js";

describe("SUPPORTED_THEMES", () => {
  it("contains all four expected theme names", () => {
    expect(SUPPORTED_THEMES).toEqual(["white", "paper", "night", "custom"]);
  });

  it("has exactly 4 entries", () => {
    expect(SUPPORTED_THEMES).toHaveLength(4);
  });
});

describe("DEFAULT_CUSTOM_THEME_COLOR", () => {
  it("is a valid 6-digit hex color", () => {
    expect(DEFAULT_CUSTOM_THEME_COLOR).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("equals #159447", () => {
    expect(DEFAULT_CUSTOM_THEME_COLOR).toBe("#159447");
  });
});

describe("LEGACY_THEME_COLORS", () => {
  it("has mint and sepia entries", () => {
    expect(LEGACY_THEME_COLORS.mint).toBe("#0d8f55");
    expect(LEGACY_THEME_COLORS.sepia).toBe("#8a6d3b");
  });

  it("contains only valid hex colors", () => {
    for (const color of Object.values(LEGACY_THEME_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("isThemeName", () => {
  it("returns true for every supported theme", () => {
    for (const theme of SUPPORTED_THEMES) {
      expect(isThemeName(theme)).toBe(true);
    }
  });

  it("returns false for legacy theme names", () => {
    expect(isThemeName("mint")).toBe(false);
    expect(isThemeName("sepia")).toBe(false);
  });

  it("returns false for arbitrary strings", () => {
    expect(isThemeName("dark")).toBe(false);
    expect(isThemeName("")).toBe(false);
    expect(isThemeName("Paper")).toBe(false);
  });

  it("returns false for non-string types", () => {
    expect(isThemeName(undefined)).toBe(false);
    expect(isThemeName(null)).toBe(false);
    expect(isThemeName(0)).toBe(false);
    expect(isThemeName(1)).toBe(false);
    expect(isThemeName(true)).toBe(false);
    expect(isThemeName(false)).toBe(false);
    expect(isThemeName({})).toBe(false);
    expect(isThemeName([])).toBe(false);
  });
});

describe("migrateThemeName", () => {
  it("maps legacy mint to custom", () => {
    expect(migrateThemeName("mint")).toBe("custom");
  });

  it("maps legacy sepia to custom", () => {
    expect(migrateThemeName("sepia")).toBe("custom");
  });

  it("returns valid theme names unchanged", () => {
    for (const theme of SUPPORTED_THEMES) {
      expect(migrateThemeName(theme)).toBe(theme);
    }
  });

  it("falls back to paper for unknown strings", () => {
    expect(migrateThemeName("dark")).toBe("paper");
    expect(migrateThemeName("")).toBe("paper");
    expect(migrateThemeName("light")).toBe("paper");
  });

  it("falls back to paper for non-string types", () => {
    expect(migrateThemeName(undefined)).toBe("paper");
    expect(migrateThemeName(null)).toBe("paper");
    expect(migrateThemeName(42)).toBe("paper");
    expect(migrateThemeName(true)).toBe("paper");
    expect(migrateThemeName({})).toBe("paper");
    expect(migrateThemeName([])).toBe("paper");
  });
});

describe("normalizeThemeColor", () => {
  it("returns the normalized lowercase hex for a valid color", () => {
    expect(normalizeThemeColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeThemeColor("#abcdef")).toBe("#abcdef");
    expect(normalizeThemeColor("#000000")).toBe("#000000");
    expect(normalizeThemeColor("#ffffff")).toBe("#ffffff");
  });

  it("trims whitespace before validating", () => {
    expect(normalizeThemeColor("  #AABBCC  ")).toBe("#aabbcc");
    expect(normalizeThemeColor("\t#123456\n")).toBe("#123456");
  });

  it("falls back to DEFAULT_CUSTOM_THEME_COLOR for invalid formats", () => {
    expect(normalizeThemeColor("#abc")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // 3-digit shorthand
    expect(normalizeThemeColor("#aabbccdd")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // 8-digit
    expect(normalizeThemeColor("aabbcc")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // missing #
    expect(normalizeThemeColor("#gggggg")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // non-hex chars
    expect(normalizeThemeColor("#AABBCC00")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // 8-digit hex
    expect(normalizeThemeColor("red")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // named color
    expect(normalizeThemeColor("rgb(0,0,0)")).toBe(DEFAULT_CUSTOM_THEME_COLOR); // rgb format
  });

  it("falls back to DEFAULT_CUSTOM_THEME_COLOR for non-string types", () => {
    expect(normalizeThemeColor(undefined)).toBe(DEFAULT_CUSTOM_THEME_COLOR);
    expect(normalizeThemeColor(null)).toBe(DEFAULT_CUSTOM_THEME_COLOR);
    expect(normalizeThemeColor(0)).toBe(DEFAULT_CUSTOM_THEME_COLOR);
    expect(normalizeThemeColor(123)).toBe(DEFAULT_CUSTOM_THEME_COLOR);
    expect(normalizeThemeColor(true)).toBe(DEFAULT_CUSTOM_THEME_COLOR);
    expect(normalizeThemeColor({})).toBe(DEFAULT_CUSTOM_THEME_COLOR);
    expect(normalizeThemeColor([])).toBe(DEFAULT_CUSTOM_THEME_COLOR);
  });

  it("uses a custom fallback when provided", () => {
    const customFallback = "#000000";
    expect(normalizeThemeColor(undefined, customFallback)).toBe(customFallback);
    expect(normalizeThemeColor("invalid", customFallback)).toBe(customFallback);
    expect(normalizeThemeColor("#abc", customFallback)).toBe(customFallback);
  });

  it("returns the value itself when valid, ignoring fallback", () => {
    expect(normalizeThemeColor("#aabbcc", "#000000")).toBe("#aabbcc");
  });
});
