import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";
import type {
  AnnotationCapability,
  PDFViewerConfig,
  PluginRegistry,
  ThemeColors,
  ThemeConfig
} from "@embedpdf/react-pdf-viewer";
import { MoreHorizontal } from "lucide-react";
import type { AppSettings, InformioDocument, PdfSelectionRect } from "../../shared/types";
import type {
  UnifiedToolbarTranslateState as ToolbarTranslateState,
  PdfAgentSelection,
  UnifiedPdfEditorContextValue as PdfEditorContextValue
} from "./types";
import { cn } from "./lib/utils";
import { loadLocalAssetObjectUrl } from "./lib/asset-url";

const normalizeLocalFilePath = (path: string) => {
  const normalizedHomePath = path.startsWith("/users/") ? `/Users/${path.slice("/users/".length)}` : path;
  return /^\/[A-Za-z]:\//.test(normalizedHomePath) ? normalizedHomePath.slice(1) : normalizedHomePath;
};

const localFilePathFromUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "local-file:") return value;
    const host = decodeURIComponent(url.host);
    const pathname = decodeURIComponent(url.pathname);
    if (/^[A-Za-z]:?$/.test(host)) return `${host.replace(/:$/, "")}:${pathname}`;
    return normalizeLocalFilePath(url.host ? `/${host}${pathname}` : pathname);
  } catch (error) {
    console.warn("Failed to parse local file URL:", error);
    return value;
  }
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

type EmbedPdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EmbedPdfSelectionCapability = {
  getSelectedText: (documentId?: string) => { toPromise: () => Promise<string[]> };
  getBoundingRects: (documentId?: string) => Array<{ page: number; rect: EmbedPdfRect }>;
  clear: (documentId?: string) => void;
};

type EmbedPdfCommandsCapability = {
  registerCommand: (command: {
    id: string;
    label?: string;
    description?: string;
    categories?: string[];
    action: (context: { registry: PluginRegistry; documentId: string }) => void;
    disabled?: (context: { registry: PluginRegistry; documentId: string }) => boolean;
  }) => void;
  unregisterCommand?: (commandId: string) => void;
};

type EmbedPdfSelectionMenuItem = {
  type: "command-button";
  id: string;
  commandId: string;
  variant: "icon" | "text" | "icon-text";
  categories?: string[];
};

type EmbedPdfUiCapability = {
  getSchema: () => {
    selectionMenus?: Record<
      string,
      {
        id: string;
        items: EmbedPdfSelectionMenuItem[];
        visibilityDependsOn?: { itemIds?: string[] };
        categories?: string[];
        responsive?: unknown;
      }
    >;
  };
  mergeSchema: (schema: {
    selectionMenus: NonNullable<ReturnType<EmbedPdfUiCapability["getSchema"]>["selectionMenus"]>;
  }) => void;
};

type EmbedPdfDocumentManagerCapability = {
  getActiveDocumentId: () => string | null;
  getDocumentState: (documentId: string) => { status: string } | null;
  onDocumentOpened: (listener: (document: { id: string }) => void) => () => void;
  onDocumentError: (listener: (event: { documentId: string; message: string; code?: number; reason?: unknown }) => void) => () => void;
};

type EmbedPdfExportCapability = {
  forDocument: (documentId: string) => {
    saveAsCopy: () => { toPromise: () => Promise<ArrayBuffer> };
  };
};

const EMBEDPDF_TRANSLATE_COMMAND_ID = "informio:translate-selection";
const EMBEDPDF_TRANSLATE_MENU_ITEM_ID = "informio-translate-selection";
const EMBEDPDF_ITEM_ATTRIBUTE = "data-epdf-i";
const PDF_ANNOTATION_SAVE_DELAY_MS = 700;

export const PdfEditorContext = createContext<PdfEditorContextValue | null>(null);

const usePdfEditorContext = () => useContext(PdfEditorContext);

const getCapability = <T,>(registry: PluginRegistry, pluginId: string): T | null => {
  return (registry.getPlugin(pluginId)?.provides?.() as T | null | undefined) ?? null;
};

const validViewportRect = (rect: DOMRect | null | undefined) => {
  return Boolean(rect && rect.width > 0 && rect.height > 0 && Number.isFinite(rect.left) && Number.isFinite(rect.top));
};

