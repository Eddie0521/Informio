import { describe, expect, it } from "vitest";
import {
  clampSpreadsheetZoom,
  isSpreadsheetPinchWheel,
  spreadsheetZoomFromWheel,
  SPREADSHEET_MAX_ZOOM,
  SPREADSHEET_MIN_ZOOM
} from "./spreadsheet-zoom";

describe("spreadsheet-zoom", () => {
  it("clamps zoom to fortune-sheet limits", () => {
    expect(clampSpreadsheetZoom(0.01)).toBe(SPREADSHEET_MIN_ZOOM);
    expect(clampSpreadsheetZoom(10)).toBe(SPREADSHEET_MAX_ZOOM);
    expect(clampSpreadsheetZoom(1.234)).toBe(1.23);
  });

  it("zooms in and out from wheel delta", () => {
    expect(spreadsheetZoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(spreadsheetZoomFromWheel(1, 100)).toBeLessThan(1);
  });

  it("detects pinch wheel gestures", () => {
    expect(isSpreadsheetPinchWheel({ ctrlKey: true, metaKey: false, deltaY: 12 } as WheelEvent)).toBe(true);
    expect(isSpreadsheetPinchWheel({ ctrlKey: false, metaKey: false, deltaY: 12 } as WheelEvent)).toBe(false);
    expect(isSpreadsheetPinchWheel({ ctrlKey: true, metaKey: false, deltaY: 0 } as WheelEvent)).toBe(false);
  });
});
