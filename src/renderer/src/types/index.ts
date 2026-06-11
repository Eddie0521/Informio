import type { ComponentType } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { JSONContent, Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  ThemeName,
  ApiProviderKind,
  InformioDocument,
  InformioFolder,
  InformioProject,
  AppData,
  AppSettings,
  AgentModel,
  AgentConnection,
  AgentPermissionMode,
  AgentSessionStatus,
  AgentSessionAction,
  AgentConversation,
  AgentConversationMessage,
  PdfSelectionRect,
  AgentMessageAttachment,
  LocalFontOption,
  InformioDocumentKind,
  AgentProvider,
  AgentApprovalDecision,
  AppInfo,
  MenuCommand,
  DocumentConflict,
  FileSystemOperationInput,
} from "../../../shared/types";

// Re-export shared types that are heavily used in renderer
export type {
  ThemeName,
  ApiProviderKind,
  InformioDocument,
  InformioFolder,
  InformioProject,
  AppData,
  AppSettings,
  AgentModel,
  AgentConnection,
  AgentPermissionMode,
  AgentSessionStatus,
  AgentSessionAction,
  AgentConversation,
  AgentConversationMessage,
  PdfSelectionRect,
  AgentMessageAttachment,
  LocalFontOption,
  InformioDocumentKind,
  AgentProvider,
  AgentApprovalDecision,
  AppInfo,
  MenuCommand,
  DocumentConflict,
  FileSystemOperationInput,
};

// ─── PDF types ───