const deepQueryAll = (root: ParentNode, selector: string): HTMLElement[] => {
  const matches: HTMLElement[] = [];
  root.querySelectorAll(selector).forEach((element) => {
    if (element instanceof HTMLElement) matches.push(element);
  });

  root.querySelectorAll("*").forEach((element) => {
    if (element instanceof HTMLElement && element.shadowRoot) {
      matches.push(...deepQueryAll(element.shadowRoot, selector));
    }
  });

  return matches;
};

const visibleViewportRect = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  if (!validViewportRect(rect)) return null;
  const style = globalThis.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return null;
  return rect;
};

const firstVisibleRect = (elements: HTMLElement[]) => {
  for (const element of elements) {
    const rect = visibleViewportRect(element);
    if (rect) return rect;
  }
  return null;
};

const isTranslateControl = (element: HTMLElement) => {
  const label = `${element.getAttribute("aria-label") ?? ""} ${element.title ?? ""} ${element.textContent ?? ""}`.trim();
  return label === "翻译" || label === "Translate" || label.includes("翻译") || label.includes("Translate");
};

const pdfTranslationAnchorFromViewport = (surfaceRoot: HTMLElement | null) => {
  if (surfaceRoot) {
    const translateButtonRect = firstVisibleRect(
      deepQueryAll(surfaceRoot, `[${EMBEDPDF_ITEM_ATTRIBUTE}="${EMBEDPDF_TRANSLATE_MENU_ITEM_ID}"]`)
    );
    if (translateButtonRect) {
      return {
        kind: "pdf" as const,
        left: translateButtonRect.left,
        top: translateButtonRect.bottom + 8
      };
    }

    const translateTextRect = firstVisibleRect(
      deepQueryAll(surfaceRoot, "button,[role='button']").filter(isTranslateControl)
    );
    if (translateTextRect) {
      return {
        kind: "pdf" as const,
        left: translateTextRect.left,
        top: translateTextRect.bottom + 8
      };
    }
  }

  const activeElement = globalThis.document?.activeElement;
  const activeControl =
    activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>("button,[role='button'],[data-radix-collection-item]")
      : null;
  const activeRect = activeControl?.getBoundingClientRect();
  if (validViewportRect(activeRect)) {
    const rect = activeRect as DOMRect;
    return {
      kind: "pdf" as const,
      left: rect.left,
      top: rect.bottom + 8
    };
  }

  const selection = globalThis.getSelection?.();
  if (selection?.rangeCount) {
    const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
    if (validViewportRect(rangeRect)) {
      return {
        kind: "pdf" as const,
        left: rangeRect.left,
        top: rangeRect.bottom + 42
      };
    }
  }

  return undefined;
};

const pdfTranslationAnchorFromEvent = (event: ReactPointerEvent<HTMLElement>) => {
  for (const item of event.nativeEvent.composedPath()) {
    if (!(item instanceof HTMLElement)) continue;
    const anchorElement =
      item.getAttribute(EMBEDPDF_ITEM_ATTRIBUTE) === EMBEDPDF_TRANSLATE_MENU_ITEM_ID
        ? item
        : item.closest<HTMLElement>(`[${EMBEDPDF_ITEM_ATTRIBUTE}="${EMBEDPDF_TRANSLATE_MENU_ITEM_ID}"]`) ??
          (isTranslateControl(item) ? item : null);
    const rect = anchorElement ? visibleViewportRect(anchorElement) : null;
    if (rect) {
      return {
        kind: "pdf" as const,
        left: rect.left,
        top: rect.bottom + 8
      };
    }
  }
  return undefined;
};

