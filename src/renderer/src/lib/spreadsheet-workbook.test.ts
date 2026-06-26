import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addWorkbookSheet,
  columnLabel,
  deleteSheetColumn,
  deleteSheetRow,
  deleteWorkbookSheet,
  exportSpreadsheetWorkbook,
  insertSheetColumn,
  insertSheetRow,
  loadSpreadsheetWorkbook,
  updateWorkbookCell
} from "./spreadsheet-workbook";

const fixturePath = resolve("test-fixtures/Benchmark_完整表格.xlsx");

describe("spreadsheet-workbook", () => {
  it("loads benchmark xlsx with sheet data", () => {
    const buffer = readFileSync(fixturePath);
    const workbook = loadSpreadsheetWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "xlsx");
    expect(workbook.sheets.length).toBeGreaterThan(0);
    expect(workbook.sheets[0]?.name).toBe("Benchmarks");
    expect(workbook.sheets[0]?.rows[0]?.[0]).toBe("任务分类");
    expect(workbook.sheets[0]?.rows.length).toBeGreaterThan(1);
  });

  it("round-trips workbook data through xlsx export", () => {
    const buffer = readFileSync(fixturePath);
    const workbook = loadSpreadsheetWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "xlsx");
    const blob = exportSpreadsheetWorkbook(workbook, "xlsx");
    expect(blob.type).toContain("spreadsheetml.sheet");
    return blob.arrayBuffer().then((exported) => {
      const roundTrip = loadSpreadsheetWorkbook(exported, "xlsx");
      expect(roundTrip.sheets[0]?.rows[0]?.[0]).toBe("任务分类");
    });
  });

  it("updates cells immutably", () => {
    const workbook = {
      activeSheetIndex: 0,
      sheets: [{ name: "Sheet1", rows: [] as (string | number | boolean | null)[][] }]
    };
    const next = updateWorkbookCell(workbook, 0, 1, 2, "hello");
    expect(next.sheets[0]?.rows[1]?.[2]).toBe("hello");
    expect(workbook.sheets[0]?.rows[1]?.[2]).toBeUndefined();
  });

  it("labels columns like Excel", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
    expect(columnLabel(26)).toBe("AA");
  });

  it("inserts and deletes rows and columns", () => {
    const base = {
      activeSheetIndex: 0,
      sheets: [{ name: "Sheet1", rows: [["A", "B"], ["C", "D"]] }]
    };
    const withRow = insertSheetRow(base, 0, 1);
    expect(withRow.sheets[0]?.rows).toEqual([["A", "B"], [null, null], ["C", "D"]]);
    const withoutRow = deleteSheetRow(withRow, 0, 0);
    expect(withoutRow.sheets[0]?.rows).toEqual([[null, null], ["C", "D"]]);
    const withCol = insertSheetColumn(withoutRow, 0, 0);
    expect(withCol.sheets[0]?.rows[0]).toEqual([null, null, null]);
    expect(withCol.sheets[0]?.rows[1]).toEqual([null, "C", "D"]);
    const withoutCol = deleteSheetColumn(withCol, 0, 0);
    expect(withoutCol.sheets[0]?.rows[1]).toEqual(["C", "D"]);
  });

  it("adds and deletes sheets", () => {
    const base = {
      activeSheetIndex: 0,
      sheets: [{ name: "Sheet1", rows: [["A"]] }]
    };
    const withSheet = addWorkbookSheet(base);
    expect(withSheet.sheets).toHaveLength(2);
    expect(withSheet.activeSheetIndex).toBe(1);
    const backToOne = deleteWorkbookSheet(withSheet, 1);
    expect(backToOne.sheets).toHaveLength(1);
    expect(deleteWorkbookSheet(backToOne, 0).sheets).toHaveLength(1);
  });
});
