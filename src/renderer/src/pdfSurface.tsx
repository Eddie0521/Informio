import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Highlighter,
  Languages,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw
} from "lucide-react";
import type {
  AppSettings,
  InformioDocument,
  PdfAnnotation,
  PdfAnnotationRect,
  PdfAnnotationSelection,
  PdfMarkdownTarget
} from "../../shared/types";
import { cn } from "./lib/utils";

const resolveRendererAssetUrl = (relativePath: string) => {
  if (typeof window === "undefined") return relativePath;
  return new URL(relativePath, window.location.href).toString();
};

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFJS_WASM_URL = resolveRendererAssetUrl("./pdfjs/wasm/");
const PDFJS_ICC_URL = resolveRendererAssetUrl("./pdfjs/iccs/");
const PDF_MIN_ZOOM = 0.45;
const PDF_MAX_ZOOM = 3;
const PDF_GESTURE_ZOOM_SENSITIVITY = 0.0024;
const PDF_HIGHLIGHT_EDITOR_COLORS = [
  "yellow=#FDE047",
  "green=#86EFAC",
  "blue=#93C5FD",
  "pink=#F9A8D4",
  "red=#FDBA74",
  "yellow_HCM=#FFFFCC",
  "green_HCM=#53FFBC",
  "blue_HCM=#80EBFF",
  "pink_HCM=#F6B8FF",
  "red_HCM=#C50043"
].join(",");

let pdfJsViewerModulePromise: Promise<any> | null = null;

const loadPdfJsViewerModule = async () => {
  const globalScope = globalThis as typeof globalThis & { pdfjsLib?: unknown };
  if (!globalScope.pdfjsLib) globalScope.pdfjsLib = pdfjsLib;
  if (!pdfJsViewerModulePromise) pdfJsViewerModulePromise = import("pdfjs-dist/web/pdf_viewer.mjs");
  return pdfJsViewerModulePromise;
};

const fileUrl = (path: string) => `local-file://${encodeURI(path.replace(/\\/g, "/"))}`;

const localFilePathFromUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "local-file:") return value;
    const pathname = decodeURIComponent(url.host ? `/${url.host}${url.pathname}` : url.pathname);
    return pathname.startsWith("/users/") ? `/Users/${pathname.slice("/users/".length)}` : pathname;
  } catch {
    return value;
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export type PdfAgentSelection = {
  kind: "markdown" | "pdf";
  documentId: string;
  from: number;
  to: number;
  text: string;
  markdown: string;
  title?: string;
  filePath?: string;
  page?: number;
  rects?: PdfAnnotationRect[];
  overlayLeft?: number;
  overlayTop?: number;
};

export type ToolbarTranslateState = {
  status: "idle" | "loading" | "done" | "error";
  response: string;
  error?: string;
};

export type PdfSelectionState = PdfAnnotationSelection & {
  left: number;
  top: number;
};

type ReadonlySelectionSessionStatus = "selecting" | "stable" | "acting";

type ReadonlySelectionSession = {
  rangeSignature: string;
  overlayLeft: number;
  overlayTop: number;
  visualRects: PdfSelectionVisualRect[];
  status: ReadonlySelectionSessionStatus;
};

type PdfSelectionSession = PdfAnnotationSelection & ReadonlySelectionSession;

type PdfSelectionVisualRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PdfSelectionPointerEndpoint = {
  clientX: number;
  clientY: number;
  updatedAt: number;
};

export type PdfEditorContextValue = {
  paneId: string;
  document: InformioDocument;
  settings: AppSettings;
  markdownTarget: PdfMarkdownTarget | null;
  focusAnnotationId: string | null;
  annotationRefreshToken: number;
  toolbarEnabled: boolean;
  toolbarTranslate: ToolbarTranslateState;
  onPdfSelection: (selection: PdfSelectionState | null) => void;
  onTranslateSelection: (selection: PdfAgentSelection) => void;
  onClearToolbarTranslate: () => void;
  onRequestPdfBacklink: (annotation: PdfAnnotation) => void;
  onPdfAnnotationStoreChanged: () => void;
  onRegisterPdfAnnotation: (annotation: PdfAnnotation) => void;
  onDeletePdfAnnotation: (annotationId: string) => void;
  onInsertPdfBacklink: (annotation: PdfAnnotation) => void;
  onOpenMarkdownTarget: (target: PdfMarkdownTarget) => void;
};

type PdfAnnotationEditor = {
  id: string;
  pageIndex?: number;
  color?: string;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  deleted?: boolean;
  div?: HTMLElement | null;
  comment: {
    text: string;
    richText: string | null;
    date: Date | null;
    deleted: boolean;
    color?: string;
    opacity?: number;
  } | null;
};

type PdfAnnotationUiManager = {
  getSelectionBoxes: (textLayer: Element | null) => Array<{ x: number; y: number; width: number; height: number }> | null;
  waitForEditorsRendered: (pageNumber: number) => Promise<void>;
  getEditor: (id: string) => PdfAnnotationEditor | null;
  getActive?: () => PdfAnnotationEditor | null;
  getEditors?: (pageIndex: number) => Iterable<PdfAnnotationEditor>;
  highlightSelection?: (methodOfCreation?: string, comment?: boolean) => void;
  updateParams?: (type: number, value: unknown) => void;
};

type PdfSurfaceMode = "compact" | "full";

type PdfSurfaceProps = {
  mode: PdfSurfaceMode;
  pdfPath: string;
  title: string;
  fingerprintFallback: string;
  allowRemove?: boolean;
  onRemove?: () => void;
};

const defaultPdfHighlightColor = "#fde047";
const selectionToolbarSafeAreaSelector = "[data-selection-toolbar-safe-area]";
const PDF_SELECTION_INK_PROBE_RATIO = 0.45;
const PDF_SELECTION_INK_PADDING_RATIO = 0.2;
const PDF_SELECTION_INK_CLUSTER_GAP = 2;
const PDF_SELECTION_POINTER_ENDPOINT_MAX_AGE = 1200;
const PDF_SELECTION_LINE_GROUP_CENTER_RATIO = 0.55;

const samePdfRects = (left: PdfAnnotationRect[] | undefined, right: PdfAnnotationRect[] | undefined) => {
  const leftRects = left ?? [];
  const rightRects = right ?? [];
  if (leftRects.length !== rightRects.length) return false;
  return leftRects.every((rect, index) => {
    const other = rightRects[index];
    return rect.x === other?.x && rect.y === other?.y && rect.width === other?.width && rect.height === other?.height;
  });
};

const getAnnotationBoundingRect = (rects: PdfAnnotationRect[]) => {
  const firstRect = rects[0];
  if (!firstRect) return null;
  let minX = firstRect.x;
  let minY = firstRect.y;
  let maxX = firstRect.x + firstRect.width;
  let maxY = firstRect.y + firstRect.height;
  rects.forEach((rect) => {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  });
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
};

const normalizeAnnotationTextForMatch = (value: string | undefined) => value?.trim().replace(/\s+/g, " ") ?? "";

const normalizePdfSelectionText = (value: string | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

const sameDomBoundaryPoint = (leftNode: Node, leftOffset: number, rightNode: Node | null, rightOffset: number) =>
  leftNode === rightNode && leftOffset === rightOffset;

const getElementForNode = (node: Node | null) =>
  node instanceof HTMLElement ? node : node?.parentElement instanceof HTMLElement ? node.parentElement : null;

const getCaretRangeFromPoint = (clientX: number, clientY: number) => {
  const activeDocument = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const caretRange = activeDocument.caretRangeFromPoint?.(clientX, clientY);
  if (caretRange) return caretRange;
  const caretPosition = activeDocument.caretPositionFromPoint?.(clientX, clientY);
  if (!caretPosition) return null;
  const range = document.createRange();
  range.setStart(caretPosition.offsetNode, caretPosition.offset);
  range.collapse(true);
  return range;
};

const getPointerAdjustedSelectionRange = (
  selection: Selection,
  range: Range,
  viewerElement: HTMLElement,
  pointerEndpoint: PdfSelectionPointerEndpoint | null
) => {
  if (!pointerEndpoint || Date.now() - pointerEndpoint.updatedAt > PDF_SELECTION_POINTER_ENDPOINT_MAX_AGE) return range;
  const caretRange = getCaretRangeFromPoint(pointerEndpoint.clientX, pointerEndpoint.clientY);
  if (!caretRange || !viewerElement.contains(caretRange.startContainer)) return range;
  if (!getElementForNode(caretRange.startContainer)?.closest(".textLayer")) return range;

  const originalText = normalizePdfSelectionText(range.toString());
  if (!originalText) return range;

  const focusNode = selection.focusNode;
  const focusOffset = selection.focusOffset;
  const focusIsRangeEnd = sameDomBoundaryPoint(range.endContainer, range.endOffset, focusNode, focusOffset);
  const focusIsRangeStart = sameDomBoundaryPoint(range.startContainer, range.startOffset, focusNode, focusOffset);
  if (!focusIsRangeEnd && !focusIsRangeStart) return range;

  const chooseCandidate = (candidate: Range, edge: "start" | "end") => {
    const candidateText = normalizePdfSelectionText(candidate.toString());
    if (!candidateText || candidateText.length > originalText.length) return null;
    if (edge === "end" && !originalText.startsWith(candidateText)) return null;
    if (edge === "start" && !originalText.endsWith(candidateText)) return null;
    return candidateText.length < originalText.length ? candidate : range;
  };

  try {
    if (focusIsRangeEnd) {
      const candidate = range.cloneRange();
      candidate.setEnd(caretRange.startContainer, caretRange.startOffset);
      return chooseCandidate(candidate, "end") ?? range;
    }
    const candidate = range.cloneRange();
    candidate.setStart(caretRange.startContainer, caretRange.startOffset);
    return chooseCandidate(candidate, "start") ?? range;
  } catch {
    return range;
  } finally {
    caretRange.detach();
  }
};

const getTextNodeRangeRects = (range: Range, root: HTMLElement) => {
  const textNodes: Text[] = [];
  const collectTextNode = (node: Node | null) => {
    if (node?.nodeType === Node.TEXT_NODE && root.contains(node)) textNodes.push(node as Text);
  };

  const commonAncestor = range.commonAncestorContainer;
  collectTextNode(commonAncestor);
  const walkerRoot = commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor;
  if (walkerRoot && root.contains(walkerRoot)) {
    const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) collectTextNode(node);
  }

  const rects: DOMRect[] = [];
  textNodes.forEach((textNode) => {
    try {
      if (!range.intersectsNode(textNode)) return;
      const textRange = document.createRange();
      textRange.selectNodeContents(textNode);
      if (textNode === range.startContainer) textRange.setStart(textNode, range.startOffset);
      if (textNode === range.endContainer) textRange.setEnd(textNode, range.endOffset);
      if (!textRange.collapsed) {
        rects.push(...Array.from(textRange.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0));
      }
      textRange.detach();
    } catch {
      // Ignore nodes that become detached while the pdf.js text layer is re-rendering.
    }
  });
  return rects;
};

const getPdfSelectionRangeRects = (range: Range, root: HTMLElement) => {
  const textRects = getTextNodeRangeRects(range, root);
  if (textRects.length) return textRects;
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
};

const domRectFromBounds = (left: number, top: number, right: number, bottom: number) =>
  new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));

