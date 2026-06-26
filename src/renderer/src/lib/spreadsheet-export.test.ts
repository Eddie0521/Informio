import { describe, expect, it } from "vitest";
import { exportFormatFromPath, exportSpreadsheetBlob } from "./spreadsheet-export";
import type { SpreadsheetWorkbook } from "./spreadsheet-workbook";

describe("exportFormatFromPath", () => {
  it("returns csv for csv files", () => {
    expect(exportFormatFromPath("/tmp/data.csv")).toBe("csv");
  });

  it("returns xlsx for xlsx files and xls for xls files", () => {
    expect(exportFormatFromPath("/tmp/budget.xlsx")).toBe("xlsx");
    expect(exportFormatFromPath("/tmp/legacy.xls")).toBe("xls");
  });
});

describe("exportSpreadsheetBlob", () => {
  it("throws when workbook ref is not ready", async () => {
    await expect(exportSpreadsheetBlob({ current: null }, "xlsx")).rejects.toThrow(
      "Spreadsheet viewer is not ready"
    );
  });

  it("exports xlsx bytes from workbook data", async () => {
    const workbook: SpreadsheetWorkbook = {
      activeSheetIndex: 0,
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["A1", 2],
            ["B1", 3]
          ]
        }
      ]
    };
    const result = await exportSpreadsheetBlob({ current: workbook }, "xlsx");
    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
