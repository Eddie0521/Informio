import { Component, Fragment, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  CSSProperties,
  ComponentType,
  DragEvent as ReactDragEvent,
  ErrorInfo,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent
} from "react";
import type { Editor, MarkdownParseHelpers, MarkdownRendererHelpers, PasteRuleMatch } from "@tiptap/core";
import { Extension, InputRule, markPasteRule, mergeAttributes, Node, ResizableNodeView } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import Link from "@tiptap/extension-link";
import * as YAML from "yaml";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowUp,
  Bold,
  Bot,
  Bookmark,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Code2,
  ExternalLink,
  FilePlus,
  FileText,
  Film,
  Folder,
  FolderPlus,
  FolderRoot,
  Globe,
  Github,
  Highlighter,
  History,
  ImageIcon,
  Info,
  Italic,
  Keyboard,
  LayoutList,
  Languages,
  ListOrdered,
  Loader2,
  Maximize2,
  Merge,
  MessageSquareQuote,
  Minus,
  MoreHorizontal,
  Music,
  Paperclip,
  Pencil,
  Palette,
  Pin,
  PinOff,
  Replace,
  Search,
  Settings,
  Shield,
  Square,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Columns3,
  Rows3,
  Split,
  Table2,
  Text,
  Trash2,
  Underline as UnderlineIcon,
  Unplug,
  Undo2,
  Redo2,
  X,
  Link2,
  ListTodo,
  TextQuote,
} from "lucide-react";
import type {
  ApiProviderKind,
  AgentApprovalDecision,
  AgentConversation,
  AgentConversationMessage,
  AgentMessageAttachment,
  AgentConnection,
  AgentModel,
  AgentPermissionMode,
  AgentProvider,
  AgentSessionAction,
  AgentSessionStatus,
  AppData,
  AppSettings,
  DocumentConflict,
  FileSystemOperationInput,
  InformioFolder,
  InformioDocument,
  InformioDocumentKind,
  InformioProject,
  LocalFontOption,
  MenuCommand,
  PdfSelectionRect,
  ThemeName
} from "../../shared/types";
import {
  acceleratorFromKeyboardEvent,
  acceleratorToDisplay,
  configurableShortcutEntries,
  defaultShortcutBindings,
  findShortcutConflict,
  getShortcutAccelerator,
  normalizeAccelerator,
  shortcutRegistryById
} from "../../shared/shortcuts";
import { sanitizeAgentResponse } from "../../shared/agentResponse";
import { DEFAULT_CUSTOM_THEME_COLOR } from "../../shared/theme";
import { buildWorkspaceScopeId } from "../../shared/workspaceScope";
import { cn } from "./lib/utils";
import {
  appIconUrl,
  themeOptions,
  apiProviderOptions,
  defaultApiSettings,
  CHINESE_FONT_FALLBACK,
  ENGLISH_FONT_FALLBACK,
  CODE_FONT_FALLBACK,
  connectionTone,
  connectionLabel,
  permissionModeLabel,
  agentPermissionModes,
  sessionStatusLabel,
  processCategoryLabel,
  selectionToolbarLabel,
  selectionToolbarSafeAreaSelector,
  LEFT_PANEL_MIN_WIDTH,
  LEFT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  EDITOR_CONTENT_MIN_WIDTH,
  EDITOR_CONTENT_MAX_WIDTH,
  CHAT_PANEL_FONT_MIN,
  CHAT_PANEL_FONT_MAX,
  TABLE_CELL_MIN_WIDTH,
  TABLE_EDGE_COMPRESS_MIN_WIDTH,
  TABLE_CONTROL_SIZE,
  TABLE_CONTEXT_OFFSET,
  TABLE_EDGE_HIT_DISTANCE,
  TABLE_HEADER_STRIP_SIZE,
  TABLE_TOOLBAR_HEIGHT,
  TABLE_ROW_MIN_HEIGHT,
  INFORMIO_SECRET_TAG,
  SECRET_ITERATIONS,
  SECRET_ALGORITHM,
  SECRET_KDF,
  imageExtensions,
  pdfExtensions,
  videoExtensions,
  audioExtensions,
  mediaExtensions,
  codeLanguageAliases,
  calloutTypes,
} from "./constants";
import {
  shortcutDisplayPlatform,
  isWindowsPlatform,
  normalizePath,
  normalizePathForCompare,
  pathBaseName,
  pathDirName,
  pathExtName,
  isAbsoluteAssetPath,
  hasRenderableScheme,
  safeDecodeUri,
  encodeLocalFilePath,
  localFileUrlForPath,
  joinAssetPath,
  pathContains,
  relativePath,
} from "./lib/path";
import {
  writeClipboardText,
  selectionIsInsideElement,
} from "./lib/clipboard";
import {
  assetPathPartFromSrc,
  assetExtensionFromSrc,
  resolveMarkdownAssetSrc,
  resolveMarkdownAssetPath,
  loadLocalAssetObjectUrl,
} from "./lib/asset-url";
import { saveSpreadsheetDocumentAs, saveSpreadsheetDocumentNow } from "./lib/spreadsheet-save-bridge";
import { spreadsheetDocumentMarkdown } from "./lib/spreadsheet-document";
import { saveWordDocumentAs, saveWordDocumentNow } from "./lib/word-save-bridge";
import { wordDocumentMarkdown } from "./lib/word-document";
import {
  documentKindFromPath,
  documentKind,
  isImageFile,
  isPdfFile,
  isVideoFile,
  isAudioFile,
  mediaKindFromSrc,
  isEmbeddableAssetFile,
  isEmbeddableAssetDocument,
  isWritableTextDocument,
  isMarkdownDocument,
  imageExtensionFromMimeType,
  fileKindFromName,
  mimeTypeFromName,
} from "./lib/file-type";
import {
  documentSecretPassphraseCache,
  bytesToBase64,
  base64ToBytes,
  normalizeSecretBytes,
  secretAttrsFromElement,
  secretAttrsAreValid,
  renderSecretMarkdown,
  importSecretKeyMaterial,
  deriveSecretKey,
  encryptSecretMarkdown,
  decryptSecretMarkdown,
  serializeSelectionFragmentToMarkdown,
  parseInlineMarkdownContent,
  selectionShouldUseBlockSecret,
  selectionContainsSecretNode,
  findFirstValidSecretInDocument,
  documentContainsSecretNode,
} from "./lib/encryption";
import {
  escapeHtml,
  normalizeTableText,
  renderImageMarkdown,
  markdownTitle,
  normalizeLinkTitle,
  wikilinkLabel,
  parseWikiLinkBody,
  wikiLinkText,
  replaceWikiLinkTargets,
  plainText,
  parseHtmlAttr,
  renderJsonNodeToHtml,
} from "./lib/markdown";
import {
  parseFrontmatter,
  stringifyFrontmatter,
  composeMarkdownWithFrontmatter,
} from "./lib/frontmatter";
import {
  modelLabel,
  defaultApiBaseUrl,
  isBuiltinApiBaseUrl,
  normalizeApiSettings,
  buildWorkspaceLabel,
  createConversationTitle,
  splitCodexFinalResponse,
  appendWithParagraphBreak,
  attachmentsMarkdown,
  buildSessionMessagesFromConversation,
  buildConversationMessagesFromSession,
  upsertSessionAction,
  updateSessionActionByToolId,
  classifyAgentAction,
  summarizeAgentProcess,
  didAgentEditFiles,
  mergeFinalAgentResponse,
  isCancelledAgentMessage,
  formatProcessDuration,
  formatConversationUpdatedAt,
} from "./lib/agent";
import {
  sourceText,
  sourceContent,
  nodeSourceAttr,
  jsonSourceText,
  jsonTextContent,
  defaultBlockSource,
  sourceBackedBlockContent,
  sourceBackedBlockJson,
  chartLabels,
  textContentNode,
  sourceBackedNode,
  parseMarkdownTableRow,
  isExplicitMarkdownTableRow,
  isMarkdownTableSeparator,
  markdownTableAlign,
  createTableFromMarkdown,
  codeBlockRawMarkdown,
  parseCodeBlockRawMarkdown,
  codeBlockEditableRange,
  replaceNodeWithPlainText,
  replaceSourceBlockWithParagraph,
  isDiscardableSourceRemainder,
  markdownOffsetForLine,
  resolveWikiLink,
  buildDocumentLookupIndex,
  collectWikiSuggestions,
  findDocumentForActionPath,
  resolveReferencedDocuments,
  normalizeCodeLanguage,
  highlightedCodeHtml,
  lowlight,
} from "./lib/markdown-block-parser";
import type {
  SidebarMode,
  OutlineItem,
  OutlineTreeItem,
  OutlineJumpRequest,
  PropertyValueGroup,
  PropertyGroup,
  AgentSelection,
  AgentSessionMessage,
  EditorPaneState,
  EditorViewMode,
  SplitDirection,
  EditorDropZone,
  RightPanelMode,
  WorkspaceDropTarget,
  WorkspaceLeafNode,
  WorkspacePaneContent,
  WorkspaceSplitNode,
  HorizontalCellAlign,
  VerticalCellAlign,
  TreeDragPayload,
  AgentProcessCategory,
  ToolbarIcon,
  SelectionToolbarAction,
  InsertToolbarAction,
  CommandPaletteScope,
  CommandPaletteItem,
  IndexedDocument,
  WikiTargetBucket,
  WikiSuggestionItem,
  DocumentLookupIndex,
  FrontmatterParseResult,
  MarkdownTokenLike,
  MarkdownHelperLike,
  SecretKind,
  EncryptedSecretAttrs,
  SecretDecryptRequest,
  EncryptedTextOptions,
  WikiLinkOptions,
  MarkdownParserEditor,
  MarkdownAutoBlockMatch,
  ProseMirrorNodeLike,
  ProseMirrorSchemaLike,
  MarkdownTextBlock,
  FileTreeNode,
  FileContextTarget,
  FileContextMenuState,
  ProjectContextMenuState,
  BlankContextMenuState,
  BrowserTabMeta,
  WorkspaceTabRef,
  InlineRenameState,
  PendingCreationState,
  TreeDropTarget,
  LinkRequest,
  ImageRequest,
  EditorTextSearchIndex,
  FindMatch,
  SecretPromptRequest,
  PendingSecretAction,
  ConflictDiffLine,
  MarkdownDiffHunk,
  TableOverlayState,
  TableSelectionShape,
  TableColumnWidthInfo,
  TableHoverTarget,
  ProviderExecutionFlowProps,
  NodeViewPositionGetter,
  NodeViewNode,
  LowlightNode,
  UnifiedToolbarTranslateState,
} from "./types";
import {
  clipboardPlainTextForPaste,
  htmlFragmentHasContent,
  insertTextIntoTextarea,
  sanitizeHtmlFragmentForPaste,
  stripClipboardFragmentMarkers
} from "./lib/clipboardPaste";
import {
  PdfBlockView as UnifiedPdfBlockView,
  PdfEditorContext as UnifiedPdfEditorContext,
  PdfViewerSurface as UnifiedPdfViewerSurface
} from "./pdfSurface";
import type { UnifiedPdfEditorContextValue } from "./types";
import "katex/dist/katex.min.css";
import i18n, { settingsLanguageToUiLanguage } from "./i18n";

import { getThemeSwatchStyle, isDarkColor, settingsNav, mergeFontOptions, lastToolbarSelectionText, setLastToolbarSelectionText, syncDocumentAppearanceVariables, buildShellStyle, buildConfiguredFontStack, buildUiFontStack } from "./lib/settings-helpers";
import { useUiStore, useAppStore, useAgentStore, useDocumentStore, selectOpenDocumentIds } from "./stores";

const resolveTranslationTarget = (text: string): "zh-CN" | "en" => {
  const normalized = text.trim();
  const hasEnglishLetter = /[A-Za-z]/.test(normalized);
  const hasCjk = /[㐀-鿿豈-﫿぀-ヿ가-힯]/.test(normalized);
  return hasEnglishLetter && !hasCjk ? "zh-CN" : "en";
};

// Components
import EditorPane from "./components/EditorPane";
import { EmptyEditorPane } from "./components/EmptyEditorPane";
import FileList from "./components/FileList";
import { OutlineList } from "./components/OutlineList";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { AgentPanel } from "./components/AgentPanel";
import { BrowserPanel, BROWSER_BOUNDS_SYNC_EVENT } from "./components/BrowserPanel";
import { WorkspaceDropOverlay } from "./components/WorkspaceDropOverlay";
import { WorkspaceSplitView } from "./components/WorkspaceSplitView";
import { CommandPalette } from "./components/CommandPalette";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineIndicator } from "./components/OfflineIndicator";

const SettingsView = lazy(() => import("./components/SettingsView").then((m) => ({ default: m.SettingsView })));
import { DocumentConflictDialog, mergeMarkdownWithBase, buildConflictDiffLines } from "./components/DocumentConflictDialog";
import { IconButton } from "./components/IconButton";
import { WindowControls } from "./components/WindowControls";
import { PanelResizeHandle } from "./components/PanelResizeHandle";
import { PropertiesList } from "./components/PropertiesList";
import { markdownToStatusText, countWords, countCharacters, countLines } from "./lib/text-stats";
import { getDocumentOutline, buildOutlineTree } from "./lib/outline";
import { sameAgentSelection, formatRelative, clamp, buildEditorTextSearchIndex, findNextTextMatch } from "./lib/editor-utils";
import {
  AGENT_DRAG_MIME,
  BROWSER_DRAG_MIME,
  MAIN_PANE_ID,
  collectWorkspaceLeaves,
  countWorkspaceLeaves,
  createAgentLeaf,
  createBrowserContent,
  createBrowserId,
  createBrowserLeaf,
  browserTabLabel,
  createDocumentLeaf,
  createPaneId,
  findAgentLeaf,
  findBrowserLeafByTabId,
  findDocumentLeafById,
  findWorkspaceLeaf,
  getActiveDocumentId,
  maximizeWorkspaceLeaf,
  normalizeWorkspaceLayout,
  paneDropZoneFromRect,
  removeWorkspaceLeaf,
  replaceWorkspaceLeafContent,
  splitWorkspaceLeaf,
  updateSplitRatioAtPath,
} from "./lib/workspace-layout-utils";
import { buildFileTree, filterFileTree, documentStructureKey, documentLookupKey, DOCUMENT_DRAG_MIME, TREE_ITEM_DRAG_MIME, FOLDER_DRAG_MIME, serializeTreeDragPayload, parseTreeDragPayload, isInternalDocumentDrag, isInternalTreeDrag, isExternalFileDrag, filePathForFile, dataTransferFilePaths } from "./lib/file-tree";