const getVerticalOverlapRatio = (left: DOMRect, right: DOMRect) => {
  const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
  if (overlap <= 0) return 0;
  return overlap / Math.min(left.height, right.height);
};

const groupPdfSelectionRectsByLine = (rects: DOMRect[]) => {
  type LineGroup = {
    rects: DOMRect[];
    top: number;
    bottom: number;
    centerY: number;
    height: number;
  };
  const lines: LineGroup[] = [];
  const sortedRects = [...rects].sort((left, right) => left.top - right.top || left.left - right.left);
  sortedRects.forEach((rect) => {
    const centerY = rect.top + rect.height / 2;
    const line = lines.find((candidate) => {
      const centerDelta = Math.abs(centerY - candidate.centerY);
      const centerThreshold = Math.max(candidate.height, rect.height) * PDF_SELECTION_LINE_GROUP_CENTER_RATIO;
      return centerDelta <= centerThreshold || getVerticalOverlapRatio(domRectFromBounds(0, candidate.top, 1, candidate.bottom), rect) >= 0.5;
    });
    if (!line) {
      lines.push({ rects: [rect], top: rect.top, bottom: rect.bottom, centerY, height: rect.height });
      return;
    }
    line.rects.push(rect);
    line.top = Math.min(line.top, rect.top);
    line.bottom = Math.max(line.bottom, rect.bottom);
    line.height = Math.max(1, line.bottom - line.top);
    line.centerY = line.top + line.height / 2;
  });

  return lines.flatMap((line) => {
    const lineRects = [...line.rects].sort((left, right) => left.left - right.left);
    const segments: Array<{ left: number; right: number }> = [];
    lineRects.forEach((rect) => {
      const last = segments.at(-1);
      const mergeGap = Math.max(24, line.height * 2.5);
      if (last && rect.left <= last.right + mergeGap) {
        last.right = Math.max(last.right, rect.right);
        return;
      }
      segments.push({ left: rect.left, right: rect.right });
    });
    return segments.map((segment) => domRectFromBounds(segment.left, line.top, segment.right, line.bottom));
  });
};

const samePdfSelectionVisualRects = (left: PdfSelectionVisualRect[] | undefined, right: PdfSelectionVisualRect[] | undefined) => {
  const leftRects = left ?? [];
  const rightRects = right ?? [];
  if (leftRects.length !== rightRects.length) return false;
  return leftRects.every((rect, index) => {
    const other = rightRects[index];
    return rect.left === other?.left && rect.top === other?.top && rect.width === other?.width && rect.height === other?.height;
  });
};

const isPdfInkPixel = (data: Uint8ClampedArray, offset: number) => {
  const alpha = data[offset + 3] ?? 0;
  if (alpha < 24) return false;
  const red = data[offset] ?? 255;
  const green = data[offset + 1] ?? 255;
  const blue = data[offset + 2] ?? 255;
  return red < 246 || green < 246 || blue < 246;
};

const getCanvasInkBoundsForSelectionRect = (rect: DOMRect, pageElement: HTMLElement) => {
  const canvas = pageElement.querySelector<HTMLCanvasElement>(".canvasWrapper canvas, canvas");
  if (!canvas || !canvas.width || !canvas.height) return null;
  const canvasRect = canvas.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height) return null;
  const probePadding = Math.max(4, rect.height * PDF_SELECTION_INK_PROBE_RATIO);
  const cssLeft = clamp(rect.left, canvasRect.left, canvasRect.right);
  const cssRight = clamp(rect.right, canvasRect.left, canvasRect.right);
  const cssTop = clamp(rect.top - probePadding, canvasRect.top, canvasRect.bottom);
  const cssBottom = clamp(rect.bottom + probePadding, canvasRect.top, canvasRect.bottom);
  if (cssRight <= cssLeft || cssBottom <= cssTop) return null;
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const x = clamp(Math.floor((cssLeft - canvasRect.left) * scaleX), 0, canvas.width - 1);
  const y = clamp(Math.floor((cssTop - canvasRect.top) * scaleY), 0, canvas.height - 1);
  const right = clamp(Math.ceil((cssRight - canvasRect.left) * scaleX), x + 1, canvas.width);
  const bottom = clamp(Math.ceil((cssBottom - canvasRect.top) * scaleY), y + 1, canvas.height);
  const width = right - x;
  const height = bottom - y;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const pixels = context.getImageData(x, y, width, height).data;
    const rowInkThreshold = Math.max(2, Math.floor(width * 0.002));
    const inkRows: number[] = [];
    for (let row = 0; row < height; row += 1) {
      let inkPixels = 0;
      for (let column = 0; column < width; column += 1) {
        if (isPdfInkPixel(pixels, (row * width + column) * 4)) inkPixels += 1;
        if (inkPixels >= rowInkThreshold) break;
      }
      if (inkPixels >= rowInkThreshold) {
        inkRows.push(row);
      }
    }
    if (!inkRows.length) return null;
    const clusters: Array<{ start: number; end: number }> = [];
    inkRows.forEach((row) => {
      const lastCluster = clusters.at(-1);
      if (lastCluster && row - lastCluster.end <= PDF_SELECTION_INK_CLUSTER_GAP) {
        lastCluster.end = row;
        return;
      }
      clusters.push({ start: row, end: row });
    });
    const rectCenterY = ((rect.top + rect.bottom) / 2 - cssTop) * scaleY;
    const selectedCluster = clusters
      .map((cluster) => ({
        ...cluster,
        distance: Math.abs((cluster.start + cluster.end + 1) / 2 - rectCenterY)
      }))
      .sort((leftCluster, rightCluster) => leftCluster.distance - rightCluster.distance)[0];
    if (!selectedCluster) return null;
    const top = canvasRect.top + (y + selectedCluster.start) / scaleY;
    const bottom = canvasRect.top + (y + selectedCluster.end + 1) / scaleY;
    return { top, bottom };
  } catch {
    return null;
  }
};

const buildPdfSelectionVisualRects = (
  rawRects: DOMRect[],
  pageElement: HTMLElement,
  frameRect: DOMRect,
  frameScroll: { left: number; top: number },
  skipInkDetection = false
): PdfSelectionVisualRect[] => {
  return rawRects.map((rect) => {
    const inkBounds = skipInkDetection ? null : getCanvasInkBoundsForSelectionRect(rect, pageElement);
    const inkTop = inkBounds?.top ?? rect.top;
    const inkBottom = inkBounds?.bottom ?? rect.bottom;
    const inkHeight = Math.max(1, inkBottom - inkTop);
    const padding = inkBounds ? clamp(inkHeight * PDF_SELECTION_INK_PADDING_RATIO, 1.5, Math.max(2, rect.height * 0.18)) : 0;
    const visualTop = inkTop - padding;
    const visualBottom = inkBottom + padding;
    return {
      left: rect.left - frameRect.left + frameScroll.left,
      top: visualTop - frameRect.top + frameScroll.top,
      width: rect.width,
      height: Math.max(1, visualBottom - visualTop)
    };
  });
};

