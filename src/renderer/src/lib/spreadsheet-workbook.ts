import * as XLSX from "xlsx";

export type SpreadsheetCellValue = string | number | boolean | null;

export type SpreadsheetSheet = {
  name: string;
  rows: SpreadsheetCellValue[][];
};

export type SpreadsheetWorkbook = {
  sheets: SpreadsheetSheet[];
  activeSheetIndex: number;
};

const MIN_GRID_ROWS = 40;
const MIN_GRID_COLS = 20;
const GRID_ROW_PADDING = 12;
const GRID_COL_PADDING = 4;

export const columnLabel = (index: number): string => {
  let label = "";
  let current = index;
  while (current >= 0) {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  }
  return label;
};

export const cellDisplayValue = (value: SpreadsheetCellValue | undefined): string => {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
};

export const parseCellInput = (raw: string): SpreadsheetCellValue => {
  const text = raw.trim();
  if (!text) return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.toLowerCase() === "true") return true;
  if (text.toLowerCase() === "false") return false;
  return raw;
};

export const sheetGridSize = (sheet: SpreadsheetSheet) => {
  let maxRow = 0;
  let maxCol = 0;
  sheet.rows.forEach((row, rowIndex) => {
    maxRow = Math.max(maxRow, rowIndex + 1);
    row.forEach((_, colIndex) => {
      maxCol = Math.max(maxCol, colIndex + 1);
    });
  });
  return {
    rowCount: Math.max(maxRow + GRID_ROW_PADDING, MIN_GRID_ROWS),
    colCount: Math.max(maxCol + GRID_COL_PADDING, MIN_GRID_COLS)
  };
};

const rowsFromWorksheet = (worksheet: XLSX.WorkSheet): SpreadsheetCellValue[][] => {
  const matrix = XLSX.utils.sheet_to_json<SpreadsheetCellValue[]>(worksheet, {
    header: 1,
    defval: null,
    raw: false
  });
  return matrix.map((row) => (Array.isArray(row) ? row.map((cell) => (cell == null || cell === "" ? null : cell)) : []));
};

export const loadSpreadsheetWorkbook = (data: ArrayBuffer, ext: string): SpreadsheetWorkbook => {
  const workbook =
    ext === "csv"
      ? XLSX.read(new TextDecoder().decode(data), { type: "string", cellDates: true })
      : XLSX.read(data, { type: "array", cellDates: true });

  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: rowsFromWorksheet(workbook.Sheets[name] ?? {})
  }));

  if (sheets.length === 0) {
    sheets.push({ name: "Sheet1", rows: [] });
  }

  return { sheets, activeSheetIndex: 0 };
};

export const convertLegacyXlsToXlsxBuffer = (data: ArrayBuffer): ArrayBuffer => {
  const workbook = XLSX.read(data, { type: "array" });
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
};

export const exportSpreadsheetWorkbook = (workbook: SpreadsheetWorkbook, format: "xlsx" | "xls" | "csv"): Blob => {
  const book = XLSX.utils.book_new();
  workbook.sheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((row) => row.map((cell) => cell ?? ""));
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, worksheet, sheet.name || `Sheet${index + 1}`);
  });

  if (format === "csv") {
    const firstSheetName = book.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(book.Sheets[firstSheetName] ?? {});
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  }

  const bookType = format === "xls" ? "xls" : "xlsx";
  const buffer = XLSX.write(book, { type: "array", bookType });
  const mimeType =
    bookType === "xls"
      ? "application/vnd.ms-excel"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Blob([buffer], { type: mimeType });
};

export const updateWorkbookCell = (
  workbook: SpreadsheetWorkbook,
  sheetIndex: number,
  row: number,
  column: number,
  value: SpreadsheetCellValue
): SpreadsheetWorkbook => {
  const sheets = workbook.sheets.map((sheet, index) => {
    if (index !== sheetIndex) return sheet;
    const rows = sheet.rows.map((existingRow) => [...existingRow]);
    while (rows.length <= row) rows.push([]);
    const nextRow = [...rows[row]];
    while (nextRow.length <= column) nextRow.push(null);
    nextRow[column] = value;
    rows[row] = nextRow;
    return { ...sheet, rows };
  });
  return { ...workbook, sheets };
};