const embedPdfInformioColors: Partial<ThemeColors> = {
  background: {
    app: "var(--surface-editor)",
    surface: "var(--surface-editor)",
    surfaceAlt: "var(--surface-panel)",
    elevated: "var(--surface-elevated)",
    overlay: "rgba(15, 23, 42, 0.28)",
    input: "var(--surface-elevated)"
  },
  foreground: {
    primary: "var(--text-main)",
    secondary: "var(--text-muted)",
    muted: "color-mix(in srgb, var(--text-muted) 76%, transparent)",
    disabled: "color-mix(in srgb, var(--text-muted) 42%, transparent)",
    onAccent: "#ffffff"
  },
  border: {
    default: "var(--divider)",
    subtle: "color-mix(in srgb, var(--divider) 72%, transparent)",
    strong: "color-mix(in srgb, var(--divider) 86%, var(--text-muted))"
  },
  accent: {
    primary: "var(--accent)",
    primaryHover: "color-mix(in srgb, var(--accent) 86%, var(--text-main))",
    primaryActive: "color-mix(in srgb, var(--accent) 74%, var(--text-main))",
    primaryLight: "color-mix(in srgb, var(--accent) 14%, transparent)",
    primaryForeground: "#ffffff"
  },
  interactive: {
    hover: "color-mix(in srgb, var(--text-muted) 10%, transparent)",
    active: "color-mix(in srgb, var(--text-muted) 16%, transparent)",
    selected: "color-mix(in srgb, var(--accent) 15%, transparent)",
    focus: "var(--accent)",
    focusRing: "color-mix(in srgb, var(--accent) 26%, transparent)"
  },
  state: {
    error: "#dc2626",
    errorLight: "rgba(220, 38, 38, 0.12)",
    warning: "#d97706",
    warningLight: "rgba(217, 119, 6, 0.14)",
    success: "#059669",
    successLight: "rgba(5, 150, 105, 0.14)",
    info: "#2563eb",
    infoLight: "rgba(37, 99, 235, 0.12)"
  },
  scrollbar: {
    track: "transparent",
    thumb: "color-mix(in srgb, var(--text-muted) 42%, transparent)",
    thumbHover: "color-mix(in srgb, var(--text-muted) 62%, transparent)"
  },
  tooltip: {
    background: "var(--surface-elevated)",
    foreground: "var(--text-main)"
  }
};

const embedPdfThemeForSettings = (settings: AppSettings): ThemeConfig => ({
  preference: settings.appearance.theme === "night" ? "dark" : "light",
  light: embedPdfInformioColors,
  dark: embedPdfInformioColors
});