const separateOverlappingSelectionVisualRects = (rects: PdfSelectionVisualRect[]) => {
  const nextRects = [...rects].sort((left, right) => left.top - right.top || left.left - right.left);
  for (let index = 0; index < nextRects.length - 1; index += 1) {
    const current = nextRects[index];
    const next = nextRects[index + 1];
    const currentBottom = current.top + current.height;
    const nextBottom = next.top + next.height;
    if (currentBottom <= next.top || nextBottom <= current.top) continue;
    const horizontalOverlap = Math.min(current.left + current.width, next.left + next.width) - Math.max(current.left, next.left);
    if (horizontalOverlap <= Math.min(current.width, next.width) * 0.25) continue;
    const boundary = current.top + (next.top - current.top + current.height) / 2;
    current.height = Math.max(1, boundary - current.top);
    next.top = boundary;
    next.height = Math.max(1, nextBottom - boundary);
  }
  return nextRects;
};

const samePdfSelectionSession = (left: PdfSelectionSession | null, right: PdfSelectionSession | null) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.pdfPath === right.pdfPath &&
    left.fingerprint === right.fingerprint &&
    left.title === right.title &&
    left.page === right.page &&
    left.text === right.text &&
    left.rangeSignature === right.rangeSignature &&
    left.overlayLeft === right.overlayLeft &&
    left.overlayTop === right.overlayTop &&
    left.status === right.status &&
    samePdfRects(left.rects, right.rects) &&
    samePdfSelectionVisualRects(left.visualRects, right.visualRects)
  );
};

const fingerprintForPdf = (pdf: PDFDocumentProxy | null, fallback: string) => {
  const fingerprints = (pdf as (PDFDocumentProxy & { fingerprints?: string[] }) | null)?.fingerprints;
  return fingerprints?.[0] || fallback;
};

export const PdfEditorContext = createContext<PdfEditorContextValue | null>(null);

const usePdfEditorContext = () => useContext(PdfEditorContext);

type PdfViewerApi = {
  viewer: any;
  eventBus: any;
  linkService: any;
  findController: any;
  viewerModule: any;
};

const toPersistedPdfAnnotation = (annotation: PdfAnnotation): PdfAnnotation => annotation;