const mapActiveSheet = (
  workbook: SpreadsheetWorkbook,
  sheetIndex: number,
  mapRows: (rows: SpreadsheetCellValue[][]) => SpreadsheetCellValue[][]
): SpreadsheetWorkbook => ({
  ...workbook,
  sheets: workbook.sheets.map((sheet, index) =>
    index === sheetIndex ? { ...sheet, rows: mapRows(sheet.rows.map((row) => [...row])) } : sheet
  )
});

const uniqueSheetName = (workbook: SpreadsheetWorkbook, preferred: string): string => {
  const existing = new Set(workbook.sheets.map((sheet) => sheet.name));
  if (!existing.has(preferred)) return preferred;
  let index = 2;
  while (existing.has(`${preferred}${index}`)) index += 1;
  return `${preferred}${index}`;
};

export const insertSheetRow = (workbook: SpreadsheetWorkbook, sheetIndex: number, atRow: number): SpreadsheetWorkbook =>
  mapActiveSheet(workbook, sheetIndex, (rows) => {
    const next = [...rows];
    const width = next.reduce((max, row) => Math.max(max, row.length), 0);
    next.splice(Math.max(0, atRow), 0, Array.from({ length: width }, () => null));
    return next;
  });

export const deleteSheetRow = (workbook: SpreadsheetWorkbook, sheetIndex: number, row: number): SpreadsheetWorkbook =>
  mapActiveSheet(workbook, sheetIndex, (rows) => {
    if (row < 0 || row >= rows.length) return rows;
    const next = [...rows];
    next.splice(row, 1);
    return next;
  });

export const insertSheetColumn = (workbook: SpreadsheetWorkbook, sheetIndex: number, atColumn: number): SpreadsheetWorkbook =>
  mapActiveSheet(workbook, sheetIndex, (rows) =>
    rows.map((row) => {
      const next = [...row];
      next.splice(Math.max(0, atColumn), 0, null);
      return next;
    })
  );

export const deleteSheetColumn = (workbook: SpreadsheetWorkbook, sheetIndex: number, column: number): SpreadsheetWorkbook =>
  mapActiveSheet(workbook, sheetIndex, (rows) =>
    rows.map((row) => {
      if (column < 0 || column >= row.length) return row;
      const next = [...row];
      next.splice(column, 1);
      return next;
    })
  );

export const addWorkbookSheet = (workbook: SpreadsheetWorkbook): SpreadsheetWorkbook => {
  const name = uniqueSheetName(workbook, "Sheet");
  return {
    sheets: [...workbook.sheets, { name, rows: [] }],
    activeSheetIndex: workbook.sheets.length
  };
};

export const deleteWorkbookSheet = (workbook: SpreadsheetWorkbook, sheetIndex: number): SpreadsheetWorkbook => {
  if (workbook.sheets.length <= 1) return workbook;
  const sheets = workbook.sheets.filter((_, index) => index !== sheetIndex);
  const activeSheetIndex =
    workbook.activeSheetIndex === sheetIndex
      ? Math.max(0, sheetIndex - 1)
      : workbook.activeSheetIndex > sheetIndex
        ? workbook.activeSheetIndex - 1
        : workbook.activeSheetIndex;
  return { sheets, activeSheetIndex };
};

export const clearSheetRow = (workbook: SpreadsheetWorkbook, sheetIndex: number, row: number): SpreadsheetWorkbook =>
  mapActiveSheet(workbook, sheetIndex, (rows) =>
    rows.map((existingRow, rowIndex) =>
      rowIndex === row ? existingRow.map(() => null) : existingRow
    )
  );

export const clearSheetColumn = (workbook: SpreadsheetWorkbook, sheetIndex: number, column: number): SpreadsheetWorkbook =>
  mapActiveSheet(workbook, sheetIndex, (rows) =>
    rows.map((row) => row.map((cell, colIndex) => (colIndex === column ? null : cell)))
  );

export const renameWorkbookSheet = (
  workbook: SpreadsheetWorkbook,
  sheetIndex: number,
  name: string
): SpreadsheetWorkbook => {
  const trimmed = name.trim();
  if (!trimmed) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, index) => (index === sheetIndex ? { ...sheet, name: trimmed } : sheet))
  };
};
