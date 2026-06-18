import { describe, expect, it } from "vitest";
import type { WorkbookInstance } from "@fortune-sheet/react";
import { exportFormatFromPath, exportSpreadsheetBlob } from "./spreadsheet-export";

describe("exportFormatFromPath", () => {
  it("returns csv for csv files", () => {
    expect(exportFormatFromPath("/tmp/data.csv")).toBe("csv");
  });

  it("returns xlsx for xlsx and xls files", () => {
    expect(exportFormatFromPath("/tmp/budget.xlsx")).toBe("xlsx");
    expect(exportFormatFromPath("/tmp/legacy.xls")).toBe("xlsx");
  });
});

describe("exportSpreadsheetBlob", () => {
  it("throws when workbook ref is not ready", async () => {
    await expect(exportSpreadsheetBlob({ current: null }, "xlsx")).rejects.toThrow(
      "Spreadsheet viewer is not ready"
    );
  });

  it("exports xlsx bytes from workbook data", async () => {
    const sheetRef = {
      current: {
        getAllSheets: () => [
          {
            name: "Sheet1",
            data: [[{ v: "A1" }, { v: 2 }], [{ v: "B1" }, { v: 3 }]]
          }
        ],
        celldataToData: () => null
      } as unknown as WorkbookInstance
    };

    const blob = await exportSpreadsheetBlob(sheetRef, "xlsx");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("exports without crashing on malformed inlineStr cells (missing rich-text array)", async () => {
    // `@corbe30/fortune-excel` 导入会产生 ct.t==="inlineStr" 但 s 缺失的坏单元格,
    // 其导出器对 s 执行 forEach 会崩溃。净化逻辑应把它还原成普通文本单元格。
    const sheetRef = {
      current: {
        getAllSheets: () => [
          {
            name: "Sheet1",
            data: [
              [
                { ct: { t: "inlineStr", fa: "General" }, m: "rich text" },
                { v: 1 }
              ]
            ]
          }
        ],
        celldataToData: () => null
      } as unknown as WorkbookInstance
    };

    const blob = await exportSpreadsheetBlob(sheetRef, "xlsx");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
