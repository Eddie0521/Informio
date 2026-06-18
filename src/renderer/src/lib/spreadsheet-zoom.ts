import type { WorkbookInstance } from "@fortune-sheet/react";

export const SPREADSHEET_MIN_ZOOM = 0.1;
export const SPREADSHEET_MAX_ZOOM = 4;

export const clampSpreadsheetZoom = (value: number): number =>
  parseFloat(Math.min(SPREADSHEET_MAX_ZOOM, Math.max(SPREADSHEET_MIN_ZOOM, value)).toFixed(2));

export const spreadsheetZoomFromWheel = (currentZoom: number, deltaY: number): number => {
  const factor = Math.exp(-deltaY * 0.01);
  return clampSpreadsheetZoom(currentZoom * factor);
};

export const isSpreadsheetPinchWheel = (event: WheelEvent): boolean =>
  (event.ctrlKey || event.metaKey) && event.deltaY !== 0;

export const readActiveSpreadsheetZoom = (instance: WorkbookInstance): number => {
  const sheet = instance.getSheet?.() ?? instance.getAllSheets().find((item) => item.status === 1) ?? instance.getAllSheets()[0];
  return sheet?.zoomRatio ?? 1;
};

export const applySpreadsheetZoom = (instance: WorkbookInstance, nextZoom: number): void => {
  const sheets = instance.getAllSheets();
  const active = instance.getSheet?.() ?? sheets.find((item) => item.status === 1) ?? sheets[0];
  if (!active?.id) return;

  const currentZoom = active.zoomRatio ?? readActiveSpreadsheetZoom(instance);
  if (Math.abs(currentZoom - nextZoom) < 0.001) return;

  instance.applyOp([
    { op: "replace", path: ["zoomRatio"], value: nextZoom },
    { op: "replace", path: ["zoomRatio"], value: nextZoom, id: active.id }
  ]);
};
