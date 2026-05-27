import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";
import type { PDFViewerConfig, PluginRegistry, ThemeColors, ThemeConfig } from "@embedpdf/react-pdf-viewer";
import { MoreHorizontal } from "lucide-react";
import type { AppSettings, InformioDocument, PdfSelectionRect } from "../../shared/types";
import { cn } from "./lib/utils";

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
  rects?: PdfSelectionRect[];
  overlayLeft?: number;
  overlayTop?: number;
};

export type ToolbarTranslateState = {
  status: "idle" | "loading" | "done" | "error";
  response: string;
  error?: string;
};

export type PdfEditorContextValue = {
  paneId: string;
  document: InformioDocument;
  settings: AppSettings;
  toolbarTranslate: ToolbarTranslateState;
  onTranslateSelection: (selection: PdfAgentSelection) => void;
  onClearToolbarTranslate: () => void;
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

const EMBEDPDF_TRANSLATE_COMMAND_ID = "informio:translate-selection";
const EMBEDPDF_TRANSLATE_MENU_ITEM_ID = "informio-translate-selection";

export const PdfEditorContext = createContext<PdfEditorContextValue | null>(null);

const usePdfEditorContext = () => useContext(PdfEditorContext);

const getCapability = <T,>(registry: PluginRegistry, pluginId: string): T | null => {
  return (registry.getPlugin(pluginId)?.provides?.() as T | null | undefined) ?? null;
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
  const pdfContext = usePdfEditorContext();
  const settings = pdfContext?.settings;
  const [toolMenuOpen, setToolMenuOpen] = useState(false);

  const triggerPdfTranslation = useCallback(
    async (registry: PluginRegistry, embedPdfDocumentId: string) => {
      if (!pdfContext) return;
      const selection = getCapability<EmbedPdfSelectionCapability>(registry, "selection");
      if (!selection) return;
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

  const handleEmbedPdfReady = useCallback(
    (registry: PluginRegistry) => {
      const commands = getCapability<EmbedPdfCommandsCapability>(registry, "commands");
      const ui = getCapability<EmbedPdfUiCapability>(registry, "ui");
      const selection = getCapability<EmbedPdfSelectionCapability>(registry, "selection");

      commands?.registerCommand({
        id: EMBEDPDF_TRANSLATE_COMMAND_ID,
        label: "翻译",
        description: "翻译选中的 PDF 文本",
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
    [triggerPdfTranslation]
  );

  const viewerConfig = useMemo<PDFViewerConfig>(
    () => ({
      src: fileUrl(pdfPath),
      tabBar: "never",
      theme: settings ? embedPdfThemeForSettings(settings) : { preference: "light" },
      fonts: {
        ui: {
          family: "var(--informio-font-family)",
          stylesheetUrl: null
        }
      }
    }),
    [pdfPath, settings]
  );
  const viewerKey = settings
    ? [
        pdfPath,
        settings.appearance.theme,
        settings.appearance.customThemeColor,
        settings.appearance.chineseFontFamily,
        settings.appearance.englishFontFamily
      ].join(":")
    : pdfPath;

  if (!pdfPath) {
    return <div className="informio-pdf-message is-error">当前 PDF 文档缺少文件路径。</div>;
  }

  return (
    <div className={cn("informio-pdf-shell informio-embedpdf-shell", mode === "compact" ? "is-compact" : "is-full")}>
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
  const pdfContext = usePdfEditorContext();
  const currentDocument = pdfContext?.document ?? null;
  if (!pdfContext || !currentDocument) {
    return <div className="informio-pdf-message is-error">PDF 上下文丢失，无法打开文档。</div>;
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
