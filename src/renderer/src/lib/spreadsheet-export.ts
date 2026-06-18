import * as XLSX from "xlsx";
import type { WorkbookInstance } from "@fortune-sheet/react";
import { transformFortuneToExcel } from "@corbe30/fortune-excel";
import { IFileType } from "@corbe30/fortune-excel/dist/common/ICommon";
import type { RefObject } from "react";
import { sanitizeSheetDataMatrix } from "./spreadsheet-sanitize";

export type SpreadsheetExportFormat = "xlsx" | "csv";

type FortuneSheet = ReturnType<WorkbookInstance["getAllSheets"]>[number];

type CellLike = { v?: unknown; m?: unknown; f?: unknown };

const cellExportValue = (cell: unknown): string | number | boolean => {
  if (!cell || typeof cell !== "object") return "";
  const value = cell as CellLike;
  if (value.f != null && value.f !== "") {
    const formula = String(value.f).startsWith("=") ? String(value.f) : `=${String(value.f)}`;
    return formula;
  }
  const raw = value.v ?? value.m ?? "";
  return typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : String(raw);
};

const normalizeSheetForExport = (instance: WorkbookInstance, sheet: FortuneSheet): FortuneSheet => {
  if (Array.isArray(sheet.data) && sheet.data.length > 0) {
    return { ...sheet, data: sanitizeSheetDataMatrix(sheet.data) };
  }
  if (sheet.celldata?.length) {
    const data = instance.celldataToData(sheet.celldata);
    if (data) {
      return { ...sheet, data: sanitizeSheetDataMatrix(data) };
    }
  }
  return { ...sheet, data: sheet.data ?? [] };
};

const exportWithSheetJS = (sheets: FortuneSheet[], format: SpreadsheetExportFormat): Blob => {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet, index) => {
    const rows = (sheet.data ?? []).map((row) =>
      Array.isArray(row) ? row.map((cell) => cellExportValue(cell)) : []
    );
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name || `Sheet${index + 1}`);
  });

  if (format === "csv") {
    const firstSheetName = workbook.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName] ?? {});
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  }

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

export async function exportSpreadsheetBlob(
  sheetRef: RefObject<WorkbookInstance | null>,
  format: SpreadsheetExportFormat
): Promise<Blob> {
  const instance = sheetRef.current;
  if (!instance || typeof instance.getAllSheets !== "function") {
    throw new Error("Spreadsheet viewer is not ready");
  }

  const sheets = instance.getAllSheets();
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("Spreadsheet has no sheets to export");
  }

  const normalizedSheets = sheets.map((sheet) => normalizeSheetForExport(instance, sheet));

  try {
    const fortuneRef = {
      current: {
        getAllSheets: () => normalizedSheets,
        getSheet: () => normalizedSheets[0]
      }
    };
    return await transformFortuneToExcel(
      fortuneRef,
      format === "csv" ? IFileType.CSV : IFileType.XLSX,
      false
    );
  } catch {
    return exportWithSheetJS(normalizedSheets, format);
  }
}

export const exportFormatFromPath = (filePath: string): SpreadsheetExportFormat => {
  const ext = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase() : "";
  return ext === "csv" ? "csv" : "xlsx";
};
