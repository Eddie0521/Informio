export type PdfSurfaceMode = "compact" | "full";

export type PdfViewState = {
  pageNumber: number;
  scrollOffset: {
    x: number;
    y: number;
  };
  zoomLevel?: string | number;
  updatedAt: number;
};

export const PDF_VIEW_STATE_CACHE_LIMIT = 80;

const pdfViewStateCache = new Map<string, PdfViewState>();

const isFiniteOffset = (offset: PdfViewState["scrollOffset"]) =>
  Number.isFinite(offset.x) && Number.isFinite(offset.y) && offset.x >= 0 && offset.y >= 0;

export const pdfViewStateKey = ({
  mode,
  paneId,
  fingerprintFallback,
  pdfPath
}: {
  mode: PdfSurfaceMode;
  paneId?: string | null;
  fingerprintFallback?: string | null;
  pdfPath?: string | null;
}) => {
  const identity = (fingerprintFallback || pdfPath || "").trim();
  if (!identity) return null;
  return [mode, paneId || "default", identity].join(":");
};

export const getCachedPdfViewState = (key: string | null) => (key ? pdfViewStateCache.get(key) ?? null : null);

export const cachePdfViewState = (key: string | null, state: PdfViewState) => {
  if (!key || state.pageNumber < 1 || !isFiniteOffset(state.scrollOffset)) return;
  pdfViewStateCache.delete(key);
  pdfViewStateCache.set(key, state);

  while (pdfViewStateCache.size > PDF_VIEW_STATE_CACHE_LIMIT) {
    const oldestKey = pdfViewStateCache.keys().next().value;
    if (!oldestKey) break;
    pdfViewStateCache.delete(oldestKey);
  }
};

export const resetPdfViewStateCacheForTest = () => {
  pdfViewStateCache.clear();
};
