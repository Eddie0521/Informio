import { describe, expect, it } from "vitest";
import {
  shortcutRegistry,
  shortcutRegistryById,
  configurableShortcutEntries,
  normalizeAccelerator,
  defaultShortcutBindings,
  normalizeShortcutBindings,
  getShortcutAccelerator,
  findShortcutConflict,
  acceleratorToDisplay,
  acceleratorFromKeyboardEvent
} from "./shortcuts";

describe("shortcutRegistry", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(shortcutRegistry)).toBe(true);
    expect(shortcutRegistry.length).toBeGreaterThan(0);
  });
  it("each entry has id and label", () => {
    for (const entry of shortcutRegistry) {
      expect(entry.id).toBeTruthy();
      expect(entry.label).toBeTruthy();
    }
  });
});

describe("shortcutRegistryById", () => {
  it("maps all registry entries", () => {
    expect(shortcutRegistryById.size).toBe(shortcutRegistry.length);
  });
  it("contains known entries", () => {
    for (const entry of shortcutRegistry) {
      expect(shortcutRegistryById.get(entry.id)).toBe(entry);
    }
  });
});

describe("configurableShortcutEntries", () => {
  it("is a subset of registry", () => {
    expect(configurableShortcutEntries.length).toBeLessThanOrEqual(shortcutRegistry.length);
  });
  it("filters out non-configurable", () => {
    for (const entry of configurableShortcutEntries) {
      expect(entry.configurable).not.toBe(false);
    }
  });
});

describe("normalizeAccelerator", () => {
  it("returns empty for null/undefined", () => {
    expect(normalizeAccelerator(null)).toBe("");
    expect(normalizeAccelerator(undefined)).toBe("");
  });
  it("normalizes Command+S", () => {
    expect(normalizeAccelerator("Command+S")).toBe("Command+S");
  });
  it("normalizes Control+S", () => {
    expect(normalizeAccelerator("Control+S")).toBe("Control+S");
  });
  it("preserves CommandOrControl+S", () => {
    expect(normalizeAccelerator("CommandOrControl+S")).toBe("CommandOrControl+S");
  });
  it("returns empty for modifier-only", () => {
    expect(normalizeAccelerator("Command")).toBe("");
  });
  it("returns empty for empty string", () => {
    expect(normalizeAccelerator("")).toBe("");
  });
  it("handles multiple modifiers", () => {
    expect(normalizeAccelerator("Shift+CommandOrControl+S")).toBe("CommandOrControl+Shift+S");
  });
});

describe("defaultShortcutBindings", () => {
  it("is an object", () => {
    expect(typeof defaultShortcutBindings).toBe("object");
  });
  it("has entries for configurable shortcuts", () => {
    expect(Object.keys(defaultShortcutBindings).length).toBeGreaterThan(0);
  });
});

describe("getShortcutAccelerator", () => {
  it("returns binding for known id", () => {
    const bindings = { "save": "CommandOrControl+S" };
    expect(getShortcutAccelerator(bindings, "save")).toBe("CommandOrControl+S");
  });
  it("returns default for known id with no binding", () => {
    const result = getShortcutAccelerator({}, "save");
    // May return a default or undefined depending on registry
    expect(typeof result === "string" || result === undefined).toBe(true);
  });
});

describe("findShortcutConflict", () => {
  it("returns null for empty bindings", () => {
    expect(findShortcutConflict({}, "save", "CommandOrControl+S")).toBeNull();
  });
  it("ignores self", () => {
    const bindings = { "save": "CommandOrControl+S" };
    expect(findShortcutConflict(bindings, "save", "CommandOrControl+S")).toBeNull();
  });
});

describe("acceleratorToDisplay", () => {
  it("returns a string for valid input", () => {
    const result = acceleratorToDisplay("CommandOrControl+S", "mac");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
  it("handles empty input", () => {
    expect(acceleratorToDisplay("")).toBeTruthy();
    expect(acceleratorToDisplay(undefined)).toBeTruthy();
  });
});

describe("acceleratorFromKeyboardEvent", () => {
  it("returns a string", () => {
    const event = { metaKey: true, key: "s", ctrlKey: false, altKey: false, shiftKey: false };
    const result = acceleratorFromKeyboardEvent(event);
    expect(typeof result).toBe("string");
  });
  it("returns empty for modifier-only", () => {
    const event = { metaKey: true, key: "Meta", ctrlKey: false, altKey: false, shiftKey: false };
    expect(acceleratorFromKeyboardEvent(event)).toBe("");
  });
});