function PdfSurface({
  mode,
  pdfPath,
  title,
  fingerprintFallback,
  allowRemove = false,
  onRemove
}: PdfSurfaceProps) {
  const pdfContext = usePdfEditorContext();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const viewerApiRef = useRef<PdfViewerApi | null>(null);
  const activeViewerDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const sourceDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const sourceLoadingTaskRef = useRef<ReturnType<typeof pdfjsLib.getDocument> | null>(null);
  const annotationsRef = useRef<PdfAnnotation[]>([]);
  const pendingSourceWriteJobRef = useRef<{
    revision: number;
    document: PDFDocumentProxy;
    pdfPath: string;
    snapshotIds: string[];
    pendingIds: string[];
    failureMessage: string;
  } | null>(null);
  const sourceWriteRunningRef = useRef(false);
  const sourceWriteRevisionRef = useRef(0);
  const overlayRefreshFrameRef = useRef<number | null>(null);
  const zoomAdjustFrameRef = useRef<number | null>(null);
  const pdfSelectionSessionRef = useRef<PdfSelectionSession | null>(null);
  const pdfSelectionPointerActiveRef = useRef(false);
  const pdfSelectionPointerEndpointRef = useRef<PdfSelectionPointerEndpoint | null>(null);
  const liveNativeAnnotationIdsRef = useRef<Map<string, string>>(new Map());
  const selectionToolbarLockUntilRef = useRef(0);
  const syncNativeStateRunningRef = useRef(false);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [zoomScale, setZoomScale] = useState(1);
  const selectedColor = defaultPdfHighlightColor;
  const [pdfSelectionSession, setPdfSelectionSession] = useState<PdfSelectionSession | null>(null);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const findQueryRef = useRef("");
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [nativeHighlightModeEnabled, setNativeHighlightModeEnabled] = useState(false);
  const fingerprint = fingerprintForPdf(pdf, fingerprintFallback);

  const getPdfAnnotationUiManager = () =>
    (((viewerApiRef.current?.viewer as { _layerProperties?: { annotationEditorUIManager?: PdfAnnotationUiManager | null } } | undefined)
      ?._layerProperties?.annotationEditorUIManager ?? null) as PdfAnnotationUiManager | null);

  function shouldDisplayAnnotationInOverlay(annotation: PdfAnnotation) {
    if (annotation.type === "link") return false;
    return !hasLiveNativeHighlightEditor(annotation);
  }

  const getNativeEditorMode = () => {
    const viewer = viewerApiRef.current?.viewer as { annotationEditorMode?: number | { mode?: number } } | undefined;
    const currentMode = viewer?.annotationEditorMode;
    if (typeof currentMode === "number") return currentMode;
    if (currentMode && typeof currentMode === "object" && typeof currentMode.mode === "number") return currentMode.mode;
    return null;
  };

  const getNativeHighlightMode = () =>
    (pdfjsLib as typeof pdfjsLib & { AnnotationEditorType?: { HIGHLIGHT?: number } }).AnnotationEditorType?.HIGHLIGHT ?? 9;

  const getNativeNoneMode = () =>
    (pdfjsLib as typeof pdfjsLib & { AnnotationEditorType?: { NONE?: number } }).AnnotationEditorType?.NONE ?? 0;

  const setNativeEditorMode = (mode: number) => {
    const viewer = viewerApiRef.current?.viewer as { annotationEditorMode?: number | { mode: number } } | undefined;
    if (!viewer) return;
    try {
      viewer.annotationEditorMode = { mode };
      return;
    } catch {
      try {
        viewer.annotationEditorMode = mode;
      } catch {
        // Ignore mode reset failures and let the overlay-driven UI continue.
      }
    }
  };

  const waitForNativeEditorMode = async (targetMode: number, timeoutMessage: string) => {
    const viewerApi = viewerApiRef.current;
    if (!viewerApi) return false;
    if (getNativeEditorMode() === targetMode) return true;
    const eventBus = viewerApi.eventBus as {
      on: (name: string, listener: (event: { mode?: number }) => void) => void;
      off: (name: string, listener: (event: { mode?: number }) => void) => void;
    };
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (handler: (event: { mode?: number }) => void) => {
        if (settled) return;
        settled = true;
        eventBus.off("annotationeditormodechanged", handler);
        window.clearTimeout(timeoutId);
        resolve();
      };
      const fail = (handler: (event: { mode?: number }) => void, reason: unknown) => {
        if (settled) return;
        settled = true;
        eventBus.off("annotationeditormodechanged", handler);
        window.clearTimeout(timeoutId);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };
      const handleModeChanged = (event: { mode?: number }) => {
        if ((typeof event.mode === "number" ? event.mode : getNativeEditorMode()) === targetMode) finish(handleModeChanged);
      };
      const timeoutId = window.setTimeout(() => {
        if (getNativeEditorMode() === targetMode) {
          finish(handleModeChanged);
          return;
        }
        fail(handleModeChanged, new Error(timeoutMessage));
      }, 1200);
      eventBus.on("annotationeditormodechanged", handleModeChanged);
      try {
        setNativeEditorMode(targetMode);
      } catch (error) {
        fail(handleModeChanged, error);
      }
    });
    return getNativeEditorMode() === targetMode;
  };

  const markSelectionToolbarInteraction = () => {
    selectionToolbarLockUntilRef.current = Date.now() + 600;
  };

  const isSelectionToolbarInteractionActive = () => {
    const activeInsideToolbar =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? Boolean(document.activeElement.closest(selectionToolbarSafeAreaSelector))
        : false;
    return activeInsideToolbar || Date.now() < selectionToolbarLockUntilRef.current;
  };

  const scheduleOverlayRefresh = () => {
    if (overlayRefreshFrameRef.current !== null) window.cancelAnimationFrame(overlayRefreshFrameRef.current);
    overlayRefreshFrameRef.current = window.requestAnimationFrame(() => {
      overlayRefreshFrameRef.current = null;
      const viewerElement = viewerRef.current;
      if (!viewerElement) return;
      const pageElements = Array.from(viewerElement.querySelectorAll<HTMLElement>(".page[data-page-number]"));
      const annotationsByPage = new Map<number, PdfAnnotation[]>();
      annotationsRef.current.forEach((annotation) => {
        annotationsByPage.set(annotation.page, [...(annotationsByPage.get(annotation.page) ?? []), annotation]);
      });
      const focusId = pdfContext?.focusAnnotationId ?? null;
      pageElements.forEach((pageElement) => {
        const pageNumber = Number.parseInt(pageElement.dataset.pageNumber ?? "0", 10);
        const layerClassName = "informio-pdf-overlay-layer";
        let overlayLayer = pageElement.querySelector<HTMLElement>(`.${layerClassName}`);
        if (!overlayLayer) {
          overlayLayer = document.createElement("div");
          overlayLayer.className = layerClassName;
          pageElement.appendChild(overlayLayer);
        }
        overlayLayer.replaceChildren();
        (annotationsByPage.get(pageNumber) ?? []).forEach((annotation) => {
          annotation.rects.forEach((rect, index) => {
            const mark = document.createElement("span");
            mark.dataset.annotationId = annotation.id;
            const shouldDisplay = shouldDisplayAnnotationInOverlay(annotation);
            mark.className = cn(
              "informio-pdf-annotation",
              !shouldDisplay && "informio-pdf-viewer-hit-region",
              `is-${annotation.type}`,
              focusId === annotation.id && "is-focused"
            );
            mark.title = annotation.comment || annotation.text;
            Object.assign(mark.style, {
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              "--annotation-color": annotation.color
            });
            mark.setAttribute("aria-hidden", "true");
            mark.setAttribute("data-annotation-rect-index", String(index));
            mark.style.pointerEvents = "none";
            mark.removeAttribute("tabindex");
            overlayLayer?.appendChild(mark);
          });
        });
      });
    });
  };

  const commitPdfSelectionSession = (
    nextSelection: PdfSelectionSession | null,
    options: { clearTranslate?: boolean; preserveDomSelection?: boolean } = {}
  ) => {
    pdfSelectionSessionRef.current = nextSelection;
    setPdfSelectionSession((previous) => (samePdfSelectionSession(previous, nextSelection) ? previous : nextSelection));
    if (!options.preserveDomSelection) window.getSelection()?.removeAllRanges();
    if (options.clearTranslate ?? true) pdfContext?.onClearToolbarTranslate();
    pdfContext?.onPdfSelection(
      nextSelection
        ? {
            ...nextSelection,
            left: nextSelection.overlayLeft,
            top: nextSelection.overlayTop
          }
        : null
    );
  };

  const clearPdfSelectionSession = (options: { clearTranslate?: boolean; preserveDomSelection?: boolean } = {}) => {
    commitPdfSelectionSession(null, options);
  };

  const setPdfSelectionSessionStatus = (status: ReadonlySelectionSessionStatus) => {
    const current = pdfSelectionSessionRef.current;
    if (!current || current.status === status) return;
    const nextSelection = { ...current, status };
    commitPdfSelectionSession(nextSelection, { clearTranslate: false, preserveDomSelection: true });
  };

  const applyAnnotationState = (updater: (current: PdfAnnotation[]) => PdfAnnotation[]) => {
    let nextAnnotationsValue: PdfAnnotation[] = [];
    setAnnotations((current) => {
      nextAnnotationsValue = updater(current);
      annotationsRef.current = nextAnnotationsValue;
      return nextAnnotationsValue;
    });
    return nextAnnotationsValue;
  };

  const persistAnnotationRecords = async (items: PdfAnnotation[]) => {
    await Promise.all(
      items.map((annotation) =>
        window.informio.savePdfAnnotation({ annotation: toPersistedPdfAnnotation(annotation), writeToSource: false }).catch(() => undefined)
      )
    );
  };

  const updateAnnotationSourceWrite = async (
    ids: string[],
    buildSourceWrite: (annotation: PdfAnnotation) => NonNullable<PdfAnnotation["sourceWrite"]>
  ) => {
    if (!ids.length) return;
    const updated: PdfAnnotation[] = [];
    applyAnnotationState((current) =>
      current.map((annotation) => {
        if (!ids.includes(annotation.id)) return annotation;
        const nextAnnotation = {
          ...annotation,
          updatedAt: new Date().toISOString(),
          sourceWrite: buildSourceWrite(annotation)
        };
        updated.push(nextAnnotation);
        return nextAnnotation;
      })
    );
    if (updated.length) await persistAnnotationRecords(updated);
  };

  const flushQueuedSourceWrites = async () => {
    if (sourceWriteRunningRef.current) return;
    sourceWriteRunningRef.current = true;
    try {
      while (pendingSourceWriteJobRef.current) {
        const job = pendingSourceWriteJobRef.current;
        pendingSourceWriteJobRef.current = null;
        try {
          const bytes = await job.document.saveDocument();
          await window.informio.writePdfDocumentBytes({ pdfPath: job.pdfPath, bytes });
          await updateAnnotationSourceWrite(job.snapshotIds, (annotation) => ({
            attempted: true,
            ok: true,
            pending: false,
            message: annotation.type === "highlight" ? "高亮已写回源 PDF。" : "PDF 改动已写回源文件。"
          }));
        } catch (reason) {
          const message = `${job.failureMessage}：${reason instanceof Error ? reason.message : String(reason)}`;
          await updateAnnotationSourceWrite(job.pendingIds, () => ({
            attempted: true,
            ok: false,
            pending: false,
            message
          }));
          setNotice(message);
        }
      }
    } finally {
      sourceWriteRunningRef.current = false;
    }
  };

  const queueSourceWrite = (pendingIds: string[], failureMessage: string, _snapshotAnnotations: PdfAnnotation[]) => {
    const activeDocument = activeViewerDocumentRef.current;
    if (!activeDocument) return;
    pendingSourceWriteJobRef.current = {
      revision: sourceWriteRevisionRef.current + 1,
      document: activeDocument,
      pdfPath,
      snapshotIds: pendingIds,
      pendingIds,
      failureMessage
    };
    sourceWriteRevisionRef.current = pendingSourceWriteJobRef.current.revision;
    void flushQueuedSourceWrites();
  };

  const listNativeEditors = (uiManager: PdfAnnotationUiManager, pageIndex: number) => {
    try {
      return Array.from(uiManager.getEditors?.(pageIndex) ?? []);
    } catch {
      return [];
    }
  };

  const findNativeViewerAnnotationEditor = (annotation: PdfAnnotation) => {
    const uiManager = getPdfAnnotationUiManager();
    if (!uiManager) return null;
    const runtimeSourceAnnotationId = liveNativeAnnotationIdsRef.current.get(annotation.id);
    for (const candidateId of [runtimeSourceAnnotationId, annotation.sourceAnnotationId]) {
      if (!candidateId) continue;
      const editor = uiManager.getEditor(candidateId);
      if (editor && !editor.deleted) return editor;
    }
    const pageIndex = Math.max(0, annotation.page - 1);
    const targetBox = getAnnotationBoundingRect(annotation.rects);
    if (!targetBox) return null;
    const targetText = normalizeAnnotationTextForMatch(annotation.text);
    const tolerance = 0.02;
    return listNativeEditors(uiManager, pageIndex).find((editor) => {
      if (editor.deleted) return false;
      if (annotation.sourceAnnotationId && String(editor.id) === annotation.sourceAnnotationId) return true;
      const labelText = normalizeAnnotationTextForMatch(editor.div?.getAttribute("aria-label") ?? editor.div?.textContent ?? "");
      const textMatches = Boolean(targetText) && labelText === targetText;
      if (
        typeof editor.x !== "number" ||
        typeof editor.y !== "number" ||
        typeof editor.width !== "number" ||
        typeof editor.height !== "number"
      ) {
        return textMatches;
      }
      const boxMatches =
        Math.abs(editor.x - targetBox.x) <= tolerance &&
        Math.abs(editor.y - targetBox.y) <= tolerance &&
        Math.abs(editor.width - targetBox.width) <= tolerance &&
        Math.abs(editor.height - targetBox.height) <= tolerance;
      return boxMatches || textMatches;
    }) ?? null;
  };

  const hasLiveNativeHighlightEditor = (annotation: PdfAnnotation) => {
    if (annotation.type !== "highlight") return false;
    return Boolean(findNativeViewerAnnotationEditor(annotation));
  };

  const nativeEditorToAnnotation = (editor: PdfAnnotationEditor): PdfAnnotation | null => {
    if (!editor.id || editor.deleted) return null;
    const pageIndex = typeof editor.pageIndex === "number" ? editor.pageIndex : 0;
    if (
      typeof editor.x !== "number" ||
      typeof editor.y !== "number" ||
      typeof editor.width !== "number" ||
      typeof editor.height !== "number"
    ) {
      return null;
    }
    const now = new Date().toISOString();
    const text = normalizeAnnotationTextForMatch(editor.div?.getAttribute("aria-label") ?? editor.div?.textContent ?? "");
    return {
      id: `pdf-annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      pdfPath,
      fingerprint,
      page: pageIndex + 1,
      type: "highlight",
      color: editor.color || selectedColor,
      rects: [
        {
          x: clamp(editor.x, 0, 1),
          y: clamp(editor.y, 0, 1),
          width: clamp(editor.width, 0, 1),
          height: clamp(editor.height, 0, 1)
        }
      ],
      text,
      comment: editor.comment?.deleted ? undefined : editor.comment?.text?.trim() || undefined,
      sourceAnnotationId: String(editor.id),
      createdAt: now,
      updatedAt: now,
      sourceWrite: { attempted: true, ok: false, pending: true, message: "正在后台写回源 PDF。" }
    };
  };

  const syncNativeViewerAnnotationState = async () => {
    if (syncNativeStateRunningRef.current) return;
    syncNativeStateRunningRef.current = true;
    const deleted: PdfAnnotation[] = [];
    const changed: PdfAnnotation[] = [];
    const discovered: PdfAnnotation[] = [];
    try {
      let nextAnnotations = applyAnnotationState((current) =>
        current.flatMap((annotation) => {
          if (annotation.type === "link") return [annotation];
          const liveSourceAnnotationId = liveNativeAnnotationIdsRef.current.get(annotation.id);
          const uiManager = getPdfAnnotationUiManager();
          if (liveSourceAnnotationId && uiManager) {
            const liveEditor = uiManager.getEditor(liveSourceAnnotationId);
            if (!liveEditor || liveEditor.deleted) {
              deleted.push(annotation);
              liveNativeAnnotationIdsRef.current.delete(annotation.id);
              return [];
            }
          }
          const editor = findNativeViewerAnnotationEditor(annotation);
          if (!editor) return [annotation];
          if (editor.id) {
            liveNativeAnnotationIdsRef.current.set(annotation.id, String(editor.id));
          }
          const nextSourceAnnotationId = editor.id ? String(editor.id) : annotation.sourceAnnotationId;
          const nextComment = editor.comment?.deleted ? undefined : editor.comment?.text?.trim() || undefined;
          const sourceAnnotationChanged = Boolean(nextSourceAnnotationId) && annotation.sourceAnnotationId !== nextSourceAnnotationId;
          const commentChanged = (annotation.comment || undefined) !== nextComment;
          if (!commentChanged && !sourceAnnotationChanged) return [annotation];
          const nextAnnotation = {
            ...toPersistedPdfAnnotation(annotation),
            sourceAnnotationId: nextSourceAnnotationId,
            comment: nextComment,
            updatedAt: new Date().toISOString()
          };
          changed.push(nextAnnotation);
          return [nextAnnotation];
        })
      );
      const uiManager = getPdfAnnotationUiManager();
      if (uiManager) {
        const knownNativeIds = new Set<string>();
        nextAnnotations.forEach((annotation) => {
          const liveSourceAnnotationId = liveNativeAnnotationIdsRef.current.get(annotation.id);
          if (liveSourceAnnotationId) knownNativeIds.add(liveSourceAnnotationId);
          if (annotation.sourceAnnotationId) knownNativeIds.add(annotation.sourceAnnotationId);
        });
        const totalPages = Math.max(pageCount, activeViewerDocumentRef.current?.numPages ?? 1);
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
          listNativeEditors(uiManager, pageIndex).forEach((editor) => {
            if (!editor.id || knownNativeIds.has(String(editor.id))) return;
            const annotation = nativeEditorToAnnotation(editor);
            if (!annotation) return;
            knownNativeIds.add(String(editor.id));
            liveNativeAnnotationIdsRef.current.set(annotation.id, String(editor.id));
            discovered.push(annotation);
          });
        }
      }
      if (discovered.length) {
        nextAnnotations = applyAnnotationState((current) => [
          ...current.filter((annotation) => !discovered.some((item) => item.sourceAnnotationId === annotation.sourceAnnotationId)),
          ...discovered
        ]);
      }
      if (!deleted.length && !changed.length && !discovered.length) return;
      if (deleted.length) {
        await Promise.all(
          deleted.map((annotation) =>
            window.informio.deletePdfAnnotation({
              pdfPath,
              fingerprint,
              annotationId: annotation.id
            })
          )
        );
        deleted.forEach((annotation) => pdfContext?.onDeletePdfAnnotation(annotation.id));
      }
      const persistedRecords = [...changed, ...discovered];
      if (persistedRecords.length) {
        await persistAnnotationRecords(persistedRecords);
        persistedRecords.forEach((annotation) => pdfContext?.onRegisterPdfAnnotation(annotation));
      }
      pdfContext?.onPdfAnnotationStoreChanged();
      const sourceWriteIds = [...changed, ...discovered].map((annotation) => annotation.id);
      if (deleted.length || sourceWriteIds.length) {
        queueSourceWrite(sourceWriteIds, "源 PDF 后台写回失败，PDF 高亮改动尚未写入源文件", nextAnnotations);
      }
    } finally {
      syncNativeStateRunningRef.current = false;
    }
  };

  const executeFind = (type?: "" | "again" | "highlightallchange", previous = false) => {
    const viewerApi = viewerApiRef.current;
    const query = findQuery.trim();
    if (!viewerApi || !query) return;
    viewerApi.eventBus.dispatch("find", {
      source: viewerApi.findController,
      type,
      query,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false
    });
  };

  const clearPdfFindResults = () => {
    const viewerApi = viewerApiRef.current;
    if (!viewerApi) return;
    viewerApi.eventBus.dispatch("findbarclose", { source: viewerApi.findController });
    viewerApi.eventBus.dispatch("find", {
      source: viewerApi.findController,
      type: "highlightallchange",
      query: "",
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: false,
      findPrevious: false,
      matchDiacritics: false
    });
  };

  const zoomToScale = (nextScale: number, anchor?: { clientX: number; clientY: number }) => {
    const frame = frameRef.current;
    const viewer = viewerApiRef.current?.viewer;
    const viewerElement = viewerRef.current;
    if (!frame || !viewer || !viewerElement) return;
    const currentScale = Number.isFinite(viewer.currentScale) ? viewer.currentScale : zoomScale;
    const clampedScale = clamp(nextScale, PDF_MIN_ZOOM, PDF_MAX_ZOOM);
    if (Math.abs(clampedScale - currentScale) < 0.0001) return;
    clearPdfSelectionSession();
    window.getSelection()?.removeAllRanges();
    const frameRect = frame.getBoundingClientRect();
    const pointerViewportX = anchor ? anchor.clientX - frameRect.left : frameRect.width / 2;
    const pointerViewportY = anchor ? anchor.clientY - frameRect.top : frameRect.height / 2;
    const anchorElement =
      (anchor
        ? document
            .elementsFromPoint(anchor.clientX, anchor.clientY)
            .find((element) => element instanceof HTMLElement && element.classList.contains("page"))
        : viewerElement.querySelector<HTMLElement>(".page")) as HTMLElement | undefined | null;
    const anchorRect = anchorElement?.getBoundingClientRect();
    const anchorPageNumber = Number.parseInt(anchorElement?.dataset.pageNumber ?? "1", 10);
    const xRatio = anchorRect?.width
      ? clamp((anchor ? anchor.clientX : frameRect.left + frameRect.width / 2) - anchorRect.left, 0, anchorRect.width) / anchorRect.width
      : 0.5;
    const yRatio = anchorRect?.height
      ? clamp((anchor ? anchor.clientY : frameRect.top + frameRect.height / 2) - anchorRect.top, 0, anchorRect.height) / anchorRect.height
      : 0.5;
    viewer.currentScale = clampedScale;
    setZoomScale(clampedScale);
    if (zoomAdjustFrameRef.current !== null) window.cancelAnimationFrame(zoomAdjustFrameRef.current);
    zoomAdjustFrameRef.current = window.requestAnimationFrame(() => {
      zoomAdjustFrameRef.current = window.requestAnimationFrame(() => {
        zoomAdjustFrameRef.current = null;
        const pageElement = viewerRef.current?.querySelector<HTMLElement>(`.page[data-page-number="${anchorPageNumber}"]`);
        const activeFrame = frameRef.current;
        if (!pageElement || !activeFrame) return;
        const nextFrameRect = activeFrame.getBoundingClientRect();
        const nextPageRect = pageElement.getBoundingClientRect();
        const absoluteLeft = activeFrame.scrollLeft + nextPageRect.left - nextFrameRect.left;
        const absoluteTop = activeFrame.scrollTop + nextPageRect.top - nextFrameRect.top;
        activeFrame.scrollTo({
          left: Math.max(0, absoluteLeft + nextPageRect.width * xRatio - pointerViewportX),
          top: Math.max(0, absoluteTop + nextPageRect.height * yRatio - pointerViewportY)
        });
        scheduleOverlayRefresh();
      });
    });
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const normalizedDeltaY = clamp(event.deltaY, -80, 80);
    const viewer = viewerApiRef.current?.viewer;
    const currentScale = viewer && Number.isFinite(viewer.currentScale) ? viewer.currentScale : zoomScale;
    zoomToScale(currentScale * Math.exp(-normalizedDeltaY * PDF_GESTURE_ZOOM_SENSITIVITY), {
      clientX: event.clientX,
      clientY: event.clientY
    });
  };

  const translatePdfSelection = () => {
    if (!pdfSelectionSession || !pdfContext) return;
    setPdfSelectionSessionStatus("acting");
    pdfContext.onTranslateSelection({
      kind: "pdf",
      documentId: pdfContext.document.id,
      from: -1,
      to: -1,
      text: pdfSelectionSession.text,
      markdown: `PDF: ${title}\nPage: ${pdfSelectionSession.page}\n\n${pdfSelectionSession.text}`,
      title,
      filePath: pdfPath,
      page: pdfSelectionSession.page,
      rects: pdfSelectionSession.rects,
      overlayLeft: pdfSelectionSession.overlayLeft,
      overlayTop: pdfSelectionSession.overlayTop - 54
    });
  };

  const applyNativeHighlightColor = () => {
    const uiManager = getPdfAnnotationUiManager();
    try {
      uiManager?.updateParams?.(
        (pdfjsLib as typeof pdfjsLib & { AnnotationEditorParamsType?: { HIGHLIGHT_COLOR?: number } }).AnnotationEditorParamsType
          ?.HIGHLIGHT_COLOR ?? 31,
        selectedColor.toUpperCase()
      );
    } catch {
      // pdf.js may reject color updates before editor layers are ready; highlighting still works with its default color.
    }
  };

  const toggleNativeHighlightMode = async () => {
    const nextMode = nativeHighlightModeEnabled ? getNativeNoneMode() : getNativeHighlightMode();
    clearPdfSelectionSession({ preserveDomSelection: false });
    if (nextMode === getNativeHighlightMode()) applyNativeHighlightColor();
    try {
      const ready = await waitForNativeEditorMode(
        nextMode,
        nextMode === getNativeHighlightMode() ? "等待 pdf.js 进入原生高亮模式超时。" : "等待 pdf.js 退出原生高亮模式超时。"
      );
      setNativeHighlightModeEnabled(ready && nextMode === getNativeHighlightMode());
      if (!ready) setNotice(nextMode === getNativeHighlightMode() ? "无法进入高亮模式，请重试。" : "无法退出高亮模式，请重试。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换 PDF 高亮模式失败。");
    }
  };

  useEffect(() => {
    if (!findOpen) return;
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [findOpen]);

  useEffect(() => {
    if (!pdfPath || !frameRef.current || !viewerRef.current) {
      setLoading(false);
      setError(pdfPath ? null : "当前 PDF 文档缺少文件路径。");
      return;
    }
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    let detachViewerEvents = () => undefined;
    setLoading(true);
    setError(null);
    setNotice(null);
    setPdf(null);
    setAnnotations([]);
    setCurrentPageNumber(1);
    setPageCount(0);
    setFindStatus(null);
    setNativeHighlightModeEnabled(false);
    pendingSourceWriteJobRef.current = null;
    sourceWriteRunningRef.current = false;
    sourceWriteRevisionRef.current = 0;
    clearPdfSelectionSession({ preserveDomSelection: true });

    void (async () => {
      try {
        const viewerModule = await loadPdfJsViewerModule();
        if (cancelled) return;
        const frame = frameRef.current;
        const viewerElement = viewerRef.current;
        if (!frame || !viewerElement) return;
        viewerElement.replaceChildren();
        const eventBus = new viewerModule.EventBus();
        const linkService = new viewerModule.PDFLinkService({ eventBus });
        const findController = new viewerModule.PDFFindController({ linkService, eventBus, updateMatchesCountOnProgress: false });
        const viewer = new viewerModule.PDFViewer({
          container: frame,
          viewer: viewerElement,
          eventBus,
          linkService,
          findController,
          textLayerMode: 1,
          annotationMode: (pdfjsLib as typeof pdfjsLib & { AnnotationMode?: { ENABLE?: number } }).AnnotationMode?.ENABLE ?? 1,
          annotationEditorMode: getNativeNoneMode(),
          annotationEditorHighlightColors: PDF_HIGHLIGHT_EDITOR_COLORS,
          maxCanvasPixels: 16_777_216,
          enableDetailCanvas: true,
          enableOptimizedPartialRendering: true,
          minDurationToUpdateCanvas: 90,
          supportsPinchToZoom: true
        });
        linkService.setViewer(viewer);
        viewerApiRef.current = { viewer, eventBus, linkService, findController, viewerModule };

        const onPagesInit = () => {
          if (cancelled) return;
          viewer.currentScaleValue = "page-width";
          setZoomScale(Number.isFinite(viewer.currentScale) ? viewer.currentScale : 1);
          scheduleOverlayRefresh();
        };
        const onPagesLoaded = (event: { pagesCount?: number }) => {
          if (cancelled) return;
          setLoading(false);
          setPageCount(event.pagesCount ?? 0);
          setCurrentPageNumber(viewer.currentPageNumber ?? 1);
          scheduleOverlayRefresh();
        };
        const onScaleChanging = (event: { scale?: number }) => {
          if (!cancelled && typeof event.scale === "number" && Number.isFinite(event.scale)) {
            setZoomScale(event.scale);
            scheduleOverlayRefresh();
          }
        };
        const onPageChanging = (event: { pageNumber?: number }) => {
          if (cancelled || !event.pageNumber) return;
          setCurrentPageNumber(event.pageNumber);
        };
        const onAnnotationEditorModeChanged = (event: { mode?: number }) => {
          if (cancelled) return;
          const nextMode = typeof event.mode === "number" ? event.mode : getNativeEditorMode();
          setNativeHighlightModeEnabled(nextMode === getNativeHighlightMode());
        };
        const onFindState = (event: { state?: number; matchesCount?: { current: number; total: number } }) => {
          if (cancelled || !findQueryRef.current.trim()) return;
          const total = event.matchesCount?.total ?? 0;
          const current = event.matchesCount?.current ?? 0;
          if (event.state === viewerModule.FindState.NOT_FOUND || total === 0) {
            setFindStatus("未找到匹配项。");
            return;
          }
          if (event.state === viewerModule.FindState.PENDING) {
            setFindStatus("正在搜索...");
            return;
          }
          setFindStatus(`第 ${current || 1} / ${Math.max(total, 1)} 项`);
        };
        const onRendered = () => scheduleOverlayRefresh();
        eventBus.on("pagesinit", onPagesInit);
        eventBus.on("pagesloaded", onPagesLoaded);
        eventBus.on("scalechanging", onScaleChanging);
        eventBus.on("pagechanging", onPageChanging);
        eventBus.on("annotationeditormodechanged", onAnnotationEditorModeChanged);
        eventBus.on("updatefindcontrolstate", onFindState);
        eventBus.on("pagerendered", onRendered);
        eventBus.on("textlayerrendered", onRendered);
        detachViewerEvents = () => {
          eventBus.off("pagesinit", onPagesInit);
          eventBus.off("pagesloaded", onPagesLoaded);
          eventBus.off("scalechanging", onScaleChanging);
          eventBus.off("pagechanging", onPageChanging);
          eventBus.off("annotationeditormodechanged", onAnnotationEditorModeChanged);
          eventBus.off("updatefindcontrolstate", onFindState);
          eventBus.off("pagerendered", onRendered);
          eventBus.off("textlayerrendered", onRendered);
        };

        loadingTask = pdfjsLib.getDocument({
          url: fileUrl(pdfPath),
          isImageDecoderSupported: false,
          isOffscreenCanvasSupported: false,
          useWasm: true,
          wasmUrl: PDFJS_WASM_URL,
          iccUrl: PDFJS_ICC_URL
        });
        sourceLoadingTaskRef.current = loadingTask;
        const loaded = await loadingTask.promise;
        if (sourceLoadingTaskRef.current === loadingTask) sourceLoadingTaskRef.current = null;
        if (cancelled) {
          void loaded.destroy().catch(() => undefined);
          return;
        }
        sourceDocumentRef.current = loaded;
        activeViewerDocumentRef.current = loaded;
        setPdf(loaded);
        viewer.setDocument(loaded);
        linkService.setDocument(loaded, null);
        findController.setDocument(loaded);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      detachViewerEvents();
      if (overlayRefreshFrameRef.current !== null) window.cancelAnimationFrame(overlayRefreshFrameRef.current);
      overlayRefreshFrameRef.current = null;
      if (zoomAdjustFrameRef.current !== null) window.cancelAnimationFrame(zoomAdjustFrameRef.current);
      zoomAdjustFrameRef.current = null;
      const sourceDocument = sourceDocumentRef.current;
      sourceDocumentRef.current = null;
      viewerApiRef.current?.viewer?.setDocument?.(null);
      viewerApiRef.current?.linkService?.setDocument?.(null, null);
      viewerApiRef.current?.findController?.setDocument?.(null);
      activeViewerDocumentRef.current = null;
      viewerApiRef.current = null;
      viewerRef.current?.replaceChildren();
      sourceLoadingTaskRef.current?.destroy();
      sourceLoadingTaskRef.current = null;
      void loadingTask?.destroy().catch(() => undefined);
      if (sourceDocument) void sourceDocument.destroy().catch(() => undefined);
    };
  }, [pdfPath]);

  useEffect(() => {
    findQueryRef.current = findQuery;
    if (!findQuery.trim()) {
      setFindStatus(null);
      clearPdfFindResults();
      return;
    }
    const timer = window.setTimeout(() => executeFind(), 160);
    return () => window.clearTimeout(timer);
  }, [findQuery]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (!pdfContext || !viewerRef.current) return;
      if (getNativeEditorMode() === getNativeHighlightMode()) {
        clearPdfSelectionSession({ preserveDomSelection: true });
        return;
      }
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        if (!pdfSelectionPointerActiveRef.current && !isSelectionToolbarInteractionActive() && pdfSelectionSessionRef.current?.status !== "acting") {
          clearPdfSelectionSession({ preserveDomSelection: true });
        }
        return;
      }
      const range = domSelection.getRangeAt(0);
      const anchorNode = domSelection.anchorNode;
      const focusNode = domSelection.focusNode;
      if (!anchorNode || !focusNode || !viewerRef.current.contains(anchorNode) || !viewerRef.current.contains(focusNode)) return;
      const effectiveRange = getPointerAdjustedSelectionRange(domSelection, range, viewerRef.current, pdfSelectionPointerEndpointRef.current);
      const domRangeWasAdjusted = effectiveRange !== range;
      const rawRects = groupPdfSelectionRectsByLine(getPdfSelectionRangeRects(effectiveRange, viewerRef.current));
      const text = normalizePdfSelectionText(effectiveRange.toString());
      if (!text || !rawRects.length) {
        if (!pdfSelectionPointerActiveRef.current && !isSelectionToolbarInteractionActive() && pdfSelectionSessionRef.current?.status !== "acting") {
          clearPdfSelectionSession({ preserveDomSelection: true });
        }
        return;
      }
      const allPageElements = Array.from(viewerRef.current.querySelectorAll<HTMLElement>(".page[data-page-number]"));
      const pages = new Map<number, { pageElement: HTMLElement; rects: PdfAnnotationRect[]; rawRects: DOMRect[] }>();
      rawRects.forEach((rect) => {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let cachedPageRect: DOMRect | undefined;
        const pageElement = allPageElements.find((el) => {
          const pr = el.getBoundingClientRect();
          if (centerX >= pr.left && centerX <= pr.right && centerY >= pr.top && centerY <= pr.bottom) {
            cachedPageRect = pr;
            return true;
          }
          return false;
        });
        if (!pageElement || !cachedPageRect) return;
        const pageNumber = Number.parseInt(pageElement.dataset.pageNumber ?? "0", 10);
        if (!pageNumber) return;
        const pageRect = cachedPageRect;
        const left = pageRect.left + pageElement.clientLeft;
        const top = pageRect.top + pageElement.clientTop;
        const width = pageElement.clientWidth;
        const height = pageElement.clientHeight;
        if (!width || !height) return;
        const group = pages.get(pageNumber) ?? { pageElement, rects: [], rawRects: [] };
        group.rects.push({
          x: clamp((rect.left - left) / width, 0, 1),
          y: clamp((rect.top - top) / height, 0, 1),
          width: clamp(rect.width / width, 0, 1),
          height: clamp(rect.height / height, 0, 1)
        });
        group.rawRects.push(rect);
        pages.set(pageNumber, group);
      });
      if (pages.size === 0) {
        if (!pdfSelectionPointerActiveRef.current && !isSelectionToolbarInteractionActive() && pdfSelectionSessionRef.current?.status !== "acting") {
          clearPdfSelectionSession({ preserveDomSelection: true });
        }
        return;
      }
      const [[pageNumber, entry]] = Array.from(pages.entries()).sort((a, b) => b[1].rects.length - a[1].rects.length);
      const frame = frameRef.current;
      if (!frame) return;
      const frameRect = frame.getBoundingClientRect();
      const minLeft = Math.min(...entry.rawRects.map((rect) => rect.left));
      const minTop = Math.min(...entry.rawRects.map((rect) => rect.top));
      const maxRight = Math.max(...entry.rawRects.map((rect) => rect.right));
      const visualRects = separateOverlappingSelectionVisualRects(
        buildPdfSelectionVisualRects(
          entry.rawRects,
          entry.pageElement,
          frameRect,
          {
            left: frame.scrollLeft,
            top: frame.scrollTop
          },
          pdfSelectionPointerActiveRef.current
        )
      );
      const r4 = (v: number) => Math.round(v * 10000) / 10000;
      const rangeSignature = `${pageNumber}:${text}:${entry.rects.map((rect) => `${r4(rect.x)}:${r4(rect.y)}:${r4(rect.width)}:${r4(rect.height)}`).join("|")}`;
      if (domRangeWasAdjusted && !pdfSelectionPointerActiveRef.current) {
        try {
          domSelection.removeAllRanges();
          domSelection.addRange(effectiveRange);
        } catch {
          // Keep the corrected overlay even if Chromium rejects a transient text-layer range.
        }
      }
      const pdfToolbarEl = shellRef.current?.querySelector<HTMLElement>(".informio-pdf-toolbar");
      const pdfToolbarHeight = pdfToolbarEl?.offsetHeight ?? 0;
      const minOverlayTop = frame.scrollTop + pdfToolbarHeight + 4;
      const nextSelection: PdfSelectionSession = {
        pdfPath,
        fingerprint,
        title,
        page: pageNumber,
        text,
        rects: entry.rects,
        rangeSignature,
        visualRects,
        overlayLeft: clamp(
          minLeft + (maxRight - minLeft) / 2 - frameRect.left + frame.scrollLeft,
          frame.scrollLeft + 24,
          Math.max(frame.scrollLeft + 24, frame.scrollLeft + frameRect.width - 24)
        ),
        overlayTop: Math.max(minOverlayTop, minTop - frameRect.top + frame.scrollTop - 42),
        status: pdfSelectionPointerActiveRef.current
          ? "selecting"
          : pdfSelectionSessionRef.current?.status === "acting"
            ? "acting"
            : "stable"
      };
      const sameRange = pdfSelectionSessionRef.current?.rangeSignature === nextSelection.rangeSignature;
      commitPdfSelectionSession(nextSelection, { clearTranslate: !sameRange, preserveDomSelection: true });
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [fingerprint, pdfContext, pdfPath, title]);

  useEffect(() => {
    const rememberPointerEndpoint = (event: PointerEvent) => {
      pdfSelectionPointerEndpointRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        updatedAt: Date.now()
      };
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = target instanceof HTMLElement ? target : target.parentElement;
      if (element?.closest(".informio-pdf-selection-popover, .informio-pdf-toolbar, .editToolbar"))
        return;
      if (!shellRef.current?.contains(target)) {
        pdfSelectionPointerActiveRef.current = false;
        pdfSelectionPointerEndpointRef.current = null;
        clearPdfSelectionSession();
        setToolMenuOpen(false);
        return;
      }
      if (element?.closest(".textLayer, .annotationLayer")) {
        pdfSelectionPointerActiveRef.current = true;
        rememberPointerEndpoint(event);
        clearPdfSelectionSession({ preserveDomSelection: false });
        return;
      }
      pdfSelectionPointerActiveRef.current = false;
      pdfSelectionPointerEndpointRef.current = null;
      if (element?.closest(".page")) {
        return;
      }
      clearPdfSelectionSession({ preserveDomSelection: true });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pdfSelectionPointerActiveRef.current) return;
      rememberPointerEndpoint(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pdfSelectionPointerActiveRef.current) return;
      rememberPointerEndpoint(event);
      window.setTimeout(() => {
        pdfSelectionPointerActiveRef.current = false;
        const selection = window.getSelection();
        if (!pdfSelectionSessionRef.current || pdfSelectionSessionRef.current.status === "selecting") {
          if (selection?.rangeCount) document.dispatchEvent(new Event("selectionchange"));
        } else {
          setPdfSelectionSessionStatus("stable");
        }
      }, 0);
    };
    const onPointerUpCaptureNativeHighlights = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !shellRef.current?.contains(target)) return;
      window.setTimeout(() => {
        void syncNativeViewerAnnotationState();
      }, 0);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointerup", onPointerUpCaptureNativeHighlights, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointerup", onPointerUpCaptureNativeHighlights, true);
    };
  }, [pdfContext]);

  return (
    <div
      ref={shellRef}
      className={cn(
        "informio-pdf-shell",
        mode === "compact" ? "is-compact" : "is-full",
        nativeHighlightModeEnabled && "is-native-highlight-mode"
      )}
      onMouseDownCapture={markSelectionToolbarInteraction}
    >
      <div className="informio-pdf-toolbar" data-selection-toolbar-safe-area="true">
        <div className="informio-pdf-toolbar-main">
          <div className="informio-pdf-toolbar-strip">
            <div className="informio-pdf-toolbar-cluster">
              <button
                type="button"
                className="informio-pdf-toolbar-icon"
                title="上一页"
                disabled={currentPageNumber <= 1}
                onClick={() => {
                  const viewer = viewerApiRef.current?.viewer;
                  if (!viewer) return;
                  viewer.currentPageNumber = Math.max(1, (viewer.currentPageNumber ?? 1) - 1);
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="informio-pdf-toolbar-icon"
                title="下一页"
                disabled={pageCount > 0 && currentPageNumber >= pageCount}
                onClick={() => {
                  const viewer = viewerApiRef.current?.viewer;
                  if (!viewer) return;
                  viewer.currentPageNumber = Math.min(pageCount || 1, (viewer.currentPageNumber ?? 1) + 1);
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="informio-pdf-toolbar-divider" />
            <div className="informio-pdf-toolbar-cluster">
              <button type="button" className="informio-pdf-toolbar-icon" title="缩小" onClick={() => zoomToScale(zoomScale / 1.15)}>
                <Minus size={14} />
              </button>
              <span className="informio-pdf-toolbar-meta">{Math.round(zoomScale * 100)}%</span>
              <button type="button" className="informio-pdf-toolbar-icon" title="放大" onClick={() => zoomToScale(zoomScale * 1.15)}>
                <Plus size={14} />
              </button>
            </div>
            <div className="informio-pdf-toolbar-divider" />
            <div className="informio-pdf-toolbar-cluster">
              <button
                type="button"
                className={cn("informio-pdf-toolbar-icon", nativeHighlightModeEnabled && "is-active")}
                title={nativeHighlightModeEnabled ? "退出高亮模式" : "进入高亮模式"}
                aria-label={nativeHighlightModeEnabled ? "退出高亮模式" : "进入高亮模式"}
                aria-pressed={nativeHighlightModeEnabled}
                onClick={() => void toggleNativeHighlightMode()}
              >
                <Highlighter size={14} />
              </button>
              <button
                type="button"
                className={cn("informio-pdf-toolbar-icon", findOpen && "is-active")}
                title="查找"
                onClick={() => setFindOpen((current) => !current)}
              >
                <FileSearch size={14} />
              </button>
              {mode === "full" ? (
                <>
                  <button type="button" className="informio-pdf-toolbar-icon" title="逆时针旋转" onClick={() => {
                    const viewer = viewerApiRef.current?.viewer;
                    if (!viewer) return;
                    viewer.pagesRotation = ((viewer.pagesRotation ?? 0) + 270) % 360;
                  }}>
                    <RotateCcw size={14} />
                  </button>
                  <button type="button" className="informio-pdf-toolbar-icon" title="顺时针旋转" onClick={() => {
                    const viewer = viewerApiRef.current?.viewer;
                    if (!viewer) return;
                    viewer.pagesRotation = ((viewer.pagesRotation ?? 0) + 90) % 360;
                  }}>
                    <RotateCw size={14} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="informio-pdf-toolbar-icon"
                title={mode === "compact" ? "在系统中打开" : "打开原始文件"}
                onClick={() => void window.informio.openPath(pdfPath)}
              >
                {mode === "compact" ? <Maximize2 size={14} /> : <ExternalLink size={14} />}
              </button>
            </div>
            {allowRemove ? (
              <>
                <div className="informio-pdf-toolbar-divider" />
                <div className="relative">
                  <button
                    type="button"
                    className={cn("informio-pdf-toolbar-icon", toolMenuOpen && "is-active")}
                    title="更多"
                    onClick={() => setToolMenuOpen((current) => !current)}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {toolMenuOpen ? (
                    <div className="informio-pdf-menu">
                      <button
                        type="button"
                        className="informio-table-menu-item"
                        onClick={() => {
                          setToolMenuOpen(false);
                          void window.informio.openPath(pdfPath);
                        }}
                      >
                        在系统中打开
                      </button>
                      <button
                        type="button"
                        className="informio-table-menu-item is-danger"
                        onClick={() => {
                          setToolMenuOpen(false);
                          onRemove?.();
                        }}
                      >
                        移除 PDF
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
        {findOpen ? (
          <div className="informio-pdf-toolbar-sub">
            <input
              ref={findInputRef}
              type="text"
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  executeFind("again", event.shiftKey);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setFindOpen(false);
                }
              }}
              className="informio-pdf-find-input"
              placeholder="在 PDF 中搜索"
              aria-label="在 PDF 中搜索"
            />
            <button type="button" className="informio-pdf-toolbar-icon" title="上一个匹配" onClick={() => executeFind("again", true)}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="informio-pdf-toolbar-icon" title="下一个匹配" onClick={() => executeFind("again", false)}>
              <ChevronRight size={14} />
            </button>
            {findStatus ? <span className="informio-pdf-find-status">{findStatus}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="informio-pdf-body">
        <div className="informio-pdf-document-frame-shell">
          <div
            ref={frameRef}
            className={cn("informio-pdf-frame", mode === "full" && "informio-pdf-frame-full")}
            onWheel={handleWheel}
            onClickCapture={(event) => {
              const anchor = (event.target as HTMLElement).closest("a");
              const href = anchor?.getAttribute("href") ?? "";
              if (href && /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("file:") && !href.startsWith("blob:")) {
                event.preventDefault();
                event.stopPropagation();
                void window.informio.openExternal(href);
                return;
              }
            }}
          >
            {loading ? <div className="informio-pdf-message">Loading PDF...</div> : null}
            {error ? <div className="informio-pdf-message is-error">{error}</div> : null}
            {notice ? (
              <button type="button" className="informio-pdf-notice" onClick={() => setNotice(null)}>
                {notice}
              </button>
            ) : null}
            <div ref={viewerRef} className="pdfViewer informio-pdf-document-viewer" />
            {pdfSelectionSession?.visualRects.length ? (
              <div className="informio-pdf-selection-visual-layer" aria-hidden="true">
                {pdfSelectionSession.visualRects.map((rect, index) => (
                  <span
                    key={`${pdfSelectionSession.rangeSignature}:${index}`}
                    className="informio-pdf-selection-visual-rect"
                    style={{
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height
                    }}
                  />
                ))}
              </div>
            ) : null}
            {pdfSelectionSession && pdfSelectionSession.status !== "selecting" ? (
              <div
                className="informio-pdf-selection-popover"
                style={{ left: pdfSelectionSession.overlayLeft, top: pdfSelectionSession.overlayTop }}
                data-selection-toolbar-safe-area="true"
                onMouseDownCapture={markSelectionToolbarInteraction}
              >
                <div className="informio-pdf-selection-toolbar">
                  <div className="informio-pdf-action-row">
                    <button
                      type="button"
                      className="informio-pdf-toolbar-button"
                      aria-label="翻译"
                      title="翻译"
                      disabled={!pdfContext?.toolbarEnabled || pdfContext.toolbarTranslate.status === "loading"}
                      onClick={translatePdfSelection}
                    >
                      {pdfContext?.toolbarTranslate.status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                    </button>
                  </div>
                </div>
                {pdfContext?.toolbarTranslate.response ? (
                  <div className="informio-pdf-translate-panel" onMouseDown={(event) => event.stopPropagation()}>
                    {pdfContext.toolbarTranslate.response}
                  </div>
                ) : null}
                {pdfContext?.toolbarTranslate.error ? (
                  <div className="informio-pdf-translate-panel is-error" onMouseDown={(event) => event.stopPropagation()}>
                    {pdfContext.toolbarTranslate.error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PdfBlockView({ node, editor, getPos }: ReactNodeViewProps) {
  const src = String((node.attrs as { src?: string }).src ?? "");
  const title = String((node.attrs as { title?: string }).title ?? "PDF");
  const pdfPath = localFilePathFromUrl(src);
  return (
    <NodeViewWrapper className="informio-pdf-block" contentEditable={false}>
      <PdfSurface
        mode="compact"
        pdfPath={pdfPath}
        title={title}
        fingerprintFallback={src}
        allowRemove
        onRemove={() => {
          const position = getPos();
          if (typeof position !== "number") return;
          editor.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run();
        }}
      />
    </NodeViewWrapper>
  );
}

export function PdfViewerSurface() {
  const pdfContext = usePdfEditorContext();
  const currentDocument = pdfContext?.document ?? null;
  if (!pdfContext || !currentDocument) {
    return <div className="informio-pdf-message is-error">PDF 上下文丢失，无法打开文档。</div>;
  }
  return (
    <PdfSurface
      mode="full"
      pdfPath={currentDocument.filePath ?? ""}
      title={currentDocument.title ?? "PDF"}
      fingerprintFallback={currentDocument.filePath || currentDocument.id}
    />
  );
}