export type UnifiedToolbarTranslateState = {
  status: "idle" | "loading" | "done" | "error";
  response: string;
  error?: string;
  anchor?: {
    kind: "markdown" | "pdf";
    left: number;
    top: number;
  };
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

export type UnifiedPdfEditorContextValue = {
  paneId: string;
  document: InformioDocument;
  settings: AppSettings;
  toolbarTranslate: UnifiedToolbarTranslateState;
  onTranslateSelection: (selection: PdfAgentSelection) => void;
  onClearToolbarTranslate: () => void;
};

// ─── Editor types ───

export type SidebarMode = "files" | "outline" | "properties";

export type OutlineItem = {
  id: string;
  title: string;
  level: number;
  line: number;
  order: number;
};

export type OutlineTreeItem = OutlineItem & {
  children: OutlineTreeItem[];
};

export type OutlineJumpRequest = {
  documentId: string;
  itemId: string;
  order: number;
  line: number;
  title: string;
  nonce: number;
};

export type PropertyValueGroup = {
  value: string;
  files: InformioDocument[];
};

export type PropertyGroup = {
  name: string;
  values: PropertyValueGroup[];
};

export type EditorPaneState = {
  id: "main" | "secondary";
  documentId: string;
};

export type EditorViewMode = "rich-text" | "source";

export type SplitDirection = "horizontal" | "vertical";

export type EditorDropZone = "left" | "right" | "top" | "bottom";

export type EditorTextSearchIndex = {
  text: string;
  positions: number[];
};

export type FindMatch = {
  start: number;
  end: number;
  from: number;
  to: number;
};

export type LinkRequest = {
  from: number;
  to: number;
  text: string;
  url: string;
  title?: string;
};

export type ImageRequest = {
  pos: number;
  alt: string;
  src: string;
  title: string;
};

export type SecretPromptRequest =
  | {
      mode: "set-passphrase";
      error?: string;
    }
  | {
      mode: "unlock-passphrase";
      intent: "encrypt" | "decrypt";
      error?: string;
    };

export type PendingSecretAction =
  | {
      type: "encrypt";
      from: number;
      to: number;
      kind: SecretKind;
      verifyAttrs?: EncryptedSecretAttrs | null;
    }
  | {
      type: "decrypt";
      request: SecretDecryptRequest;
    };

// ─── Agent types ───

export type AgentSelection = {
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

export type ApiCheckState = {
  status: "idle" | "loading" | "done" | "error";
  message?: string;
  error?: string;
};

export type AgentSessionMessage = {
  id: string;
  userMessage: string;
  permissionMode: AgentPermissionMode;
  status: AgentSessionStatus;
  reasoning: string;
  response: string;
  actions: AgentSessionAction[];
  error?: string;
  hasSelection: boolean;
  submittedAt: number;
  completedAt?: number;
};

export type AgentProcessCategory = "system" | "explore" | "search" | "read" | "edit" | "command" | "approval" | "other";

// ─── Toolbar types ───

export type ToolbarIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type SelectionToolbarAction = {
  id: "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript" | "highlight" | "link";
  label: string;
  icon: ToolbarIcon;
};

export type InsertToolbarAction =
  | {
      id: string;
      label: string;
      icon: ToolbarIcon;
      kind: "command";
      command:
        | "insert:table"
        | "format:bullet-list"
        | "format:ordered-list"
        | "format:task-list"
        | "format:blockquote"
        | "format:code-block"
        | "insert:math"
        | "insert:chart"
        | "insert:callout"
        | "insert:footnote"
        | "insert:details"
        | "insert:horizontal-rule";
    }
  | {
      id: string;
      label: string;
      icon: ToolbarIcon;
      kind: "asset";
      assetKind: "image" | "video" | "audio" | "pdf";
    };

// ─── Command palette types ───

export type CommandPaletteScope = "system" | "document";

export type CommandPaletteItem = {
  id: string;
  scope: CommandPaletteScope;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
};

// ─── Document index types ───

export type IndexedDocument = {
  document: InformioDocument;
  normalizedTitle: string;
  normalizedFilePath: string;
  folderPath: string;
};

export type WikiTargetBucket = {
  candidates: IndexedDocument[];
  latest: IndexedDocument | null;
};

export type WikiSuggestionItem = {
  document: InformioDocument;
  lowerLabel: string;
};

export type DocumentLookupIndex = {
  byWikiTarget: Map<string, WikiTargetBucket>;
  byMarkdownTitleLower: Map<string, InformioDocument>;
  byMarkdownTitleExact: Map<string, InformioDocument>;
  byExactTitle: Map<string, InformioDocument>;
  byFilePath: Map<string, InformioDocument>;
  wikiSuggestions: WikiSuggestionItem[];
};

export type FrontmatterParseResult = {
  hasFrontmatter: boolean;
  raw: string;
  body: string;
  values: Record<string, unknown>;
  error?: string;
};

// ─── Markdown extension types ───

export type MarkdownTokenLike = {
  raw?: string;
  text?: string;
  title?: string;
  summary?: string;
  index?: string;
  kind?: string;
  src?: string;
  base?: string;
  script?: string;
};

export type MarkdownHelperLike = {
  createTextNode: (text: string) => unknown;
  createNode: (name: string, attrs?: Record<string, unknown>, content?: unknown[]) => unknown;
};

export type MarkdownAutoBlockMatch = {
  from: number;
  to: number;
  node: ProseMirrorNodeLike;
  selectionOffset?: number;
  selectAfterNode?: boolean;
};

export type ProseMirrorNodeLike = {
  type: { name: string };
  isText?: boolean;
  isTextblock: boolean;
  nodeSize: number;
  text?: string;
  textContent: string;
  forEach: (callback: (node: ProseMirrorNodeLike, offset: number) => void) => void;
  descendants?: (
    callback: (node: ProseMirrorNodeLike, pos: number, parent: ProseMirrorNodeLike | null, index: number) => boolean | void
  ) => void;
};

export type ProseMirrorSchemaLike = {
  nodes: Record<string, { create: (attrs?: Record<string, unknown> | null, content?: unknown) => ProseMirrorNodeLike }>;
  text: (text: string) => ProseMirrorNodeLike;
};

export type MarkdownTextBlock = {
  node: ProseMirrorNodeLike;
  pos: number;
  text: string;
};

export type MarkdownParserEditor = Editor & {
  markdown?: {
    parse: (markdown: string) => JSONContent | JSONContent[];
  };
};

// ─── Encryption types ───

export type SecretKind = "inline" | "block";

export type EncryptedSecretAttrs = {
  kind: SecretKind;
  version: string;
  salt: string;
  iv: string;
  iterations: number;
  algorithm: string;
  kdf: string;
  cipherText: string;
};

export type SecretDecryptRequest = {
  pos: number;
  kind: SecretKind;
  attrs: EncryptedSecretAttrs;
};

export type EncryptedTextOptions = {
  onRequestDecrypt: (request: SecretDecryptRequest) => void;
};

// ─── Lowlight / code highlight types ───

export type LowlightNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: LowlightNode[];
};

// ─── NodeView types ───

export type NodeViewPositionGetter = ReactNodeViewProps["getPos"];
export type NodeViewNode = ReactNodeViewProps["node"];

// ─── WikiLink extension types ───

export type WikiLinkOptions = {
  documentLookupIndex: DocumentLookupIndex;
  currentDocument?: InformioDocument;
  onOpen: (documentId: string) => void;
  onCreate: (title: string) => void;
};

// ─── Table types ───

export type HorizontalCellAlign = "left" | "center" | "right";
export type VerticalCellAlign = "top" | "middle" | "bottom";

export type TableOverlayState = {
  table: HTMLTableElement;
  tablePos: number;
  rect: { top: number; left: number; width: number; height: number };
  rows: Array<{ top: number; height: number }>;
  columns: Array<{ left: number; width: number }>;
};

export type TableSelectionShape = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  rowSelection: boolean;
  columnSelection: boolean;
  fullTable: boolean;
};

