import { Component, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { JSONContent } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DOMParser as ProseMirrorDOMParser, DOMSerializer, Fragment as ProseMirrorFragment } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import SubscriptExtension from "@tiptap/extension-subscript";
import SuperscriptExtension from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import UnderlineExtension from "@tiptap/extension-underline";
import katex from "katex";
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
  Github,
  FolderPlus,
  FolderRoot,
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
  Plus,
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
  AppInfo,
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
  renderTableToGfm,
  renderJsonNodeToHtml,
  tableJsonUsesRichMarkdown,
  renderRichTableToMarkdown,
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
  ApiCheckState,
  AgentSessionMessage,
  EditorPaneState,
  EditorViewMode,
  SplitDirection,
  EditorDropZone,
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
import { TranslationResultText } from "./components/TranslationResultText";
import {
  clipboardPlainTextForPaste,
  htmlFragmentHasContent,
  insertTextIntoTextarea,
  sanitizeHtmlFragmentForPaste,
  stripClipboardFragmentMarkers
} from "./lib/clipboardPaste";
import { normalizeAgentMathMarkdown } from "./lib/agentMathMarkdown";
import {
  PdfBlockView as UnifiedPdfBlockView,
  PdfEditorContext as UnifiedPdfEditorContext,
  PdfViewerSurface as UnifiedPdfViewerSurface
} from "./pdfSurface";
import type {
  PdfEditorContextValue as UnifiedPdfEditorContextValue
} from "./pdfSurface";
import "katex/dist/katex.min.css";

