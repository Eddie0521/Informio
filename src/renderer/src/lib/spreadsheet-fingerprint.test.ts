import { describe, expect, it } from "vitest";
import { spreadsheetFingerprintsEqual } from "./spreadsheet-fingerprint";

describe("spreadsheetFingerprintsEqual", () => {
  it("returns true when mtime and size match", () => {
    expect(spreadsheetFingerprintsEqual({ mtimeMs: 100, size: 42 }, { mtimeMs: 100, size: 42 })).toBe(true);
  });

  it("returns false when either fingerprint is missing or values differ", () => {
    expect(spreadsheetFingerprintsEqual(null, { mtimeMs: 100, size: 42 })).toBe(false);
    expect(spreadsheetFingerprintsEqual({ mtimeMs: 100, size: 42 }, { mtimeMs: 101, size: 42 })).toBe(false);
    expect(spreadsheetFingerprintsEqual({ mtimeMs: 100, size: 42 }, { mtimeMs: 100, size: 43 })).toBe(false);
  });
});
