import { describe, expect, it } from "vitest";
import {
  clampSpreadsheetZoom,
  isSpreadsheetPinchWheel,
  spreadsheetZoomFromWheel
} from "./spreadsheet-zoom";

describe("spreadsheet-zoom", () => {
  it("clamps zoom to spreadsheet limits", () => {
    expect(clampSpreadsheetZoom(0.1)).toBe(0.5);
    expect(clampSpreadsheetZoom(5)).toBe(2);
  });

  it("zooms in and out from wheel delta", () => {
    expect(spreadsheetZoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(spreadsheetZoomFromWheel(1, 100)).toBeLessThan(1);
  });

  it("detects pinch wheel gestures", () => {
    expect(isSpreadsheetPinchWheel({ ctrlKey: true, metaKey: false, deltaY: 1 } as WheelEvent)).toBe(true);
    expect(isSpreadsheetPinchWheel({ ctrlKey: false, metaKey: false, deltaY: 1 } as WheelEvent)).toBe(false);
  });
});