import { getThemeSwatchStyle, isDarkColor, settingsNav, mergeFontOptions, lastToolbarSelectionText, setLastToolbarSelectionText, syncDocumentAppearanceVariables, buildShellStyle, buildConfiguredFontStack, buildUiFontStack } from "./lib/settings-helpers";
import { InsertToolbar, insertToolbarActions, markSelectionToolbarInteraction, isSelectionToolbarInteractionActive } from "./components/InsertToolbar";

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
import { CommandPalette } from "./components/CommandPalette";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { SettingsView } from "./components/SettingsView";
import { DocumentConflictDialog, mergeMarkdownWithBase, buildConflictDiffLines } from "./components/DocumentConflictDialog";
import { IconButton } from "./components/IconButton";
import { WindowControls } from "./components/WindowControls";
import { PanelResizeHandle } from "./components/PanelResizeHandle";
import { PropertiesList } from "./components/PropertiesList";
import { normalizeEditorPanes, sameAgentSelection, countWords, countCharacters, countLines, getDocumentOutline, buildOutlineTree, formatRelative, clamp, markdownToStatusText, buildEditorTextSearchIndex, findNextTextMatch } from "./components/EditorPane";
import { buildFileTree, filterFileTree, documentStructureKey, documentLookupKey, DOCUMENT_DRAG_MIME, TREE_ITEM_DRAG_MIME, FOLDER_DRAG_MIME, serializeTreeDragPayload, parseTreeDragPayload, isInternalDocumentDrag, isInternalTreeDrag, isExternalFileDrag, filePathForFile, dataTransferFilePaths } from "./components/FileList";


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
          <p className="text-[13px] font-semibold text-slate-600">编辑器加载失败</p>
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white"
            onClick={() => { this.setState({ hasError: false }); this.props.onResetSelection(); }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentSessionMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingNewConversation, setPendingNewConversation] = useState(false);
  const [agentSelection, setAgentSelection] = useState<AgentSelection | null>(null);
  const [outlineJumpRequest, setOutlineJumpRequest] = useState<OutlineJumpRequest | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [checkingAgents, setCheckingAgents] = useState(false);
  const [checkingApiModels, setCheckingApiModels] = useState(false);
  const [apiCheckState, setApiCheckState] = useState<ApiCheckState>({ status: "idle" });
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: "Informio",
    version: "",
    platform: navigator.platform.toLowerCase().includes("win") ? "win32" : "darwin",
    githubUrl: "",
    iconDataUrl: undefined
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("files");
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>([]);
  const [editorPanes, setEditorPanes] = useState<EditorPaneState[]>([]);
  const [activePaneId, setActivePaneId] = useState<EditorPaneState["id"]>("main");
  const [editorViewModes, setEditorViewModes] = useState<Record<EditorPaneState["id"], EditorViewMode>>({
    main: "rich-text",
    secondary: "rich-text"
  });
  const [documentRefreshTokens, setDocumentRefreshTokens] = useState<Record<string, number>>({});
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("horizontal");
  const [paneRatio, setPaneRatio] = useState(0.5);
  const [dropZone, setDropZone] = useState<EditorDropZone | null>(null);
  const [dirtyDocumentIds, setDirtyDocumentIds] = useState<Set<string>>(() => new Set());
  const [documentConflicts, setDocumentConflicts] = useState<Map<string, DocumentConflict>>(() => new Map());
  const [activeConflictDocumentId, setActiveConflictDocumentId] = useState<string | null>(null);
  const [fileListCreationSignal, setFileListCreationSignal] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [toolbarTranslate, setToolbarTranslate] = useState<UnifiedToolbarTranslateState>({ status: "idle", response: "" });
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

  useEffect(() => {
    if (!data) return;
    syncDocumentAppearanceVariables(data.settings.appearance);
  }, [data?.settings.appearance]);

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
            message: `正在启动 ${agent.name}...`,
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
                message: error instanceof Error ? error.message : "Agent 启动失败。",
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
        setLoadError(message || "无法加载应用数据。");
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
    setOpenDocumentIds((ids) => {
      const validIds = ids.filter((id) => data.documents.some((doc) => doc.id === id));

      if (!initializedTabsRef.current) {
        initializedTabsRef.current = true;
        const seeded = data.activeDocumentId
          ? [data.activeDocumentId, ...validIds, ...data.documents.slice(0, 2).map((doc) => doc.id)].filter(Boolean)
          : validIds;
        const nextIds = Array.from(new Set(seeded));
        return nextIds.length === ids.length && nextIds.every((id, index) => id === ids[index]) ? ids : nextIds;
      }

      if (activeDocumentChanged && data.activeDocumentId && !validIds.includes(data.activeDocumentId)) {
        return [data.activeDocumentId, ...validIds];
      }

      if (validIds.includes(data.activeDocumentId) || !activeDocumentChanged) {
        return validIds.length === ids.length && validIds.every((id, index) => id === ids[index]) ? ids : validIds;
      }

      return validIds;
    });
    lastActiveDocumentIdRef.current = data.activeDocumentId;
  }, [data?.activeDocumentId, data?.documents]);

  const activeAgent = useMemo(
    () => data?.settings.agents.find((agent) => agent.id === data.settings.activeAgentId) ?? data?.settings.agents[0],
    [data]
  );
  const workspaceScopeId = useMemo(
    () => (data ? buildWorkspaceScopeId({ projects: data.projects ?? [], workspacePath: data.workspacePath }) : "global:empty"),
    [data?.projects, data?.workspacePath]
  );
  const workspaceLabel = useMemo(
    () => (data ? buildWorkspaceLabel({ projects: data.projects ?? [], workspacePath: data.workspacePath }) : "未命名工作区"),
    [data?.projects, data?.workspacePath]
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
  const openDocuments = useMemo(
    () => openDocumentIds.map((id) => documentsById.get(id)).filter((doc): doc is InformioDocument => Boolean(doc)),
    [documentsById, openDocumentIds]
  );
  const activePane = editorPanes.find((pane) => pane.id === activePaneId) ?? editorPanes[0];
  const activeOpenDoc = useMemo(
    () => (activePane ? documentsById.get(activePane.documentId) : undefined) ?? openDocuments.find((doc) => doc.id === activePane?.documentId) ?? openDocuments[0],
    [activePane, documentsById, openDocuments]
  );
  const activeConflict = activeConflictDocumentId ? documentConflicts.get(activeConflictDocumentId) ?? null : null;
  const activeConflictDocument = activeConflict ? documentsById.get(activeConflict.documentId) : undefined;

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeOpenDoc?.id, openDocuments.length]);

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
  }, [openDocuments.length]);

  useEffect(() => {
    if (!data) return;
    setEditorPanes((panes) => {
      if (initializedTabsRef.current && openDocumentIds.length === 0) return panes.length ? [] : panes;
      const normalized = normalizeEditorPanes(panes, (documentId) => data.documents.some((doc) => doc.id === documentId));
      if (!normalized.length) return data.activeDocumentId ? [{ id: "main", documentId: data.activeDocumentId }] : [];
      if (normalized.length === 1 && splitDirection !== "horizontal") setSplitDirection("horizontal");
      return normalized;
    });
  }, [data?.activeDocumentId, data?.documents, openDocumentIds.length, splitDirection]);

  useEffect(() => {
    if (!editorPanes.some((pane) => pane.id === activePaneId)) {
      setActivePaneId(editorPanes[0]?.id ?? "main");
    }
  }, [activePaneId, editorPanes]);

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
      throw new Error("文档存在外部更改冲突，请先选择保留本地版本或采用外部版本。");
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
    sourcePaneId: EditorPaneState["id"],
    documentId: string,
    options?: { forceRichText?: boolean }
  ): EditorPaneState["id"] | null => {
    if (!data || !documentsById.has(documentId)) return null;
    const normalized = normalizeEditorPanes(editorPanes, (paneDocumentId) => documentsById.has(paneDocumentId));
    const sourcePane =
      normalized.find((pane) => pane.id === sourcePaneId) ??
      normalized.find((pane) => pane.id === activePaneId) ??
      normalized[0] ??
      (data.activeDocumentId ? { id: "main" as const, documentId: data.activeDocumentId } : null);
    if (!sourcePane) return null;
    if (sourcePane.documentId === documentId) {
      setActivePaneId(sourcePane.id);
      return sourcePane.id;
    }
    const targetPaneId: EditorPaneState["id"] = sourcePane.id === "main" ? "secondary" : "main";
    const nextPanes =
      normalized.length <= 1
        ? normalizeEditorPanes([
            { id: "main", documentId: sourcePane.documentId },
            { id: "secondary", documentId }
          ])
        : normalizeEditorPanes(
            normalized.map((pane) => (pane.id === targetPaneId ? { ...pane, documentId } : pane))
          );
    setSplitDirection("horizontal");
    setOpenDocumentIds((ids) => (ids.includes(documentId) ? ids : [...ids, documentId]));
    setEditorPanes(nextPanes);
    if (options?.forceRichText) {
      setEditorViewModes((current) => ({ ...current, [targetPaneId]: "rich-text" }));
    }
    setActivePaneId(targetPaneId);
    const next = { ...data, activeDocumentId: documentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, documentId);
    return targetPaneId;
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

  const activatePane = (pane: EditorPaneState) => {
    if (!data) return;
    setActivePaneId(pane.id);
    if (data.activeDocumentId === pane.documentId) return;
    const next = { ...data, activeDocumentId: pane.documentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, pane.documentId);
  };

  const expandPaneToSingle = (pane: EditorPaneState) => {
    if (!data) return;
    setEditorPanes([{ id: "main", documentId: pane.documentId }]);
    setActivePaneId("main");
    setPaneRatio(0.5);
    setDropZone(null);
    if (data.activeDocumentId === pane.documentId) return;
    const next = { ...data, activeDocumentId: pane.documentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, pane.documentId);
  };

  const selectDocument = (id: string) => {
    if (!data) return;
    setOpenDocumentIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setEditorPanes((panes) => {
      if (!panes.length) return [{ id: "main", documentId: id }];
      const targetPaneId = panes.some((pane) => pane.id === activePaneId) ? activePaneId : panes[0].id;
      const nextPanes = normalizeEditorPanes(panes.map((pane) => (pane.id === targetPaneId ? { ...pane, documentId: id } : pane)));
      setActivePaneId(nextPanes.length === 1 ? "main" : targetPaneId);
      return nextPanes;
    });
    const next = { ...data, activeDocumentId: id };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, id);
  };

  const applyClosedDocumentTab = (id: string, currentData: AppData, currentTabs: string[]) => {
    const closingIndex = currentTabs.indexOf(id);
    const nextTabs = currentTabs.filter((item) => item !== id);
    const nextActiveDocumentId =
      currentData.activeDocumentId === id && nextTabs.length
        ? (currentTabs[closingIndex + 1] ?? currentTabs[closingIndex - 1] ?? nextTabs[0])
        : currentData.activeDocumentId === id
          ? ""
          : currentData.activeDocumentId;

    setOpenDocumentIds(nextTabs);
    setEditorPanes((panes) => {
      const remaining = panes.filter((pane) => pane.documentId !== id);
      const replacementId = nextTabs.includes(nextActiveDocumentId) ? nextActiveDocumentId : nextTabs[0];
      if (!remaining.length && replacementId) return [{ id: "main", documentId: replacementId }];
      return normalizeEditorPanes(remaining);
    });
    setActivePaneId((current) => (current === "secondary" && nextTabs.length < 2 ? "main" : current));
    const next = { ...currentData, activeDocumentId: nextActiveDocumentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, nextActiveDocumentId);
  };

  const closeDocumentTab = async (id: string) => {
    const currentData = latestDataRef.current;
    if (!currentData) return;
    try {
      if (dirtyDocumentIdsRef.current.has(id)) {
        await saveDocumentsNow(currentData.documents, currentData.activeDocumentId, [id]);
      }
    } catch (error) {
      window.alert(error instanceof Error ? `保存失败，已取消关闭标签。\n${error.message}` : "保存失败，已取消关闭标签。");
      return;
    }
    applyClosedDocumentTab(id, latestDataRef.current ?? currentData, openDocumentIds);
  };

  const createDocument = async (folderPath?: string) => {
    setFileListCreationSignal((value) => value + 1);
    const next = folderPath ? await window.informio.createDocumentInFolder(folderPath) : await window.informio.createDocument();
    setOpenDocumentIds((ids) => [next.activeDocumentId, ...ids.filter((item) => item !== next.activeDocumentId)]);
    setEditorPanes((panes) =>
      panes.length
        ? normalizeEditorPanes(panes.map((pane) => (pane.id === activePaneId ? { ...pane, documentId: next.activeDocumentId } : pane)))
        : [{ id: "main", documentId: next.activeDocumentId }]
    );
    setActivePaneId((current) => (editorPanes.some((pane) => pane.id === current) ? current : "main"));
    applyMergedAppData(next);
  };

  const createDefaultMarkdownDocument = async () => {
    const next = await window.informio.createDefaultMarkdownDocument();
    setOpenDocumentIds((ids) => [next.activeDocumentId, ...ids.filter((item) => item !== next.activeDocumentId)]);
    setEditorPanes((panes) =>
      panes.length
        ? normalizeEditorPanes(panes.map((pane) => (pane.id === activePaneId ? { ...pane, documentId: next.activeDocumentId } : pane)))
        : [{ id: "main", documentId: next.activeDocumentId }]
    );
    setActivePaneId((current) => (editorPanes.some((pane) => pane.id === current) ? current : "main"));
    applyMergedAppData(next);
  };

  const createLinkedDocument = async (title: string) => {
    const next = await window.informio.createLinkedDocument(title);
    setOpenDocumentIds((ids) => [next.activeDocumentId, ...ids.filter((item) => item !== next.activeDocumentId)]);
    setEditorPanes((panes) =>
      panes.length
        ? normalizeEditorPanes(panes.map((pane) => (pane.id === activePaneId ? { ...pane, documentId: next.activeDocumentId } : pane)))
        : [{ id: "main", documentId: next.activeDocumentId }]
    );
    setActivePaneId((current) => (editorPanes.some((pane) => pane.id === current) ? current : "main"));
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

  const editorDropZoneFromEvent = (event: ReactDragEvent<HTMLElement>): EditorDropZone => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const distances: Array<[EditorDropZone, number]> = [
      ["left", x],
      ["right", rect.width - x],
      ["top", y],
      ["bottom", rect.height - y]
    ];
    return distances.sort((a, b) => a[1] - b[1])[0][0];
  };

  const applyEditorDrop = (documentId: string, zone: EditorDropZone) => {
    if (!data || !documentsById.has(documentId)) return;
    const direction: SplitDirection = zone === "left" || zone === "right" ? "horizontal" : "vertical";
    const targetPaneId: EditorPaneState["id"] = zone === "left" || zone === "top" ? "main" : "secondary";
    const existingPaneForDrop = normalizeEditorPanes(editorPanes, (paneDocumentId) => documentsById.has(paneDocumentId)).find((pane) => pane.documentId === documentId);
    const dropWillCollapse = Boolean(existingPaneForDrop && existingPaneForDrop.id !== targetPaneId);
    setOpenDocumentIds((ids) => (ids.includes(documentId) ? ids : [...ids, documentId]));
    setSplitDirection(direction);
    setEditorPanes((panes) => {
      const valid = normalizeEditorPanes(panes, (paneDocumentId) => documentsById.has(paneDocumentId));
      const currentDocumentId = activeOpenDoc?.id ?? data.activeDocumentId;
      if (!valid.length || !currentDocumentId) return [{ id: "main", documentId }];
      if (valid.length === 1) {
        if (valid[0].documentId === documentId) return valid;
        return targetPaneId === "main"
          ? [
              { id: "main", documentId },
              { id: "secondary", documentId: valid[0].documentId }
            ]
          : [
              { id: "main", documentId: valid[0].documentId },
              { id: "secondary", documentId }
            ];
      }

      const normalized = normalizeEditorPanes(valid);
      const target = normalized.find((pane) => pane.id === targetPaneId) ?? normalized[0];
      if (target.documentId === documentId) return normalizeEditorPanes(normalized);
      const other = normalized.find((pane) => pane.id !== target.id);
      if (other?.documentId === documentId) {
        return [{ id: "main", documentId }];
      }
      return normalizeEditorPanes(normalized.map((pane) => (pane.id === target.id ? { ...pane, documentId } : pane)));
    });
    setActivePaneId(dropWillCollapse ? "main" : targetPaneId);
    const next = { ...data, activeDocumentId: documentId };
    applyDataState(next);
    window.informio.saveDocuments(next.documents, documentId);
  };

  const startEditorPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startRatio = paneRatio;
    const startX = event.clientX;
    const startY = event.clientY;
    document.body.classList.add("is-resizing-panel");
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = splitDirection === "horizontal" ? moveEvent.clientX - startX : moveEvent.clientY - startY;
      const size = splitDirection === "horizontal" ? rect.width : rect.height;
      setPaneRatio(clamp(startRatio + delta / Math.max(1, size), 0.25, 0.75));
    };
    const onPointerUp = () => {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const executeFileSystemAction = async (input: FileSystemOperationInput) => {
    if (!data) return;
    if (input.action === "delete") {
      const confirmed = window.confirm(input.targetType === "folder" ? "删除这个文件夹及其下的文件？" : "删除这个文件？");
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
    setOpenDocumentIds((ids) => ids.filter((id) => next.documents.some((doc) => doc.id === id)));
    dirtyBaseMarkdownRef.current.clear();
    applyDirtyDocumentIds(new Set());
    if (saved.activeDocumentId !== next.activeDocumentId && next.documents.some((doc) => doc.id === next.activeDocumentId)) {
      setOpenDocumentIds((ids) => (ids.includes(next.activeDocumentId) ? ids : [next.activeDocumentId, ...ids]));
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

  const updateSettings = (settings: AppSettings) => {
    if (!data) return;
    applyDataState({ ...data, settings });
    window.informio.saveSettings(settings);
  };

  const saveActiveDocumentAs = async () => {
    if (!data || !activeOpenDoc) return;
    const next = await window.informio.saveActiveDocumentAs(data.documents, data.activeDocumentId);
    if (!next) return;
    applyMergedAppData(next);
    if (next.activeDocumentId) {
      setOpenDocumentIds((ids) => (ids.includes(next.activeDocumentId) ? ids : [next.activeDocumentId, ...ids]));
    }
  };

  const exportActiveDocument = async (format: "markdown" | "html" | "pdf") => {
    if (!data || !activeOpenDoc || !isWritableTextDocument(activeOpenDoc)) return;
    await window.informio.exportActiveDocument(data.documents, data.activeDocumentId, format);
  };

  const updateActiveAgentModel = (model: string) => {
    if (!data || !activeAgent) return;
    const settings = {
      ...data.settings,
      agents: data.settings.agents.map((agent) => (agent.id === activeAgent.id ? { ...agent, model } : agent))
    };
    updateSettings(settings);
  };

  const checkApiModels = async () => {
    if (!data) return;
    const api = apiSettings;
    if (!api.baseUrl.trim() || !api.apiKey.trim()) {
      setApiCheckState({ status: "error", error: "请先填写 base_url 和 api_key。" });
      return;
    }

    setCheckingApiModels(true);
    setApiCheckState({ status: "loading", message: "正在检测可用模型..." });
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
      setApiCheckState({ status: "done", message: `检测到 ${result.models.length} 个可用模型。` });
    } catch (error) {
      setApiCheckState({
        status: "error",
        error: error instanceof Error ? error.message : "模型检测失败，请检查 API 配置。"
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
        if (activeOpenDoc) void saveDocumentsNow(data.documents, data.activeDocumentId);
        return true;
      case "file:save-as":
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
      window.informio.saveSettings({
        ...data.settings,
        appearance: {
          ...data.settings.appearance,
          [key]: nextWidth
        }
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
        message: existing?.status === "connected" ? "正在重新建立 Agent 连接..." : "正在启动 Agent...",
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
          message: `正在检测 ${agent.name}...`,
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
    const messageText = `${text.trim() || "请处理这些附件。"}${attachmentsMarkdown(attachments)}`;
    const currentDoc = activeOpenDoc;
    const selection = agentSelection?.documentId === currentDoc?.id ? agentSelection : null;
    const references = resolveReferencedDocumentsFromMessage(messageText);
    const nowIso = new Date().toISOString();
    const existingConversation = activeConversation;
    const conversationId = existingConversation?.id ?? `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const baseConversationMessages = existingConversation?.messages ?? buildConversationMessagesFromSession(agentMessages);
    const baseRuntimeThreadId = existingConversation?.runtimeThreadId;
    const baseCreatedAt = existingConversation?.createdAt ?? nowIso;
    const baseTitle = existingConversation?.title ?? createConversationTitle(messageText);
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
      error: data.settings.agentRuntime.enabled ? undefined : "Agent 未启用。请在设置 → Agent 中打开“启用 Agent”。",
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
        error: "翻译 API 还没配置完成。请在设置 → API 填写 base_url、api_key，并检测后选择一个模型。",
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
          <div>{loadError ? "Informio 启动失败" : "Loading Informio"}</div>
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
    { id: "file:new", scope: "system", title: "新建文档", shortcut: shortcutLabel("file.new"), keywords: "新建 文档 new document", run: () => runAppCommand("file:new") },
    { id: "file:open", scope: "system", title: "打开文件", shortcut: shortcutLabel("file.open"), keywords: "打开 文件 open files", run: () => runAppCommand("file:open") },
    { id: "workspace:open", scope: "system", title: "打开项目", shortcut: shortcutLabel("workspace.open"), keywords: "打开 工作区 项目 workspace project", run: () => runAppCommand("workspace:open") },
    { id: "settings:open", scope: "system", title: "打开设置", shortcut: shortcutLabel("settings.open"), keywords: "设置 settings", run: () => runAppCommand("settings:open") },
    ...(canExportActiveDocument
      ? [
          {
            id: "file:export-html",
            scope: "system" as const,
            title: `导出 ${(activeOpenDoc?.title ?? "Untitled").replace(/\.[^.]+$/, "")}.HTML`,
            keywords: "导出 html export save 当前文档",
            run: () => runAppCommand("file:export-html")
          },
          {
            id: "file:export-pdf",
            scope: "system" as const,
            title: `导出 ${(activeOpenDoc?.title ?? "Untitled").replace(/\.[^.]+$/, "")}.PDF`,
            keywords: "导出 pdf export save 当前文档",
            run: () => runAppCommand("file:export-pdf")
          }
        ]
      : []),
    {
      id: "view:left",
      scope: "system",
      title: leftOpen ? "隐藏文件侧栏" : "显示文件侧栏",
      keywords: "切换 侧栏 文件 toggle file sidebar",
      run: () =>
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, leftPanel: leftOpen ? "collapsed" : "expanded" }
        })
    },
    {
      id: "view:right",
      scope: "system",
      title: rightOpen ? "隐藏 Agent Session" : "显示 Agent Session",
      keywords: "assistant agent session ai 右栏 助手 任务 切换",
      run: () =>
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, rightPanel: rightOpen ? "collapsed" : "expanded" }
        })
    },
    {
      id: "file:close-workspace",
      scope: "system",
      title: "收起写作侧栏",
      keywords: "隐藏 左栏 右栏 close workspace collapse panels",
      run: () => runAppCommand("file:close-workspace")
    }
  ];
  const normalizedEditorPanes = normalizeEditorPanes(editorPanes, (documentId) => documentsById.has(documentId));
  const visibleEditorPanes =
    normalizedEditorPanes.length > 0
      ? normalizedEditorPanes
      : openDocuments[0]
        ? [{ id: "main" as const, documentId: openDocuments[0].id }]
        : [];
  const singleEditorPane = visibleEditorPanes.length <= 1;
  const renderEditorPane = (pane: EditorPaneState, index: number) => {
    const document = documentsById.get(pane.documentId);
    const active = pane.id === activePaneId || (singleEditorPane && index === 0);
    const basis =
      visibleEditorPanes.length === 2
        ? `${(index === 0 ? paneRatio : 1 - paneRatio) * 100}%`
        : "100%";
    return (
      <div
        key={pane.id}
        className={cn("relative min-h-0 min-w-0 flex flex-col", active && visibleEditorPanes.length > 1 && "ring-1 ring-emerald-500/30")}
        style={splitDirection === "horizontal" ? { flexBasis: basis } : { flexBasis: basis, minHeight: 0 }}
        onMouseDown={() => activatePane(pane)}
        onFocusCapture={() => activatePane(pane)}
      >
        {visibleEditorPanes.length === 2 && active ? (
          <button
            type="button"
            aria-label="整屏展示当前 pane"
            className="absolute right-3 top-3 z-30 grid h-6 w-6 place-items-center rounded-md text-slate-400 opacity-80 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              expandPaneToSingle(pane);
            }}
          >
            <Maximize2 size={14} strokeWidth={1.8} />
          </button>
        ) : null}
        {document ? (
          <EditorSurfaceErrorBoundary documentId={document.id} onResetSelection={() => setAgentSelection(null)}>
            {documentConflicts.has(document.id) ? (
	              <button
	                type="button"
	                className="mx-auto mt-2 flex w-[min(760px,calc(100%-32px))] shrink-0 items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[12px] font-semibold text-amber-900 shadow-sm"
	                onClick={() => openDocumentConflict(document.id)}
	              >
	                <span className="min-w-0 truncate">需要合并更改，自动保存已暂停。点击查看 Diff 并选择处理方式。</span>
	                <span className="shrink-0 text-amber-700">查看</span>
	              </button>
            ) : null}
            <EditorPane
              key={`${pane.id}-${document.id}-${documentRefreshTokens[document.id] ?? 0}`}
              paneId={pane.id}
              document={document}
              documents={data.documents}
              settings={data.settings}
              viewMode={editorViewModes[pane.id] ?? "rich-text"}
              outlineJumpRequest={outlineJumpRequest}
              onOutlineJumpHandled={handleOutlineJumpHandled}
              onChange={updateDocument}
              onOpenInternalLink={(documentId, sourcePaneId) => {
                openDocumentInLinkedPane(sourcePaneId, documentId);
              }}
              onCreateInternalLink={createLinkedDocument}
              onSelection={handleAgentSelection}
              onCompositionChange={handleEditorCompositionChange}
              toolbarEnabled
              toolbarTranslate={toolbarTranslate}
              onTranslateSelection={runSelectionToolbarTranslate}
              onClearToolbarTranslate={clearToolbarTranslate}
            />
          </EditorSurfaceErrorBoundary>
        ) : (
          <EmptyEditorPane defaultFolder={data.settings.shortcuts.quickFolder} onCreate={createDefaultMarkdownDocument} />
        )}
      </div>
    );
  };

  if (isSettingsWindow) {
    return (
      <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
        <div
          className={cn("app-shell h-screen overflow-hidden", `theme-${data.settings.appearance.theme}`, showWindowControls && "is-frameless")}
          style={shellStyle}
        >
          <SettingsView
            settings={data.settings}
            connections={connections}
            onChange={updateSettings}
            onCheckAgents={checkAgents}
            checkingAgents={checkingAgents}
            onCheckApiModels={checkApiModels}
            checkingApiModels={checkingApiModels}
            apiCheckState={apiCheckState}
            appInfo={appInfo}
            showWindowControls={showWindowControls}
          />
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
                {openDocuments.map((doc) => {
                  const active = doc.id === activeOpenDoc?.id;
                  const dirty = dirtyDocumentIds.has(doc.id);
                  const conflicted = documentConflicts.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      ref={active ? activeTabRef : undefined}
                      draggable
                      onDragStart={(event) => startDocumentDrag(doc.id, event)}
                      className={cn(
	                        "group relative flex h-7 min-w-28 max-w-40 shrink-0 items-center rounded-md text-[12px] font-semibold text-[var(--text-muted)] transition-[background-color,transform,color]",
                        active && "surface-card text-[var(--text-main)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]"
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
	                            title="需要合并更改"
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
                          "hover:bg-slate-200/60 hover:text-[var(--text-main)] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 group-hover:opacity-100"
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
	                <FileList
	                  folders={data.folders}
	                  documents={data.documents}
	                  projects={data.projects ?? []}
	                  activeDocumentId={activeOpenDoc?.id ?? ""}
	                  onSelect={selectDocument}
	                  onCreate={createDocument}
	                  onCreateFolder={createFolder}
	                  onFileAction={(input) => { void executeFileSystemAction(input); }}
	                  onImportExternalFiles={(sourcePaths, destinationFolderPath) => { void importExternalFiles(sourcePaths, destinationFolderPath); }}
	                  onRenameProject={renameProject}
	                  onToggleProjectPinned={toggleProjectPinned}
	                  onRemoveProject={(path) => window.informio.removeProject(path).then(setData)}
	                  onDocumentDragStart={startDocumentDrag}
	                  width={leftPanelWidth}
	                  creationSignal={fileListCreationSignal}
	                />
	              ) : sidebarMode === "outline" ? (
	                activeOpenDoc ? (
	                  <OutlineList document={activeOpenDoc} width={leftPanelWidth} onJump={(item) => jumpToOutlineItem(activeOpenDoc.id, item)} />
	                ) : (
	                  <aside className="side-rail flex h-full shrink-0 items-center justify-center border-r px-4 text-[12px] font-semibold text-[var(--text-muted)]" style={{ width: leftPanelWidth }}>
	                    无打开文档
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

	            <section className="flex min-w-0 flex-1">
	              <div
	                className="relative flex min-w-0 flex-1 flex-col"
	                onDragOverCapture={(event) => {
	                  if (!isInternalDocumentDrag(event.dataTransfer)) return;
	                  event.preventDefault();
	                  event.stopPropagation();
	                  event.dataTransfer.dropEffect = "copy";
	                  setDropZone(editorDropZoneFromEvent(event));
	                }}
	                onDropCapture={(event) => {
	                  if (!isInternalDocumentDrag(event.dataTransfer)) return;
	                  event.preventDefault();
	                  event.stopPropagation();
	                  const documentId = event.dataTransfer.getData(DOCUMENT_DRAG_MIME);
	                  if (!documentId) {
	                    setDropZone(null);
	                    return;
	                  }
	                  const zone = dropZone ?? editorDropZoneFromEvent(event);
	                  setDropZone(null);
	                  applyEditorDrop(documentId, zone);
	                }}
	                onDragOver={(event) => {
	                  if (!isInternalDocumentDrag(event.dataTransfer)) return;
	                  event.preventDefault();
	                  event.dataTransfer.dropEffect = "copy";
	                  setDropZone(editorDropZoneFromEvent(event));
	                }}
	                onDragLeave={(event) => {
	                  if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
	                  setDropZone(null);
	                }}
	                onDrop={(event) => {
	                  if (!isInternalDocumentDrag(event.dataTransfer)) return;
	                  const documentId = event.dataTransfer.getData(DOCUMENT_DRAG_MIME);
	                  if (!documentId) return;
	                  event.preventDefault();
	                  const zone = dropZone ?? editorDropZoneFromEvent(event);
	                  setDropZone(null);
	                  applyEditorDrop(documentId, zone);
	                }}
	              >
	                <div className={cn("flex min-h-0 min-w-0 flex-1", splitDirection === "vertical" && "flex-col")}>
	                  {visibleEditorPanes.length ? (
	                    visibleEditorPanes.map((pane, index) => (
	                      <Fragment key={pane.id}>
	                        {index === 1 ? (
	                          <div
	                            className={cn(
	                              "shrink-0 bg-slate-200/70 transition-colors hover:bg-slate-300/80",
	                              splitDirection === "horizontal" ? "h-full w-1 cursor-col-resize" : "h-1 w-full cursor-row-resize"
	                            )}
	                            onPointerDown={startEditorPaneResize}
	                          />
	                        ) : null}
	                        {renderEditorPane(pane, index)}
	                      </Fragment>
	                    ))
	                  ) : (
	                    <EmptyEditorPane defaultFolder={data.settings.shortcuts.quickFolder} onCreate={createDefaultMarkdownDocument} />
	                  )}
	                </div>
	                {dropZone ? (
	                  <div className="pointer-events-none absolute inset-0 z-40 grid grid-cols-3 grid-rows-3 gap-1 bg-emerald-500/5 p-2">
	                    <div className={cn("col-start-1 row-start-1 row-span-3 rounded-md", dropZone === "left" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
	                    <div className={cn("col-start-3 row-start-1 row-span-3 rounded-md", dropZone === "right" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
	                    <div className={cn("col-start-1 col-span-3 row-start-1 rounded-md", dropZone === "top" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
	                    <div className={cn("col-start-1 col-span-3 row-start-3 rounded-md", dropZone === "bottom" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
	                    <div className="col-start-2 row-start-2 grid place-items-center rounded-md bg-white/70 text-[12px] font-semibold text-emerald-700 shadow-sm">
	                      {dropZone === "left" ? "左侧分屏" : dropZone === "right" ? "右侧分屏" : dropZone === "top" ? "上方分屏" : "下方分屏"}
	                    </div>
	                  </div>
	                ) : null}
	              </div>
	              {rightOpen ? (
	                <>
	                  <PanelResizeHandle label="Resize right panel" onPointerDown={(event) => startPanelResize("right", event)} />
	                  <AgentPanel
	                    providers={data.settings.agents}
	                    provider={activeAgent}
	                    connection={activeConnection}
	                    conversations={providerAgentConversations}
	                    activeConversationId={activeConversationId}
	                    pendingNewConversation={pendingNewConversation}
	                    messages={agentMessages}
	                    selectedSelection={agentSelection}
	                    busy={agentBusy}
	                    enabled={data.settings.agentRuntime.enabled}
	                    currentModel={activeModel}
	                    availableModels={activeModels}
	                    chatFontSize={data.settings.appearance.chatFontSize}
	                    connections={connections}
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
	                    width={rightPanelWidth}
	                  />
	                </>
	              ) : null}
	            </section>
	          </div>
	          <footer className="status-bar flex h-8 shrink-0 items-center justify-between gap-3 px-3 font-mono text-[11px] text-[var(--text-muted)]">
	            <div className="flex items-center gap-1">
	              <IconButton
	                label="文件"
	                className="h-6 w-6"
	                pressed={sidebarMode === "files" && leftOpen}
	                onClick={() => toggleBottomSidebar("files")}
	              >
	                <Folder size={14} />
	              </IconButton>
	              <IconButton
	                label="大纲"
	                className="h-6 w-6"
	                pressed={sidebarMode === "outline" && leftOpen}
	                onClick={() => toggleBottomSidebar("outline")}
	              >
	                <LayoutList size={14} />
	              </IconButton>
	              <IconButton
	                label="属性"
	                className="h-6 w-6"
	                pressed={sidebarMode === "properties" && leftOpen}
	                onClick={() => toggleBottomSidebar("properties")}
	              >
	                <Bookmark size={14} />
	              </IconButton>
	              <IconButton
	                label="添加项目"
	                className="h-6 w-6"
	                onClick={() =>
	                  window.informio.addProject().then((next) => {
	                    if (next) applyMergedAppData(next);
	                  })
	                }
	              >
	                <FolderPlus size={14} />
	              </IconButton>
	              <IconButton label="设置" className="h-6 w-6" onClick={() => window.informio.openSettings()}>
	                <Settings size={14} />
	              </IconButton>
	            </div>
	            <div className="flex shrink-0 items-center gap-3">
	              {!data.settings.appearance.autoHideStatusBar ? (
	                <>
		                  <span>{activeOpenDoc ? countWords(activeOpenDoc.markdown) : 0} 词</span>
		                  <span>{activeOpenDoc ? countCharacters(activeOpenDoc.markdown).toLocaleString() : 0} 字符</span>
	                  <span>{lineCount} 行</span>
	                </>
	              ) : null}
	              <IconButton
	                label={activePaneViewMode === "source" ? "切换到文本内容视图" : "切换到 Markdown 源码视图"}
	                className="h-6 w-6"
	                pressed={activePaneViewMode === "source"}
	                disabled={!canToggleMarkdownSource}
	                onClick={toggleActivePaneViewMode}
	              >
	                <Code2 size={14} />
	              </IconButton>
	              <IconButton
	                label={rightOpen ? "隐藏 Agent Session" : "显示 Agent Session"}
	                className="h-6 w-6"
	                pressed={rightOpen}
	                onClick={() =>
	                  updateSettings({
	                    ...data.settings,
	                    appearance: { ...data.settings.appearance, rightPanel: rightOpen ? "collapsed" : "expanded" }
	                  })
	                }
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
