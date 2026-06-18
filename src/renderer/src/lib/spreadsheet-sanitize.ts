type RichTextCellType = { t?: string; s?: unknown; fa?: string };
type CellLike = { ct?: RichTextCellType; v?: unknown; m?: unknown; f?: unknown };

type CelldataEntry = { r: number; c: number; v: unknown };

type SheetConfigLike = {
  columnlen?: Record<string, number>;
  rowlen?: Record<string, number>;
};

type SanitizableSheet = {
  data?: unknown;
  celldata?: CelldataEntry[];
  config?: SheetConfigLike;
  defaultRowHeight?: unknown;
  defaultColWidth?: unknown;
  zoomRatio?: unknown;
};

const finitePositiveDimension = (value: unknown): number | undefined => {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : undefined;
};

const inlineStrPlainText = (cell: CellLike, ct: RichTextCellType): string => {
  if (Array.isArray(ct.s) && ct.s.length > 0) {
    const richText = ct.s
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const segment = part as { v?: unknown; m?: unknown };
        const text = segment.v ?? segment.m ?? "";
        return typeof text === "string" ? text : String(text);
      })
      .join("");
    if (richText) return richText;
  }
  const fallback = cell.m ?? cell.v ?? "";
  return typeof fallback === "string" ? fallback : String(fallback);
};

const sanitizeDimensionMap = (map?: Record<string, number>): Record<string, number> | undefined => {
  if (!map) return undefined;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    const size = Number(value);
    if (Number.isFinite(size) && size >= 0) {
      result[key] = size;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const sanitizeSheetConfig = (config?: SheetConfigLike): SheetConfigLike | undefined => {
  if (!config) return undefined;
  const columnlen = sanitizeDimensionMap(config.columnlen);
  const rowlen = sanitizeDimensionMap(config.rowlen);
  const next = { ...config, ...(columnlen ? { columnlen } : {}), ...(rowlen ? { rowlen } : {}) };
  if (!columnlen) delete next.columnlen;
  if (!rowlen) delete next.rowlen;
  return Object.keys(next).length > 0 ? next : undefined;
};

const sanitizeSheetDefaults = (sheet: SanitizableSheet): void => {
  const rowHeight = finitePositiveDimension(sheet.defaultRowHeight);
  const colWidth = finitePositiveDimension(sheet.defaultColWidth);
  const zoomRatio = finitePositiveDimension(sheet.zoomRatio);

  if (rowHeight != null) {
    sheet.defaultRowHeight = rowHeight;
  } else {
    delete sheet.defaultRowHeight;
  }

  if (colWidth != null) {
    sheet.defaultColWidth = colWidth;
  } else {
    delete sheet.defaultColWidth;
  }

  if (sheet.zoomRatio != null) {
    if (zoomRatio != null) {
      sheet.zoomRatio = zoomRatio;
    } else {
      delete sheet.zoomRatio;
    }
  }
};

// `@corbe30/fortune-excel` 导入会产生 ct.t === "inlineStr" 但缺少 s 的坏单元格；
// FortuneSheet 对 inlineStr 的渲染/公式路径也不稳定，统一还原为普通文本。
export const sanitizeCellValue = (cell: unknown): unknown => {
  if (!cell || typeof cell !== "object") return cell;
  const c = cell as CellLike;
  const ct = c.ct;
  if (ct && ct.t === "inlineStr") {
    const text = inlineStrPlainText(c, ct);
    const { ct: _omitted, ...rest } = c;
    return { ...rest, v: text, m: text };
  }
  return cell;
};

const sanitizeSheetData = <T>(data: T): T => {
  if (!Array.isArray(data)) return data;
  return data.map((row) => (Array.isArray(row) ? row.map(sanitizeCellValue) : row)) as unknown as T;
};

export const sanitizeFortuneSheets = <T extends SanitizableSheet[]>(sheets: T): T => {
  return sheets.map((sheet) => {
    const next = { ...sheet } as SanitizableSheet;
    sanitizeSheetDefaults(next);
    if (Array.isArray(next.data) && next.data.length > 0) {
      next.data = sanitizeSheetData(next.data);
    }
    if (Array.isArray(next.celldata) && next.celldata.length > 0) {
      next.celldata = next.celldata.map((entry) => ({
        ...entry,
        v: sanitizeCellValue(entry.v)
      }));
    }
    const config = sanitizeSheetConfig(next.config);
    if (config) {
      next.config = config;
    } else if (next.config) {
      delete next.config;
    }
    return next;
  }) as T;
};

export const sanitizeSheetDataMatrix = sanitizeSheetData;