const toolbarTranslateAnchorFromSelection = (selection: AgentSelection): UnifiedToolbarTranslateState["anchor"] => {
  if (selection.overlayLeft === undefined || selection.overlayTop === undefined) return undefined;
  return {
    kind: selection.kind,
    left: selection.overlayLeft,
    top: selection.overlayTop
  };
};

class EditorSurfaceErrorBoundary extends Component<
  { documentId: string; onResetSelection: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Editor error:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-[13px] font-semibold text-slate-600">{i18n.t("app.editorLoadFailed")}</p>
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white"
            onClick={() => { this.setState({ hasError: false }); this.props.onResetSelection(); }}
          >
            {i18n.t("app.reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const { t, i18n: reactI18n } = useTranslation();
  const { data, setData, loadError, setLoadError, updateSettings, updateActiveAgentModel } = useAppStore();
  const {
    connections, setConnections,
    agentMessages, setAgentMessages,
    activeConversationId, setActiveConversationId,
    pendingNewConversation, setPendingNewConversation,
    agentSelection, setAgentSelection,
    agentBusy, setAgentBusy,
    checkingAgents, setCheckingAgents,
    toolbarTranslate, setToolbarTranslate
  } = useAgentStore();
  const { checkingApiModels, setCheckingApiModels, apiCheckState, setApiCheckState } = useUiStore();
  const { appInfo, setAppInfo } = useAppStore();
  const { sidebarMode, setSidebarMode, rightPanelMode, setRightPanelMode, commandPaletteOpen, setCommandPaletteOpen } = useUiStore();
  const {
    openWorkspaceTabs,
    setOpenWorkspaceTabs,
    browserTabMeta,
    setBrowserTabMeta,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    workspaceLayout,
    setWorkspaceLayout,
    activePaneId,
    setActivePaneId,
    editorViewModes,
    setEditorViewModes,
    documentRefreshTokens,
    setDocumentRefreshTokens,
    dropTarget,
    setDropTarget,
    dirtyDocumentIds,
    setDirtyDocumentIds,
    documentConflicts,
    setDocumentConflicts,
    activeConflictDocumentId,
    setActiveConflictDocumentId,
    fileListCreationSignal,
    setFileListCreationSignal,
    outlineJumpRequest,
    setOutlineJumpRequest,
  } = useDocumentStore();
  const saveTimer = useRef<number | null>(null);
  const saveQueueRef = useRef(Promise.resolve<AppData | null>(null));
  const pendingAutoSaveIdsRef = useRef<Set<string>>(new Set());
  const dirtyDocumentIdsRef = useRef<Set<string>>(new Set());
  const documentConflictsRef = useRef<Map<string, DocumentConflict>>(new Map());
  const activeConflictDocumentIdRef = useRef<string | null>(null);
  const latestDataRef = useRef<AppData | null>(null);
  const dirtyBaseMarkdownRef = useRef<Map<string, string>>(new Map());
  const composingDocumentIdRef = useRef<string | null>(null);
  const initializedTabsRef = useRef(false);
  const lastActiveDocumentIdRef = useRef<string | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const workspaceSectionRef = useRef<HTMLElement | null>(null);
  const isWorkspaceDraggingRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    syncDocumentAppearanceVariables(data.settings.appearance);
  }, [data?.settings.appearance]);

  useEffect(() => {
    if (!data) return;
    const nextLanguage = settingsLanguageToUiLanguage(data.settings.language);
    window.localStorage.setItem("informio-language", nextLanguage);
    if (!reactI18n.language.startsWith(nextLanguage)) void reactI18n.changeLanguage(nextLanguage);
  }, [data?.settings.language, reactI18n]);

  const applyDataState = (next: AppData) => {
    latestDataRef.current = next;
    setData(next);
  };

  const applyDirtyDocumentIds = (next: Set<string>) => {
    dirtyDocumentIdsRef.current = next;
    setDirtyDocumentIds(next);
  };

  const updateDirtyDocumentIds = (updater: (items: Set<string>) => Set<string>) => {
    const next = updater(dirtyDocumentIdsRef.current);
    applyDirtyDocumentIds(next);
    return next;
  };

  const applyDocumentConflicts = (next: Map<string, DocumentConflict>) => {
    documentConflictsRef.current = next;
    setDocumentConflicts(next);
  };

  const markDocumentDirty = (document: InformioDocument) => {
    if (!dirtyDocumentIdsRef.current.has(document.id)) {
      dirtyBaseMarkdownRef.current.set(document.id, document.markdown);
    }
    updateDirtyDocumentIds((items) => new Set(items).add(document.id));
  };

  const forgetDocumentDirtyState = (documentId: string) => {
    dirtyBaseMarkdownRef.current.delete(documentId);
    updateDirtyDocumentIds((items) => {
      const next = new Set(items);
      next.delete(documentId);
      return next;
    });
  };

  const setDocumentDirtyState = useCallback((documentId: string, dirty: boolean) => {
    if (dirty) {
      const doc = latestDataRef.current?.documents.find((item) => item.id === documentId);
      if (doc) markDocumentDirty(doc);
      return;
    }
    forgetDocumentDirtyState(documentId);
  }, []);

  const updateSpreadsheetDocumentPath = useCallback((documentId: string, nextPath: string) => {
    const current = latestDataRef.current;
    if (!current) return;
    const title = pathBaseName(nextPath);
    const markdown = spreadsheetDocumentMarkdown(nextPath);
    const documents = current.documents.map((doc) =>
      doc.id === documentId
        ? {
            ...doc,
            filePath: nextPath,
            title,
            markdown,
            kind: "spreadsheet" as const,
            updatedAt: new Date().toISOString()
          }
        : doc
    );
    applyDataState({ ...current, documents });
    void window.informio.saveDocuments(documents, current.activeDocumentId);
  }, []);

  const updateWordDocumentPath = useCallback((documentId: string, nextPath: string) => {
    const current = latestDataRef.current;
    if (!current) return;
    const title = pathBaseName(nextPath);
    const markdown = wordDocumentMarkdown(nextPath);
    const documents = current.documents.map((doc) =>
      doc.id === documentId
        ? {
            ...doc,
            filePath: nextPath,
            title,
            markdown,
            kind: "word" as const,
            updatedAt: new Date().toISOString()
          }
        : doc
    );
    applyDataState({ ...current, documents });
    void window.informio.saveDocuments(documents, current.activeDocumentId);
  }, []);

  const handleBinaryDocumentPathChange = useCallback((documentId: string, nextPath: string) => {
    const doc = latestDataRef.current?.documents.find((item) => item.id === documentId);
    if (!doc) return;
    if (documentKind(doc) === "spreadsheet") {
      updateSpreadsheetDocumentPath(documentId, nextPath);
      return;
    }
    if (documentKind(doc) === "word") {
      updateWordDocumentPath(documentId, nextPath);
    }
  }, [updateSpreadsheetDocumentPath, updateWordDocumentPath]);

  const applyMergedAppData = (updated: AppData, options: { allowNewConflicts?: boolean } = {}) => {
    const merged = mergeDiskDataWithLocalDrafts(
      updated,
      latestDataRef.current,
      dirtyDocumentIdsRef.current,
      documentConflictsRef.current,
      options
    );
    applyDataState(merged.data);
    applyDirtyDocumentIds(merged.dirtyIds);
    applyDocumentConflicts(merged.conflicts);
    if (!merged.conflicts.has(activeConflictDocumentIdRef.current ?? "")) {
      setActiveConflictDocumentId((id) => (id && merged.conflicts.has(id) ? id : null));
    }
    merged.dirtyIds.forEach((id) => {
      if (!merged.conflicts.has(id) && !pendingAutoSaveIdsRef.current.has(id)) {
        persistDocuments(id);
      }
    });
    return merged.data;
  };

  const requestSpreadsheetSaveAs = async (documentId: string) => {
    const current = latestDataRef.current;
    if (!current) return;
    try {
      const next = await saveSpreadsheetDocumentAs(documentId, current.documents, current.activeDocumentId);
      if (!next) return;
      applyMergedAppData(next);
      forgetDocumentDirtyState(documentId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const requestWordSaveAs = async (documentId: string) => {
    const current = latestDataRef.current;
    if (!current) return;
    try {
      const next = await saveWordDocumentAs(documentId, current.documents, current.activeDocumentId);
      if (!next) return;
      applyMergedAppData(next);
      forgetDocumentDirtyState(documentId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const requestBinaryDocumentSaveAs = async (documentId: string) => {
    const doc = latestDataRef.current?.documents.find((item) => item.id === documentId);
    if (!doc) return;
    if (documentKind(doc) === "spreadsheet") {
      await requestSpreadsheetSaveAs(documentId);
      return;
    }
    if (documentKind(doc) === "word") {
      await requestWordSaveAs(documentId);
    }
  };

  const mergeDiskDataWithLocalDrafts = (
    updated: AppData,
    current: AppData | null,
    dirtyIds: Set<string>,
    conflicts: Map<string, DocumentConflict>,
    options: { allowNewConflicts?: boolean } = {}
  ) => {
    if (!current || !dirtyIds.size) {
      const validIds = new Set(updated.documents.map((doc) => doc.id));
      const nextConflicts = new Map(Array.from(conflicts).filter(([id]) => validIds.has(id)));
      dirtyBaseMarkdownRef.current = new Map(Array.from(dirtyBaseMarkdownRef.current).filter(([id]) => validIds.has(id)));
      return { data: updated, dirtyIds: new Set<string>(), conflicts: nextConflicts };
    }

    const localDirtyDocs = new Map(current.documents.filter((doc) => dirtyIds.has(doc.id)).map((doc) => [doc.id, doc]));
    const nextDirtyIds = new Set<string>();
    const nextConflicts = new Map<string, DocumentConflict>();
    const nowIso = new Date().toISOString();
    const documents = updated.documents.map((doc) => {
      const local = localDirtyDocs.get(doc.id);
      const existingConflict = conflicts.get(doc.id);
      if (!local) {
        if (existingConflict) nextConflicts.set(doc.id, existingConflict);
        return doc;
      }

      if (local.markdown === doc.markdown) {
        dirtyBaseMarkdownRef.current.delete(doc.id);
        if (documentKind(local) === "spreadsheet" && dirtyIds.has(doc.id)) {
          nextDirtyIds.add(doc.id);
        }
        if (documentKind(local) === "word" && dirtyIds.has(doc.id)) {
          nextDirtyIds.add(doc.id);
        }
        return doc;
      }

      const baseMarkdown = existingConflict?.baseMarkdown ?? dirtyBaseMarkdownRef.current.get(doc.id);
      if (baseMarkdown !== undefined) {
        const externalChanged = doc.markdown !== baseMarkdown;
        if (!externalChanged) {
          nextDirtyIds.add(doc.id);
          return { ...doc, markdown: local.markdown, updatedAt: local.updatedAt };
        }

        const merged = mergeMarkdownWithBase(baseMarkdown, local.markdown, doc.markdown);
        if (!merged.conflicted) {
          dirtyBaseMarkdownRef.current.set(doc.id, doc.markdown);
          nextDirtyIds.add(doc.id);
          return { ...doc, markdown: merged.mergedMarkdown, updatedAt: new Date().toISOString() };
        }
        if (!options.allowNewConflicts && !existingConflict) {
          nextDirtyIds.add(doc.id);
          return { ...doc, markdown: local.markdown, updatedAt: local.updatedAt };
        }
      }

      if (!options.allowNewConflicts && !existingConflict) {
        nextDirtyIds.add(doc.id);
        return { ...doc, markdown: local.markdown, updatedAt: local.updatedAt };
      }

      const conflict: DocumentConflict = {
        documentId: doc.id,
        filePath: doc.filePath ?? existingConflict?.filePath ?? local.filePath ?? doc.title,
        baseMarkdown,
        localMarkdown: local.markdown,
        externalMarkdown: doc.markdown,
        detectedAt: existingConflict?.detectedAt ?? nowIso,
        externalUpdatedAt: doc.updatedAt
      };
      nextDirtyIds.add(doc.id);
      nextConflicts.set(doc.id, conflict);
      return { ...doc, markdown: local.markdown, updatedAt: local.updatedAt };
    });

    const updatedDocumentIds = new Set(updated.documents.map((doc) => doc.id));
    localDirtyDocs.forEach((local, id) => {
      if (updatedDocumentIds.has(id)) return;
      const existingConflict = conflicts.get(id);
      nextDirtyIds.add(id);
      if (!options.allowNewConflicts && !existingConflict) {
        documents.push(local);
        return;
      }
      nextConflicts.set(id, {
        documentId: id,
        filePath: existingConflict?.filePath ?? local.filePath ?? local.title,
        baseMarkdown: existingConflict?.baseMarkdown ?? dirtyBaseMarkdownRef.current.get(id),
        localMarkdown: local.markdown,
        externalMarkdown: existingConflict?.externalMarkdown ?? "",
        detectedAt: existingConflict?.detectedAt ?? nowIso,
        externalUpdatedAt: existingConflict?.externalUpdatedAt
      });
      documents.push(local);
    });

    dirtyBaseMarkdownRef.current = new Map(
      Array.from(dirtyBaseMarkdownRef.current).filter(([id]) => nextDirtyIds.has(id) || nextConflicts.has(id))
    );
    return { data: { ...updated, documents }, dirtyIds: nextDirtyIds, conflicts: nextConflicts };
  };

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.informio.onAppDataUpdated((updated) => {
      applyMergedAppData(updated);
    });

    void (async () => {
      try {
        const loaded = await window.informio.loadApp();
        if (cancelled) return;
        setLoadError(null);
        applyDataState(loaded);

        const existingConnections = await window.informio.listAgentRuntimeConnections();
        if (cancelled) return;
        setConnections(existingConnections);

        const shouldAutoStart = loaded.settings.agentRuntime.enabled && loaded.settings.agentRuntime.autoStart;
        if (!shouldAutoStart) return;
        const targetAgents = loaded.settings.agents.filter((agent) => agent.enabled);
        const activeAgentId = loaded.settings.activeAgentId;
        const existingConnectionsByProviderId = new Map(existingConnections.map((item) => [item.providerId, item]));
        const disconnectedAgents = targetAgents.filter((agent) => {
          const existing = existingConnectionsByProviderId.get(agent.id);
          return existing?.status !== "connected";
        });
        if (!disconnectedAgents.length) return;
        const disconnectedAgentIds = new Set(disconnectedAgents.map((agent) => agent.id));

        const prioritizedAgents = [
          ...disconnectedAgents.filter((agent) => agent.id === activeAgentId),
          ...disconnectedAgents.filter((agent) => agent.id !== activeAgentId)
        ];

        setConnections((items) => [
          ...items.filter((item) => !disconnectedAgentIds.has(item.providerId)),
          ...disconnectedAgents.map((agent) => ({
            providerId: agent.id,
            status: "connecting" as const,
            message: t("app.startingAgent", { name: agent.name }),
            tools: []
          }))
        ]);

        for (const agent of prioritizedAgents) {
          if (cancelled) return;
          const connection = await (async () => {
            try {
              return await window.informio.connectAgentRuntime(agent.id);
            } catch (error) {
              return {
                providerId: agent.id,
                status: "error" as const,
                message: error instanceof Error ? error.message : t("app.agentStartFailed"),
                tools: [],
                models: agent.models
              };
            }
          })();
          if (cancelled) return;
          setConnections((items) => [...items.filter((item) => item.providerId !== connection.providerId), connection]);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("loadApp failed", error);
        setLoadError(message || t("app.loadDataFailed"));
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    window.informio.getAppInfo().then(setAppInfo).catch(() => {
      setAppInfo({
        name: "Informio",
        version: "",
        platform: navigator.platform.toLowerCase().includes("win") ? "win32" : "darwin",
        githubUrl: "",
        iconDataUrl: undefined
      });
    });
  }, []);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    dirtyDocumentIdsRef.current = dirtyDocumentIds;
  }, [dirtyDocumentIds]);

  useEffect(() => {
    documentConflictsRef.current = documentConflicts;
  }, [documentConflicts]);

  useEffect(() => {
    activeConflictDocumentIdRef.current = activeConflictDocumentId;
  }, [activeConflictDocumentId]);

  useEffect(() => {
    if (!data) return;
    const activeDocumentChanged = lastActiveDocumentIdRef.current !== data.activeDocumentId;
    setOpenWorkspaceTabs((tabs) => {
      const documentTabs = tabs.filter(
        (tab): tab is Extract<WorkspaceTabRef, { kind: "document" }> =>
          tab.kind === "document" && data.documents.some((doc) => doc.id === tab.id),
      );
      const browserTabs = tabs.filter((tab) => tab.kind === "browser");

      if (!initializedTabsRef.current) {
        initializedTabsRef.current = true;
        const seededDocumentIds = data.activeDocumentId
          ? [data.activeDocumentId, ...documentTabs.map((tab) => tab.id), ...data.documents.slice(0, 2).map((doc) => doc.id)].filter(Boolean)
          : documentTabs.map((tab) => tab.id);
        const nextDocumentTabs = Array.from(new Set(seededDocumentIds)).map((id) => ({ kind: "document" as const, id }));
        return [...nextDocumentTabs, ...browserTabs];
      }

      if (activeDocumentChanged && data.activeDocumentId && !documentTabs.some((tab) => tab.id === data.activeDocumentId)) {
        return [{ kind: "document", id: data.activeDocumentId }, ...documentTabs, ...browserTabs];
      }

      return [...documentTabs, ...browserTabs];
    });
    lastActiveDocumentIdRef.current = data.activeDocumentId;
  }, [data?.activeDocumentId, data?.documents, setOpenWorkspaceTabs]);

  const activeAgent = useMemo(
    () => data?.settings.agents.find((agent) => agent.id === data.settings.activeAgentId) ?? data?.settings.agents[0],
    [data]
  );
  const workspaceScopeId = useMemo(
    () => (data ? buildWorkspaceScopeId({ projects: data.projects ?? [], workspacePath: data.workspacePath }) : "global:empty"),
    [data?.projects, data?.workspacePath]
  );
  const workspaceLabel = useMemo(
    () => (data ? buildWorkspaceLabel({ projects: data.projects ?? [], workspacePath: data.workspacePath }, t("app.unnamedWorkspace")) : t("app.unnamedWorkspace")),
    [data?.projects, data?.workspacePath, t]
  );
  const activeConnection = connections.find((connection) => connection.providerId === activeAgent?.id);
  const apiSettings = useMemo(() => normalizeApiSettings(data?.settings.api), [data?.settings.api]);
  const activeModels = useMemo(() => {
    const runtimeModels = activeConnection?.models?.length ? activeConnection.models : [];
    const merged = runtimeModels.length
      ? [
          ...runtimeModels,
          ...(activeAgent?.model ? [{ id: activeAgent.model, label: activeAgent.model }] : [])
        ]
      : [
          ...(activeAgent?.models ?? []),
          ...(activeAgent?.model ? [{ id: activeAgent.model, label: activeAgent.model }] : [])
        ];
    return Array.from(new Map(merged.filter((item) => item.id).map((item) => [item.id, item])).values());
  }, [activeAgent?.model, activeAgent?.models, activeConnection?.models]);
  const activeModelSelection = useMemo(() => {
    const configuredModel = activeAgent?.model?.trim() ?? "";
    if (configuredModel && (!activeModels.length || activeModels.some((model) => model.id === configuredModel))) return configuredModel;
    return activeModels[0]?.id || configuredModel;
  }, [activeAgent?.model, activeModels]);
  const providerAgentConversations = useMemo(
    () =>
      (data?.agentConversations ?? [])
        .filter((conversation) => conversation.providerId === activeAgent?.id)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [activeAgent?.id, data?.agentConversations]
  );
  const activeConversation = useMemo(
    () => providerAgentConversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, providerAgentConversations]
  );
  const activeModel = activeModelSelection;
  useEffect(() => {
    if (!data || !activeAgent || !activeConnection?.models?.length) return;
    const configuredModel = activeAgent.model?.trim() ?? "";
    if (!configuredModel || activeConnection.models.some((model) => model.id === configuredModel)) return;
    const fallbackModel = activeConnection.models[0]?.id;
    if (!fallbackModel) return;
    updateSettings({
      ...data.settings,
      agents: data.settings.agents.map((agent) => (agent.id === activeAgent.id ? { ...agent, model: fallbackModel } : agent))
    });
  }, [activeAgent?.id, activeAgent?.model, activeConnection?.models, data?.settings]);
  const documentLookupIndex = useMemo(
    () => (data ? buildDocumentLookupIndex(data.documents) : null),
    [data?.documents]
  );
  const documentsById = useMemo(() => new Map((data?.documents ?? []).map((doc) => [doc.id, doc])), [data?.documents]);
  const openDocumentIds = useMemo(() => selectOpenDocumentIds(openWorkspaceTabs), [openWorkspaceTabs]);
  const openDocuments = useMemo(
    () => openDocumentIds.map((id) => documentsById.get(id)).filter((doc): doc is InformioDocument => Boolean(doc)),
    [documentsById, openDocumentIds],
  );
  const activeDocumentId = getActiveDocumentId(workspaceLayout, activePaneId);
  const activeOpenDoc = useMemo(
    () => (activeDocumentId ? documentsById.get(activeDocumentId) : undefined) ?? openDocuments[0],
    [activeDocumentId, documentsById, openDocuments]
  );
  const activeConflict = activeConflictDocumentId ? documentConflicts.get(activeConflictDocumentId) ?? null : null;
  const activeConflictDocument = activeConflict ? documentsById.get(activeConflict.documentId) : undefined;

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeWorkspaceTab, openWorkspaceTabs.length]);

  useEffect(() => {
    const target = tabsScrollRef.current;
    if (!target) return;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (target.scrollWidth <= target.clientWidth) return;
      event.preventDefault();
      target.scrollLeft += event.deltaY;
    };
    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  }, [openWorkspaceTabs.length]);

  useEffect(() => {
    const onDragEnd = () => {
      if (!isWorkspaceDraggingRef.current) return;
      isWorkspaceDraggingRef.current = false;
      setDropTarget(null);
      window.dispatchEvent(new Event(BROWSER_BOUNDS_SYNC_EVENT));
    };
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, [setDropTarget]);

  const beginWorkspaceDrag = () => {
    isWorkspaceDraggingRef.current = true;
    void window.informio.hideAllBrowserPanes();
  };

  const handleWorkspaceDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!isWorkspaceDraggingRef.current) return;
    event.preventDefault();
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const paneEl = elements.find(
      (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-pane-id"),
    );
    if (!paneEl) {
      setDropTarget(null);
      return;
    }
    const paneId = paneEl.getAttribute("data-pane-id");
    if (!paneId) return;
    const zone = paneDropZoneFromRect(paneEl.getBoundingClientRect(), event.clientX, event.clientY);
    setDropTarget({ paneId, zone });
  };

  useEffect(() => {
    if (!data) return;
    setWorkspaceLayout((layout) => {
      if (initializedTabsRef.current && openWorkspaceTabs.length === 0) {
        const leaves = collectWorkspaceLeaves(layout);
        const nonDocumentLeaves = leaves.filter((leaf) => leaf.content.type !== "document");
        if (!nonDocumentLeaves.length) return null;
        return layout;
      }
      const normalized = normalizeWorkspaceLayout(layout, (documentId) => data.documents.some((doc) => doc.id === documentId));
      if (!normalized) {
        return data.activeDocumentId ? createDocumentLeaf(data.activeDocumentId) : null;
      }
      return normalized;
    });
  }, [data?.activeDocumentId, data?.documents, openWorkspaceTabs.length, setWorkspaceLayout]);

  useEffect(() => {
    if (!workspaceLayout) return;
    if (!findWorkspaceLeaf(workspaceLayout, activePaneId)) {
      const firstLeaf = collectWorkspaceLeaves(workspaceLayout)[0];
      if (firstLeaf) setActivePaneId(firstLeaf.id);
    }
  }, [activePaneId, workspaceLayout, setActivePaneId]);

  useEffect(() => {
    if (agentBusy) return;
    if (activeConversation) {
      setAgentMessages(buildSessionMessagesFromConversation(activeConversation));
      setPendingNewConversation(false);
      return;
    }
    if (pendingNewConversation) {
      setAgentMessages([]);
      return;
    }
    if (providerAgentConversations.length) {
      setActiveConversationId(providerAgentConversations[0].id);
      setAgentMessages(buildSessionMessagesFromConversation(providerAgentConversations[0]));
      setPendingNewConversation(false);
      return;
    }
    setActiveConversationId(null);
    setAgentMessages([]);
    setPendingNewConversation(true);
  }, [activeConversation, agentBusy, pendingNewConversation, providerAgentConversations]);

  const clearSavedDirtyIds = (cleanIds: string[], savedDocuments: InformioDocument[]) => {
    const savedById = new Map(savedDocuments.map((doc) => [doc.id, doc]));
    const currentById = new Map((latestDataRef.current?.documents ?? []).map((doc) => [doc.id, doc]));
    updateDirtyDocumentIds((items) => {
      const next = new Set(items);
      cleanIds.forEach((id) => {
        const current = currentById.get(id);
        const saved = savedById.get(id);
        if (current && saved && current.markdown === saved.markdown) {
          next.delete(id);
          dirtyBaseMarkdownRef.current.delete(id);
        }
      });
      return next;
    });
  };

  const saveDocumentsNow = async (
    nextDocuments: InformioDocument[],
    activeDocumentId: string,
    cleanIds?: string[],
    options: { syncData?: boolean; ignoreConflicts?: boolean } = {}
  ) => {
    const targetIds = cleanIds?.length ? cleanIds : nextDocuments.map((doc) => doc.id);
    const conflictedId = options.ignoreConflicts ? undefined : targetIds.find((id) => documentConflictsRef.current.has(id));
    if (conflictedId) {
      setActiveConflictDocumentId(conflictedId);
      throw new Error(t("app.conflictBeforeSave"));
    }
    if (!cleanIds?.length) pendingAutoSaveIdsRef.current.clear();
    const runSave = async () => {
      const result = await window.informio.saveNow(nextDocuments, activeDocumentId);
      if (options.syncData !== false) {
        applyDataState(result.data);
      }
      if (cleanIds?.length) {
        clearSavedDirtyIds(cleanIds, result.data.documents);
      } else {
        dirtyBaseMarkdownRef.current.clear();
        applyDirtyDocumentIds(new Set());
      }
      return result.data;
    };
    const queued = saveQueueRef.current.then(runSave, runSave);
    saveQueueRef.current = queued.then(
      () => null,
      () => null
    );
    return queued;
  };

  const persistDocuments = (changedDocumentId: string) => {
    const current = latestDataRef.current;
    if (!current?.settings.markdown.autoSave) return;
    if (composingDocumentIdRef.current === changedDocumentId) return;
    pendingAutoSaveIdsRef.current.add(changedDocumentId);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const latest = latestDataRef.current;
      if (!latest?.settings.markdown.autoSave) return;
      if (composingDocumentIdRef.current) return;
      const cleanIds = Array.from(pendingAutoSaveIdsRef.current);
      if (!cleanIds.length) return;
      pendingAutoSaveIdsRef.current.clear();
      void saveDocumentsNow(latest.documents, latest.activeDocumentId, cleanIds, { syncData: false }).catch(() => {
        cleanIds.forEach((id) => pendingAutoSaveIdsRef.current.add(id));
        if (cleanIds.every((id) => !documentConflictsRef.current.has(id))) {
          persistDocuments(cleanIds[0]);
        }
      });
    }, 900);
  };

  const updateDocument = (documentId: string, markdown: string, options?: { composing?: boolean }) => {
    if (!data) return;
    const sourceDocument = documentsById.get(documentId);
    if (!sourceDocument) return;
    const documents = data.documents.map((doc) =>
      doc.id === documentId ? { ...doc, markdown, updatedAt: new Date().toISOString() } : doc
    );
    const nextData = { ...data, documents };
    applyDataState(nextData);
    markDocumentDirty(sourceDocument);
    applyDocumentConflicts(
      (() => {
        const items = documentConflictsRef.current;
        const existing = items.get(sourceDocument.id);
        if (!existing) return items;
        const next = new Map(items);
        const nextConflict = { ...existing, localMarkdown: markdown };
        next.set(sourceDocument.id, nextConflict);
        return next;
      })()
    );
    if (!options?.composing) persistDocuments(sourceDocument.id);
  };

  const handleAgentSelection = (selection: AgentSelection | null) => {
    setAgentSelection((current) => (sameAgentSelection(current, selection) ? current : selection));
    setToolbarTranslate((current) =>
      current.status === "idle" && !current.response && !current.error ? current : { status: "idle", response: "" }
    );
  };

  const openDocumentInLinkedPane = (
    sourcePaneId: string,
    documentId: string,
    options?: { forceRichText?: boolean }
  ): string | null => {
    if (!data || !documentsById.has(documentId)) return null;
    const layout = normalizeWorkspaceLayout(workspaceLayout, (paneDocumentId) => documentsById.has(paneDocumentId));
    const sourceLeaf =
      (layout ? findWorkspaceLeaf(layout, sourcePaneId) : null) ??
      (layout ? findWorkspaceLeaf(layout, activePaneId) : null) ??
      (layout ? collectWorkspaceLeaves(layout)[0] : null) ??
      (data.activeDocumentId ? createDocumentLeaf(data.activeDocumentId) : null);
    if (!sourceLeaf) return null;
    if (sourceLeaf.content.type === "document" && sourceLeaf.content.documentId === documentId) {
      setActivePaneId(sourceLeaf.id);
      return sourceLeaf.id;
    }
    const existing = findDocumentLeafById(layout, documentId);
    if (existing) {
      setActivePaneId(existing.id);
      return existing.id;
    }
    const currentLayout = layout ?? sourceLeaf;
    const nextLayout =
      countWorkspaceLeaves(currentLayout) <= 1
        ? splitWorkspaceLeaf(currentLayout, sourceLeaf.id, "right", { type: "document", documentId })
        : replaceWorkspaceLeafContent(
            currentLayout,
            sourceLeaf.id === collectWorkspaceLeaves(currentLayout)[0]?.id
              ? collectWorkspaceLeaves(currentLayout)[1]?.id ?? sourceLeaf.id
              : collectWorkspaceLeaves(currentLayout)[0]?.id ?? sourceLeaf.id,
            { type: "document", documentId }
          );
    const targetLeaf = findDocumentLeafById(nextLayout, documentId);
    setOpenWorkspaceTabs((tabs) =>
      tabs.some((tab) => tab.kind === "document" && tab.id === documentId) ? tabs : [...tabs, { kind: "document", id: documentId }],
    );
    setWorkspaceLayout(nextLayout);
    if (options?.forceRichText && targetLeaf) {
      setEditorViewModes((current) => ({ ...current, [targetLeaf.id]: "rich-text" }));
    }
    if (targetLeaf) setActivePaneId(targetLeaf.id);
    const next = { ...data, activeDocumentId: documentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, documentId);
    return targetLeaf?.id ?? null;
  };

  const activatePane = (paneId: string) => {
    if (!data) return;
    setActivePaneId(paneId);
    const leaf = workspaceLayout ? findWorkspaceLeaf(workspaceLayout, paneId) : null;
    if (leaf?.content.type === "browser") {
      setActiveWorkspaceTab({ kind: "browser", id: leaf.content.tabId });
      return;
    }
    if (leaf?.content.type !== "document") return;
    setActiveWorkspaceTab({ kind: "document", id: leaf.content.documentId });
    if (data.activeDocumentId === leaf.content.documentId) return;
    const next = { ...data, activeDocumentId: leaf.content.documentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, leaf.content.documentId);
  };

  const expandPaneToSingle = (paneId: string) => {
    if (!data || !workspaceLayout) return;
    const maximized = maximizeWorkspaceLeaf(workspaceLayout, paneId);
    setWorkspaceLayout(maximized);
    setActivePaneId(paneId);
    setDropTarget(null);
    const leaf = findWorkspaceLeaf(maximized, paneId);
    if (!leaf) return;
    if (leaf.content.type === "document") {
      if (data.activeDocumentId === leaf.content.documentId) return;
      const next = { ...data, activeDocumentId: leaf.content.documentId };
      applyDataState(next);
      window.informio.saveDocuments(next.documents, leaf.content.documentId);
      setActiveWorkspaceTab({ kind: "document", id: leaf.content.documentId });
      return;
    }
    if (leaf.content.type === "browser") {
      setActiveWorkspaceTab({ kind: "browser", id: leaf.content.tabId });
    }
  };

  const closeWorkspacePane = (paneId: string) => {
    if (!workspaceLayout) return;
    const nextLayout = removeWorkspaceLeaf(workspaceLayout, paneId);
    setWorkspaceLayout(nextLayout);
    setDropTarget(null);
    const leaves = collectWorkspaceLeaves(nextLayout);
    const nextActive = leaves[0];
    if (nextActive) {
      setActivePaneId(nextActive.id);
      if (nextActive.content.type === "document") {
        setActiveWorkspaceTab({ kind: "document", id: nextActive.content.documentId });
      } else if (nextActive.content.type === "browser") {
        setActiveWorkspaceTab({ kind: "browser", id: nextActive.content.tabId });
      }
    }
  };

  const updateBrowserTabMeta = (tabId: string, meta: BrowserTabMeta) => {
    setBrowserTabMeta((current) => ({ ...current, [tabId]: { ...current[tabId], ...meta } }));
  };

  const selectBrowserTab = (tabId: string) => {
    if (!data) return;
    setOpenWorkspaceTabs((tabs) =>
      tabs.some((tab) => tab.kind === "browser" && tab.id === tabId) ? tabs : [...tabs, { kind: "browser", id: tabId }],
    );
    setActiveWorkspaceTab({ kind: "browser", id: tabId });
    setWorkspaceLayout((layout) => {
      const base =
        layout ??
        (data.activeDocumentId ? createDocumentLeaf(data.activeDocumentId) : createBrowserLeaf(tabId));
      const targetPaneId = findWorkspaceLeaf(base, activePaneId) ? activePaneId : collectWorkspaceLeaves(base)[0]?.id ?? MAIN_PANE_ID;
      return replaceWorkspaceLeafContent(base, targetPaneId, { type: "browser", tabId });
    });
    setActivePaneId((current) => current || MAIN_PANE_ID);
  };

  const createNewBrowserTab = () => {
    const tabId = createBrowserId();
    setBrowserTabMeta((meta) => ({ ...meta, [tabId]: {} }));
    selectBrowserTab(tabId);
  };

  const hideBrowser = () => {
    const browserTabs = openWorkspaceTabs.filter((tab) => tab.kind === "browser");
    if (!browserTabs.length) return;

    browserTabs.forEach((tab) => {
      void window.informio.destroyBrowserPane(tab.id);
    });
    setBrowserTabMeta((meta) => {
      const next = { ...meta };
      browserTabs.forEach((tab) => {
        delete next[tab.id];
      });
      return next;
    });

    const closingIndex =
      activeWorkspaceTab?.kind === "browser"
        ? openWorkspaceTabs.findIndex((tab) => tab.kind === "browser" && tab.id === activeWorkspaceTab.id)
        : openWorkspaceTabs.length;
    const nextTabs = openWorkspaceTabs.filter((tab) => tab.kind !== "browser");
    setOpenWorkspaceTabs(nextTabs);
    setWorkspaceLayout((layout) => {
      if (!layout) return null;
      const remainingLeaves = collectWorkspaceLeaves(layout).filter((leaf) => leaf.content.type !== "browser");
      if (!remainingLeaves.length) {
        const fallbackDocument = selectOpenDocumentIds(nextTabs)[0];
        return fallbackDocument ? createDocumentLeaf(fallbackDocument) : null;
      }
      if (remainingLeaves.length === 1) return remainingLeaves[0];
      return remainingLeaves.reduce<WorkspaceSplitNode | null>((acc, leaf, index) => {
        if (index === 0) return leaf;
        if (!acc) return leaf;
        return { type: "split", direction: "horizontal", ratio: 0.5, first: acc, second: leaf };
      }, null);
    });
    if (activeWorkspaceTab?.kind === "browser") {
      const nextActive =
        nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? nextTabs[0] ?? null;
      setActiveWorkspaceTab(nextActive);
    }
  };

  const toggleBrowser = () => {
    if (!data) return;
    if (activeWorkspaceTab?.kind === "browser") {
      hideBrowser();
      return;
    }
    const browserTabs = openWorkspaceTabs.filter((tab) => tab.kind === "browser");
    const existing = browserTabs[browserTabs.length - 1];
    if (existing) {
      selectBrowserTab(existing.id);
      return;
    }
    createNewBrowserTab();
  };

  const closeBrowserTab = (tabId: string) => {
    void window.informio.destroyBrowserPane(tabId);
    setBrowserTabMeta((meta) => {
      const next = { ...meta };
      delete next[tabId];
      return next;
    });
    const closingIndex = openWorkspaceTabs.findIndex((tab) => tab.kind === "browser" && tab.id === tabId);
    const nextTabs = openWorkspaceTabs.filter((tab) => !(tab.kind === "browser" && tab.id === tabId));
    setOpenWorkspaceTabs(nextTabs);
    setWorkspaceLayout((layout) => {
      if (!layout) return null;
      const remainingLeaves = collectWorkspaceLeaves(layout).filter(
        (leaf) => !(leaf.content.type === "browser" && leaf.content.tabId === tabId),
      );
      if (!remainingLeaves.length) {
        const fallbackDocument = selectOpenDocumentIds(nextTabs)[0];
        return fallbackDocument ? createDocumentLeaf(fallbackDocument) : null;
      }
      if (remainingLeaves.length === 1) return remainingLeaves[0];
      return remainingLeaves.reduce<WorkspaceSplitNode | null>((acc, leaf, index) => {
        if (index === 0) return leaf;
        if (!acc) return leaf;
        return { type: "split", direction: "horizontal", ratio: 0.5, first: acc, second: leaf };
      }, null);
    });
    if (activeWorkspaceTab?.kind === "browser" && activeWorkspaceTab.id === tabId) {
      const nextActive =
        nextTabs[closingIndex] ??
        nextTabs[closingIndex - 1] ??
        nextTabs[0] ??
        null;
      setActiveWorkspaceTab(nextActive);
    }
  };

  const openToolInWorkspace = (content: WorkspacePaneContent, target: WorkspaceDropTarget) => {
    if (!data) return;
    if (content.type === "agent") {
      const existing = findAgentLeaf(workspaceLayout);
      if (existing) {
        setActivePaneId(existing.id);
        if (target) {
          const next = splitWorkspaceLeaf(workspaceLayout ?? existing, target.paneId, target.zone, content);
          if (next && countWorkspaceLeaves(next) > countWorkspaceLeaves(workspaceLayout)) {
            setWorkspaceLayout(next);
            setActivePaneId(collectWorkspaceLeaves(next).find((leaf) => leaf.content.type === "agent")?.id ?? existing.id);
          }
        }
        return;
      }
    }
    const baseLayout =
      workspaceLayout ??
      (data.activeDocumentId ? createDocumentLeaf(data.activeDocumentId) : createBrowserLeaf(createBrowserId()));
    if (!target) {
      if (countWorkspaceLeaves(baseLayout) >= 4) return;
      const leaf = collectWorkspaceLeaves(baseLayout)[0];
      const next = splitWorkspaceLeaf(baseLayout, leaf.id, "right", content);
      setWorkspaceLayout(next);
      setActivePaneId(collectWorkspaceLeaves(next).at(-1)?.id ?? leaf.id);
      return;
    }
    const existingDocument =
      content.type === "document" ? findDocumentLeafById(baseLayout, content.documentId) : null;
    if (existingDocument && existingDocument.id !== target.paneId) {
      setWorkspaceLayout(maximizeWorkspaceLeaf(baseLayout, existingDocument.id));
      setActivePaneId(existingDocument.id);
      return;
    }
    const next = splitWorkspaceLeaf(baseLayout, target.paneId, target.zone, content);
    if (!next) return;
    setWorkspaceLayout(next);
    const openedLeaf = collectWorkspaceLeaves(next).find((leaf) => {
      if (content.type === "document") return leaf.content.type === "document" && leaf.content.documentId === content.documentId;
      if (content.type === "browser") return leaf.content.type === "browser" && leaf.content.tabId === content.tabId;
      return leaf.content.type === "agent";
    });
    if (openedLeaf) setActivePaneId(openedLeaf.id);
    if (content.type === "document") {
      setOpenWorkspaceTabs((tabs) =>
        tabs.some((tab) => tab.kind === "document" && tab.id === content.documentId)
          ? tabs
          : [...tabs, { kind: "document", id: content.documentId }],
      );
      setActiveWorkspaceTab({ kind: "document", id: content.documentId });
      const nextData = { ...data, activeDocumentId: content.documentId };
      applyDataState(nextData);
      window.informio.saveDocuments(nextData.documents, content.documentId);
    }
    if (content.type === "browser") {
      setOpenWorkspaceTabs((tabs) =>
        tabs.some((tab) => tab.kind === "browser" && tab.id === content.tabId) ? tabs : [...tabs, { kind: "browser", id: content.tabId }],
      );
      setActiveWorkspaceTab({ kind: "browser", id: content.tabId });
    }
  };

  const handleEditorCompositionChange = (documentId: string, composing: boolean) => {
    if (composing) {
      composingDocumentIdRef.current = documentId;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      return;
    }
    const changedDocumentId = composingDocumentIdRef.current;
    composingDocumentIdRef.current = null;
    if (changedDocumentId) {
      window.setTimeout(() => {
        persistDocuments(changedDocumentId);
      }, 120);
    }
  };

  const selectDocument = (id: string) => {
    if (!data) return;
    setOpenWorkspaceTabs((tabs) =>
      tabs.some((tab) => tab.kind === "document" && tab.id === id) ? tabs : [...tabs, { kind: "document", id }],
    );
    setActiveWorkspaceTab({ kind: "document", id });
    setWorkspaceLayout((layout) => {
      const base =
        layout ??
        (data.activeDocumentId ? createDocumentLeaf(data.activeDocumentId) : createDocumentLeaf(id));
      const targetPaneId = findWorkspaceLeaf(base, activePaneId) ? activePaneId : collectWorkspaceLeaves(base)[0]?.id ?? MAIN_PANE_ID;
      return replaceWorkspaceLeafContent(base, targetPaneId, { type: "document", documentId: id });
    });
    setActivePaneId((current) => current || MAIN_PANE_ID);
    const next = { ...data, activeDocumentId: id };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, id);
  };

  const applyClosedDocumentTab = (id: string, currentData: AppData, currentTabs: WorkspaceTabRef[]) => {
    const documentTabs = currentTabs.filter((tab) => tab.kind === "document");
    const browserTabs = currentTabs.filter((tab) => tab.kind === "browser");
    const closingIndex = documentTabs.findIndex((tab) => tab.id === id);
    const nextDocumentTabs = documentTabs.filter((tab) => tab.id !== id);
    const nextTabs = [...nextDocumentTabs, ...browserTabs];
    const nextDocumentIds = nextDocumentTabs.map((tab) => tab.id);
    const nextActiveDocumentId =
      currentData.activeDocumentId === id && nextDocumentIds.length
        ? (nextDocumentIds[closingIndex] ?? nextDocumentIds[closingIndex - 1] ?? nextDocumentIds[0])
        : currentData.activeDocumentId === id
          ? ""
          : currentData.activeDocumentId;

    setOpenWorkspaceTabs(nextTabs);
    setWorkspaceLayout((layout) => {
      if (!layout) {
        return nextActiveDocumentId ? createDocumentLeaf(nextActiveDocumentId) : browserTabs.length ? createBrowserLeaf(browserTabs[0]!.id) : null;
      }
      const leaves = collectWorkspaceLeaves(layout);
      const remainingLeaves = leaves.filter((leaf) => !(leaf.content.type === "document" && leaf.content.documentId === id));
      if (!remainingLeaves.length) {
        return nextActiveDocumentId ? createDocumentLeaf(nextActiveDocumentId) : browserTabs.length ? createBrowserLeaf(browserTabs[0]!.id) : null;
      }
      if (remainingLeaves.length === 1) return remainingLeaves[0];
      return remainingLeaves.reduce<WorkspaceSplitNode | null>((acc, leaf, index) => {
        if (index === 0) return leaf;
        if (!acc) return leaf;
        return { type: "split", direction: "horizontal", ratio: 0.5, first: acc, second: leaf };
      }, null);
    });
    if (activeWorkspaceTab?.kind === "document" && activeWorkspaceTab.id === id) {
      const nextActive =
        nextTabs[closingIndex] ??
        nextTabs[closingIndex - 1] ??
        nextTabs[0] ??
        null;
      setActiveWorkspaceTab(nextActive);
    }
    const next = { ...currentData, activeDocumentId: nextActiveDocumentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, nextActiveDocumentId);
  };

  const assignDocumentToActivePane = (documentId: string) => {
    setWorkspaceLayout((layout) => {
      const base = layout ?? createDocumentLeaf(documentId);
      const targetPaneId = findWorkspaceLeaf(base, activePaneId) ? activePaneId : collectWorkspaceLeaves(base)[0]?.id ?? MAIN_PANE_ID;
      return replaceWorkspaceLeafContent(base, targetPaneId, { type: "document", documentId });
    });
    setActivePaneId((current) => current || MAIN_PANE_ID);
  };

  const closeDocumentTab = async (id: string) => {
    const currentData = latestDataRef.current;
    if (!currentData) return;
    try {
      if (dirtyDocumentIdsRef.current.has(id)) {
        const closingDoc = currentData.documents.find((doc) => doc.id === id);
        if (closingDoc && documentKind(closingDoc) === "spreadsheet") {
          await saveSpreadsheetDocumentNow(id);
          forgetDocumentDirtyState(id);
        } else if (closingDoc && documentKind(closingDoc) === "word") {
          await saveWordDocumentNow(id);
          forgetDocumentDirtyState(id);
        } else {
          await saveDocumentsNow(currentData.documents, currentData.activeDocumentId, [id]);
        }
      }
    } catch (error) {
      window.alert(error instanceof Error ? t("app.saveFailedCancelCloseWithMessage", { message: error.message }) : t("app.saveFailedCancelClose"));
      return;
    }
    applyClosedDocumentTab(id, latestDataRef.current ?? currentData, openWorkspaceTabs);
  };

  const createDocument = async (folderPath?: string) => {
    setFileListCreationSignal((value) => value + 1);
    const next = folderPath ? await window.informio.createDocumentInFolder(folderPath) : await window.informio.createDocument();
    setOpenWorkspaceTabs((tabs) => [
      { kind: "document", id: next.activeDocumentId },
      ...tabs.filter((tab) => !(tab.kind === "document" && tab.id === next.activeDocumentId)),
    ]);
    assignDocumentToActivePane(next.activeDocumentId);
    applyMergedAppData(next);
  };

  const createDefaultMarkdownDocument = async () => {
    const next = await window.informio.createDefaultMarkdownDocument();
    setOpenWorkspaceTabs((tabs) => [
      { kind: "document", id: next.activeDocumentId },
      ...tabs.filter((tab) => !(tab.kind === "document" && tab.id === next.activeDocumentId)),
    ]);
    assignDocumentToActivePane(next.activeDocumentId);
    applyMergedAppData(next);
  };

  const createLinkedDocument = async (title: string) => {
    const next = await window.informio.createLinkedDocument(title);
    setOpenWorkspaceTabs((tabs) => [
      { kind: "document", id: next.activeDocumentId },
      ...tabs.filter((tab) => !(tab.kind === "document" && tab.id === next.activeDocumentId)),
    ]);
    assignDocumentToActivePane(next.activeDocumentId);
    applyMergedAppData(next);
  };

  const dispatchEditorCommand = (command: MenuCommand, payload?: unknown) => {
    window.dispatchEvent(new CustomEvent("informio:command", { detail: { command, payload } }));
  };

  const createFolder = async (folderPath?: string) => {
    setFileListCreationSignal((value) => value + 1);
    const next = folderPath ? await window.informio.createFolderInFolder(folderPath) : await window.informio.createFolder();
    applyMergedAppData(next);
  };

  const startDocumentDrag = (documentId: string, event: ReactDragEvent<HTMLElement>) => {
    beginWorkspaceDrag();
    const document = documentsById.get(documentId);
    event.dataTransfer.effectAllowed = "copyMove";
    if (document?.filePath) {
      event.dataTransfer.setData(
        TREE_ITEM_DRAG_MIME,
        serializeTreeDragPayload({ type: "file", documentId, path: document.filePath })
      );
    }
    event.dataTransfer.setData(DOCUMENT_DRAG_MIME, documentId);
  };

  const startToolDrag = (mode: RightPanelMode, event: ReactDragEvent<HTMLElement>) => {
    beginWorkspaceDrag();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(mode === "browser" ? BROWSER_DRAG_MIME : AGENT_DRAG_MIME, mode);
  };

  const applyDocumentDrop = (documentId: string, target: WorkspaceDropTarget) => {
    if (!data || !documentsById.has(documentId) || !target) return;
    openToolInWorkspace({ type: "document", documentId }, target);
  };

  const applyToolDrop = (mode: RightPanelMode, target: WorkspaceDropTarget) => {
    if (!target) return;
    if (mode === "agent") {
      openToolInWorkspace({ type: "agent" }, target);
      return;
    }
    openToolInWorkspace(createBrowserContent(createBrowserId()), target);
  };

  const handleWorkspaceDrop = (target: WorkspaceDropTarget, dataTransfer: DataTransfer) => {
    const documentId = dataTransfer.getData(DOCUMENT_DRAG_MIME);
    if (documentId) {
      applyDocumentDrop(documentId, target);
      return;
    }
    if (dataTransfer.types.includes(BROWSER_DRAG_MIME)) {
      applyToolDrop("browser", target);
      return;
    }
    if (dataTransfer.types.includes(AGENT_DRAG_MIME)) {
      applyToolDrop("agent", target);
    }
  };

  const toggleRightTool = (mode: "agent") => {
    if (!data) return;
    const rightOpen = data.settings.appearance.rightPanel === "expanded";
    const nextOpen = rightOpen && rightPanelMode === mode ? "collapsed" : "expanded";
    setRightPanelMode(mode);
    updateSettings({
      ...data.settings,
      appearance: { ...data.settings.appearance, rightPanel: nextOpen },
    });
  };

  const executeFileSystemAction = async (input: FileSystemOperationInput) => {
    if (!data) return;
    if (input.action === "delete") {
      const confirmed = window.confirm(input.targetType === "folder" ? t("app.confirmDeleteFolder") : t("app.confirmDeleteFile"));
      if (!confirmed) return;
    }

    const affectedEmbeddableDocumentIds =
      input.action === "move" || input.action === "rename"
        ? data.documents
            .filter((doc) => {
              if (!doc.filePath || !isEmbeddableAssetDocument(doc)) return false;
              if (input.targetType === "file") {
                return doc.id === input.documentId || normalizePath(doc.filePath) === normalizePath(input.path);
              }
              return pathContains(input.path, doc.filePath);
            })
            .map((doc) => doc.id)
        : [];

    const saved = await saveDocumentsNow(data.documents, data.activeDocumentId);
    const next = await window.informio.runFileSystemAction({
      ...input,
      documentId: input.documentId
    });
    applyMergedAppData(next);
    setOpenWorkspaceTabs((tabs) =>
      tabs.filter((tab) => tab.kind !== "document" || next.documents.some((doc) => doc.id === tab.id)),
    );
    dirtyBaseMarkdownRef.current.clear();
    applyDirtyDocumentIds(new Set());
    if (saved.activeDocumentId !== next.activeDocumentId && next.documents.some((doc) => doc.id === next.activeDocumentId)) {
      setOpenWorkspaceTabs((tabs) =>
        tabs.some((tab) => tab.kind === "document" && tab.id === next.activeDocumentId)
          ? tabs
          : [{ kind: "document", id: next.activeDocumentId }, ...tabs],
      );
    }
    if (affectedEmbeddableDocumentIds.length) {
      const nextIds = new Set(next.documents.map((doc) => doc.id));
      setDocumentRefreshTokens((current) => {
        const updated = { ...current };
        affectedEmbeddableDocumentIds.forEach((id) => {
          if (!nextIds.has(id)) return;
          updated[id] = (updated[id] ?? 0) + 1;
        });
        return updated;
      });
    }
  };

  const importExternalFiles = async (sourcePaths: string[], destinationFolderPath: string) => {
    if (!sourcePaths.length) return;
    const next = await window.informio.importExternalFiles({ sourcePaths, destinationFolderPath });
    applyMergedAppData(next);
  };

  const renameProject = async (path: string, title: string) => {
    const next = await window.informio.renameProject(path, title);
    applyMergedAppData(next);
  };

  const toggleProjectPinned = async (path: string) => {
    const next = await window.informio.toggleProjectPinned(path);
    applyMergedAppData(next);
  };

  const saveActiveDocumentAs = async () => {
    if (!data || !activeOpenDoc) return;
    const next = await window.informio.saveActiveDocumentAs(data.documents, data.activeDocumentId);
    if (!next) return;
    applyMergedAppData(next);
    if (next.activeDocumentId) {
      setOpenWorkspaceTabs((tabs) =>
        tabs.some((tab) => tab.kind === "document" && tab.id === next.activeDocumentId)
          ? tabs
          : [{ kind: "document", id: next.activeDocumentId }, ...tabs],
      );
    }
  };

  const exportActiveDocument = async (format: "markdown" | "html" | "pdf") => {
    if (!data || !activeOpenDoc || !isWritableTextDocument(activeOpenDoc)) return;
    await window.informio.exportActiveDocument(data.documents, data.activeDocumentId, format);
  };

  const checkApiModels = async () => {
    if (!data) return;
    const api = apiSettings;
    if (!api.baseUrl.trim() || !api.apiKey.trim()) {
      setApiCheckState({ status: "error", error: t("app.apiMissingCredentials") });
      return;
    }

    setCheckingApiModels(true);
    setApiCheckState({ status: "loading", message: t("app.apiCheckingModels") });
    try {
      const result = await window.informio.detectApiModels({
        provider: api.provider,
        baseUrl: api.baseUrl,
        apiKey: api.apiKey
      });
      const nextModel = result.models.some((item) => item.id === api.model) ? api.model : (result.models[0]?.id ?? "");
      updateSettings({
        ...data.settings,
        api: {
          ...api,
          models: result.models,
          model: nextModel
        }
      });
      setApiCheckState({ status: "done", message: t("app.apiModelsDetected", { count: result.models.length }) });
    } catch (error) {
      setApiCheckState({
        status: "error",
        error: error instanceof Error ? error.message : t("app.apiModelDetectionFailed")
      });
    } finally {
      setCheckingApiModels(false);
    }
  };

  const runAppCommand = (command: MenuCommand) => {
    if (!data) return false;
    switch (command) {
      case "file:new":
        void createDocument();
        return true;
      case "window:new":
        void window.informio.newWindow();
        return true;
      case "command:open-palette":
        setCommandPaletteOpen(true);
        return true;
      case "file:save":
        if (activeOpenDoc && documentKind(activeOpenDoc) === "spreadsheet") {
          void saveSpreadsheetDocumentNow(activeOpenDoc.id).then((saved) => {
            if (saved) forgetDocumentDirtyState(activeOpenDoc.id);
          });
          return true;
        }
        if (activeOpenDoc && documentKind(activeOpenDoc) === "word") {
          void saveWordDocumentNow(activeOpenDoc.id).then((saved) => {
            if (saved) forgetDocumentDirtyState(activeOpenDoc.id);
          });
          return true;
        }
        if (activeOpenDoc) void saveDocumentsNow(data.documents, data.activeDocumentId);
        return true;
      case "file:save-as":
        if (activeOpenDoc && documentKind(activeOpenDoc) === "spreadsheet") {
          void requestSpreadsheetSaveAs(activeOpenDoc.id);
          return true;
        }
        if (activeOpenDoc && documentKind(activeOpenDoc) === "word") {
          void requestWordSaveAs(activeOpenDoc.id);
          return true;
        }
        void saveActiveDocumentAs();
        return true;
      case "file:export-html":
        void exportActiveDocument("html");
        return true;
      case "file:export-pdf":
        void exportActiveDocument("pdf");
        return true;
      case "file:open":
        void window.informio.openFiles().then((next) => {
          if (next) applyMergedAppData(next);
        });
        return true;
      case "workspace:open":
        void window.informio.openWorkspace().then((next) => {
          if (next) applyMergedAppData(next);
        });
        return true;
      case "settings:open":
        window.informio.openSettings();
        return true;
      case "file:close-tab":
        if (activeOpenDoc?.id) void closeDocumentTab(activeOpenDoc.id);
        return true;
      case "window:close":
        window.close();
        return true;
      case "file:close-workspace":
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, leftPanel: "collapsed", rightPanel: "collapsed" }
        });
        return true;
      case "view:toggle-left-panel": {
        const leftOpen = data.settings.appearance.leftPanel === "expanded";
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, leftPanel: leftOpen ? "collapsed" : "expanded" }
        });
        return true;
      }
      case "view:toggle-right-panel": {
        const rightOpen = data.settings.appearance.rightPanel === "expanded";
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, rightPanel: rightOpen ? "collapsed" : "expanded" }
        });
        return true;
      }
      case "view:toggle-status-bar":
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, autoHideStatusBar: !data.settings.appearance.autoHideStatusBar }
        });
        return true;
      default:
        return false;
    }
  };

  const copyCurrentSelection = async () => {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    const transcript = document.querySelector("[data-agent-transcript]");
    if (selection && text.trim() && transcript instanceof HTMLElement && selectionIsInsideElement(selection, transcript)) {
      await writeClipboardText(text);
      return;
    }
    // If the user has a live selection inside the selection-translate
    // toolbar, prefer that live selection (so partial drags copy only the
    // dragged range). If the DOM selection has already collapsed between
    // mouseup and the menu accelerator firing, fall back to the most
    // recent toolbar selection captured on mouseup. We deliberately avoid
    // document.execCommand("copy") here — it is unreliable in Electron for
    // non-input divs and frequently copies an empty string when the
    // selection has collapsed, leaving the previous clipboard contents
    // (the original source text) in place.
    // Multiple elements carry [data-selection-toolbar-safe-area] (insert toolbar,
    // PDF panels, SelectionToolbar, etc.). querySelector returns the first in DOM
    // order which is often the insert toolbar — not the one holding the translation
    // result. Walk all of them so we never miss a live selection inside a toolbar.
    const safeAreas = document.querySelectorAll("[data-selection-toolbar-safe-area]");
    if (selection && !selection.isCollapsed) {
      for (const area of safeAreas) {
        if (area instanceof HTMLElement && selectionIsInsideElement(selection, area)) {
          await writeClipboardText(text);
          return;
        }
      }
    }
    const cachedToolbarText = lastToolbarSelectionText;
    if (cachedToolbarText && safeAreas.length > 0) {
      await writeClipboardText(cachedToolbarText);
      return;
    }
    const copied = document.execCommand("copy");
    if (!copied && text.trim()) await writeClipboardText(text);
  };

  useEffect(() => {
    return window.informio.onMenuCommand((command) => {
      if (command === "edit:copy") {
        void copyCurrentSelection();
        return;
      }
      runAppCommand(command);
    });
  }, [activeOpenDoc?.id, data]);

  const startPanelResize = (side: "left" | "right", event: React.PointerEvent<HTMLDivElement>) => {
    if (!data) return;
    event.preventDefault();

    const key = side === "left" ? "leftPanelWidth" : "rightPanelWidth";
    const min = side === "left" ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH;
    const max = side === "left" ? LEFT_PANEL_MAX_WIDTH : RIGHT_PANEL_MAX_WIDTH;
    const startX = event.clientX;
    const startWidth = data.settings.appearance[key];
    let nextWidth = startWidth;

    document.body.classList.add("is-resizing-panel");
    void window.informio.setBrowserPanelResizing(true);
    void window.informio.hideAllBrowserPanes();

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      nextWidth = clamp(side === "left" ? startWidth + delta : startWidth - delta, min, max);
      const current = latestDataRef.current;
      if (!current) return;
      applyDataState({
        ...current,
        settings: {
          ...current.settings,
          appearance: {
            ...current.settings.appearance,
            [key]: nextWidth
          }
        }
      });
    };

    const onPointerUp = () => {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      void window.informio
        .saveSettings({
          ...data.settings,
          appearance: {
            ...data.settings.appearance,
            [key]: nextWidth,
          },
        })
        .then(() => window.informio.setBrowserPanelResizing(false))
        .then(() => {
          window.dispatchEvent(new Event(BROWSER_BOUNDS_SYNC_EVENT));
        });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const connectAgent = async (providerId?: string) => {
    if (!data?.settings.agentRuntime.enabled) return;
    if (!activeAgent && !providerId) return;
    const id = providerId ?? activeAgent!.id;
    const existing = connections.find((item) => item.providerId === id);
    setConnections((items) => [
      ...items.filter((item) => item.providerId !== id),
      {
        providerId: id,
        status: "connecting",
        message: existing?.status === "connected" ? t("app.reconnectingAgent") : t("app.startingAgentGeneric"),
        tools: []
      }
    ]);
    if (existing?.status === "connected") {
      await window.informio.disconnectAgentRuntime(id);
    }
    const connection = await window.informio.connectAgentRuntime(id);
    setConnections((items) => [...items.filter((item) => item.providerId !== id), connection]);
  };

  const checkAgents = async () => {
    if (!data?.settings.agentRuntime.enabled || checkingAgents) return;
    const targetAgents = data.settings.agents;
    if (!targetAgents.length) return;
    const targetAgentIds = new Set(targetAgents.map((agent) => agent.id));
    setCheckingAgents(true);
    try {
      setConnections((items) => [
        ...items.filter((item) => !targetAgentIds.has(item.providerId)),
        ...targetAgents.map((agent) => ({
          providerId: agent.id,
          status: "connecting" as const,
          message: t("app.checkingAgent", { name: agent.name }),
          tools: []
        }))
      ]);
      const results = await Promise.all(
        targetAgents.map(async (agent) => ({
          providerId: agent.id,
          connection: await window.informio.connectAgentRuntime(agent.id)
        }))
      );
      const resultProviderIds = new Set(results.map((result) => result.providerId));
      setConnections((items) => [
        ...items.filter((item) => !resultProviderIds.has(item.providerId)),
        ...results.map((result) => result.connection)
      ]);
    } finally {
      setCheckingAgents(false);
    }
  };

  const openActionPath = (path: string) => {
    if (!documentLookupIndex) return;
    const document = findDocumentForActionPath(path, documentLookupIndex);
    if (document) selectDocument(document.id);
  };

  const jumpToOutlineItem = (documentId: string, item: OutlineItem) => {
    selectDocument(documentId);
    setOutlineJumpRequest({
      documentId,
      itemId: item.id,
      order: item.order,
      line: item.line,
      title: item.title,
      nonce: Date.now()
    });
  };

  const handleOutlineJumpHandled = (request: OutlineJumpRequest) => {
    setOutlineJumpRequest((current) => (current && current.nonce === request.nonce ? null : current));
  };

  const refreshAppDataFromDisk = async (options: { allowNewConflicts?: boolean } = {}) => {
    const updated = await window.informio.loadApp();
    applyMergedAppData(updated, options);
  };

  const openDocumentConflict = (documentId: string) => {
    if (!documentConflictsRef.current.has(documentId)) return;
    setActiveConflictDocumentId(documentId);
  };

  const clearDocumentConflict = (documentId: string) => {
    const items = documentConflictsRef.current;
    if (items.has(documentId)) {
      const next = new Map(items);
      next.delete(documentId);
      applyDocumentConflicts(next);
    }
    setActiveConflictDocumentId((id) => (id === documentId ? null : id));
  };

  const keepLocalConflictVersion = async (documentId: string) => {
    const latest = latestDataRef.current;
    if (!latest || !documentConflictsRef.current.has(documentId)) return;
    await saveDocumentsNow(latest.documents, latest.activeDocumentId, [documentId], { syncData: true, ignoreConflicts: true });
    forgetDocumentDirtyState(documentId);
    clearDocumentConflict(documentId);
  };

  const useExternalConflictVersion = (documentId: string) => {
    const latest = latestDataRef.current;
    const conflict = documentConflictsRef.current.get(documentId);
    if (!latest || !conflict) return;
    const documents = latest.documents.map((doc) =>
      doc.id === documentId
        ? { ...doc, markdown: conflict.externalMarkdown, updatedAt: conflict.externalUpdatedAt ?? new Date().toISOString() }
        : doc
    );
    const nextData = { ...latest, documents };
    applyDataState(nextData);
    forgetDocumentDirtyState(documentId);
    clearDocumentConflict(documentId);
  };

  const saveAgentConversations = async (conversations: AgentConversation[]) => {
    const saved = await window.informio.saveAgentConversations({ conversations });
    const current = latestDataRef.current;
    if (current) applyDataState({ ...current, agentConversations: saved });
    return saved;
  };

  const selectAgentConversation = (conversationId: string) => {
    if (agentBusy) return;
    const conversation = providerAgentConversations.find((item) => item.id === conversationId);
    setActiveConversationId(conversationId);
    setPendingNewConversation(false);
    setAgentMessages(buildSessionMessagesFromConversation(conversation ?? null));
  };

  const startNewAgentConversation = () => {
    if (agentBusy) return;
    setActiveConversationId(null);
    setPendingNewConversation(true);
    setAgentMessages([]);
  };

  const deleteAgentConversation = async (conversationId: string) => {
    if (agentBusy) return;
    const currentData = latestDataRef.current;
    if (!currentData) return;
    const remainingConversations = (currentData.agentConversations ?? []).filter((conversation) => conversation.id !== conversationId);
    const saved = await saveAgentConversations(remainingConversations);
    const remainingProviderConversations = saved
      .filter((conversation) => conversation.providerId === activeAgent?.id)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    if (activeConversationId === conversationId) {
      const nextConversation = remainingProviderConversations[0] ?? null;
      if (nextConversation) {
        setActiveConversationId(nextConversation.id);
        setPendingNewConversation(false);
        setAgentMessages(buildSessionMessagesFromConversation(nextConversation));
      } else {
        setActiveConversationId(null);
        setPendingNewConversation(true);
        setAgentMessages([]);
      }
    }
  };

  const respondAgentApproval = async (approvalId: string, decision: AgentApprovalDecision) => {
    if (!activeAgent) return;
    const providerPrefix = approvalId.includes(":") ? approvalId.split(":")[0] : "";
    const providerId = data?.settings.agents.some((agent) => agent.id === providerPrefix) ? providerPrefix : activeAgent.id;
    try {
      await window.informio.respondAgentApproval({
        providerId,
        approvalId,
        decision
      });
    } catch (error) {
      setAgentMessages((items) =>
        items.map((item) => ({
          ...item,
          actions: item.actions.map((action) =>
            action.approval?.id === approvalId
              ? {
                  ...action,
                  status: "error",
                  output: error instanceof Error ? error.message : String(error)
                }
              : action
          )
        }))
      );
    }
  };

  const cancelAgentSession = async () => {
    if (!activeAgent) return;
    try {
      await window.informio.cancelAgentRun(activeAgent.id);
    } finally {
      setAgentBusy(false);
    }
  };

  const resolveReferencedDocumentsFromMessage = (message: string) =>
    documentLookupIndex ? resolveReferencedDocuments(message, documentLookupIndex) : [];

  const sendAgentSession = async (text: string, permissionMode: AgentPermissionMode, attachments: AgentMessageAttachment[] = []) => {
    if (!data || !activeAgent) return;
    const messageText = `${text.trim() || t("agentpanel.processAttachments")}${attachmentsMarkdown(attachments)}`;
    const currentDoc = activeOpenDoc;
    const selection = agentSelection?.documentId === currentDoc?.id ? agentSelection : null;
    const references = resolveReferencedDocumentsFromMessage(messageText);
    const nowIso = new Date().toISOString();
    const existingConversation = activeConversation;
    const conversationId = existingConversation?.id ?? `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const baseConversationMessages = existingConversation?.messages ?? buildConversationMessagesFromSession(agentMessages);
    const baseRuntimeThreadId = existingConversation?.runtimeThreadId;
    const baseCreatedAt = existingConversation?.createdAt ?? nowIso;
    const baseTitle = existingConversation?.title ?? createConversationTitle(messageText, t("agentpanel.newSession"));
    const baseWorkspaceScopeId = existingConversation?.workspaceScopeId ?? workspaceScopeId;
    const baseWorkspaceLabel = existingConversation?.workspaceLabel ?? workspaceLabel;
    const conversationBase: Omit<AgentConversation, "messages" | "updatedAt" | "runtimeThreadId"> = {
      id: conversationId,
      workspaceScopeId: baseWorkspaceScopeId,
      workspaceLabel: baseWorkspaceLabel,
      providerId: activeAgent.id,
      title: baseTitle,
      createdAt: baseCreatedAt
    };
    const messageId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message: AgentSessionMessage = {
      id: messageId,
      userMessage: messageText,
      permissionMode,
      status: data.settings.agentRuntime.enabled ? "thinking" : "error",
      reasoning: "",
      response: "",
      actions: [],
      error: data.settings.agentRuntime.enabled ? undefined : t("app.agentDisabled"),
      hasSelection: Boolean(selection?.text),
      submittedAt: Date.now(),
      completedAt: data.settings.agentRuntime.enabled ? undefined : Date.now()
    };
    let latestSessionMessages = [...agentMessages, message].slice(-20);
    setActiveConversationId(conversationId);
    setPendingNewConversation(false);
    setAgentMessages(latestSessionMessages);

    const applySessionMessageUpdate = (updater: (item: AgentSessionMessage) => AgentSessionMessage) => {
      setAgentMessages((items) => {
        const updated = items.map((item) => (item.id === messageId ? updater(item) : item));
        latestSessionMessages = updated;
        return updated;
      });
    };

    const persistConversationSnapshot = async (runtimeThreadId?: string) => {
      const currentData = latestDataRef.current;
      if (!currentData) return;
      const conversation: AgentConversation = {
        ...conversationBase,
        updatedAt: new Date().toISOString(),
        runtimeThreadId,
        messages: buildConversationMessagesFromSession(latestSessionMessages)
      };
      const otherConversations = (currentData.agentConversations ?? []).filter((item) => item.id !== conversation.id);
      await saveAgentConversations([...otherConversations, conversation]);
    };

    if (!data.settings.agentRuntime.enabled) {
      await persistConversationSnapshot(baseRuntimeThreadId);
      return;
    }

    setAgentBusy(true);
    try {
      const result = await window.informio.runAgentSessionStream(
        {
          providerId: activeAgent.id,
          model: activeModel,
          message: messageText,
          permissionMode,
          conversationId,
          runtimeThreadId: baseRuntimeThreadId,
          workspaceScopeId,
          conversationHistory: baseConversationMessages,
          context: {
            workspacePath: data.workspacePath,
            currentDocument: currentDoc
              ? {
                  id: currentDoc.id,
                  title: currentDoc.title,
                  filePath: currentDoc.filePath,
                  markdown: currentDoc.markdown
                }
              : undefined,
            selection: selection
              ? selection.kind === "pdf"
                ? {
                    kind: "pdf",
                    documentId: selection.documentId,
                    title: selection.title ?? currentDoc?.title ?? "PDF",
                    filePath: selection.filePath ?? currentDoc?.filePath,
                    page: selection.page ?? 1,
                    text: selection.text,
                    rects: selection.rects ?? []
                  }
                : {
                    kind: "markdown",
                    documentId: selection.documentId,
                    from: selection.from,
                    to: selection.to,
                    text: selection.text
                  }
              : undefined,
            openTabs: openDocuments.map((doc) => ({ id: doc.id, title: doc.title, filePath: doc.filePath })),
            projectRoots: data.projects.map((project) => project.path),
            noteList: data.documents.map((doc) => ({
              id: doc.id,
              title: doc.title,
              filePath: doc.filePath,
              updatedAt: doc.updatedAt
            })),
            references: references.map((doc) => ({
              title: doc.title,
              documentId: doc.id,
              filePath: doc.filePath,
              markdown: doc.markdown
            })),
            attachments
          }
        },
        (event) => {
          applySessionMessageUpdate((item) => {
            if (event.type === "thinking_delta") {
              if (event.kind === "reasoning" && activeAgent.id !== "codex") return item;
              return { ...item, reasoning: item.reasoning + event.content, status: "thinking" };
            }
            if (event.type === "text_delta") {
              const nextResponse = item.response + event.content;
              if (activeAgent.id === "codex") {
                const split = splitCodexFinalResponse(nextResponse);
                if (split) {
                  return {
                    ...item,
                    reasoning: appendWithParagraphBreak(item.reasoning, split.process),
                    response: split.response,
                    status: "thinking"
                  };
                }
              }
              return { ...item, response: nextResponse, status: "thinking" };
            }
            if (event.type === "tool_start") {
              return { ...item, status: "tool-executing", actions: upsertSessionAction(item.actions, event.action) };
            }
            if (event.type === "approval_request") {
              return {
                ...item,
                status: "tool-executing",
                actions: upsertSessionAction(item.actions, event.action, event.action.approval?.id)
              };
            }
            if (event.type === "tool_delta") {
              return {
                ...item,
                actions: updateSessionActionByToolId(
                  item.actions,
                  event.toolId,
                  { output: `${(item.actions.find((a: AgentSessionAction) => a.toolId === event.toolId)?.output ?? "")}${event.outputDelta}` }
                )
              };
            }
            if (event.type === "tool_done") {
              return {
                ...item,
                actions: updateSessionActionByToolId(
                  item.actions,
                  event.toolId,
                  { status: event.status ?? "done", output: event.output }
                )
              };
            }
            if (event.type === "approval_resolved") {
              return {
                ...item,
                actions: updateSessionActionByToolId(
                  item.actions,
                  event.toolId,
                  { status: event.status, output: event.output }
                )
              };
            }
            if (event.type === "done") {
              if (activeAgent.id === "codex") {
                const split = splitCodexFinalResponse(event.content);
                if (split) {
                  return {
                    ...item,
                    status: "done",
                    reasoning: appendWithParagraphBreak(item.reasoning, split.process),
                    response: mergeFinalAgentResponse(item.response, split.response),
                    completedAt: item.completedAt ?? Date.now()
                  };
                }
              }
              return {
                ...item,
                status: "done",
                response: activeAgent.id === "opencode" ? sanitizeAgentResponse(event.content) : sanitizeAgentResponse(mergeFinalAgentResponse(item.response, event.content)),
                completedAt: item.completedAt ?? Date.now()
              };
            }
            return { ...item, status: "error", error: event.message, completedAt: item.completedAt ?? Date.now() };
          });
        }
      );
      applySessionMessageUpdate((item) => {
        if (activeAgent.id === "codex") {
          const split = splitCodexFinalResponse(result.content);
          if (split) {
            return {
              ...item,
              status: "done",
              reasoning: appendWithParagraphBreak(item.reasoning, split.process),
              response: mergeFinalAgentResponse(item.response, split.response),
              completedAt: item.completedAt ?? Date.now()
            };
          }
        }
        return {
          ...item,
          status: "done",
          response: activeAgent.id === "opencode" ? sanitizeAgentResponse(result.content) : sanitizeAgentResponse(mergeFinalAgentResponse(item.response, result.content)),
          completedAt: item.completedAt ?? Date.now()
        };
      });
      await persistConversationSnapshot(result.runtimeThreadId ?? baseRuntimeThreadId);
      if (permissionMode !== "read_only") {
        await refreshAppDataFromDisk({ allowNewConflicts: didAgentEditFiles(latestSessionMessages) });
      }
      window.informio.listAgentRuntimeConnections().then(setConnections);
    } catch (error) {
      applySessionMessageUpdate((item) => ({
        ...item,
        status: "error",
        error: item.error || (error instanceof Error ? error.message : String(error)),
        completedAt: item.completedAt ?? Date.now()
      }));
      await persistConversationSnapshot(baseRuntimeThreadId);
    } finally {
      setAgentBusy(false);
    }
  };

  const clearToolbarTranslate = () => {
    setToolbarTranslate((current) =>
      current.status === "idle" && !current.response && !current.error ? current : { status: "idle", response: "" }
    );
  };

  const runSelectionToolbarTranslate = async (selection: AgentSelection) => {
    if (!data || !selection.text) return;
    const api = apiSettings;
    const targetLanguage = resolveTranslationTarget(selection.text);
    const anchor = toolbarTranslateAnchorFromSelection(selection);
    if (!api.baseUrl.trim() || !api.apiKey.trim() || !api.model.trim()) {
      setToolbarTranslate({
        status: "error",
        response: "",
        error: t("app.translationApiIncomplete"),
        anchor
      });
      return;
    }

    setToolbarTranslate({ status: "loading", response: "", anchor });
    try {
      const result = await window.informio.translateSelection({
        provider: api.provider,
        baseUrl: api.baseUrl,
        apiKey: api.apiKey,
        model: api.model,
        targetLanguage,
        text: selection.text
      });
      setToolbarTranslate({ status: "done", response: result.content.trim(), anchor });
    } catch (error) {
      setToolbarTranslate({
        status: "error",
        response: "",
        error: error instanceof Error ? error.message : String(error),
        anchor
      });
    }
  };

  if (!data || !activeAgent) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-500">
        <div className="px-6 text-center">
          <div>{loadError ? t("app.startFailed") : t("app.loading")}</div>
          {loadError ? <div className="mt-3 max-w-xl whitespace-pre-wrap text-[12px] font-medium leading-6 text-red-600">{loadError}</div> : null}
        </div>
      </div>
    );
  }

  const leftOpen = data.settings.appearance.leftPanel === "expanded";
  const rightOpen = data.settings.appearance.rightPanel === "expanded";
  const leftPanelWidth = clamp(data.settings.appearance.leftPanelWidth, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH);
  const rightPanelWidth = clamp(data.settings.appearance.rightPanelWidth, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH);
  const isSettingsWindow = window.location.hash === "#settings";
  const showWindowControls = appInfo.platform === "win32";
  const shellStyle = buildShellStyle(data.settings.appearance);
  const lineCount = activeOpenDoc ? countLines(activeOpenDoc.markdown) : 0;
  const activePaneViewMode = editorViewModes[activePaneId] ?? "rich-text";
  const canToggleMarkdownSource = Boolean(activeOpenDoc) && !isEmbeddableAssetDocument(activeOpenDoc);
  const canExportActiveDocument = isWritableTextDocument(activeOpenDoc);
  const toggleActivePaneViewMode = () => {
    if (!canToggleMarkdownSource) return;
    setEditorViewModes((current) => ({
      ...current,
      [activePaneId]: current[activePaneId] === "source" ? "rich-text" : "source"
    }));
  };
  const toggleBottomSidebar = (mode: SidebarMode) => {
    const nextPanel = leftOpen && sidebarMode === mode ? "collapsed" : "expanded";
    setSidebarMode(mode);
    updateSettings({
      ...data.settings,
      appearance: { ...data.settings.appearance, leftPanel: nextPanel }
    });
  };
  const shortcutLabel = (id: string) => {
    const accelerator = getShortcutAccelerator(data.settings.shortcuts.bindings, id);
    return accelerator ? acceleratorToDisplay(accelerator, shortcutDisplayPlatform) : undefined;
  };
  const commandPaletteItems: CommandPaletteItem[] = [
    { id: "file:new", scope: "system", title: t("commands.newDocument"), shortcut: shortcutLabel("file.new"), keywords: t("commands.newDocumentKeywords"), run: () => runAppCommand("file:new") },
    { id: "file:open", scope: "system", title: t("commands.openFile"), shortcut: shortcutLabel("file.open"), keywords: t("commands.openFileKeywords"), run: () => runAppCommand("file:open") },
    { id: "workspace:open", scope: "system", title: t("commands.openProject"), shortcut: shortcutLabel("workspace.open"), keywords: t("commands.openProjectKeywords"), run: () => runAppCommand("workspace:open") },
    { id: "settings:open", scope: "system", title: t("commands.openSettings"), shortcut: shortcutLabel("settings.open"), keywords: t("commands.openSettingsKeywords"), run: () => runAppCommand("settings:open") },
    ...(canExportActiveDocument
      ? [
          {
            id: "file:export-html",
            scope: "system" as const,
            title: t("commands.exportHtml", { name: (activeOpenDoc?.title ?? t("files.untitled")).replace(/\.[^.]+$/, "") }),
            keywords: t("commands.exportHtmlKeywords"),
            run: () => runAppCommand("file:export-html")
          },
          {
            id: "file:export-pdf",
            scope: "system" as const,
            title: t("commands.exportPdf", { name: (activeOpenDoc?.title ?? t("files.untitled")).replace(/\.[^.]+$/, "") }),
            keywords: t("commands.exportPdfKeywords"),
            run: () => runAppCommand("file:export-pdf")
          }
        ]
      : []),
    {
      id: "view:left",
      scope: "system",
      title: leftOpen ? t("commands.hideFileSidebar") : t("commands.showFileSidebar"),
      keywords: t("commands.toggleFileSidebarKeywords"),
      run: () =>
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, leftPanel: leftOpen ? "collapsed" : "expanded" }
        })
    },
    {
      id: "view:right-agent",
      scope: "system",
      title: rightOpen && rightPanelMode === "agent" ? t("commands.hideAgentSession") : t("commands.showAgentSession"),
      keywords: t("commands.toggleAgentSessionKeywords"),
      run: () => toggleRightTool("agent")
    },
    {
      id: "view:right-browser",
      scope: "system",
      title: activeWorkspaceTab?.kind === "browser" ? t("commands.hideBrowser") : t("commands.showBrowser"),
      keywords: t("commands.toggleBrowserKeywords"),
      run: () => toggleBrowser()
    },
    {
      id: "file:close-workspace",
      scope: "system",
      title: t("commands.collapseWritingPanels"),
      keywords: t("commands.collapseWritingPanelsKeywords"),
      run: () => runAppCommand("file:close-workspace")
    }
  ];
  const normalizedWorkspaceLayout = normalizeWorkspaceLayout(
    workspaceLayout ?? (openDocuments[0] ? createDocumentLeaf(openDocuments[0].id) : null),
    (documentId) => documentsById.has(documentId)
  );
  const workspaceLeafCount = countWorkspaceLeaves(normalizedWorkspaceLayout);

  const isWorkspaceTabActive = (tab: WorkspaceTabRef) =>
    activeWorkspaceTab?.kind === tab.kind && activeWorkspaceTab.id === tab.id;

  const renderAgentPanel = (panelWidth?: number) => (
    <AgentPanel
      providers={data.settings.agents}
      provider={activeAgent}
      connection={activeConnection}
      conversations={providerAgentConversations}
      enabled={data.settings.agentRuntime.enabled}
      currentModel={activeModel}
      availableModels={activeModels}
      chatFontSize={data.settings.appearance.chatFontSize}
      onConnect={() => connectAgent()}
      onSend={sendAgentSession}
      onCancel={cancelAgentSession}
      onNewConversation={startNewAgentConversation}
      onSelectConversation={selectAgentConversation}
      onDeleteConversation={deleteAgentConversation}
      onSelectProvider={(providerId) =>
        updateSettings({ ...data.settings, activeAgentId: providerId, toolbarAgentId: providerId })
      }
      onApprovalResponse={respondAgentApproval}
      onOpenActionPath={openActionPath}
      onModelChange={updateActiveAgentModel}
      onOpenSettings={() => {
        window.localStorage.setItem("informio-settings-section", "agent");
        window.informio.openSettings();
      }}
      width={panelWidth}
    />
  );

  const renderWorkspaceLeaf = (leaf: WorkspaceLeafNode) => {
    if (leaf.content.type === "browser") {
      return (
        <BrowserPanel
          paneId={leaf.id}
          tabId={leaf.content.tabId}
          initialUrl={browserTabMeta[leaf.content.tabId]?.url}
          showPaneControls={workspaceLeafCount > 1}
          onClosePane={() => closeWorkspacePane(leaf.id)}
          onMaximizePane={() => expandPaneToSingle(leaf.id)}
          onTabMetaChange={updateBrowserTabMeta}
        />
      );
    }
    if (leaf.content.type === "agent") {
      return renderAgentPanel();
    }
    const document = documentsById.get(leaf.content.documentId);
    if (!document) {
      return <EmptyEditorPane defaultFolder={data.settings.shortcuts.quickFolder} onCreate={createDefaultMarkdownDocument} />;
    }
    return (
      <EditorSurfaceErrorBoundary documentId={document.id} onResetSelection={() => setAgentSelection(null)}>
        {documentConflicts.has(document.id) ? (
          <button
            type="button"
            className="mx-auto mt-2 flex w-[min(760px,calc(100%-32px))] shrink-0 items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[12px] font-semibold text-amber-900 shadow-sm"
            onClick={() => openDocumentConflict(document.id)}
          >
            <span className="min-w-0 truncate">{t("app.conflictBanner")}</span>
            <span className="shrink-0 text-amber-700">{t("app.view")}</span>
          </button>
        ) : null}
        <EditorPane
          key={`${leaf.id}-${document.id}-${documentRefreshTokens[document.id] ?? 0}`}
          paneId={leaf.id}
          documentId={document.id}
          onOutlineJumpHandled={handleOutlineJumpHandled}
          onChange={updateDocument}
          onOpenInternalLink={(documentId, sourcePaneId) => {
            openDocumentInLinkedPane(sourcePaneId, documentId);
          }}
          onCreateInternalLink={createLinkedDocument}
          onSelection={handleAgentSelection}
          onCompositionChange={handleEditorCompositionChange}
          onDirtyChange={setDocumentDirtyState}
          onFilePathChange={handleBinaryDocumentPathChange}
          onRequestSaveAs={requestBinaryDocumentSaveAs}
          toolbarEnabled
          onTranslateSelection={runSelectionToolbarTranslate}
          onClearToolbarTranslate={clearToolbarTranslate}
        />
      </EditorSurfaceErrorBoundary>
    );
  };

  if (isSettingsWindow) {
    return (
      <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
        <div
          className={cn("app-shell h-screen overflow-hidden", `theme-${data.settings.appearance.theme}`, showWindowControls && "is-frameless")}
          style={shellStyle}
        >
          <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[13px] text-[var(--text-muted)]">{t("app.loadingSettings")}</div>}>
            <SettingsView
              settings={data.settings}
              onChange={updateSettings}
              onCheckAgents={checkAgents}
              onCheckApiModels={checkApiModels}
              showWindowControls={showWindowControls}
            />
          </Suspense>
        </div>
      </Tooltip.Provider>
    );
  }

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
      <div
        className={cn("app-shell h-screen overflow-hidden", `theme-${data.settings.appearance.theme}`, showWindowControls && "is-frameless")}
        style={shellStyle}
      >
        <DocumentConflictDialog
          conflict={activeConflict}
          document={activeConflictDocument}
          onClose={() => setActiveConflictDocumentId(null)}
          onKeepLocal={(documentId) => {
            void keepLocalConflictVersion(documentId);
          }}
          onUseExternal={useExternalConflictVersion}
        />
        <div className="flex h-full flex-col overflow-hidden">
	          <header className="top-bar drag-region flex h-[42px] shrink-0 items-center">
		            <div
		              className={cn("titlebar-left h-full shrink-0", leftOpen ? undefined : "w-[86px]")}
		              style={leftOpen ? { width: leftPanelWidth + 1 } : undefined}
		            />
	            <div className="flex h-full min-w-0 flex-1 items-center px-2">
              <div
                ref={tabsScrollRef}
                className="document-tabs-scroll no-drag flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden"
              >
                {openWorkspaceTabs.map((tab) => {
                  if (tab.kind === "document") {
                    const doc = documentsById.get(tab.id);
                    if (!doc) return null;
                    const active = isWorkspaceTabActive(tab);
                    const dirty = dirtyDocumentIds.has(doc.id);
                    const conflicted = documentConflicts.has(doc.id);
                    return (
                      <div
                        key={`document-${doc.id}`}
                        ref={active ? activeTabRef : undefined}
                        draggable
                        onDragStart={(event) => startDocumentDrag(doc.id, event)}
                        className={cn(
                          "group relative flex h-7 min-w-28 max-w-40 shrink-0 items-center rounded-md text-[12px] font-semibold text-[var(--text-muted)] transition-[background-color,transform,color]",
                          active && "surface-card text-[var(--text-main)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectDocument(doc.id)}
                          className="no-drag flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 pr-7 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                        >
                          {conflicted ? (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                              title={t("documentconflict.mergeChanges")}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openDocumentConflict(doc.id);
                              }}
                            />
                          ) : null}
                          {dirty ? <span className="h-2 w-2 rounded-full bg-emerald-600" /> : null}
                          <span className="truncate">{doc.title}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Close ${doc.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void closeDocumentTab(doc.id);
                          }}
                          className={cn(
                            "no-drag absolute right-1 grid h-5 w-5 place-items-center rounded-md text-[var(--text-muted)] opacity-0 transition-[background-color,opacity,transform,color] active:scale-95",
                            "hover:bg-slate-200/60 hover:text-[var(--text-main)] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 group-hover:opacity-100",
                          )}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  }
                  const active = isWorkspaceTabActive(tab);
                  const label = browserTabLabel(browserTabMeta[tab.id], t("browser.newTab"));
                  return (
                    <div
                      key={`browser-${tab.id}`}
                      ref={active ? activeTabRef : undefined}
                      className={cn(
                        "group relative flex h-7 min-w-28 max-w-40 shrink-0 items-center rounded-md text-[12px] font-semibold text-[var(--text-muted)] transition-[background-color,transform,color]",
                        active && "surface-card text-[var(--text-main)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectBrowserTab(tab.id)}
                        className="no-drag flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 pr-7 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                      >
                        <Globe size={12} className="shrink-0 text-slate-400" />
                        <span className="truncate">{label}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t("browser.closeTab")}
                        onClick={(event) => {
                          event.stopPropagation();
                          closeBrowserTab(tab.id);
                        }}
                        className={cn(
                          "no-drag absolute right-1 grid h-5 w-5 place-items-center rounded-md text-[var(--text-muted)] opacity-0 transition-[background-color,opacity,transform,color] active:scale-95",
                          "hover:bg-slate-200/60 hover:text-[var(--text-main)] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 group-hover:opacity-100",
                        )}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
	            </div>
              <WindowControls visible={showWindowControls} />
	          </header>

	          <div className="flex min-h-0 flex-1">
	            {leftOpen ? (
	              sidebarMode === "files" ? (
	                <ErrorBoundary name={t("app.fileList")}>
	                  <FileList
	                    onSelect={selectDocument}
	                    onCreate={createDocument}
	                    onCreateFolder={createFolder}
	                    onFileAction={(input) => { void executeFileSystemAction(input); }}
	                    onImportExternalFiles={(sourcePaths, destinationFolderPath) => { void importExternalFiles(sourcePaths, destinationFolderPath); }}
	                    onRenameProject={renameProject}
	                    onToggleProjectPinned={toggleProjectPinned}
	                    onRemoveProject={(path) => window.informio.removeProject(path).then(setData)}
	                    onDocumentDragStart={startDocumentDrag}
	                  />
	                </ErrorBoundary>
	              ) : sidebarMode === "outline" ? (
	                activeOpenDoc ? (
	                  <OutlineList document={activeOpenDoc} width={leftPanelWidth} onJump={(item) => jumpToOutlineItem(activeOpenDoc.id, item)} />
	                ) : (
	                  <aside className="side-rail flex h-full shrink-0 items-center justify-center border-r px-4 text-[12px] font-semibold text-[var(--text-muted)]" style={{ width: leftPanelWidth }}>
	                    {t("editor.noDocument")}
	                  </aside>
	                )
	              ) : (
	                <PropertiesList
	                  documents={data.documents}
	                  activeDocumentId={activeOpenDoc?.id ?? ""}
	                  width={leftPanelWidth}
	                  onSelect={selectDocument}
	                />
	              )
	            ) : null}
	            {leftOpen ? <PanelResizeHandle label="Resize left panel" onPointerDown={(event) => startPanelResize("left", event)} /> : null}

	            <section
	              ref={workspaceSectionRef}
	              className="relative flex min-w-0 flex-1"
	              onDragOver={handleWorkspaceDragOver}
	            >
	              <WorkspaceDropOverlay containerRef={workspaceSectionRef} dropTarget={dropTarget} />
	              <div className="relative flex min-w-0 flex-1 flex-col">
	                {rightOpen ? (
	                  <div
	                    role="separator"
	                    aria-orientation="vertical"
	                    aria-label="Resize right panel"
	                    className="absolute right-0 top-0 z-20 h-full w-3 cursor-col-resize touch-none"
	                    onPointerDown={(event) => startPanelResize("right", event)}
	                  />
	                ) : null}
	                {normalizedWorkspaceLayout ? (
	                  <WorkspaceSplitView
	                    layout={normalizedWorkspaceLayout}
	                    activePaneId={activePaneId}
	                    dropTarget={dropTarget}
	                    onActivatePane={activatePane}
	                    onMaximizePane={expandPaneToSingle}
	                    onClosePane={closeWorkspacePane}
	                    onDropTargetChange={setDropTarget}
	                    onDrop={(target, dataTransfer) => handleWorkspaceDrop(target, dataTransfer)}
	                    onResizeSplit={(path, ratio) =>
	                      setWorkspaceLayout((layout) => (layout ? updateSplitRatioAtPath(layout, path, ratio) : layout))
	                    }
	                    renderLeaf={(leaf) => renderWorkspaceLeaf(leaf)}
	                  />
	                ) : (
	                  <EmptyEditorPane defaultFolder={data.settings.shortcuts.quickFolder} onCreate={createDefaultMarkdownDocument} />
	                )}
	              </div>
	              {rightOpen ? (
	                <>
	                  <PanelResizeHandle label="Resize right panel" onPointerDown={(event) => startPanelResize("right", event)} />
	                  <ErrorBoundary name={t("app.agentPanel")}>
	                    {renderAgentPanel(rightPanelWidth)}
	                  </ErrorBoundary>
	                </>
	              ) : null}
	            </section>
	          </div>
	          <footer className="status-bar flex h-8 shrink-0 items-center justify-between gap-3 px-3 font-mono text-[11px] text-[var(--text-muted)]">
	            <div className="flex items-center gap-1">
	              <OfflineIndicator />
	              <IconButton
	                label={t("app.files")}
	                className="h-6 w-6"
	                pressed={sidebarMode === "files" && leftOpen}
	                onClick={() => toggleBottomSidebar("files")}
	              >
	                <Folder size={14} />
	              </IconButton>
	              <IconButton
	                label={t("app.outline")}
	                className="h-6 w-6"
	                pressed={sidebarMode === "outline" && leftOpen}
	                onClick={() => toggleBottomSidebar("outline")}
	              >
	                <LayoutList size={14} />
	              </IconButton>
	              <IconButton
	                label={t("app.properties")}
	                className="h-6 w-6"
	                pressed={sidebarMode === "properties" && leftOpen}
	                onClick={() => toggleBottomSidebar("properties")}
	              >
	                <Bookmark size={14} />
	              </IconButton>
	              <IconButton
	                label={t("app.addProject")}
	                className="h-6 w-6"
	                onClick={() =>
	                  window.informio.addProject().then((next) => {
	                    if (next) applyMergedAppData(next);
	                  })
	                }
	              >
	                <FolderPlus size={14} />
	              </IconButton>
	              <IconButton label={t("settings.title")} className="h-6 w-6" onClick={() => window.informio.openSettings()}>
	                <Settings size={14} />
	              </IconButton>
	            </div>
	            <div className="flex shrink-0 items-center gap-3">
	              {!data.settings.appearance.autoHideStatusBar ? (
	                <>
		                  <span>{t("app.wordCount", { count: activeOpenDoc ? countWords(activeOpenDoc.markdown) : 0 })}</span>
		                  <span>{t("app.characterCount", { count: activeOpenDoc ? countCharacters(activeOpenDoc.markdown) : 0 })}</span>
	                  <span>{t("app.lineCount", { count: lineCount })}</span>
	                </>
	              ) : null}
	              <IconButton
	                label={activePaneViewMode === "source" ? t("app.switchToRichText") : t("app.switchToMarkdownSource")}
	                className="h-6 w-6"
	                pressed={activePaneViewMode === "source"}
	                disabled={!canToggleMarkdownSource}
	                onClick={toggleActivePaneViewMode}
	              >
	                <Code2 size={14} />
	              </IconButton>
	              <IconButton
	                label={activeWorkspaceTab?.kind === "browser" ? t("commands.hideBrowser") : t("commands.showBrowser")}
	                className="h-6 w-6"
	                pressed={activeWorkspaceTab?.kind === "browser"}
	                draggable
	                onDragStart={(event) => startToolDrag("browser", event)}
	                onClick={() => toggleBrowser()}
	              >
	                <Globe size={14} />
	              </IconButton>
	              <IconButton
	                label={rightOpen && rightPanelMode === "agent" ? t("commands.hideAgentSession") : t("commands.showAgentSession")}
	                className="h-6 w-6"
	                pressed={rightOpen && rightPanelMode === "agent"}
	                draggable
	                onDragStart={(event) => startToolDrag("agent", event)}
	                onClick={() => toggleRightTool("agent")}
	              >
	                <Bot size={14} />
	              </IconButton>
	            </div>
	          </footer>
        </div>
        <CommandPalette open={commandPaletteOpen} commands={commandPaletteItems} onClose={() => setCommandPaletteOpen(false)} />
      </div>
    </Tooltip.Provider>
  );
}