function EmbedPdfSurface({ mode, pdfPath, title, allowRemove = false, onRemove }: PdfSurfaceProps) {
  const { t, i18n } = useTranslation();
  const pdfContext = usePdfEditorContext();
  const settings = pdfContext?.settings;
  const surfaceRootRef = useRef<HTMLDivElement | null>(null);
  const lastTranslateAnchorRef = useRef<{ left: number; top: number } | null>(null);
  const annotationSaveTimerRef = useRef<number | null>(null);
  const annotationEventUnsubscribeRef = useRef<(() => void) | null>(null);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState("");
  const [pdfiumWasmUrl, setPdfiumWasmUrl] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState("");

  useEffect(() => {
    return () => {
      if (annotationSaveTimerRef.current !== null) window.clearTimeout(annotationSaveTimerRef.current);
      annotationEventUnsubscribeRef.current?.();
      annotationEventUnsubscribeRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let wasmUrl = "";
    window.informio
      .loadEmbedPdfWasm()
      .then((result) => {
        if (disposed) return;
        if (!result?.data?.byteLength) {
          setLoadFailed(true);
          setLoadErrorDetail("WASM load failed (empty response)");
          return;
        }
        wasmUrl = URL.createObjectURL(new Blob([result.data], { type: result.mimeType }));
        setPdfiumWasmUrl(wasmUrl);
      })
      .catch((error) => {
        if (!disposed) {
          setLoadFailed(true);
          setLoadErrorDetail(`WASM load failed: ${error.message}`);
        }
      });
    return () => {
      disposed = true;
      if (wasmUrl) URL.revokeObjectURL(wasmUrl);
    };
  }, []);

  useEffect(() => {
    if (!pdfPath) {
      setViewerSrc("");
      setLoadFailed(false);
      setLoadErrorDetail("");
      setIsLoading(false);
      return;
    }
    let disposed = false;
    let objectUrl = "";
    setIsLoading(true);
    setLoadFailed(false);
    setLoadErrorDetail("");
    loadLocalAssetObjectUrl(pdfPath)
      .then((url) => {
        if (disposed) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setViewerSrc(url);
      })
      .catch((error) => {
        if (!disposed) {
          setViewerSrc("");
          setLoadFailed(true);
          setLoadErrorDetail(`PDF load failed: ${error.message}`);
        }
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });
    return () => {
      disposed = true;
      setViewerSrc("");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfPath]);

  const triggerPdfTranslation = useCallback(
    async (registry: PluginRegistry, embedPdfDocumentId: string) => {
      if (!pdfContext) return;
      const selection = getCapability<EmbedPdfSelectionCapability>(registry, "selection");
      if (!selection) return;
      const anchor = pdfTranslationAnchorFromViewport(surfaceRootRef.current) ?? lastTranslateAnchorRef.current;
      const selectedText = (await selection.getSelectedText(embedPdfDocumentId).toPromise()).join("\n").trim();
      if (!selectedText) return;
      const rects = selection.getBoundingRects(embedPdfDocumentId);
      const firstRect = rects[0];
      pdfContext.onTranslateSelection({
        kind: "pdf",
        documentId: pdfContext.document.id,
        from: -1,
        to: -1,
        text: selectedText,
        markdown: `PDF: ${title}\nPage: ${(firstRect?.page ?? 0) + 1}\n\n${selectedText}`,
        title,
        filePath: pdfPath,
        page: (firstRect?.page ?? 0) + 1,
        overlayLeft: anchor?.left,
        overlayTop: anchor?.top,
        rects: rects.map(({ rect }) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }))
      });
    },
    [pdfContext, pdfPath, title]
  );

  const schedulePdfAnnotationPersist = useCallback(
    (pdfExport: EmbedPdfExportCapability, embedPdfDocumentId: string) => {
      if (!pdfContext) return;
      if (annotationSaveTimerRef.current !== null) window.clearTimeout(annotationSaveTimerRef.current);
      annotationSaveTimerRef.current = window.setTimeout(() => {
        annotationSaveTimerRef.current = null;
        pdfExport
          .forDocument(embedPdfDocumentId)
          .saveAsCopy()
          .toPromise()
          .then((buffer) => {
            if (!pdfPath) return;
            return window.informio.savePdfFile(pdfPath, buffer);
          })
          .catch((error) => {
            console.error("Failed to save PDF annotations to source file", error);
          });
      }, PDF_ANNOTATION_SAVE_DELAY_MS);
    },
    [pdfContext, pdfPath]
  );

  const captureTranslateAnchor = (event: ReactPointerEvent<HTMLDivElement>) => {
    const anchor = pdfTranslationAnchorFromEvent(event);
    if (anchor) {
      lastTranslateAnchorRef.current = {
        left: anchor.left,
        top: anchor.top
      };
    }
  };

  const handleEmbedPdfReady = useCallback(
    (registry: PluginRegistry) => {
      const commands = getCapability<EmbedPdfCommandsCapability>(registry, "commands");
      const ui = getCapability<EmbedPdfUiCapability>(registry, "ui");
      const selection = getCapability<EmbedPdfSelectionCapability>(registry, "selection");
      const annotation = getCapability<AnnotationCapability>(registry, "annotation");
      const documentManager = getCapability<EmbedPdfDocumentManagerCapability>(registry, "document-manager");
      const pdfExport = getCapability<EmbedPdfExportCapability>(registry, "export");

      annotationEventUnsubscribeRef.current?.();
      annotationEventUnsubscribeRef.current = null;

      const setupAnnotationPersistence = (embedPdfDocumentId: string) => {
        if (!annotation || !pdfExport || !pdfContext) return;
        annotationEventUnsubscribeRef.current?.();
        annotationEventUnsubscribeRef.current = null;
        const annotationScope = annotation.forDocument(embedPdfDocumentId);
        annotationEventUnsubscribeRef.current = annotationScope.onAnnotationEvent((event) => {
          if (event.type === "loaded" || !event.committed) return;
          schedulePdfAnnotationPersist(pdfExport, embedPdfDocumentId);
        });
      };

      if (documentManager) {
        documentManager.onDocumentError((event) => {
          setLoadFailed(true);
          setLoadErrorDetail(`${event.message} (${event.code ?? "unknown"})`);
        });
      }

      const activeEmbedPdfDocumentId = documentManager?.getActiveDocumentId();
      if (activeEmbedPdfDocumentId && documentManager?.getDocumentState(activeEmbedPdfDocumentId)?.status === "loaded") {
        setupAnnotationPersistence(activeEmbedPdfDocumentId);
      } else if (documentManager && annotation && pdfExport && pdfContext) {
        annotationEventUnsubscribeRef.current = documentManager.onDocumentOpened((document) => {
          setupAnnotationPersistence(document.id);
        });
      }

      commands?.registerCommand({
        id: EMBEDPDF_TRANSLATE_COMMAND_ID,
        label: t("common.translate"),
        description: t("pdf.translateSelection"),
        categories: ["selection", "informio-translate"],
        action: ({ registry: commandRegistry, documentId }) => {
          void triggerPdfTranslation(commandRegistry, documentId);
        },
        disabled: ({ documentId }) => {
          const textSelection = selection?.getBoundingRects(documentId) ?? [];
          return textSelection.length === 0;
        }
      });

      const schema = ui?.getSchema();
      const selectionMenu = schema?.selectionMenus?.selection;
      if (!ui || !schema?.selectionMenus || !selectionMenu) return;
      if (selectionMenu.items.some((item) => item.id === EMBEDPDF_TRANSLATE_MENU_ITEM_ID)) return;
      ui.mergeSchema({
        selectionMenus: {
          ...schema.selectionMenus,
          selection: {
            ...selectionMenu,
            visibilityDependsOn: {
              itemIds: [...(selectionMenu.visibilityDependsOn?.itemIds ?? []), EMBEDPDF_TRANSLATE_MENU_ITEM_ID]
            },
            items: [
              {
                type: "command-button",
                id: EMBEDPDF_TRANSLATE_MENU_ITEM_ID,
                commandId: EMBEDPDF_TRANSLATE_COMMAND_ID,
                variant: "text",
                categories: ["selection", "informio-translate"]
              },
              ...selectionMenu.items
            ]
          }
        }
      });
    },
    [pdfContext, schedulePdfAnnotationPersist, t, triggerPdfTranslation]
  );

  const viewerConfig = useMemo<PDFViewerConfig>(
    () => ({
      src: viewerSrc,
      tabBar: "never",
      worker: false,
      log: false,
      wasmUrl: pdfiumWasmUrl || undefined,
      theme: settings ? embedPdfThemeForSettings(settings) : { preference: "light" },
      fonts: {
        ui: {
          family: "var(--informio-font-family)",
          stylesheetUrl: null
        }
      }
    }),
    [settings, viewerSrc, pdfiumWasmUrl]
  );
  const viewerKey = settings
    ? [
        viewerSrc || pdfPath,
        pdfiumWasmUrl,
        settings.appearance.theme,
        settings.appearance.customThemeColor,
        settings.appearance.chineseFontFamily,
        settings.appearance.englishFontFamily,
        i18n.language
      ].join(":")
    : `${viewerSrc || pdfPath}:${pdfiumWasmUrl}`;

  if (!pdfPath) {
    return <div className="informio-pdf-message is-error">{t("pdf.missingFilePath")}</div>;
  }

  if (isLoading || (!viewerSrc && !loadFailed) || (!pdfiumWasmUrl && !loadFailed)) {
    return <div className="informio-pdf-message">{t("editor.assetLoading")}</div>;
  }

  if (loadFailed || !viewerSrc || !pdfiumWasmUrl) {
    return <div className="informio-pdf-message is-error">{t("editor.assetDecodeError", { type: "PDF" })}{loadErrorDetail ? ` (${loadErrorDetail})` : ""}</div>;
  }

  return (
    <div
      ref={surfaceRootRef}
      className={cn("informio-pdf-shell informio-embedpdf-shell", mode === "compact" ? "is-compact" : "is-full")}
      onPointerDownCapture={captureTranslateAnchor}
    >
      <div className="informio-embedpdf-viewer">
        <PDFViewer
          key={viewerKey}
          config={viewerConfig}
          className="informio-embedpdf-component"
          onReady={handleEmbedPdfReady}
        />
      </div>
      {allowRemove ? (
        <div className="informio-embedpdf-floating-actions">
          <button
            type="button"
            className={cn("informio-pdf-toolbar-icon", toolMenuOpen && "is-active")}
            title={t("pdf.more")}
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
                {t("editor.openInSystem")}
              </button>
              <button
                type="button"
                className="informio-table-menu-item is-danger"
                onClick={() => {
                  setToolMenuOpen(false);
                  onRemove?.();
                }}
              >
                {t("pdf.removePdf")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PdfBlockView({ node, editor, getPos }: ReactNodeViewProps) {
  const src = String((node.attrs as { src?: string }).src ?? "");
  const title = String((node.attrs as { title?: string }).title ?? "PDF");
  const pdfPath = localFilePathFromUrl(src);
  return (
    <NodeViewWrapper className="informio-pdf-block" contentEditable={false}>
      <EmbedPdfSurface
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
  const { t } = useTranslation();
  const pdfContext = usePdfEditorContext();
  const currentDocument = pdfContext?.document ?? null;
  if (!pdfContext || !currentDocument) {
    return <div className="informio-pdf-message is-error">{t("pdf.contextMissing")}</div>;
  }
  return (
    <EmbedPdfSurface
      mode="full"
      pdfPath={currentDocument.filePath ?? ""}
      title={currentDocument.title ?? "PDF"}
      fingerprintFallback={currentDocument.filePath || currentDocument.id}
    />
  );
}