export type TableColumnWidthInfo = {
  width: number;
  fixed: boolean;
};

export type TableHoverTarget =
  | {
      axis: "row" | "column";
      index: number;
    }
  | null;

// ─── File tree types ───

export type TreeDragPayload =
  | { type: "file"; documentId: string; path: string }
  | { type: "folder"; path: string };

export type FileTreeNode = {
  folder: InformioFolder;
  documents: InformioDocument[];
  children: FileTreeNode[];
  documentCount: number;
};

export type FileContextTarget =
  | { type: "folder"; path: string; title: string }
  | { type: "file"; path: string; title: string; documentId: string };

export type FileContextMenuState = {
  x: number;
  y: number;
  target: FileContextTarget;
};

export type ProjectContextMenuState = {
  x: number;
  y: number;
  path: string;
  title: string;
  pinned: boolean;
};

export type BlankContextMenuState = {
  x: number;
  y: number;
};

export type InlineRenameState =
  | { type: "file"; path: string; documentId: string; value: string; originalValue: string; selectBaseName?: boolean }
  | { type: "folder"; path: string; value: string; originalValue: string }
  | { type: "project"; path: string; value: string; originalValue: string };

export type PendingCreationState =
  | { type: "file"; folderPath?: string }
  | { type: "folder"; folderPath?: string };

export type TreeDropTarget = {
  path: string;
  depth: number;
};

// ─── Diff types ───

export type ConflictDiffLine = {
  key: string;
  kind: "same" | "removed" | "added";
  text: string;
};

export type MarkdownDiffHunk = {
  baseStart: number;
  baseEnd: number;
  replacement: string[];
};

// ─── Agent execution flow types ───

export type ProviderExecutionFlowProps = {
  provider: AgentProvider;
  message: AgentSessionMessage;
  transcriptFontSize: number;
  transcriptLineHeight: number;
  processFontSize: number;
  processLineHeight: number;
  isExpanded: boolean;
  now: number;
  onToggleExpanded: () => void;
  onApprovalResponse: (approvalId: string, decision: AgentApprovalDecision) => void;
  onOpenActionPath: (path: string) => void;
};
