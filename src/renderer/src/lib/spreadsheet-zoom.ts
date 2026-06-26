export const SPREADSHEET_MIN_ZOOM = 0.5;
export const SPREADSHEET_MAX_ZOOM = 2;

export const clampSpreadsheetZoom = (value: number): number =>
  parseFloat(Math.min(SPREADSHEET_MAX_ZOOM, Math.max(SPREADSHEET_MIN_ZOOM, value)).toFixed(2));

export const spreadsheetZoomFromWheel = (currentZoom: number, deltaY: number): number => {
  const factor = Math.exp(-deltaY * 0.01);
  return clampSpreadsheetZoom(currentZoom * factor);
};

export const isSpreadsheetPinchWheel = (event: WheelEvent): boolean =>
  (event.ctrlKey || event.metaKey) && event.deltaY !== 0;
