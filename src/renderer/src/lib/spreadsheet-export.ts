import type { RefObject } from "react";
import {
  exportSpreadsheetWorkbook,
  type SpreadsheetWorkbook
} from "./spreadsheet-workbook";

export type SpreadsheetExportFormat = "xlsx" | "xls" | "csv";

export type SpreadsheetExportResult = {
  blob: Blob;
};

export async function exportSpreadsheetBlob(
  workbookRef: RefObject<SpreadsheetWorkbook | null>,
  format: SpreadsheetExportFormat
): Promise<SpreadsheetExportResult> {
  const workbook = workbookRef.current;
  if (!workbook) {
    throw new Error("Spreadsheet viewer is not ready");
  }
  if (!workbook.sheets.length) {
    throw new Error("Spreadsheet has no sheets to export");
  }
  return { blob: exportSpreadsheetWorkbook(workbook, format) };
}

export const exportFormatFromPath = (filePath: string): SpreadsheetExportFormat => {
  const ext = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ext === "csv") return "csv";
  if (ext === "xls") return "xls";
  return "xlsx";
};
