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
import { common, createLowlight } from "lowlight";
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
  PdfEditorContextValue as UnifiedPdfEditorContextValue,
  ToolbarTranslateState as UnifiedToolbarTranslateState
} from "./pdfSurface";
import "katex/dist/katex.min.css";
const appIconUrl = "/icon.png";

const themeOptions: Array<{ id: ThemeName; label: string; surface: string; accent: string }> = [
  { id: "white", label: "白色", surface: "#ffffff", accent: "#059669" },
  { id: "paper", label: "纸张", surface: "#f7f7f2", accent: "#159447" },
  { id: "night", label: "夜间", surface: "#1b2026", accent: "#5ad08a" },
  { id: "custom", label: "自定义", surface: "#ffffff", accent: DEFAULT_CUSTOM_THEME_COLOR }
];

const getThemeSwatchStyle = (themeId: ThemeName, customThemeColor: string): CSSProperties => {
  const option = themeOptions.find((item) => item.id === themeId) ?? themeOptions[0];
  const accent = themeId === "custom" ? customThemeColor : option.accent;
  return {
    background: `linear-gradient(140deg, ${option.surface} 0 64%, ${accent} 64% 100%)`,
    boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.12)"
  };
};

const isDarkColor = (color: string) => {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) return false;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance < 150;
};

const settingsNav = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "editor", label: "编辑器", icon: Text },
  { id: "agent", label: "Agent", icon: Unplug },
  { id: "api", label: "API", icon: Search },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
  { id: "about", label: "关于", icon: Info }
] as const;

const apiProviderOptions: Array<{ id: ApiProviderKind; label: string; description: string }> = [
  { id: "openai-compatible", label: "OpenAI-Compatible", description: "用于兼容 OpenAI Chat Completions 的服务。" },
  { id: "anthropic", label: "Anthropic", description: "用于 Anthropic Messages API。" }
];

const defaultApiSettings = {
  provider: "openai-compatible" as ApiProviderKind,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  models: [] as AgentModel[]
};

const CHINESE_FONT_FALLBACK =
  `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
const ENGLISH_FONT_FALLBACK =
  `"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
const CODE_FONT_FALLBACK =
  `"SF Mono", "Cascadia Mono", "Roboto Mono", ui-monospace, monospace`;

const quoteFontFamily = (family: string) => `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const buildConfiguredFontStack = (family: string | undefined, fallback: string) => {
  const trimmed = family?.trim();
  return trimmed ? `${quoteFontFamily(trimmed)}, ${fallback}` : fallback;
};

const buildUiFontStack = (
  englishFontFamily: string | undefined,
  chineseFontFamily: string | undefined
) => {
  const orderedFamilies = [
    englishFontFamily?.trim() ? quoteFontFamily(englishFontFamily.trim()) : null,
    chineseFontFamily?.trim() ? quoteFontFamily(chineseFontFamily.trim()) : null,
    `"PingFang SC"`,
    `"Hiragino Sans GB"`,
    `"Microsoft YaHei"`,
    `"Noto Sans CJK SC"`,
    `"Helvetica Neue"`,
    `-apple-system`,
    `BlinkMacSystemFont`,
    `"Segoe UI"`,
    `Arial`,
    `sans-serif`
  ].filter(Boolean);
  return Array.from(new Set(orderedFamilies)).join(", ");
};

const mergeFontOptions = (fonts: LocalFontOption[], ...currentFamilies: Array<string | undefined>) => {
  const deduped = new Map<string, LocalFontOption>();
  fonts.forEach((font) => {
    const family = font.family.trim();
    if (!family || deduped.has(family)) return;
    deduped.set(family, { ...font, family });
  });
  currentFamilies.forEach((family) => {
    const trimmed = family?.trim();
    if (!trimmed || deduped.has(trimmed)) return;
    deduped.set(trimmed, { family: trimmed });
  });
  return Array.from(deduped.values()).sort((left, right) => left.family.localeCompare(right.family));
};

const buildShellStyle = (appearance: AppSettings["appearance"]): CSSProperties => {
  const style: CSSProperties & Record<string, string> = {
    "--informio-font-family": buildUiFontStack(
      appearance.englishFontFamily,
      appearance.chineseFontFamily
    ),
    "--informio-code-font-family": buildConfiguredFontStack(appearance.codeFontFamily, CODE_FONT_FALLBACK)
  };
  if (appearance.theme === "custom") {
    style["--custom-theme-color"] = appearance.customThemeColor || DEFAULT_CUSTOM_THEME_COLOR;
  }
  return style;
};

const syncDocumentAppearanceVariables = (appearance: AppSettings["appearance"]) => {
  const root = document.documentElement;
  const style = buildShellStyle(appearance) as Record<string, string>;
  Object.entries(style).forEach(([key, value]) => root.style.setProperty(key, value));
  root.style.setProperty("--font-sans", "var(--informio-font-family)");
  root.style.setProperty("--font-mono", "var(--informio-code-font-family)");
};

const connectionTone: Record<AgentConnection["status"], string> = {
  idle: "bg-slate-300",
  connecting: "bg-amber-400",
  connected: "bg-emerald-500",
  error: "bg-red-500"
};

const connectionLabel: Record<AgentConnection["status"], string> = {
  idle: "未检测",
  connecting: "检测中",
  connected: "可用",
  error: "不可用"
};

const modelLabel = (models: AgentModel[], id?: string) => {
  const model = models.find((item) => item.id === id);
  return model?.label || id || "先检测模型";
};

const defaultApiBaseUrl = (provider: ApiProviderKind) =>
  provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1";

const isBuiltinApiBaseUrl = (value: string) => {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized === "https://api.openai.com/v1" || normalized === "https://api.anthropic.com";
};

const LEFT_PANEL_MIN_WIDTH = 161;
const LEFT_PANEL_MAX_WIDTH = 380;
const RIGHT_PANEL_MIN_WIDTH = 225;
const RIGHT_PANEL_MAX_WIDTH = 520;
const EDITOR_CONTENT_MIN_WIDTH = 410;
const EDITOR_CONTENT_MAX_WIDTH = 1100;
const CHAT_PANEL_FONT_MIN = 10;
const CHAT_PANEL_FONT_MAX = 18;
const TABLE_CELL_MIN_WIDTH = 88;
const TABLE_EDGE_COMPRESS_MIN_WIDTH = 40;
const TABLE_CONTROL_SIZE = 24;
const TABLE_CONTEXT_OFFSET = 12;
const TABLE_EDGE_HIT_DISTANCE = 14;
const TABLE_HEADER_STRIP_SIZE = 24;
const TABLE_TOOLBAR_HEIGHT = 30;
const TABLE_ROW_MIN_HEIGHT = 36;
const INFORMIO_SECRET_TAG = "informio-secret";
const SECRET_ITERATIONS = 210000;
const SECRET_ALGORITHM = "aes-gcm";
const SECRET_KDF = "pbkdf2-sha256";

type SidebarMode = "files" | "outline" | "properties";

type OutlineItem = {
  id: string;
  title: string;
  level: number;
  line: number;
  order: number;
};

type OutlineTreeItem = OutlineItem & {
  children: OutlineTreeItem[];
};

type OutlineJumpRequest = {
  documentId: string;
  itemId: string;
  order: number;
  line: number;
  title: string;
  nonce: number;
};

type PropertyValueGroup = {
  value: string;
  files: InformioDocument[];
};

type PropertyGroup = {
  name: string;
  values: PropertyValueGroup[];
};

type AgentSelection = {
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

const toolbarTranslateAnchorFromSelection = (selection: AgentSelection): UnifiedToolbarTranslateState["anchor"] => {
  if (selection.overlayLeft === undefined || selection.overlayTop === undefined) return undefined;
  return {
    kind: selection.kind,
    left: selection.overlayLeft,
    top: selection.overlayTop
  };
};

type ApiCheckState = {
  status: "idle" | "loading" | "done" | "error";
  message?: string;
  error?: string;
};

const normalizeApiSettings = (api: AppSettings["api"] | undefined) => ({
  ...defaultApiSettings,
  ...api,
  models: api?.models ?? defaultApiSettings.models
});

const samePdfSelectionRects = (left: PdfSelectionRect[] | undefined, right: PdfSelectionRect[] | undefined) => {
  const leftRects = left ?? [];
  const rightRects = right ?? [];
  if (leftRects.length !== rightRects.length) return false;
  return leftRects.every((rect, index) => {
    const other = rightRects[index];
    return (
      rect.x === other?.x &&
      rect.y === other?.y &&
      rect.width === other?.width &&
      rect.height === other?.height
    );
  });
};

const sameAgentSelection = (left: AgentSelection | null, right: AgentSelection | null) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind &&
    left.documentId === right.documentId &&
    left.from === right.from &&
    left.to === right.to &&
    left.text === right.text &&
    left.markdown === right.markdown &&
    left.title === right.title &&
    left.filePath === right.filePath &&
    left.page === right.page &&
    left.overlayLeft === right.overlayLeft &&
    left.overlayTop === right.overlayTop &&
    samePdfSelectionRects(left.rects, right.rects)
  );
};

type AgentSessionMessage = {
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

const buildWorkspaceLabel = (data: Pick<AppData, "projects" | "workspacePath">) => {
  const titles = (data.projects ?? []).map((project) => project.title?.trim() || project.path).filter(Boolean);
  if (titles.length) return titles.join(" · ");
  if (data.workspacePath) {
    const normalized = data.workspacePath.replace(/\\/g, "/").replace(/\/+$/, "");
    return normalized.split("/").filter(Boolean).at(-1) || normalized;
  }
  return "未命名工作区";
};

const createConversationTitle = (text: string) => {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 36 ? `${singleLine.slice(0, 36)}…` : singleLine || "新会话";
};

const codexFinalResponseBoundaryPattern = /(^|\n)(结论(?:先行)?\s*[:：]|Conclusion\s*[:：])/i;

const splitCodexFinalResponse = (content: string) => {
  const match = content.match(codexFinalResponseBoundaryPattern);
  if (!match || match.index === undefined) return null;
  const boundaryIndex = match.index + match[1].length;
  const process = content.slice(0, boundaryIndex).trim();
  const response = content.slice(boundaryIndex).trimStart();
  return { process, response };
};

const appendWithParagraphBreak = (current: string, next: string) => {
  const cleanNext = next.trim();
  if (!cleanNext) return current;
  const cleanCurrent = current.trimEnd();
  if (!cleanCurrent) return cleanNext;
  if (cleanCurrent.endsWith(cleanNext)) return cleanCurrent;
  return `${cleanCurrent}\n\n${cleanNext}`;
};

const writeClipboardText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for Electron/browser contexts where the async clipboard is unavailable.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

const selectionIsInsideElement = (selection: Selection, container: HTMLElement) => {
  if (!selection.rangeCount || selection.isCollapsed || !selection.toString()) return false;
  if (selection.anchorNode && container.contains(selection.anchorNode)) return true;
  if (selection.focusNode && container.contains(selection.focusNode)) return true;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const ancestor = range.commonAncestorContainer;
    const node = ancestor.nodeType === globalThis.Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
    if (node && container.contains(node)) return true;
    if (range.intersectsNode(container)) return true;
  }
  return false;
};

const revealInFolderLabel = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    ? "在 Finder 中打开"
    : "在文件夹中打开";

const isExternalFileDrag = (dataTransfer: DataTransfer | null) =>
  Boolean(dataTransfer?.types.includes("Files") && !isInternalTreeDrag(dataTransfer) && !isInternalDocumentDrag(dataTransfer));

const filePathForFile = (file: File) => {
  const legacyPath = (file as File & { path?: string }).path;
  if (legacyPath) return legacyPath;
  return window.informio.getPathForFile(file);
};

const dataTransferFilePaths = (dataTransfer: DataTransfer | null) =>
  Array.from(dataTransfer?.files ?? [])
    .map(filePathForFile)
    .filter(Boolean);

const fileKindFromName = (name: string): AgentMessageAttachment["kind"] =>
  /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? "image" : "file";

const mimeTypeFromName = (name: string) => {
  const extension = pathExtName(name).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".txt") return "text/plain";
  return undefined;
};

const attachmentsMarkdown = (attachments: AgentMessageAttachment[]) => {
  if (!attachments.length) return "";
  const lines = attachments.map((attachment) => {
    const label = attachment.kind === "image" ? "image" : "file";
    const mimeType = attachment.mimeType ? `, mime: ${attachment.mimeType}` : "";
    return `- ${attachment.name} (${label}${mimeType}): ${attachment.path}`;
  });
  return `\n\nAttachments:\n${lines.join("\n")}`;
};

const buildSessionMessagesFromConversation = (conversation: AgentConversation | null): AgentSessionMessage[] => {
  if (!conversation) return [];
  const messages: AgentSessionMessage[] = [];
  let pendingUser: AgentConversationMessage | null = null;

  for (const message of conversation.messages) {
    if (message.role === "user") {
      if (pendingUser) {
        messages.push({
          id: pendingUser.id,
          userMessage: pendingUser.content,
          permissionMode: pendingUser.permissionMode,
          status: "done",
          reasoning: "",
          response: "",
          actions: [],
          hasSelection: false,
          submittedAt: Date.parse(pendingUser.createdAt) || Date.now(),
          completedAt: Date.parse(pendingUser.createdAt) || Date.now()
        });
      }
      pendingUser = message;
      continue;
    }

    const submittedAt = pendingUser ? Date.parse(pendingUser.createdAt) || Date.now() : Date.parse(message.createdAt) || Date.now();
    const completedAt = Date.parse(message.createdAt) || submittedAt;
    messages.push({
      id: pendingUser?.id || `${conversation.id}-${message.id}`,
      userMessage: pendingUser?.content ?? "",
      permissionMode: pendingUser?.permissionMode ?? message.permissionMode,
      status: message.status === "error" ? "error" : "done",
      reasoning: message.reasoning ?? "",
      response: message.content,
      actions: message.actions ?? [],
      error: message.errorMessage,
      hasSelection: false,
      submittedAt,
      completedAt
    });
    pendingUser = null;
  }

  const lastPendingUser = pendingUser;
  if (lastPendingUser) {
    messages.push({
      id: lastPendingUser.id,
      userMessage: lastPendingUser.content,
      permissionMode: lastPendingUser.permissionMode,
      status: "done",
      reasoning: "",
      response: "",
      actions: [],
      hasSelection: false,
      submittedAt: Date.parse(lastPendingUser.createdAt) || Date.now(),
      completedAt: Date.parse(lastPendingUser.createdAt) || Date.now()
    });
  }

  return messages;
};

const buildConversationMessagesFromSession = (messages: AgentSessionMessage[]): AgentConversationMessage[] =>
  messages.flatMap((message) => {
    const createdAt = new Date(message.submittedAt).toISOString();
    const items: AgentConversationMessage[] = [
      {
        id: `${message.id}-user`,
        role: "user",
        content: message.userMessage,
        createdAt,
        permissionMode: message.permissionMode,
        status: "done"
      }
    ];

    if (message.response || message.error) {
      items.push({
        id: `${message.id}-assistant`,
        role: "assistant",
        content: message.response,
        createdAt: new Date(message.completedAt ?? message.submittedAt).toISOString(),
        permissionMode: message.permissionMode,
        status: message.status === "error" ? "error" : "done",
        errorMessage: message.error,
        reasoning: message.reasoning || undefined,
        actions: message.actions.length ? message.actions : undefined
      });
    }

    return items;
  });

const upsertSessionAction = (actions: AgentSessionAction[], nextAction: AgentSessionAction, approvalId?: string) => {
  const index = actions.findIndex((action) =>
    (approvalId && action.approval?.id === approvalId) || action.toolId === nextAction.toolId
  );
  if (index === -1) return [...actions, nextAction];
  const current = actions[index];
  const merged: AgentSessionAction = {
    ...current,
    ...nextAction,
    approval: nextAction.approval ?? current.approval,
    input: nextAction.input ?? current.input,
    output: nextAction.output ?? current.output,
    path: nextAction.path ?? current.path
  };
  const next = actions.slice();
  next[index] = merged;
  return next;
};

const updateSessionActionByToolId = (
  actions: AgentSessionAction[],
  toolId: string,
  updater: (action: AgentSessionAction) => AgentSessionAction
) => {
  const index = actions.findIndex((action) => action.toolId === toolId);
  if (index === -1) return actions;
  const next = actions.slice();
  next[index] = updater(actions[index]);
  return next;
};

type EditorPaneState = {
  id: "main" | "secondary";
  documentId: string;
};

type EditorViewMode = "rich-text" | "source";

type SplitDirection = "horizontal" | "vertical";

type EditorDropZone = "left" | "right" | "top" | "bottom";

const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-rowheight") || element.style.height;
          const height = raw ? Number.parseInt(raw, 10) : Number.NaN;
          return Number.isFinite(height) && height > 0 ? height : null;
        },
        renderHTML: (attributes) => {
          const rowHeight = Number(attributes.rowHeight);
          if (!Number.isFinite(rowHeight) || rowHeight <= 0) return {};
          return {
            "data-rowheight": String(rowHeight),
            style: `height: ${rowHeight}px`
          };
        }
      }
    };
  }
});

type HorizontalCellAlign = "left" | "center" | "right";
type VerticalCellAlign = "top" | "middle" | "bottom";

const parseHorizontalCellAlign = (element: HTMLElement) => {
  const raw = (element.getAttribute("align") || element.style.textAlign || "").trim().toLowerCase();
  return raw === "left" || raw === "right" || raw === "center" ? (raw as HorizontalCellAlign) : "center";
};

const parseVerticalCellAlign = (element: HTMLElement) => {
  const raw = (element.getAttribute("valign") || element.style.verticalAlign || "").trim().toLowerCase();
  if (raw === "top" || raw === "bottom" || raw === "middle") return raw as VerticalCellAlign;
  return "middle";
};

const renderCellStyle = (attributes: Record<string, unknown>) => {
  const align = typeof attributes.align === "string" ? attributes.align : "center";
  const verticalAlign = typeof attributes.verticalAlign === "string" ? attributes.verticalAlign : "middle";
  const styles = [`text-align:${align}`, `vertical-align:${verticalAlign}`];
  return { style: `${styles.join(";")};` };
};

const AlignableTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element: HTMLElement) => parseHorizontalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      },
      verticalAlign: {
        default: "middle",
        parseHTML: (element: HTMLElement) => parseVerticalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      }
    };
  }
});

const AlignableTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element: HTMLElement) => parseHorizontalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      },
      verticalAlign: {
        default: "middle",
        parseHTML: (element: HTMLElement) => parseVerticalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      }
    };
  }
});

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeTableText = (value: string) => value.replace(/\s+/g, " ").trim();

const renderImageMarkdown = (attrs: { src?: string | null; alt?: string | null; title?: string | null; width?: number | string | null }) => {
  const src = attrs.src ?? "";
  const alt = attrs.alt ?? "";
  const title = attrs.title ?? "";

  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
};

const ResizableImage = Image.extend({
  markdownTokenizer: {
    name: "image",
    level: "block",
    start(src: string) {
      return src.match(/^!\[/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^!\[([^\]\n]*)]\(([^)\s]+)(?:\s+["']([^"'\n]+)["'])?\)(?:\n|$)/);
      if (!match) return undefined;
      return { type: "image", raw: match[0], text: match[1], src: match[2], title: match[3] ?? "" };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("image", { src: token.src ?? "", alt: token.text ?? "", title: token.title ?? null }, []);
  },
  renderMarkdown(node: { attrs?: { src?: string | null; alt?: string | null; title?: string | null; width?: number | string | null } }) {
    return renderImageMarkdown(node.attrs ?? {});
  },
  addNodeView(this: any) {
    if (!this.options.resize || !this.options.resize.enabled || typeof document === "undefined") {
      return null;
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize;

    return ({ node, getPos, HTMLAttributes, editor }: any) => {
      const el = document.createElement("img");
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) {
          switch (key) {
            case "width":
            case "height":
              break;
            default:
              el.setAttribute(key, String(value));
              break;
          }
        }
      });

      let objectUrl = "";
      let disposed = false;
      const applyImageSrc = async (rawSrc: string) => {
        const localPath = resolveMarkdownAssetPath(rawSrc, this.options.assetBasePath);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
        if (!localPath) {
          el.src = resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath);
          return;
        }
        try {
          objectUrl = await loadLocalAssetObjectUrl(localPath);
          if (disposed) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          el.src = objectUrl;
        } catch {
          el.src = resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath);
        }
      };
      let currentSrc = String(HTMLAttributes.src ?? "");
      void applyImageSrc(currentSrc);
      el.style.height = "auto";

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (width, height) => {
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
        },
        onCommit: (width) => {
          const pos = getPos();
          if (pos === undefined) return;
          const roundedWidth = Math.max(120, Math.round(width));
          editor.chain().setNodeSelection(pos).updateAttributes(this.name, { width: roundedWidth, height: null }).run();
          el.style.width = `${roundedWidth}px`;
          el.style.height = "auto";
        },
        onUpdate: (updatedNode: any) => {
          if (updatedNode.type !== node.type) return false;
          const nextSrc = String(updatedNode.attrs.src ?? "");
          if (nextSrc !== currentSrc) {
            currentSrc = nextSrc;
            void applyImageSrc(currentSrc);
          }
          const nextWidth = updatedNode.attrs.width;
          el.style.width =
            typeof nextWidth === "number"
              ? `${nextWidth}px`
              : typeof nextWidth === "string" && nextWidth.trim()
                ? `${nextWidth}px`
                : "";
          el.style.height = "auto";
          return true;
        },
        options: {
          directions,
          min: {
            width: minWidth,
            height: minHeight
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
          className: {
            container: "informio-image-resize-container",
            wrapper: "informio-image-resize-wrapper",
            handle: "informio-image-resize-handle",
            resizing: "is-resizing-image"
          }
        }
      });

      const dom = nodeView.dom;
      dom.style.visibility = "hidden";
      dom.style.pointerEvents = "none";
      el.onload = () => {
        dom.style.visibility = "";
        dom.style.pointerEvents = "";
      };
      el.onerror = () => {
        dom.style.visibility = "";
        dom.style.pointerEvents = "";
      };
      const originalDestroy = nodeView.destroy?.bind(nodeView);
      nodeView.destroy = () => {
        disposed = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        originalDestroy?.();
      };
      return nodeView;
    };
  }
} as never);

const renderTableToGfm = (node: JSONContent, h: MarkdownRendererHelpers) => {
  if (!node.content?.length) return "";

  const rows: Array<Array<{ text: string; isHeader: boolean; align: string | null }>> = [];
  node.content.forEach((rowNode) => {
    const cells: Array<{ text: string; isHeader: boolean; align: string | null }> = [];
    rowNode.content?.forEach((cellNode) => {
      const raw = cellNode.content ? h.renderChildren(cellNode.content as JSONContent[]) : "";
      cells.push({
        text: normalizeTableText(raw),
        isHeader: cellNode.type === "tableHeader",
        align: typeof cellNode.attrs?.align === "string" ? cellNode.attrs.align : null
      });
    });
    rows.push(cells);
  });

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!columnCount) return "";

  const colWidths = new Array(columnCount).fill(3);
  rows.forEach((row) => {
    for (let index = 0; index < columnCount; index += 1) {
      const text = row[index]?.text ?? "";
      colWidths[index] = Math.max(colWidths[index], text.length, 3);
    }
  });

  const hasHeader = rows[0]?.some((cell) => cell.isHeader) ?? false;
  const pad = (text: string, width: number) => `${text}${" ".repeat(Math.max(0, width - text.length))}`;
  const alignments = new Array<string | null>(columnCount).fill(null);
  rows.forEach((row) => {
    for (let index = 0; index < columnCount; index += 1) {
      if (!alignments[index] && row[index]?.align) alignments[index] = row[index].align;
    }
  });

  const headerTexts = new Array(columnCount)
    .fill("")
    .map((_, index) => (hasHeader ? rows[0]?.[index]?.text ?? "" : ""));

  let output = "\n";
  output += `| ${headerTexts.map((text, index) => pad(text, colWidths[index])).join(" | ")} |\n`;
  output += `| ${colWidths
    .map((width, index) => {
      const dashes = "-".repeat(Math.max(3, width));
      if (alignments[index] === "left") return `:${dashes}`;
      if (alignments[index] === "right") return `${dashes}:`;
      if (alignments[index] === "center") return `:${dashes}:`;
      return dashes;
    })
    .join(" | ")} |\n`;

  const bodyRows = hasHeader ? rows.slice(1) : rows;
  bodyRows.forEach((row) => {
    output += `| ${new Array(columnCount)
      .fill("")
      .map((_, index) => pad(row[index]?.text ?? "", colWidths[index]))
      .join(" | ")} |\n`;
  });

  return output;
};

const renderJsonNodeToHtml = (node: JSONContent): string => {
  if (node.type === "text") {
    let text = escapeHtml(node.text ?? "");
    (node.marks ?? []).forEach((mark) => {
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      else if (mark.type === "italic") text = `<em>${text}</em>`;
      else if (mark.type === "strike") text = `<s>${text}</s>`;
      else if (mark.type === "code") text = `<code>${text}</code>`;
      else if (mark.type === "link" && mark.attrs?.href) {
        text = `<a href="${escapeHtml(String(mark.attrs.href))}">${text}</a>`;
      }
    });
    return text;
  }

  const children = (node.content ?? []).map(renderJsonNodeToHtml).join("");
  switch (node.type) {
    case "paragraph":
      return `<p>${children}</p>`;
    case "hardBreak":
      return "<br />";
    case "bulletList":
      return `<ul>${children}</ul>`;
    case "orderedList":
      return `<ol>${children}</ol>`;
    case "listItem":
      return `<li>${children}</li>`;
    case "blockquote":
      return `<blockquote>${children}</blockquote>`;
    case "heading": {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 1));
      return `<h${level}>${children}</h${level}>`;
    }
    case "codeBlock":
      return `<pre><code>${escapeHtml(node.content?.map((child) => child.text ?? "").join("") ?? "")}</code></pre>`;
    default:
      return children;
  }
};

const tableJsonUsesRichMarkdown = (node: JSONContent) =>
  (node.content ?? []).some((row) =>
    (Number(row.attrs?.rowHeight) || 0) > 0
    || (row.content ?? []).some((cell) => {
      const colspan = Number(cell.attrs?.colspan ?? 1);
      const rowspan = Number(cell.attrs?.rowspan ?? 1);
      const colwidth = Array.isArray(cell.attrs?.colwidth) ? cell.attrs?.colwidth : null;
      const verticalAlign = typeof cell.attrs?.verticalAlign === "string" ? cell.attrs.verticalAlign : "middle";
      return colspan > 1 || rowspan > 1 || verticalAlign !== "middle" || Boolean(colwidth?.some((width) => Number(width) > 0));
    })
  );

const renderRichTableToMarkdown = (node: JSONContent) => {
  const body = (node.content ?? [])
    .map((row) => {
      const rowHeight = Number(row.attrs?.rowHeight ?? 0);
      const rowAttrs = rowHeight > 0 ? ` data-rowheight="${rowHeight}" style="height:${rowHeight}px"` : "";
      const cells = (row.content ?? [])
        .map((cell) => {
          const tag = cell.type === "tableHeader" ? "th" : "td";
          const attrs: string[] = [];
          const colspan = Number(cell.attrs?.colspan ?? 1);
          const rowspan = Number(cell.attrs?.rowspan ?? 1);
          const align = typeof cell.attrs?.align === "string" ? cell.attrs.align : "";
          const verticalAlign = typeof cell.attrs?.verticalAlign === "string" ? cell.attrs.verticalAlign : "";
          const colwidth = Array.isArray(cell.attrs?.colwidth)
            ? cell.attrs.colwidth.map((width) => Number(width)).filter((width) => Number.isFinite(width) && width > 0)
            : [];
          if (colspan > 1) attrs.push(`colspan="${colspan}"`);
          if (rowspan > 1) attrs.push(`rowspan="${rowspan}"`);
          if (colwidth.length) attrs.push(`colwidth="${colwidth.join(",")}"`);
          const styleParts = [
            align ? `text-align:${align}` : "",
            verticalAlign ? `vertical-align:${verticalAlign}` : ""
          ].filter(Boolean);
          if (styleParts.length) attrs.push(`style="${styleParts.join(";")}"`);
          return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${(cell.content ?? []).map(renderJsonNodeToHtml).join("") || "<p></p>"}</${tag}>`;
        })
        .join("");
      return `<tr${rowAttrs}>${cells}</tr>`;
    })
    .join("");

  return `\n<table data-rich-table="true"><tbody>${body}</tbody></table>\n`;
};

const RichTable = Table.extend({
  draggable: true,
  renderMarkdown(node, h) {
    const content = node as JSONContent;
    return tableJsonUsesRichMarkdown(content) ? renderRichTableToMarkdown(content) : renderTableToGfm(content, h);
  }
});

const TableStructureKeymap = Extension.create({
  name: "tableStructureKeymap",
  priority: 1000,
  addKeyboardShortcuts() {
    const deleteStructuredSelection = () => {
      const selection = this.editor.state.selection;
      if (selection instanceof CellSelection) {
        if (selection.isRowSelection()) return this.editor.commands.deleteRow();
        if (selection.isColSelection()) return this.editor.commands.deleteColumn();
        return false;
      }
      if (selection instanceof NodeSelection && selection.node.type.name === "table") {
        this.editor.view.dispatch(this.editor.state.tr.deleteSelection().scrollIntoView());
        return true;
      }
      return false;
    };

    return {
      Backspace: deleteStructuredSelection,
      Delete: deleteStructuredSelection,
      "Mod-Backspace": deleteStructuredSelection,
      "Mod-Delete": deleteStructuredSelection
    };
  }
});

function normalizeEditorPanes(
  panes: EditorPaneState[],
  isValidDocument: (documentId: string) => boolean = () => true
): EditorPaneState[] {
  const valid = panes.filter((pane) => isValidDocument(pane.documentId)).slice(0, 2);
  if (!valid.length) return [];
  const normalized = valid.map((pane, index) => ({
    id: (index === 0 ? "main" : "secondary") as EditorPaneState["id"],
    documentId: pane.documentId
  }));
  if (normalized.length === 2 && normalized[0].documentId === normalized[1].documentId) {
    return [{ id: "main", documentId: normalized[0].documentId }];
  }
  return normalized;
}

const DOCUMENT_DRAG_MIME = "application/x-informio-document-id";
const FOLDER_DRAG_MIME = "application/x-informio-folder-path";
const TREE_ITEM_DRAG_MIME = "text/informio-tree-item";
const isInternalDocumentDrag = (dataTransfer: DataTransfer | null | undefined) =>
  Boolean(dataTransfer && Array.from(dataTransfer.types).includes(DOCUMENT_DRAG_MIME));
const isInternalTreeDrag = (dataTransfer: DataTransfer | null | undefined) =>
  Boolean(
    dataTransfer &&
      Array.from(dataTransfer.types).some((type) => type === TREE_ITEM_DRAG_MIME || type === DOCUMENT_DRAG_MIME || type === FOLDER_DRAG_MIME)
  );

type TreeDragPayload =
  | { type: "file"; documentId: string; path: string }
  | { type: "folder"; path: string };

const serializeTreeDragPayload = (payload: TreeDragPayload) => JSON.stringify(payload);

const parseTreeDragPayload = (dataTransfer: DataTransfer): TreeDragPayload | null => {
  const raw = dataTransfer.getData(TREE_ITEM_DRAG_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<TreeDragPayload>;
      if (parsed.type === "file" && typeof parsed.documentId === "string" && typeof parsed.path === "string") {
        return { type: "file", documentId: parsed.documentId, path: parsed.path };
      }
      if (parsed.type === "folder" && typeof parsed.path === "string") {
        return { type: "folder", path: parsed.path };
      }
    } catch {
      // Fall back to legacy payloads below.
    }
  }

  const documentId = dataTransfer.getData(DOCUMENT_DRAG_MIME);
  if (documentId) return { type: "file", documentId, path: "" };
  const folderPath = dataTransfer.getData(FOLDER_DRAG_MIME);
  return folderPath ? { type: "folder", path: folderPath } : null;
};

const permissionModeLabel: Record<AgentPermissionMode, string> = {
  read_only: "只读",
  default: "审核权限",
  full_access: "默认权限"
};

const agentPermissionModes: AgentPermissionMode[] = ["read_only", "default", "full_access"];

const isCancelledAgentMessage = (message: Pick<AgentSessionMessage, "error">) =>
  /取消|中断|cancel|cancelled|canceled|abort|aborted/i.test(message.error ?? "");

const sessionStatusLabel: Record<AgentSessionStatus, string> = {
  idle: "空闲",
  thinking: "处理中",
  "tool-executing": "执行中",
  done: "完成",
  error: "失败"
};

type AgentProcessCategory = "system" | "explore" | "search" | "read" | "edit" | "command" | "approval" | "other";

const formatProcessDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const formatConversationUpdatedAt = (value: string) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
};

const classifyAgentAction = (action: AgentSessionAction): AgentProcessCategory => {
  if (action.kind) {
    if (action.kind === "system" || action.kind === "message" || action.kind === "reasoning") return "system";
    if (action.kind === "file_change") return "edit";
    if (action.kind === "tool" || action.kind === "plan") return "explore";
    if (action.kind === "approval") return "approval";
    if (action.kind === "search" || action.kind === "read" || action.kind === "command") return action.kind;
  }
  const source = `${action.tool} ${action.label}`.toLowerCase();
  if (
    source.includes("get_workspace_context")
    || source.includes("get_current_document")
    || source.includes("get_selection")
    || source.includes("agent_call")
    || source.includes("cli_run")
  ) {
    return "system";
  }
  if (
    source.includes("search")
    || source.includes("grep")
    || source.includes("rg")
    || source.includes("find")
    || source.includes("query")
  ) {
    return "search";
  }
  if (
    source.includes("read")
    || source.includes("open")
    || source.includes("file")
    || source.includes("cat")
    || source.includes("note")
  ) {
    return "read";
  }
  if (
    source.includes("edit")
    || source.includes("write")
    || source.includes("patch")
    || source.includes("replace")
    || source.includes("rename")
    || source.includes("create")
  ) {
    return "edit";
  }
  if (
    source.includes("bash")
    || source.includes("shell")
    || source.includes("command")
    || source.includes("terminal")
    || source.includes("exec")
    || source.includes("run")
  ) {
    return "command";
  }
  if (
    source.includes("list")
    || source.includes("inspect")
    || source.includes("explore")
    || source.includes("analy")
    || source.includes("scan")
  ) {
    return "explore";
  }
  return "other";
};

const didAgentEditFiles = (messages: AgentSessionMessage[]) =>
  messages.some((message) => message.actions.some((action) => action.kind === "file_change" && action.status !== "error"));

const processCategoryLabel: Record<Exclude<AgentProcessCategory, "system">, string> = {
  explore: "探索",
  search: "搜索",
  read: "读文件",
  edit: "编辑",
  command: "命令",
  approval: "审批",
  other: "步骤"
};

const summarizeAgentProcess = (actions: AgentSessionAction[]) => {
  const counts: Record<Exclude<AgentProcessCategory, "system">, number> = {
    explore: 0,
    search: 0,
    read: 0,
    edit: 0,
    command: 0,
    approval: 0,
    other: 0
  };
  let hiddenSystemActions = 0;

  actions.forEach((action) => {
    const category = classifyAgentAction(action);
    if (category === "system") {
      hiddenSystemActions += 1;
      return;
    }
    counts[category] += 1;
  });

  const segments = (Object.entries(counts) as Array<[Exclude<AgentProcessCategory, "system">, number]>)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${processCategoryLabel[category]} ${count}`);

  return {
    summary: segments.join(" · "),
    hiddenSystemActions,
    visibleActionCount: segments.length ? Object.values(counts).reduce((total, count) => total + count, 0) : 0
  };
};

const mergeFinalAgentResponse = (current: string, next?: string) => {
  if (!next) return current;
  if (!current) return next;
  if (next === current) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  if (next.includes(current)) return next;
  if (current.includes(next)) return current;
  return next.length >= current.length ? next : current;
};

const selectionToolbarLabel = "翻译";
const selectionToolbarSafeAreaSelector = "[data-selection-toolbar-safe-area]";
let selectionToolbarInteractionLockUntil = 0;
// Most recent drag-selected text inside the selection-translate toolbar.
// Captured on mouseup inside TranslationResultText so that Cmd+C can still
// honor a partial drag even when the DOM Selection collapses before the
// Electron menu accelerator fires `edit:copy`.
let lastToolbarSelectionText = "";

const resolveTranslationTarget = (text: string): "zh-CN" | "en" => {
  const normalized = text.trim();
  const hasEnglishLetter = /[A-Za-z]/.test(normalized);
  const hasCjk = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(normalized);
  return hasEnglishLetter && !hasCjk ? "zh-CN" : "en";
};

const markSelectionToolbarInteraction = () => {
  selectionToolbarInteractionLockUntil = Date.now() + 250;
};

const isSelectionToolbarInteractionActive = () => {
  const activeInsideToolbar =
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? Boolean(document.activeElement.closest(selectionToolbarSafeAreaSelector))
      : false;
  return activeInsideToolbar || Date.now() < selectionToolbarInteractionLockUntil;
};

type ToolbarIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

type SelectionToolbarAction = {
  id: "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript" | "highlight" | "link";
  label: string;
  icon: ToolbarIcon;
};

type InsertToolbarAction =
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

const selectionToolbarActions: SelectionToolbarAction[] = [
  { id: "bold", label: "加粗", icon: Bold },
  { id: "italic", label: "倾斜", icon: Italic },
  { id: "underline", label: "下划线", icon: UnderlineIcon },
  { id: "strike", label: "删除线", icon: Strikethrough },
  { id: "subscript", label: "下标", icon: SubscriptIcon },
  { id: "superscript", label: "上标", icon: SuperscriptIcon },
  { id: "highlight", label: "高亮", icon: Highlighter },
  { id: "link", label: "加链接", icon: Link2 }
];

const insertToolbarActions: InsertToolbarAction[] = [
  { id: "image", label: "插入图片", icon: ImageIcon, kind: "asset", assetKind: "image" },
  { id: "video", label: "插入视频", icon: Film, kind: "asset", assetKind: "video" },
  { id: "audio", label: "插入音频", icon: Music, kind: "asset", assetKind: "audio" },
  { id: "pdf", label: "插入 PDF", icon: FileText, kind: "asset", assetKind: "pdf" },
  { id: "chart", label: "插入 Mermaid 图表", icon: ChartNoAxesColumnIncreasing, kind: "command", command: "insert:chart" },
  { id: "table", label: "插入表格", icon: Table2, kind: "command", command: "insert:table" },
  { id: "bullet-list", label: "插入项目符号列表", icon: LayoutList, kind: "command", command: "format:bullet-list" },
  { id: "ordered-list", label: "插入编号列表", icon: ListOrdered, kind: "command", command: "format:ordered-list" },
  { id: "task-list", label: "插入任务列表", icon: ListTodo, kind: "command", command: "format:task-list" },
  { id: "blockquote", label: "插入 Note", icon: TextQuote, kind: "command", command: "format:blockquote" },
  { id: "callout", label: "插入 Callout", icon: MessageSquareQuote, kind: "command", command: "insert:callout" },
  { id: "code", label: "插入代码块", icon: Code2, kind: "command", command: "format:code-block" },
  { id: "footnote", label: "插入脚注", icon: Text, kind: "command", command: "insert:footnote" },
  { id: "horizontal-rule", label: "插入水平分隔线", icon: Minus, kind: "command", command: "insert:horizontal-rule" }
];

type CommandPaletteScope = "system" | "document";

type CommandPaletteItem = {
  id: string;
  scope: CommandPaletteScope;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
};

const shortcutDisplayPlatform = navigator.platform.toLowerCase().includes("mac") ? "mac" : "windows";
const isWindowsPlatform = shortcutDisplayPlatform === "windows";

const normalizePath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
const normalizePathForCompare = (path: string) => {
  const normalized = normalizePath(path);
  return isWindowsPlatform ? normalized.toLowerCase() : normalized;
};

const pathBaseName = (path: string) => normalizePath(path).split("/").filter(Boolean).at(-1) ?? path;

const pathDirName = (path: string) => normalizePath(path).split("/").slice(0, -1).join("/") || path;

const pathExtName = (path: string) => {
  const base = pathBaseName(path);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
};

const isAbsoluteAssetPath = (path: string) => path.startsWith("/") || /^[A-Za-z]:\//.test(path);

const hasRenderableScheme = (src: string) => /^(?:https?:|data:|blob:|local-file:)/i.test(src);

const safeDecodeUri = (value: string) => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};

const encodeLocalFilePath = (path: string) => normalizePath(path).split("/").map((part) => encodeURIComponent(part)).join("/");

const localFileUrlForPath = (path: string) => {
  const encoded = encodeLocalFilePath(path);
  return `local-file://${encoded.startsWith("/") ? encoded : `/${encoded}`}`;
};

const joinAssetPath = (folder: string, assetPath: string) => {
  const normalizedFolder = normalizePath(folder);
  const normalizedAsset = normalizePath(assetPath).replace(/^\.?\//, "");
  return `${normalizedFolder}/${normalizedAsset}`;
};

const resolveMarkdownAssetSrc = (src: string, basePath?: string) => {
  const trimmed = src.trim();
  if (!trimmed || hasRenderableScheme(trimmed)) return trimmed;
  if (/^file:\/\//i.test(trimmed)) return trimmed.replace(/^file:\/\//i, "local-file://");
  const [pathPart, suffix = ""] = trimmed.split(/([?#].*)/, 2);
  const decodedPath = safeDecodeUri(pathPart);
  const baseFolder = basePath ? (pathExtName(basePath) ? pathDirName(basePath) : normalizePath(basePath)) : "";
  const absolutePath = isAbsoluteAssetPath(decodedPath)
    ? decodedPath
    : baseFolder
      ? joinAssetPath(baseFolder, decodedPath)
      : "";
  return absolutePath ? `${localFileUrlForPath(absolutePath)}${suffix}` : trimmed;
};

const resolveMarkdownAssetPath = (src: string, basePath?: string) => {
  const trimmed = src.trim();
  if (!trimmed || /^(?:https?:|data:|blob:)/i.test(trimmed)) return "";
  if (/^(?:local-file:|file:)/i.test(trimmed)) return assetPathPartFromSrc(trimmed);
  const [pathPart] = trimmed.split(/[?#]/, 1);
  const decodedPath = safeDecodeUri(pathPart ?? "");
  const baseFolder = basePath ? (pathExtName(basePath) ? pathDirName(basePath) : normalizePath(basePath)) : "";
  if (isAbsoluteAssetPath(decodedPath)) return decodedPath;
  return baseFolder ? joinAssetPath(baseFolder, decodedPath) : "";
};

const loadLocalAssetObjectUrl = async (path: string) => {
  const asset = await window.informio.loadAsset(path);
  return URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType }));
};

const assetPathPartFromSrc = (src: string) => {
  const trimmed = src.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol === "local-file:" || url.protocol === "file:") {
      const host = decodeURIComponent(url.host);
      const pathname = decodeURIComponent(url.pathname);
      if (/^[A-Za-z]:?$/.test(host)) return `${host.replace(/:$/, "")}:${pathname}`;
      return url.host ? `/${host}${pathname}` : pathname;
    }
    if (url.protocol === "http:" || url.protocol === "https:") return decodeURIComponent(url.pathname);
  } catch {
    // Fall back to path-style parsing below.
  }
  return safeDecodeUri(trimmed.split(/[?#]/, 1)[0] ?? "");
};

const assetExtensionFromSrc = (src: string) =>
  pathExtName(assetPathPartFromSrc(src)).slice(1).toLowerCase();

const pathContains = (folder: string, path: string) => {
  const normalizedFolder = normalizePathForCompare(folder);
  const normalizedPath = normalizePathForCompare(path);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
};

const relativePath = (folder: string, path: string) => {
  const normalizedFolder = normalizePath(folder);
  const normalizedPath = normalizePath(path);
  return pathContains(folder, path) ? normalizedPath.slice(normalizedFolder.length).replace(/^\/+/, "") || pathBaseName(path) : pathBaseName(path);
};

const markdownTitle = (title: string) => title.replace(/\.(md|markdown|txt)$/i, "");

const normalizeLinkTitle = (value: string) =>
  decodeURIComponent(value)
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.(md|markdown|txt)$/i, "")
    .trim()
    .toLowerCase() ?? "";

const wikilinkLabel = (doc: InformioDocument) => markdownTitle(doc.title);

const parseWikiLinkBody = (value: string) => {
  const [rawTarget, ...aliasParts] = value.split("|");
  const target = rawTarget.trim();
  const alias = aliasParts.join("|").trim();
  return { target, alias: alias || undefined };
};

const wikiLinkText = (target: string, alias?: string) => `[[${target}${alias ? `|${alias}` : ""}]]`;

type IndexedDocument = {
  document: InformioDocument;
  normalizedTitle: string;
  normalizedFilePath: string;
  folderPath: string;
};

type WikiTargetBucket = {
  candidates: IndexedDocument[];
  latest: IndexedDocument | null;
};

type WikiSuggestionItem = {
  document: InformioDocument;
  lowerLabel: string;
};

type DocumentLookupIndex = {
  byWikiTarget: Map<string, WikiTargetBucket>;
  byMarkdownTitleLower: Map<string, InformioDocument>;
  byMarkdownTitleExact: Map<string, InformioDocument>;
  byExactTitle: Map<string, InformioDocument>;
  byFilePath: Map<string, InformioDocument>;
  wikiSuggestions: WikiSuggestionItem[];
};

const buildDocumentLookupIndex = (documents: InformioDocument[], excludedSuggestionDocumentId?: string): DocumentLookupIndex => {
  const byWikiTarget = new Map<string, WikiTargetBucket>();
  const byMarkdownTitleLower = new Map<string, InformioDocument>();
  const byMarkdownTitleExact = new Map<string, InformioDocument>();
  const byExactTitle = new Map<string, InformioDocument>();
  const byFilePath = new Map<string, InformioDocument>();
  const wikiSuggestions: WikiSuggestionItem[] = [];

  documents.forEach((document) => {
    if (document.filePath && !byFilePath.has(document.filePath)) byFilePath.set(document.filePath, document);
    if (!byExactTitle.has(document.title)) byExactTitle.set(document.title, document);

    const markdownBaseTitle = markdownTitle(document.title);
    const markdownKey = markdownBaseTitle.toLowerCase();
    if (markdownKey && !byMarkdownTitleLower.has(markdownKey)) byMarkdownTitleLower.set(markdownKey, document);
    if (markdownBaseTitle && !byMarkdownTitleExact.has(markdownBaseTitle)) byMarkdownTitleExact.set(markdownBaseTitle, document);

    const candidate: IndexedDocument = {
      document,
      normalizedTitle: normalizeLinkTitle(document.title),
      normalizedFilePath: normalizeLinkTitle(document.filePath ?? ""),
      folderPath: document.filePath ? pathDirName(document.filePath) : ""
    };

    Array.from(new Set([candidate.normalizedTitle, candidate.normalizedFilePath].filter(Boolean))).forEach((key) => {
      const bucket = byWikiTarget.get(key) ?? { candidates: [], latest: null };
      bucket.candidates.push(candidate);
      if (!bucket.latest || candidate.document.updatedAt.localeCompare(bucket.latest.document.updatedAt) > 0) {
        bucket.latest = candidate;
      }
      byWikiTarget.set(key, bucket);
    });

    if (document.id !== excludedSuggestionDocumentId) {
      wikiSuggestions.push({
        document,
        lowerLabel: wikilinkLabel(document).toLowerCase()
      });
    }
  });

  wikiSuggestions.sort((left, right) => right.document.updatedAt.localeCompare(left.document.updatedAt));

  return { byWikiTarget, byMarkdownTitleLower, byMarkdownTitleExact, byExactTitle, byFilePath, wikiSuggestions };
};

const resolveWikiLink = (target: string, documentLookupIndex: DocumentLookupIndex, currentDocument?: InformioDocument) => {
  const normalizedTarget = normalizeLinkTitle(target);
  if (!normalizedTarget) return undefined;
  const bucket = documentLookupIndex.byWikiTarget.get(normalizedTarget);
  if (!bucket?.candidates.length) return undefined;
  const exact = bucket.candidates.find((candidate) => candidate.normalizedTitle === normalizedTarget)?.document;
  if (exact) return exact;
  const currentFolder = currentDocument?.filePath ? pathDirName(currentDocument.filePath) : "";
  const sameFolder = bucket.candidates.find((candidate) => candidate.folderPath && currentFolder && candidate.folderPath === currentFolder)?.document;
  if (sameFolder) return sameFolder;
  return bucket.latest?.document;
};

const resolveReferencedDocuments = (message: string, documentLookupIndex: DocumentLookupIndex) => {
  const names = Array.from(message.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)).map((match) => match[1].trim().toLowerCase());
  const uniqueNames = Array.from(new Set(names));
  return uniqueNames
    .map((name) => documentLookupIndex.byMarkdownTitleLower.get(name))
    .filter((document): document is InformioDocument => Boolean(document));
};

const findDocumentForActionPath = (path: string, documentLookupIndex: DocumentLookupIndex) =>
  documentLookupIndex.byFilePath.get(path)
  ?? documentLookupIndex.byExactTitle.get(path)
  ?? documentLookupIndex.byMarkdownTitleExact.get(markdownTitle(path));

const collectWikiSuggestions = (documentLookupIndex: DocumentLookupIndex, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return documentLookupIndex.wikiSuggestions.slice(0, 8).map((item) => item.document);

  const startsWith: InformioDocument[] = [];
  const contains: InformioDocument[] = [];
  documentLookupIndex.wikiSuggestions.forEach((item) => {
    if (!item.lowerLabel.includes(normalizedQuery)) return;
    if (item.lowerLabel.startsWith(normalizedQuery)) {
      if (startsWith.length < 8) startsWith.push(item.document);
      return;
    }
    contains.push(item.document);
  });
  return [...startsWith, ...contains].slice(0, 8);
};

const replaceWikiLinkTargets = (markdown: string, oldTitle: string, newTitle: string) =>
  markdown.replace(/\[\[([^\]\n]+)\]\]/g, (match, body: string) => {
    const parsed = parseWikiLinkBody(body);
    return normalizeLinkTitle(parsed.target) === normalizeLinkTitle(oldTitle) ? wikiLinkText(newTitle, parsed.alias) : match;
  });

type FrontmatterParseResult = {
  hasFrontmatter: boolean;
  raw: string;
  body: string;
  values: Record<string, unknown>;
  error?: string;
};

const parseFrontmatter = (markdown: string): FrontmatterParseResult => {
  if (!markdown.startsWith("---\n") && markdown.trim() !== "---") return { hasFrontmatter: false, raw: "", body: markdown, values: {} };
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) return { hasFrontmatter: true, raw: markdown.slice(4), body: "", values: {}, error: "Frontmatter is missing a closing --- line." };
  const closeEnd = markdown.indexOf("\n", end + 4);
  const raw = markdown.slice(4, end).replace(/^\n/, "");
  const body = closeEnd >= 0 ? markdown.slice(closeEnd + 1) : "";
  try {
    const parsed = YAML.parse(raw || "{}");
    return { hasFrontmatter: true, raw, body, values: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {} };
  } catch (error) {
    return { hasFrontmatter: true, raw, body, values: {}, error: error instanceof Error ? error.message : String(error) };
  }
};

const stringifyFrontmatter = (values: Record<string, unknown>) => {
  const yaml = YAML.stringify(values, { lineWidth: 0 }).trim();
  return yaml ? `---\n${yaml}\n---\n` : "";
};

const composeMarkdownWithFrontmatter = (frontmatter: FrontmatterParseResult, body: string) =>
  frontmatter.hasFrontmatter ? `---\n${frontmatter.raw.trimEnd()}\n---\n${body.replace(/^\n+/, "")}` : body;

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const pdfExtensions = new Set(["pdf"]);
const videoExtensions = new Set(["mp4", "mov", "webm"]);
const audioExtensions = new Set(["mp3", "wav", "m4a", "ogg"]);

const documentKindFromPath = (path?: string): InformioDocumentKind => {
  if (!path) return "markdown";
  const extension = assetExtensionFromSrc(path);
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "txt") return "text";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  if (pdfExtensions.has(extension)) return "pdf";
  return "unknown";
};

const documentKind = (document?: InformioDocument | null): InformioDocumentKind =>
  document ? (document.kind ?? documentKindFromPath(document.filePath ?? document.title)) : "unknown";

const isImageFile = (path?: string) => Boolean(path && imageExtensions.has(assetExtensionFromSrc(path)));

const isPdfFile = (path?: string) => Boolean(path && pdfExtensions.has(assetExtensionFromSrc(path)));

const isWritableTextDocument = (document?: InformioDocument | null) => {
  if (!document) return false;
  const kind = documentKind(document);
  return kind === "markdown" || kind === "text";
};

const isMarkdownDocument = (document?: InformioDocument | null) => {
  if (!document) return false;
  return documentKind(document) === "markdown";
};

const mediaExtensions = new Set([...videoExtensions, ...audioExtensions]);
const lowlight = createLowlight(common);
lowlight.registerAlias({
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  markdown: ["md"],
  shell: ["sh", "zsh"],
  xml: ["html"]
});

const codeLanguageAliases: Record<string, string> = {
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  plaintext: "plaintext",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  py: "python",
  sh: "bash",
  yml: "yaml"
};

const isVideoFile = (path?: string) => Boolean(path && videoExtensions.has(assetExtensionFromSrc(path)));

const isAudioFile = (path?: string) => Boolean(path && audioExtensions.has(assetExtensionFromSrc(path)));

const mediaKindFromSrc = (src: string) => {
  const extension = assetExtensionFromSrc(src);
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  return "";
};

const isEmbeddableAssetFile = (path?: string) =>
  isPdfFile(path) || isImageFile(path) || isVideoFile(path) || isAudioFile(path);

const isEmbeddableAssetDocument = (document?: InformioDocument | null) => {
  const kind = documentKind(document);
  return kind === "pdf" || kind === "image" || kind === "video" || kind === "audio";
};

const imageExtensionFromMimeType = (mimeType: string) => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
};

type MarkdownTokenLike = {
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

type MarkdownHelperLike = {
  createTextNode: (text: string) => unknown;
  createNode: (name: string, attrs?: Record<string, unknown>, content?: unknown[]) => unknown;
};

type SecretKind = "inline" | "block";

type EncryptedSecretAttrs = {
  kind: SecretKind;
  version: string;
  salt: string;
  iv: string;
  iterations: number;
  algorithm: string;
  kdf: string;
  cipherText: string;
};

type SecretDecryptRequest = {
  pos: number;
  kind: SecretKind;
  attrs: EncryptedSecretAttrs;
};

const documentSecretPassphraseCache = new Map<string, string>();

const plainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();

const parseHtmlAttr = (html: string, name: string) => {
  const match = new RegExp(`${name}=["']([^"']*)["']`, "i").exec(html);
  return match?.[1] ?? "";
};

const chartLabels = (text: string) => Array.from(text.matchAll(/\b[A-Za-z0-9_]+\[([^\]]+)\]/g)).map((match) => match[1]);

const defaultBlockSource = (name: string) => {
  if (name === "mathInline") return "$x$";
  if (name === "mathBlock") return "$$\nE = mc^2\n$$";
  if (name === "chartBlock") return "```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```";
  if (name === "footnoteBlock") return "[^1]: Footnote";
  if (name === "detailsBlock") return "> [!note]- Summary\n> Content";
  return "> [!NOTE]\n> Important note";
};

const nodeSourceAttr = (node: { attrs?: Record<string, unknown> }, fallbackType: string) => {
  const source = node.attrs?.source;
  return typeof source === "string" ? source : defaultBlockSource(fallbackType);
};

const sourceText = (node: ReactNodeViewProps["node"]) => {
  return node.textContent !== "" ? node.textContent : nodeSourceAttr(node as { attrs?: { source?: string } }, node.type.name);
};

const jsonTextContent = (node?: JSONContent): string =>
  node?.text ?? node?.content?.map((child) => jsonTextContent(child)).join("") ?? "";

const jsonSourceText = (node: JSONContent, fallbackType: string) =>
  jsonTextContent(node) !== ""
    ? jsonTextContent(node)
    : nodeSourceAttr(node as { attrs?: { source?: string } }, fallbackType);

const sourceContent = (source: string, h: MarkdownHelperLike) => [h.createTextNode(source)];

const sourceBackedBlockContent = (source: string) => [{ type: "text", text: source }];

const sourceBackedBlockJson = (type: string, source: string, focus = false): JSONContent => ({
  type,
  attrs: { source, focusKey: focus ? String(Date.now()) : "" },
  content: sourceBackedBlockContent(source)
});

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return window.btoa(binary);
};

const base64ToBytes = (value: string) => Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
const normalizeSecretBytes = (bytes: Uint8Array) => Uint8Array.from(bytes);

const secretAttrsFromElement = (element: HTMLElement, kind: SecretKind): EncryptedSecretAttrs => ({
  kind,
  version: element.getAttribute("version") ?? "1",
  salt: element.getAttribute("salt") ?? "",
  iv: element.getAttribute("iv") ?? "",
  iterations: Number.parseInt(element.getAttribute("iterations") ?? "", 10) || SECRET_ITERATIONS,
  algorithm: element.getAttribute("algorithm") ?? SECRET_ALGORITHM,
  kdf: element.getAttribute("kdf") ?? SECRET_KDF,
  cipherText: (element.textContent ?? "").trim()
});

const secretAttrsAreValid = (attrs: Partial<EncryptedSecretAttrs> | null | undefined): attrs is EncryptedSecretAttrs =>
  Boolean(
    attrs
    && (attrs.kind === "inline" || attrs.kind === "block")
    && attrs.version === "1"
    && typeof attrs.salt === "string"
    && typeof attrs.iv === "string"
    && typeof attrs.cipherText === "string"
    && attrs.salt
    && attrs.iv
    && attrs.cipherText
    && Number.isFinite(Number(attrs.iterations))
    && Number(attrs.iterations) > 0
    && attrs.algorithm === SECRET_ALGORITHM
    && attrs.kdf === SECRET_KDF
  );

const renderSecretMarkdown = (attrs: EncryptedSecretAttrs) => {
  const serialized = `<${INFORMIO_SECRET_TAG} kind="${attrs.kind}" version="${attrs.version}" salt="${attrs.salt}" iv="${attrs.iv}" iterations="${attrs.iterations}" algorithm="${attrs.algorithm}" kdf="${attrs.kdf}">${attrs.cipherText}</${INFORMIO_SECRET_TAG}>`;
  return attrs.kind === "block" ? `\n${serialized}\n` : serialized;
};

const importSecretKeyMaterial = async (passphrase: string) =>
  window.crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);

const deriveSecretKey = async (passphrase: string, salt: Uint8Array, iterations: number) =>
  window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: normalizeSecretBytes(salt),
      iterations
    },
    await importSecretKeyMaterial(passphrase),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

const encryptSecretMarkdown = async (markdown: string, passphrase: string, kind: SecretKind): Promise<EncryptedSecretAttrs> => {
  const salt = normalizeSecretBytes(window.crypto.getRandomValues(new Uint8Array(16)));
  const iv = normalizeSecretBytes(window.crypto.getRandomValues(new Uint8Array(12)));
  const key = await deriveSecretKey(passphrase, salt, SECRET_ITERATIONS);
  const cipherBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(markdown));

  return {
    kind,
    version: "1",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: SECRET_ITERATIONS,
    algorithm: SECRET_ALGORITHM,
    kdf: SECRET_KDF,
    cipherText: bytesToBase64(new Uint8Array(cipherBuffer))
  };
};

const decryptSecretMarkdown = async (attrs: EncryptedSecretAttrs, passphrase: string) => {
  const salt = normalizeSecretBytes(base64ToBytes(attrs.salt));
  const iv = normalizeSecretBytes(base64ToBytes(attrs.iv));
  const cipherText = normalizeSecretBytes(base64ToBytes(attrs.cipherText));
  const key = await deriveSecretKey(passphrase, salt, attrs.iterations);
  const plainBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherText);
  return new TextDecoder().decode(plainBuffer);
};

const serializeSelectionFragmentToMarkdown = (editor: Editor, from: number, to: number, kind: SecretKind) => {
  const fragment = editor.state.doc.slice(from, to).content.toJSON() as JSONContent[];
  if (!editor.markdown) return editor.state.doc.textBetween(from, to, "\n");
  if (kind === "inline") {
    return editor.markdown.serialize({
      type: "doc",
      content: [{ type: "paragraph", content: fragment }]
    } as JSONContent);
  }
  return editor.markdown.serialize({ type: "doc", content: fragment } as JSONContent);
};

const parseInlineMarkdownContent = (editor: Editor, markdown: string): JSONContent[] => {
  const parsed = editor.markdown?.parse(markdown);
  if (!parsed?.content?.length) return [{ type: "text", text: markdown }];
  const first = parsed.content[0];
  if (first.type === "paragraph" && first.content?.length) return first.content;
  return [{ type: "text", text: markdown }];
};

const selectionShouldUseBlockSecret = (editor: Editor) => {
  const { selection } = editor.state;
  if (selection.empty) return false;
  if (!selection.$from.sameParent(selection.$to)) return true;
  if (!selection.$from.parent.isTextblock) return true;
  return selection.from <= selection.$from.start() && selection.to >= selection.$to.end();
};

const selectionContainsSecretNode = (editor: Editor, from: number, to: number) => {
  let containsSecret = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === "encryptedInline" || node.type.name === "encryptedBlock") {
      containsSecret = true;
      return false;
    }
    return true;
  });
  return containsSecret;
};

const findFirstValidSecretInDocument = (editor: Editor) => {
  let found: EncryptedSecretAttrs | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "encryptedInline" && node.type.name !== "encryptedBlock") return true;
    const attrs = node.attrs as Partial<EncryptedSecretAttrs>;
    if (secretAttrsAreValid(attrs)) {
      found = attrs;
      return false;
    }
    return true;
  });
  return found;
};

const documentContainsSecretNode = (editor: Editor) => {
  let containsSecret = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "encryptedInline" || node.type.name === "encryptedBlock") {
      containsSecret = true;
      return false;
    }
    return true;
  });
  return containsSecret;
};

const mathTextFromSource = (source: string) => {
  const trimmed = source.trim();
  const match =
    trimmed.match(/^\$\$\s*\n?([\s\S]*?)\n?\$\$$/) ??
    trimmed.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
  return (match?.[1] ?? source).trim();
};

const INLINE_MATH_BOUNDARY = String.raw`(?=$|[\s,.;:!?，。；：！？、)\]）】」』》])`;
const INLINE_MATH_TOKEN_REGEX = new RegExp(String.raw`^\$(?!\$)([^\n$]+?)\$(?!\$)` + INLINE_MATH_BOUNDARY);
const INLINE_MATH_AUTO_REGEX = new RegExp(String.raw`(^|[^\$])\$([^\n$]+?)\$(?!\$)` + INLINE_MATH_BOUNDARY, "g");
const INLINE_MATH_INPUT_WITH_PUNCTUATION_REGEX = /(^|[^\$])\$([^\n$]+?)\$([,.;:!?，。；：！？、)\]）】」』》])$/;
const isSkippableInlineMathContent = (content: string) => !content || /^\d+(?:\.\d+)?$/.test(content);

const chartTextFromSource = (source: string) => {
  const match = source.trim().match(/^```mermaid[^\n]*\n([\s\S]*?)\n```$/);
  return (match?.[1] ?? source).trim();
};

const isDiscardableMermaidSource = (source: string) => {
  const trimmed = source.trim();
  return !trimmed || /^`{1,3}(?:\s*mermaid)?\s*`{0,3}$/i.test(trimmed) || /^mermaid\s*`{0,3}$/i.test(trimmed);
};

const footnoteFromSource = (source: string) => {
  const match = source.trim().match(/^\[\^([^\]]+)]:\s*([\s\S]*)$/);
  return { index: match?.[1] ?? "1", text: match?.[2]?.trim() ?? source.trim() };
};

const detailsFromSource = (source: string) => {
  const trimmed = source.trim();
  const calloutMatch = trimmed.match(/^>\s*\[![A-Za-z0-9_-]+]-\s*(.*?)\s*\n?([\s\S]*)$/);
  if (calloutMatch) {
    const text = calloutMatch[2]
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n")
      .trim();
    return { summary: plainText(calloutMatch[1] || "Summary"), text };
  }
  const match = trimmed.match(/^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>$/i);
  return { summary: plainText(match?.[1] ?? "Summary"), text: plainText(match?.[2] ?? trimmed) };
};

const calloutFromSource = (source: string) => {
  const match = source.trim().match(/^>\s*\[!([A-Za-z0-9_-]+)]\s*(.*?)\s*\n?([\s\S]*)$/);
  const title = (match?.[1] ?? "NOTE").toUpperCase();
  const firstLine = match?.[2]?.trim();
  const body = match ? [firstLine, match[3]].filter(Boolean).join("\n") : source;
  const text = body
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
  return { title, text };
};

const normalizeCalloutTitle = (title: string) => {
  const normalized = title.toUpperCase();
  return ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"].includes(normalized) ? normalized : "NOTE";
};

type LowlightNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: LowlightNode[];
};

const hastToHtml = (node: LowlightNode): string => {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  const tag = node.tagName ?? "span";
  const className = Array.isArray(node.properties?.className) ? ` class="${node.properties.className.join(" ")}"` : "";
  return `<${tag}${className}>${(node.children ?? []).map(hastToHtml).join("")}</${tag}>`;
};

const normalizeCodeLanguage = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "plaintext";
  return codeLanguageAliases[normalized] ?? normalized;
};

const highlightedCodeHtml = (language: string, code: string) => {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (normalizedLanguage === "plaintext") return escapeHtml(code);
  try {
    const tree = lowlight.highlight(normalizedLanguage, code);
    return tree.children.map((child) => hastToHtml(child as LowlightNode)).join("");
  } catch {
    return escapeHtml(code);
  }
};

const codeBlockRawMarkdown = (language: string, code: string) => {
  const languageSuffix = language === "plaintext" ? "" : language;
  return `\`\`\`${languageSuffix}\n${code}\n\`\`\``;
};

const parseCodeBlockRawMarkdown = (value: string) => {
  const match = value.match(/^```([^\n`]*)\n([\s\S]*?)\n```$/);
  if (!match) return null;
  return {
    language: normalizeCodeLanguage(match[1] ?? "plaintext"),
    code: match[2] ?? ""
  };
};

const codeBlockEditableRange = (value: string) => {
  const firstLineEnd = value.indexOf("\n");
  const closingFenceStart = value.lastIndexOf("\n```");
  if (firstLineEnd < 0 || closingFenceStart <= firstLineEnd) return null;
  return {
    from: firstLineEnd + 1,
    to: closingFenceStart
  };
};

const replaceNodeWithPlainText = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode, text: string) => {
  const position = getPos();
  if (typeof position !== "number") return;
  const paragraph = editor.schema.nodes.paragraph;
  if (!paragraph) return;
  const paragraphs = text.split("\n").map((line) => paragraph.create(null, line ? editor.schema.text(line) : undefined));
  const tr = editor.state.tr.replaceWith(position, position + node.nodeSize, paragraphs);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(position + Math.max(1, text.length), tr.doc.content.size)));
  editor.view.dispatch(tr);
};

type NodeViewPositionGetter = ReactNodeViewProps["getPos"];
type NodeViewNode = ReactNodeViewProps["node"];

const isSelectionInsideNode = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode) => {
  const position = getPos();
  if (typeof position !== "number") return false;
  const from = position;
  const to = position + node.nodeSize;
  const selection = editor.state.selection;
  return selection.from > from && selection.to < to;
};

const useNodeLivePreviewState = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode, selected: boolean) => {
  const getActive = () => editor.isFocused && (selected || isSelectionInsideNode(editor, getPos, node));
  const [active, setActive] = useState(getActive);

  useEffect(() => {
    const update = () => setActive(getActive());
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    editor.on("focus", update);
    editor.on("blur", update);
    update();
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      editor.off("focus", update);
      editor.off("blur", update);
    };
  }, [editor, getPos, node, selected]);

  return active;
};

const focusNodeSource = (editor: Editor, getPos: NodeViewPositionGetter) => {
  const position = getPos();
  if (typeof position !== "number") return;
  editor.chain().focus().setTextSelection(position + 1).run();
};

const markdownOffsetForLine = (markdown: string, line: number) => {
  if (line <= 1) return 0;
  const lines = markdown.split("\n");
  let offset = 0;
  for (let index = 0; index < Math.min(line - 1, lines.length); index += 1) {
    offset += lines[index].length + 1;
  }
  return offset;
};

function CodeBlockView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const language = normalizeCodeLanguage(String(node.attrs.language || "plaintext"));
  const displayLanguage = language === "plaintext" ? "" : language;
  const [sourceFocused, setSourceFocused] = useState(false);
  const [draftCode, setDraftCode] = useState(node.textContent);
  const [draftLanguage, setDraftLanguage] = useState(displayLanguage);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const didAutoFocusSourceRef = useRef(false);
  const sourceActive = useNodeLivePreviewState(editor, getPos, node, selected);
  const active = sourceFocused;
  const previewHtml = highlightedCodeHtml(language, node.textContent);
  const resizeSourceTextarea = () => {
    const textarea = sourceRef.current;
    if (!textarea || !active) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(() => {
    if (sourceFocused) return;
    setDraftCode(node.textContent);
    setDraftLanguage(displayLanguage);
  }, [displayLanguage, node.textContent, sourceFocused]);

  useLayoutEffect(() => {
    resizeSourceTextarea();
  }, [active, draftCode]);

  const commitLanguage = (value = draftLanguage) => {
    const position = getPos();
    if (typeof position !== "number") return;
    const nextLanguage = normalizeCodeLanguage(value || "plaintext");
    if (nextLanguage === language) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, language: nextLanguage }));
  };

  useEffect(() => {
    if (!sourceFocused) return;
    const handlePointerDown = (event: PointerEvent) => {
      const wrapper = wrapperRef.current;
      if (!wrapper || !(event.target instanceof globalThis.Node) || wrapper.contains(event.target)) return;
      commitLanguage();
      setSourceFocused(false);
      sourceRef.current?.blur();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [commitLanguage, sourceFocused]);

  useEffect(() => {
    if (!sourceActive || sourceFocused || !editor.view.hasFocus()) return;
    setSourceFocused(true);
  }, [editor, sourceActive, sourceFocused]);

  const focusSourceBlock = () => {
    setSourceFocused(true);
    window.setTimeout(resizeSourceTextarea, 0);
  };

  const blurSourceBlockIfFocusLeft = () => {
    window.setTimeout(() => {
      const wrapper = wrapperRef.current;
      const activeElement = document.activeElement;
      if (wrapper && activeElement && wrapper.contains(activeElement)) return;
      commitLanguage();
      setSourceFocused(false);
    }, 0);
  };

  useEffect(() => {
    if (!active) {
      didAutoFocusSourceRef.current = false;
      return;
    }
    if (didAutoFocusSourceRef.current) return;
    didAutoFocusSourceRef.current = true;
    window.setTimeout(() => {
      const textarea = sourceRef.current;
      if (!textarea) return;
      resizeSourceTextarea();
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    }, 0);
  }, [active]);

  const applyCode = (value: string) => {
    setDraftCode(value);
    const position = getPos();
    if (typeof position !== "number") return;
    const textContent = value ? editor.schema.text(value) : ProseMirrorFragment.empty;
    const tr = editor.state.tr.replaceWith(position + 1, position + node.nodeSize - 1, textContent);
    editor.view.dispatch(tr);
  };

  const applyLanguage = (value: string) => {
    setDraftLanguage(value);
  };

  const handleSourceKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    const textarea = event.currentTarget;
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;

    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && selectionStart === selectionEnd) {
      const position = getPos();
      if (typeof position !== "number") return;
      const currentLineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
      const currentLineEndIndex = value.indexOf("\n", selectionStart);
      const currentLineEnd = currentLineEndIndex === -1 ? value.length : currentLineEndIndex;
      const atFirstCodeLine = currentLineStart === 0;
      const atLastCodeLine = currentLineEnd === value.length;
      if ((event.key === "ArrowUp" && atFirstCodeLine) || (event.key === "ArrowDown" && atLastCodeLine)) {
        event.preventDefault();
        setSourceFocused(false);
        textarea.blur();
        editor
          .chain()
          .focus()
          .setTextSelection(event.key === "ArrowUp" ? position : position + node.nodeSize)
          .run();
        return;
      }
    }

    if (event.key === "Escape") {
      const position = getPos();
      if (typeof position !== "number") return;
      event.preventDefault();
      setSourceFocused(false);
      textarea.blur();
      editor.chain().focus().setTextSelection(position + node.nodeSize).run();
      return;
    }

    if (event.key !== "Tab") return;

    event.preventDefault();
    const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const selectedText = value.slice(lineStart, selectionEnd);

    if (event.shiftKey) {
      const outdented = selectedText.replace(/^(?: {1,2}|\t)/gm, "");
      const nextValue = `${value.slice(0, lineStart)}${outdented}${value.slice(selectionEnd)}`;
      const removed = selectedText.length - outdented.length;
      applyCode(nextValue);
      window.setTimeout(() => {
        textarea.setSelectionRange(Math.max(lineStart, selectionStart - Math.min(2, removed)), Math.max(lineStart, selectionEnd - removed));
      }, 0);
      return;
    }

    const indented = selectedText.includes("\n") ? selectedText.replace(/^/gm, "  ") : `  ${value.slice(selectionStart, selectionEnd)}`;
    const replaceFrom = selectedText.includes("\n") ? lineStart : selectionStart;
    const replaceTo = selectedText.includes("\n") ? selectionEnd : selectionEnd;
    const nextValue = `${value.slice(0, replaceFrom)}${indented}${value.slice(replaceTo)}`;
    applyCode(nextValue);
    window.setTimeout(() => {
      const added = indented.length - value.slice(replaceFrom, replaceTo).length;
      textarea.setSelectionRange(selectionStart + 2, selectionEnd + added);
    }, 0);
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={cn("informio-code-block", active && "is-editing")}
      onMouseDown={(event: ReactMouseEvent) => {
        if (active) return;
        event.preventDefault();
        setSourceFocused(true);
        focusNodeSource(editor, getPos);
      }}
    >
      <div className={cn("informio-code-source", !active && "is-hidden-source-content")}>
        <textarea
          ref={sourceRef}
          value={draftCode}
          rows={Math.max(3, draftCode.split("\n").length)}
          contentEditable={false}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="informio-code-source-textarea"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onFocus={() => {
            focusSourceBlock();
          }}
          onBlur={blurSourceBlockIfFocusLeft}
          onChange={(event) => applyCode(event.currentTarget.value)}
          onKeyDown={handleSourceKeyDown}
        />
        <input
          value={draftLanguage}
          aria-label="代码语言"
          placeholder="plain text"
          spellCheck={false}
          className="informio-code-language-widget"
          onMouseDown={(event) => event.stopPropagation()}
          onFocus={focusSourceBlock}
          onBlur={blurSourceBlockIfFocusLeft}
          onChange={(event) => applyLanguage(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Escape" && event.key !== "Enter") return;
            event.preventDefault();
            if (event.key === "Enter") {
              commitLanguage(event.currentTarget.value);
            } else {
              setDraftLanguage(displayLanguage);
            }
            setSourceFocused(false);
            event.currentTarget.blur();
            const position = getPos();
            if (typeof position === "number") editor.chain().focus().setTextSelection(position + node.nodeSize).run();
          }}
        />
      </div>
      {!active ? (
        <pre contentEditable={false}>
          <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </pre>
      ) : null}
    </NodeViewWrapper>
  );
}

function MathPreview({ source }: { source: string }) {
  try {
    const html = katex.renderToString(mathTextFromSource(source), { displayMode: true, throwOnError: false });
    return <div className="informio-formula" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch (error) {
    return <div className="informio-block-error">{error instanceof Error ? error.message : String(error)}</div>;
  }
}

function MathInlineView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const active = useNodeLivePreviewState(editor, getPos, node, selected);
  const source = sourceText(node);
  const formula = mathTextFromSource(source);
  const moveOutAtSourceEdge = (event: ReactKeyboardEvent) => {
    if (event.key === "Enter") {
      const position = getPos();
      if (typeof position !== "number") return;
      event.preventDefault();
      editor.chain().focus().setTextSelection(position + node.nodeSize).run();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed) return;
    const sourceLength = source.length;
    const atStart = selection.anchorOffset === 0;
    const atEnd = selection.anchorOffset >= sourceLength;
    if ((event.key === "ArrowLeft" && !atStart) || (event.key === "ArrowRight" && !atEnd)) return;
    const position = getPos();
    if (typeof position !== "number") return;
    event.preventDefault();
    editor
      .chain()
      .focus()
      .setTextSelection(event.key === "ArrowLeft" ? position : position + node.nodeSize)
      .run();
  };

  if (active) {
    return (
      <NodeViewWrapper as="span" className="informio-math-inline is-editing" onKeyDownCapture={moveOutAtSourceEdge}>
        <NodeViewContent as={"span" as "div"} className="informio-inline-source-content" />
      </NodeViewWrapper>
    );
  }

  try {
    const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
    return (
      <NodeViewWrapper
        as="span"
        className="informio-math-inline"
        onMouseDown={(event: ReactMouseEvent) => {
          event.preventDefault();
          focusNodeSource(editor, getPos);
        }}
      >
        <NodeViewContent as={"span" as "div"} className="informio-inline-source-content is-hidden-source-content" />
        <span contentEditable={false} dangerouslySetInnerHTML={{ __html: html }} />
      </NodeViewWrapper>
    );
  } catch {
    return (
      <NodeViewWrapper
        as="span"
        className="informio-math-inline"
        onMouseDown={(event: ReactMouseEvent) => {
          event.preventDefault();
          focusNodeSource(editor, getPos);
        }}
      >
        <NodeViewContent as={"span" as "div"} className="informio-inline-source-content is-hidden-source-content" />
        <span contentEditable={false}>{formula}</span>
      </NodeViewWrapper>
    );
  }
}

function ChartPreview({ source }: { source: string }) {
  const [result, setResult] = useState<{ svg?: string; error?: string }>({});
  const id = useMemo(() => `informio-mermaid-${Math.random().toString(36).slice(2)}`, []);
  const diagram = chartTextFromSource(source);
  const discardable = isDiscardableMermaidSource(source) || !diagram;

  useEffect(() => {
    let cancelled = false;
    if (discardable) {
      setResult({});
      return () => {
        cancelled = true;
      };
    }
    import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: "neutral" });
        return mermaid.render(id, diagram);
      })
      .then(({ svg }) => {
        if (!cancelled) setResult({ svg });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [diagram, discardable, id]);

  if (discardable) return <div className="informio-block-preview-muted">Empty diagram</div>;
  if (result.error) return <div className="informio-block-error">{result.error}</div>;
  if (!result.svg) return <div className="informio-block-preview-muted">Rendering diagram...</div>;
  return <div className="informio-mermaid-preview" dangerouslySetInnerHTML={{ __html: result.svg }} />;
}

function StructuredBlockPreview({ name, source }: { name: string; source: string }) {
  if (name === "mathBlock") return <MathPreview source={source} />;
  if (name === "chartBlock") return <ChartPreview source={source} />;
  if (name === "footnoteBlock") {
    const footnote = footnoteFromSource(source);
    return (
      <div className="informio-footnote-preview">
        <sup>{footnote.index}</sup>
        <span>{footnote.text}</span>
      </div>
    );
  }
  if (name === "detailsBlock") {
    const details = detailsFromSource(source);
    return (
      <details className="informio-details-preview" open>
        <summary>{details.summary}</summary>
        <p>{details.text}</p>
      </details>
    );
  }
  const callout = calloutFromSource(source);
  return (
    <div className={cn("informio-callout-preview", `informio-callout-${normalizeCalloutTitle(callout.title).toLowerCase()}`)}>
      <strong>{normalizeCalloutTitle(callout.title)}</strong>
      <p>{callout.text || "\u00a0"}</p>
    </div>
  );
}

const replaceSourceBlockWithParagraph = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode) => {
  const position = getPos();
  if (typeof position !== "number") return false;
  const paragraph = editor.schema.nodes.paragraph?.create();
  if (!paragraph) return false;
  const tr = editor.state.tr.replaceWith(position, position + node.nodeSize, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(position + 1, tr.doc.content.size)));
  editor.view.dispatch(tr);
  return true;
};

const isDiscardableSourceRemainder = (typeName: string, source: string) =>
  source.trim() === "" || (typeName === "chartBlock" && isDiscardableMermaidSource(source));

function EditableSourceBlockView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const focusKey = (node.attrs as { focusKey?: string }).focusKey;
  const savedSource = (node.attrs as { source?: string }).source;
  const active = useNodeLivePreviewState(editor, getPos, node, selected);
  const source = sourceText(node);
  const userEditedSourceRef = useRef(false);

  useEffect(() => {
    if (focusKey) {
      window.setTimeout(() => focusNodeSource(editor, getPos), 0);
    }
  }, [editor, focusKey, getPos]);

  useEffect(() => {
    if (active) userEditedSourceRef.current = true;
  }, [active]);

  useEffect(() => {
    const nextSource = node.textContent;
    if (nextSource.trim() === "") {
      const position = getPos();
      if (typeof position !== "number") return;
      if (savedSource && !userEditedSourceRef.current) {
        const tr = editor.state.tr.replaceWith(position + 1, position + node.nodeSize - 1, editor.schema.text(savedSource));
        editor.view.dispatch(tr);
        return;
      }
      replaceSourceBlockWithParagraph(editor, getPos, node);
      return;
    }
    if (savedSource === nextSource && !focusKey) return;
    updateAttributes({ source: nextSource, focusKey: "" });
  }, [editor, focusKey, getPos, node.nodeSize, node.textContent, savedSource, updateAttributes]);

  return (
    <NodeViewWrapper
      className={cn("informio-source-block", active && "is-editing")}
      onKeyDownCapture={(event: ReactKeyboardEvent) => {
        if (!active || (event.key !== "Backspace" && event.key !== "Delete")) return;
        if (!isDiscardableSourceRemainder(node.type.name, node.textContent)) return;
        event.preventDefault();
        replaceSourceBlockWithParagraph(editor, getPos, node);
      }}
      onMouseDown={(event: ReactMouseEvent) => {
        if (active) return;
        event.preventDefault();
        focusNodeSource(editor, getPos);
      }}
    >
      <NodeViewContent as={"pre" as "div"} className={cn("informio-plain-source-content", !active && "is-hidden-source-content")} />
      {!active ? (
        <div className="informio-source-preview" contentEditable={false}>
          <StructuredBlockPreview name={node.type.name} source={source} />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

const editableSourceAttributes = () => ({
  source: { default: "" },
  focusKey: { default: "" }
});

type EncryptedTextOptions = {
  onRequestDecrypt: (request: SecretDecryptRequest) => void;
};

const selectEncryptedNode = (editor: Editor, getPos: NodeViewPositionGetter) => {
  const position = getPos();
  if (typeof position !== "number") return;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
  editor.commands.focus();
};

function EncryptedInlineView({ editor, getPos, node, selected, extension }: ReactNodeViewProps) {
  const attrs = node.attrs as Partial<EncryptedSecretAttrs>;
  const valid = secretAttrsAreValid(attrs);
  const options = extension.options as EncryptedTextOptions;

  return (
    <NodeViewWrapper
      as="span"
      className={cn("informio-secret-inline", selected && "is-selected", !valid && "is-invalid")}
      contentEditable={false}
      aria-label={valid ? "已加密内容" : "加密内容损坏"}
      onMouseDown={(event: ReactMouseEvent) => {
        event.preventDefault();
        selectEncryptedNode(editor, getPos);
      }}
      onClick={() => {
        if (!valid) return;
        const position = getPos();
        if (typeof position !== "number") return;
        options.onRequestDecrypt({ pos: position, kind: "inline", attrs });
      }}
    >
      <span className="informio-secret-mask" aria-hidden="true" />
      {!valid ? <span className="informio-secret-label">损坏</span> : null}
      {!valid ? <span className="informio-secret-status">请检查源码标签</span> : null}
    </NodeViewWrapper>
  );
}

function EncryptedBlockView({ editor, getPos, node, selected, extension }: ReactNodeViewProps) {
  const attrs = node.attrs as Partial<EncryptedSecretAttrs>;
  const valid = secretAttrsAreValid(attrs);
  const options = extension.options as EncryptedTextOptions;

  return (
    <NodeViewWrapper
      className={cn("informio-secret-block", selected && "is-selected", !valid && "is-invalid")}
      contentEditable={false}
      aria-label={valid ? "已加密内容" : "加密内容损坏"}
      onMouseDown={(event: ReactMouseEvent) => {
        event.preventDefault();
        selectEncryptedNode(editor, getPos);
      }}
      onClick={() => {
        if (!valid) return;
        const position = getPos();
        if (typeof position !== "number") return;
        options.onRequestDecrypt({ pos: position, kind: "block", attrs });
      }}
    >
      <div className="informio-secret-block-body" aria-hidden="true">
        <div className="informio-secret-mask is-wide" />
      </div>
      {!valid ? <div className="informio-secret-status">标签缺失必要字段，无法安全解密</div> : null}
    </NodeViewWrapper>
  );
}

const EncryptedInline = Node.create<EncryptedTextOptions>({
  name: "encryptedInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return {
      onRequestDecrypt: () => undefined
    };
  },
  addAttributes() {
    return {
      kind: {
        default: "inline",
        parseHTML: () => "inline"
      },
      version: {
        default: "1",
        parseHTML: (element) => element.getAttribute("version") ?? "1"
      },
      salt: {
        default: "",
        parseHTML: (element) => element.getAttribute("salt") ?? ""
      },
      iv: {
        default: "",
        parseHTML: (element) => element.getAttribute("iv") ?? ""
      },
      iterations: {
        default: SECRET_ITERATIONS,
        parseHTML: (element) => Number.parseInt(element.getAttribute("iterations") ?? "", 10) || SECRET_ITERATIONS
      },
      algorithm: {
        default: SECRET_ALGORITHM,
        parseHTML: (element) => element.getAttribute("algorithm") ?? SECRET_ALGORITHM
      },
      kdf: {
        default: SECRET_KDF,
        parseHTML: (element) => element.getAttribute("kdf") ?? SECRET_KDF
      },
      cipherText: {
        default: "",
        parseHTML: (element) => (element.textContent ?? "").trim()
      }
    };
  },
  parseHTML() {
    return [{ tag: `${INFORMIO_SECRET_TAG}[kind="inline"]` }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as EncryptedSecretAttrs;
    return [
      INFORMIO_SECRET_TAG,
      mergeAttributes(HTMLAttributes, {
        kind: "inline",
        version: attrs.version,
        salt: attrs.salt,
        iv: attrs.iv,
        iterations: String(attrs.iterations),
        algorithm: attrs.algorithm,
        kdf: attrs.kdf
      }),
      attrs.cipherText
    ];
  },
  renderMarkdown(node) {
    return renderSecretMarkdown(node.attrs as EncryptedSecretAttrs);
  },
  addNodeView() {
    return ReactNodeViewRenderer(EncryptedInlineView);
  }
});

const EncryptedBlock = Node.create<EncryptedTextOptions>({
  name: "encryptedBlock",
  group: "block",
  atom: true,
  selectable: true,
  defining: true,
  addOptions() {
    return {
      onRequestDecrypt: () => undefined
    };
  },
  addAttributes() {
    return {
      kind: {
        default: "block",
        parseHTML: () => "block"
      },
      version: {
        default: "1",
        parseHTML: (element) => element.getAttribute("version") ?? "1"
      },
      salt: {
        default: "",
        parseHTML: (element) => element.getAttribute("salt") ?? ""
      },
      iv: {
        default: "",
        parseHTML: (element) => element.getAttribute("iv") ?? ""
      },
      iterations: {
        default: SECRET_ITERATIONS,
        parseHTML: (element) => Number.parseInt(element.getAttribute("iterations") ?? "", 10) || SECRET_ITERATIONS
      },
      algorithm: {
        default: SECRET_ALGORITHM,
        parseHTML: (element) => element.getAttribute("algorithm") ?? SECRET_ALGORITHM
      },
      kdf: {
        default: SECRET_KDF,
        parseHTML: (element) => element.getAttribute("kdf") ?? SECRET_KDF
      },
      cipherText: {
        default: "",
        parseHTML: (element) => (element.textContent ?? "").trim()
      }
    };
  },
  parseHTML() {
    return [{ tag: `${INFORMIO_SECRET_TAG}[kind="block"]` }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as EncryptedSecretAttrs;
    return [
      INFORMIO_SECRET_TAG,
      mergeAttributes(HTMLAttributes, {
        kind: "block",
        version: attrs.version,
        salt: attrs.salt,
        iv: attrs.iv,
        iterations: String(attrs.iterations),
        algorithm: attrs.algorithm,
        kdf: attrs.kdf
      }),
      attrs.cipherText
    ];
  },
  renderMarkdown(node) {
    return renderSecretMarkdown(node.attrs as EncryptedSecretAttrs);
  },
  addNodeView() {
    return ReactNodeViewRenderer(EncryptedBlockView);
  }
});

const InformioCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  }
});

type WikiLinkOptions = {
  documentLookupIndex: DocumentLookupIndex;
  currentDocument?: InformioDocument;
  onOpen: (documentId: string) => void;
  onCreate: (title: string) => void;
};

function WikiLinkView({ node, extension }: ReactNodeViewProps) {
  const options = extension.options as WikiLinkOptions;
  const target = String((node.attrs as { target?: string }).target ?? "");
  const alias = String((node.attrs as { alias?: string }).alias ?? "");
  const resolved = resolveWikiLink(target, options.documentLookupIndex, options.currentDocument);
  const label = alias || target;

  return (
    <NodeViewWrapper
      as="span"
      className={cn("informio-wikilink", resolved ? "is-resolved" : "is-unresolved")}
      data-target={target}
      contentEditable={false}
      onMouseDown={(event: ReactMouseEvent) => {
        if (!event.metaKey && !event.ctrlKey) return;
        event.preventDefault();
        if (resolved) options.onOpen(resolved.id);
        else options.onCreate(target);
      }}
    >
      {label}
    </NodeViewWrapper>
  );
}

const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  addOptions() {
    return {
      documentLookupIndex: buildDocumentLookupIndex([]),
      currentDocument: undefined,
      onOpen: () => undefined,
      onCreate: () => undefined
    };
  },
  addAttributes() {
    return {
      target: { default: "" },
      alias: { default: "" }
    };
  },
  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start(src: string) {
      return src.match(/\[\[/)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\[\[([^\]\n]+)\]\]/);
      if (!match) return undefined;
      const parsed = parseWikiLinkBody(match[1]);
      return { type: "wikiLink", raw: match[0], title: parsed.target, text: parsed.alias ?? "" };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("wikiLink", { target: token.title ?? "", alias: token.text ?? "" }, []);
  },
  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { target: string; alias?: string } } }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-link",
        "data-target": node.attrs.target,
        class: "informio-wikilink"
      }),
      node.attrs.alias || node.attrs.target
    ];
  },
  renderMarkdown(node: { attrs?: { target?: string; alias?: string } }) {
    return wikiLinkText(node.attrs?.target ?? "", node.attrs?.alias || undefined);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]\n]+)\]\]$/,
        handler: ({ match, range, chain }) => {
          const parsed = parseWikiLinkBody(match[1]);
          chain().deleteRange(range).insertContent({ type: "wikiLink", attrs: { target: parsed.target, alias: parsed.alias ?? "" } }).run();
        }
      })
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  }
} as never);

const UnderlineMark = UnderlineExtension.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /\+\+([^+\n](?:[\s\S]*?[^+\n])?)\+\+$/,
        handler: ({ match, range, chain }) => {
          const text = match[1] ?? "";
          if (!text) return;
          chain()
            .deleteRange(range)
            .insertContent({
              type: "text",
              text,
              marks: [{ type: "underline" }]
            })
            .run();
        }
      })
    ];
  }
} as never);

const INVALID_AUTO_LINK_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff，。！？；：、（）【】《》“”‘’]/;
const URL_STOP_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff，。！？；：、（）：【】《》“”‘’]/;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:，。！？；：、]+$/;
const PASTED_HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

const countUrlCharacters = (value: string, character: string) => value.split(character).length - 1;

const trimUnmatchedTrailingClosers = (value: string) => {
  let trimmed = value;
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["[", "]"]
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of pairs) {
      if (trimmed.endsWith(close) && countUrlCharacters(trimmed, close) > countUrlCharacters(trimmed, open)) {
        trimmed = trimmed.slice(0, -1);
        changed = true;
      }
    }
  }

  return trimmed;
};

const cleanPastedHttpUrl = (value: string) => {
  const stopIndex = value.search(URL_STOP_CHAR_PATTERN);
  let cleaned = stopIndex >= 0 ? value.slice(0, stopIndex) : value;
  cleaned = cleaned.replace(TRAILING_URL_PUNCTUATION_PATTERN, "");
  cleaned = trimUnmatchedTrailingClosers(cleaned);
  cleaned = cleaned.replace(TRAILING_URL_PUNCTUATION_PATTERN, "");

  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? cleaned : "";
  } catch {
    return "";
  }
};

const findPastedHttpUrlMatches = (text: string): PasteRuleMatch[] => {
  const matches: PasteRuleMatch[] = [];

  for (const match of text.matchAll(PASTED_HTTP_URL_PATTERN)) {
    const raw = match[0] ?? "";
    const cleaned = cleanPastedHttpUrl(raw);
    if (!cleaned) continue;
    matches.push({
      text: cleaned,
      data: { href: cleaned },
      index: match.index ?? 0
    });
  }

  return matches;
};

const MarkdownLink = Link.extend({} as never);

type MarkdownParserEditor = Editor & {
  markdown?: {
    parse: (markdown: string) => JSONContent | JSONContent[];
  };
};

const MARKDOWN_PASTE_BLOCK_PATTERN =
  /(^|\n)(#{1,6}\s+\S|>\s+\S|[-*+]\s+\S|\d+\.\s+\S|-\s+\[[ xX]\]\s+\S|```|~~~|\|.+\|(?:\n\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?)?|\$\$|\[\^[^\]]+]:\s+\S)/;
const MARKDOWN_PASTE_INLINE_PATTERN =
  /(\*\*[^*\n][\s\S]*?[^*\n]\*\*|__[^_\n][\s\S]*?[^_\n]__|`[^`\n]+`|!\[[^\]\n]*]\([^) \n]+(?:\s+["'][^"'\n]*["'])?\)|\[[^\]\n]+]\([^) \n]+(?:\s+["'][^"'\n]*["'])?\)|\[\[[^\]\n]+]])/;

const looksLikeMarkdownPaste = (text: string) => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return false;
  if (cleanPastedHttpUrl(normalized) === normalized) return false;
  return MARKDOWN_PASTE_BLOCK_PATTERN.test(normalized) || MARKDOWN_PASTE_INLINE_PATTERN.test(normalized);
};

const inlineMarkdownLinkPattern = /(^|[^!])\[([^\]\n]+)\]\((\S+?)(?:\s+["']([^"'\n]*)["'])?\)$/;
const imageMarkdownPattern = /!\[([^\]\n]*)\]\((\S+?)(?:\s+["']([^"'\n]*)["'])?\)$/;

const currentPlainParagraph = (editor: Editor) => {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const parent = selection.$from.parent;
  if (parent.type.name !== "paragraph") return null;
  if (selection.$from.parentOffset !== parent.content.size) return null;
  const from = selection.$from.before();
  const to = selection.$from.after();
  return { from, to, text: parent.textContent.trim() };
};

const tableJsonFromHeaderRow = (headerLine: string): JSONContent | null => {
  if (!isExplicitMarkdownTableRow(headerLine)) return null;
  const header = parseMarkdownTableRow(headerLine);
  if (!header) return null;
  const paragraph = (text?: string): JSONContent => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: header.map((cell) => ({
          type: "tableHeader",
          content: [paragraph(cell)]
        }))
      },
      {
        type: "tableRow",
        content: header.map(() => ({
          type: "tableCell",
          content: [paragraph()]
        }))
      }
    ]
  };
};

const sourceBlockContent = (source: string) => [{ type: "text", text: source }];

const htmlFromSelection = (editor: Editor, from: number, to: number) => {
  const serializer = DOMSerializer.fromSchema(editor.state.schema);
  const container = document.createElement("div");
  container.appendChild(serializer.serializeFragment(editor.state.doc.slice(from, to).content));
  return container.innerHTML;
};

const markdownFromSelection = (editor: MarkdownParserEditor, from: number, to: number) => {
  const blockLike = !editor.state.doc.resolve(from).sameParent(editor.state.doc.resolve(to));
  return serializeSelectionFragmentToMarkdown(editor, from, to, blockLike ? "block" : "inline");
};

const TyporaMarkdownInput = Extension.create({
  name: "typoraMarkdownInput",
  addInputRules() {
    return [
      new InputRule({
        find: imageMarkdownPattern,
        handler: ({ match, range, chain }) => {
          const alt = match[1] ?? "";
          const src = match[2]?.trim() ?? "";
          const title = match[3]?.trim() || alt;
          if (!src) return;
          chain()
            .deleteRange(range)
            .insertContentAt(range.from, { type: "image", attrs: { src, alt, title } })
            .createParagraphNear()
            .run();
        }
      }),
      new InputRule({
        find: inlineMarkdownLinkPattern,
        handler: ({ match, range, chain }) => {
          const prefix = match[1] ?? "";
          const text = match[2]?.trim() ?? "";
          const href = match[3]?.trim() ?? "";
          const title = match[4]?.trim();
          if (!text || !href) return;
          const from = range.from + prefix.length;
          chain()
            .deleteRange({ from, to: range.to })
            .insertContentAt(from, {
              type: "text",
              text,
              marks: [{ type: "link", attrs: { href, title: title || null } }]
            })
            .setTextSelection(from + text.length)
            .run();
        }
      }),
      new InputRule({
        find: /(^|[^`])`([^`\n]+)`$/,
        handler: ({ match, range, chain }) => {
          const prefix = match[1] ?? "";
          const text = match[2] ?? "";
          if (!text) return;
          const from = range.from + prefix.length;
          chain()
            .deleteRange({ from, to: range.to })
            .insertContentAt(from, { type: "text", text, marks: [{ type: "code" }] })
            .setTextSelection(from + text.length)
            .run();
        }
      })
    ];
  },
  addPasteRules() {
    return [
      markPasteRule({
        find: findPastedHttpUrlMatches,
        type: this.editor.schema.marks.link,
        getAttributes: (match) => ({
          href: match.data?.href
        })
      })
    ];
  },
  addProseMirrorPlugins() {
    const editor = this.editor as MarkdownParserEditor;

    return [
      new Plugin({
        props: {
          handleKeyDown(_view, event) {
            if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
            if (editor.view.composing) return false;

            const block = currentPlainParagraph(editor);
            if (!block || !block.text) return false;

            if (/^(?:---|\*\*\*)$/.test(block.text)) {
              event.preventDefault();
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .setHorizontalRule()
                .run();
              return true;
            }

            const codeFence = block.text.match(/^(```|~~~)([A-Za-z0-9_+.#-]*)\s*$/);
            if (codeFence) {
              event.preventDefault();
              const language = normalizeCodeLanguage(codeFence[2] || "plaintext");
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .insertContentAt(block.from, { type: "codeBlock", attrs: { language } })
                .setTextSelection(block.from + 1)
                .run();
              return true;
            }

            if (block.text === "$$") {
              event.preventDefault();
              const source = "$$\n\n$$";
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .insertContentAt(block.from, {
                  type: "mathBlock",
                  attrs: { source, focusKey: String(Date.now()) },
                  content: sourceBlockContent(source)
                })
                .setTextSelection(block.from + 1)
                .run();
              return true;
            }

            const table = tableJsonFromHeaderRow(block.text);
            if (table) {
              event.preventDefault();
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .insertContentAt(block.from, table)
                .setTextSelection(block.from + 4)
                .run();
              return true;
            }

            return false;
          },
          handlePaste(_view, event) {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;

            const hasImageFile = Array.from(clipboard.files).some((file) => file.type.startsWith("image/"));
            if (hasImageFile) return false;

            const markdown = clipboard.getData("text/markdown");
            const text = clipboard.getData("text/plain");
            const html = clipboard.getData("text/html");
            if (markdown.trim() && editor.markdown) {
              event.preventDefault();
              editor.commands.insertContent(editor.markdown.parse(stripClipboardFragmentMarkers(markdown).trim()) as never);
              return true;
            }

            if (html) {
              const safeFragment = sanitizeHtmlFragmentForPaste(html);
              const plainText = clipboardPlainTextForPaste(text, html);
              if (!htmlFragmentHasContent(safeFragment) && !plainText) return false;
              event.preventDefault();
              if (htmlFragmentHasContent(safeFragment)) {
                const slice = ProseMirrorDOMParser.fromSchema(editor.state.schema).parseSlice(safeFragment);
                editor.view.dispatch(editor.state.tr.replaceSelection(slice).scrollIntoView());
              } else if (looksLikeMarkdownPaste(plainText) && editor.markdown) {
                editor.commands.insertContent(editor.markdown.parse(plainText) as never);
              } else {
                editor.commands.insertContent(plainText);
              }
              return true;
            }

            const plainText = clipboardPlainTextForPaste(text);
            if (!plainText || !looksLikeMarkdownPaste(plainText) || !editor.markdown) return false;

            event.preventDefault();
            editor.commands.insertContent(editor.markdown.parse(plainText) as never);
            return true;
          },
          handleDOMEvents: {
            copy(_view, event: ClipboardEvent) {
              const clipboard = event.clipboardData;
              const { from, to, empty } = editor.state.selection;
              if (!clipboard || empty) return false;

              event.preventDefault();
              const markdown = markdownFromSelection(editor, from, to);
              clipboard.setData("text/plain", markdown);
              clipboard.setData("text/markdown", markdown);
              clipboard.setData("text/html", htmlFromSelection(editor, from, to));
              return true;
            }
          }
        }
      })
    ];
  }
});

const scriptBasePattern = "([A-Za-z0-9)\\]])";
const scriptValuePattern = "(\\{[^{}\\n]+\\}|\\([^()\\n]+\\)|(?:\\d+|[A-Za-z])(?![A-Za-z0-9]))";

const scriptSyntaxRegex = (marker: "^" | "_", anchored: boolean) => {
  const escapedMarker = marker === "^" ? "\\^" : "_";
  return new RegExp(`${anchored ? "^" : ""}${scriptBasePattern}${escapedMarker}${scriptValuePattern}${anchored ? "" : ""}`);
};

const unwrapScriptValue = (value: string) => {
  if (
    (value.startsWith("{") && value.endsWith("}"))
    || (value.startsWith("(") && value.endsWith(")"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const renderScriptMarkdown = (marker: "^" | "_", value: string) => {
  const plainValue = value.replace(/\n+/g, " ").trim();
  if (!plainValue) return "";
  if (/^\d+$/.test(plainValue) || /^[A-Za-z]$/.test(plainValue)) {
    return `${marker}${plainValue}`;
  }
  return `${marker}{${plainValue}}`;
};

const extractPlainScriptText = (content: JSONContent[] | undefined) => {
  if (!content?.length) return "";
  const plainSegments: string[] = [];
  for (const child of content) {
    if (child.type !== "text" || child.marks?.length) return null;
    plainSegments.push(child.text ?? "");
  }
  return plainSegments.join("");
};

const createScriptExtension = (
  extension: typeof SubscriptExtension | typeof SuperscriptExtension,
  options: {
    name: "subscript" | "superscript";
    marker: "_" | "^";
    htmlTag: "sub" | "sup";
  }
) =>
  extension.extend({
    markdownTokenName: `${options.name}Syntax`,
    markdownOptions: {
      htmlReopen: {
        open: `<${options.htmlTag}>`,
        close: `</${options.htmlTag}>`
      }
    },
    markdownTokenizer: {
      name: `${options.name}Syntax`,
      level: "inline",
      start(src: string) {
        return src.match(scriptSyntaxRegex(options.marker, false))?.index ?? -1;
      },
      tokenize(src: string) {
        const match = src.match(scriptSyntaxRegex(options.marker, true));
        if (!match) return undefined;
        return {
          type: `${options.name}Syntax`,
          raw: match[0],
          base: match[1],
          script: unwrapScriptValue(match[2])
        };
      }
    },
    parseMarkdown(token: MarkdownTokenLike, helpers: MarkdownParseHelpers) {
      const base = token.base ?? "";
      const script = token.script ?? "";
      if (!script) {
        return helpers.createTextNode(token.raw ?? "");
      }
      return [
        ...(base ? [helpers.createTextNode(base)] : []),
        helpers.createTextNode(script, [{ type: options.name }])
      ];
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      const plainText = extractPlainScriptText(node.content);
      if (plainText !== null) {
        return renderScriptMarkdown(options.marker, plainText);
      }
      return `<${options.htmlTag}>${helpers.renderChildren(node.content ?? [])}</${options.htmlTag}>`;
    },
    addInputRules() {
      return [
        new InputRule({
          find: new RegExp(`${scriptBasePattern}${options.marker === "^" ? "\\^" : "_"}${scriptValuePattern}$`),
          handler: ({ match, range, chain }) => {
            const base = match[1] ?? "";
            const script = unwrapScriptValue(match[2] ?? "");
            if (!base || !script) return;
            const from = range.from + base.length;
            chain()
              .deleteRange({ from, to: range.to })
              .insertContentAt(from, {
                type: "text",
                text: script,
                marks: [{ type: options.name }]
              })
              .setTextSelection(from + script.length)
              .run();
          }
        })
      ];
    }
  } as never);

const SubscriptMark = createScriptExtension(SubscriptExtension, {
  name: "subscript",
  marker: "_",
  htmlTag: "sub"
});

const SuperscriptMark = createScriptExtension(SuperscriptExtension, {
  name: "superscript",
  marker: "^",
  htmlTag: "sup"
});

const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  addAttributes() {
    return { source: { default: "$x$" } };
  },
  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start(src: string) {
      const match = /(^|[^\$])\$(?!\$)/.exec(src);
      return match ? match.index + match[1].length : -1;
    },
    tokenize(src: string) {
      const match = src.match(INLINE_MATH_TOKEN_REGEX);
      if (!match) return undefined;
      return { type: "mathInline", raw: match[0], text: match[1].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw ?? `$${token.text ?? "x"}$`;
    return h.createNode("mathInline", { source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { source: string }; textContent?: string } }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "math-inline", class: "informio-math-inline" }),
      mathTextFromSource(node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "mathInline"))
    ];
  },
  renderMarkdown(node: { attrs?: { source?: string } }) {
    return jsonSourceText(node as JSONContent, "mathInline");
  },
  addInputRules() {
    const applyInlineMath = ({
      match,
      range,
      chain,
      trailingText = ""
    }: {
      match: RegExpMatchArray;
      range: { from: number; to: number };
      chain: () => ReturnType<Editor["chain"]>;
      trailingText?: string;
    }) => {
      const prefix = match[1] ?? "";
      const content = match[2]?.trim() ?? "";
      if (isSkippableInlineMathContent(content)) return;
      const source = `$${match[2]}$`;
      const from = range.from + prefix.length;
      const insertion = trailingText
        ? [{ type: "mathInline", attrs: { source }, content: [{ type: "text", text: source }] }, { type: "text", text: trailingText }]
        : { type: "mathInline", attrs: { source }, content: [{ type: "text", text: source }] };
      chain()
        .deleteRange({ from, to: range.to })
        .insertContent(insertion as never)
        .setTextSelection(from + source.length + 2 + trailingText.length)
        .run();
    };

    return [
      new InputRule({
        find: /(^|[^\$])\$([^\n$]+?)\$$/,
        handler: ({ match, range, chain }) => {
          applyInlineMath({ match, range, chain });
        }
      }),
      new InputRule({
        find: INLINE_MATH_INPUT_WITH_PUNCTUATION_REGEX,
        handler: ({ match, range, chain }) => {
          applyInlineMath({ match, range, chain, trailingText: match[3] ?? "" });
        }
      })
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  }
} as never);

const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return { text: { default: "E = mc^2" }, ...editableSourceAttributes() };
  },
  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start(src: string) {
      return src.match(/^\$\$/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/);
      if (!match) return undefined;
      return { type: "mathBlock", raw: match[0], text: match[1].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("mathBlock");
    return h.createNode("mathBlock", { text: token.text ?? "E = mc^2", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { text: string }; textContent?: string } }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "mathBlock");
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block", class: "informio-math-block" }),
      ["span", { class: "informio-block-label" }, "Formula"],
      ["div", { class: "informio-formula" }, mathTextFromSource(source)]
    ];
  },
  renderMarkdown(node: { attrs?: { text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "mathBlock")}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^\n$]+?)\$\$$/,
        handler: ({ match, range, chain }) => {
          const source = match[0];
          chain()
            .deleteRange(range)
            .insertContent({ type: "mathBlock", attrs: { source }, content: [{ type: "text", text: source }] })
            .setTextSelection(range.from + 1 + source.length)
            .run();
        }
      })
    ];
  }
} as never);

const ChartBlock = Node.create({
  name: "chartBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return { text: { default: "flowchart TD\\n  A[Start] --> B[End]" }, ...editableSourceAttributes() };
  },
  markdownTokenizer: {
    name: "chartBlock",
    level: "block",
    start(src: string) {
      return src.match(/^```mermaid/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^```mermaid[^\n]*\n([\s\S]*?)\n```(?:\n|$)/);
      if (!match) return undefined;
      return { type: "chartBlock", raw: match[0], text: match[1].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("chartBlock");
    return h.createNode("chartBlock", { text: token.text ?? "flowchart TD\n  A[Start] --> B[End]", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'div[data-type="chart-block"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { text: string }; textContent?: string } }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "chartBlock");
    const diagram = chartTextFromSource(source);
    const labels = chartLabels(diagram);
    const flow =
      labels.length > 1
        ? [
            "div",
            { class: "informio-chart-preview" },
            ...labels.flatMap((label, index) => [
              ["span", { class: "informio-chart-node" }, label],
              ...(index < labels.length - 1 ? [["span", { class: "informio-chart-arrow" }, "->"]] : [])
            ])
        ]
        : ["pre", { class: "informio-chart-source" }, diagram];

    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "chart-block", class: "informio-chart-block" }),
      ["span", { class: "informio-block-label" }, "Mermaid"],
      flow,
      ["pre", { class: "informio-chart-source" }, diagram]
    ];
  },
  renderMarkdown(node: { attrs?: { text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "chartBlock")}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  }
} as never);

const MediaBlock = Node.create({
  name: "mediaBlock",
  group: "block",
  atom: true,
  addOptions() {
    return {
      assetBasePath: ""
    };
  },
  addAttributes() {
    return {
      kind: { default: "video" },
      src: { default: "" },
      title: { default: "Media" }
    };
  },
  markdownTokenizer: {
    name: "mediaBlock",
    level: "block",
    start(src: string) {
      return (src.match(/^<(video|audio)\b/im) ?? src.match(/^\[[^\]\n]+]\([^) \n]+\)/m))?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^<(video|audio)\b([^>]*)><\/\1>(?:\n|$)/i);
      if (match) {
        return {
          type: "mediaBlock",
          raw: match[0],
          kind: match[1].toLowerCase(),
          src: parseHtmlAttr(match[2], "src"),
          title: parseHtmlAttr(match[2], "title") || parseHtmlAttr(match[2], "aria-label") || "Media"
        };
      }
      const linkMatch = src.match(/^\[([^\]\n]+)]\(([^)\s]+)(?:\s+["']([^"'\n]+)["'])?\)(?:\n|$)/);
      const linkedSrc = linkMatch?.[2] ?? "";
      const linkedKind = mediaKindFromSrc(linkedSrc);
      if (!linkMatch || !linkedKind) return undefined;
      return {
        type: "mediaBlock",
        raw: linkMatch[0],
        kind: linkedKind,
        src: linkedSrc,
        title: linkMatch[3] || linkMatch[1] || "Media"
      };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("mediaBlock", { kind: token.kind ?? "video", src: token.src ?? "", title: token.title ?? "Media" }, []);
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="media-block"]' }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { kind: string; src: string; title: string } };
  }) {
    const kind = node.attrs.kind === "audio" ? "audio" : "video";
    const wrapperClassName = `informio-media-block is-${kind}`;
    const captionClassName = `informio-media-caption is-${kind}`;
    const mediaClassName = `informio-media is-${kind}`;
    const title = node.attrs.title || "Media";

    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-type": "media-block", class: wrapperClassName }),
      [kind, { controls: "", src: node.attrs.src || "", class: mediaClassName }],
      ["figcaption", { class: captionClassName }, title]
    ];
  },
  addNodeView(this: any) {
    return ({ node }: { node: { attrs: { kind: string; src: string; title: string } } }) => {
      const kind = node.attrs.kind === "audio" ? "audio" : "video";
      const wrapper = document.createElement("figure");
      wrapper.setAttribute("data-type", "media-block");
      wrapper.className = `informio-media-block is-${kind}`;
      wrapper.contentEditable = "false";

      const title = node.attrs.title || "Media";
      const appendCaption = () => {
        const caption = document.createElement("figcaption");
        caption.className = `informio-media-caption is-${kind}`;
        caption.textContent = title;
        wrapper.appendChild(caption);
      };

      const media = document.createElement(kind);
      media.setAttribute("controls", "");
      let objectUrl = "";
      let disposed = false;
      const applyMediaSrc = async (rawSrc: string) => {
        const localPath = resolveMarkdownAssetPath(rawSrc, this.options.assetBasePath);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
        if (!localPath) {
          media.setAttribute("src", resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath));
          return;
        }
        try {
          objectUrl = await loadLocalAssetObjectUrl(localPath);
          if (disposed) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          media.setAttribute("src", objectUrl);
        } catch {
          media.setAttribute("src", resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath));
        }
      };
      let currentSrc = node.attrs.src || "";
      void applyMediaSrc(currentSrc);
      media.className = `informio-media is-${kind}`;
      wrapper.appendChild(media);

      appendCaption();

      return {
        dom: wrapper,
        update(updatedNode: { attrs: { kind: string; src: string; title: string }; type?: unknown }) {
          const nextKind = updatedNode.attrs.kind === "audio" ? "audio" : "video";
          if (nextKind !== kind) return false;
          const nextSrc = updatedNode.attrs.src || "";
          if (nextSrc !== currentSrc) {
            currentSrc = nextSrc;
            void applyMediaSrc(currentSrc);
          }
          return true;
        },
        destroy() {
          disposed = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
      };
    };
  },
  renderMarkdown(node: { attrs?: { kind?: string; src?: string; title?: string } }) {
    const title = (node.attrs?.title ?? "Media").replace(/[\[\]\n]/g, " ").trim() || "Media";
    const src = node.attrs?.src ?? "";
    const kind = node.attrs?.kind === "audio" ? "audio" : "video";
    return `\n<${kind} controls src="${escapeHtml(src)}" title="${escapeHtml(title)}"></${kind}>\n`;
  }
} as never);

const PdfBlock = Node.create({
  name: "pdfBlock",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      src: { default: "" },
      title: { default: "PDF" }
    };
  },
  markdownTokenizer: {
    name: "pdfBlock",
    level: "block",
    start(src: string) {
      return src.match(/^<iframe\b/im)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^<iframe\b([^>]*)><\/iframe>(?:\n|$)/i);
      if (!match || parseHtmlAttr(match[1], "data-type") !== "pdf") return undefined;
      return {
        type: "pdfBlock",
        raw: match[0],
        src: parseHtmlAttr(match[1], "src"),
        title: parseHtmlAttr(match[1], "title") || "PDF"
      };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("pdfBlock", { src: token.src ?? "", title: token.title ?? "PDF" }, []);
  },
  parseHTML() {
    return [{ tag: 'iframe[data-type="pdf"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { src: string; title: string } } }) {
    return [
      "iframe",
      mergeAttributes(HTMLAttributes, {
        "data-type": "pdf",
        src: node.attrs.src,
        title: node.attrs.title
      })
    ];
  },
  renderMarkdown(node: { attrs?: { src?: string; title?: string } }) {
    const title = (node.attrs?.title ?? "PDF").replace(/[\[\]\n]/g, " ").trim() || "PDF";
    const src = node.attrs?.src ?? "";
    return `\n[${title}](${src})\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(UnifiedPdfBlockView);
  }
} as never);

const DetailsBlock = Node.create({
  name: "detailsBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return {
      summary: { default: "Summary" },
      text: { default: "Content" },
      ...editableSourceAttributes()
    };
  },
  markdownTokenizer: {
    name: "detailsBlock",
    level: "block",
    start(src: string) {
      return (src.match(/^>\s*\[![A-Za-z0-9_-]+]-/m) ?? src.match(/^<details\b/im))?.index ?? -1;
    },
    tokenize(src: string) {
      const calloutMatch = src.match(/^>\s*\[!([A-Za-z0-9_-]+)]-\s*(.*?)\s*\n((?:>\s?.*(?:\n|$))+)/);
      if (calloutMatch) {
        return {
          type: "detailsBlock",
          raw: calloutMatch[0],
          summary: calloutMatch[2] || calloutMatch[1],
          text: calloutMatch[3]
            .split("\n")
            .map((line) => line.replace(/^>\s?/, ""))
            .join("\n")
            .trim()
        };
      }
      const match = src.match(/^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>(?:\n|$)/i);
      if (!match) return undefined;
      return { type: "detailsBlock", raw: match[0], summary: plainText(match[1]), text: plainText(match[2]) };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("detailsBlock");
    return h.createNode("detailsBlock", { summary: token.summary ?? "Summary", text: token.text ?? "Content", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'details[data-type="details-block"]' }, { tag: "details" }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { summary: string; text: string }; textContent?: string };
  }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "detailsBlock");
    const details = detailsFromSource(source);
    return [
      "details",
      mergeAttributes(HTMLAttributes, { "data-type": "details-block", class: "informio-details-block", open: "true" }),
      ["summary", {}, details.summary],
      ["p", {}, details.text]
    ];
  },
  renderMarkdown(node: { attrs?: { summary?: string; text?: string } }) {
    const details = detailsFromSource(jsonSourceText(node as JSONContent, "detailsBlock"));
    const body = details.text.split("\n").map((line) => `> ${line}`).join("\n");
    return `\n> [!note]- ${details.summary || "Summary"}\n${body}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  }
} as never);

const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return {
      title: { default: "Note" },
      text: { default: "Important note" },
      ...editableSourceAttributes()
    };
  },
  markdownTokenizer: {
    name: "calloutBlock",
    level: "block",
    start(src: string) {
      return src.match(/^>\s*\[![A-Za-z0-9_-]+](?!-)/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^>\s*\[!([A-Za-z0-9_-]+)]\s*(.*?)\s*\n((?:>\s?.*(?:\n|$))+)/);
      if (!match) return undefined;
      return {
        type: "calloutBlock",
        raw: match[0],
        title: match[1],
        text: [match[2], match[3]]
          .filter(Boolean)
          .join("\n")
          .split("\n")
          .map((line) => line.replace(/^>\s?/, ""))
          .join("\n")
          .trim()
      };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("calloutBlock");
    return h.createNode("calloutBlock", { title: token.title ?? "NOTE", text: token.text ?? "Important note", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="callout-block"]' }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { title: string; text: string }; textContent?: string };
  }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "calloutBlock");
    const callout = calloutFromSource(source);
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-type": "callout-block", class: "informio-callout-block" }),
      ["strong", {}, normalizeCalloutTitle(callout.title)],
      ["p", {}, callout.text]
    ];
  },
  renderMarkdown(node: { attrs?: { title?: string; text?: string } }) {
    const callout = calloutFromSource(jsonSourceText(node as JSONContent, "calloutBlock"));
    const body = callout.text.split("\n").map((line) => `> ${line}`).join("\n");
    return `\n> [!${normalizeCalloutTitle(callout.title)}]\n${body}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  }
} as never);

const FootnoteBlock = Node.create({
  name: "footnoteBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return {
      index: { default: "1" },
      text: { default: "Footnote" },
      ...editableSourceAttributes()
    };
  },
  markdownTokenizer: {
    name: "footnoteBlock",
    level: "block",
    start(src: string) {
      return src.match(/^\[\^[^\]]+]:/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\[\^([^\]]+)]:\s*(.*)(?:\n|$)/);
      if (!match) return undefined;
      return { type: "footnoteBlock", raw: match[0], index: match[1], text: match[2].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("footnoteBlock");
    return h.createNode("footnoteBlock", { index: token.index ?? "1", text: token.text ?? "Footnote", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'section[data-type="footnote-block"]' }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { index: string; text: string }; textContent?: string };
  }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "footnoteBlock");
    const footnote = footnoteFromSource(source);
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-type": "footnote-block", class: "informio-footnote-block" }),
      ["sup", {}, footnote.index],
      ["span", {}, footnote.text]
    ];
  },
  renderMarkdown(node: { attrs?: { index?: string; text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "footnoteBlock")}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  }
} as never);

type MarkdownAutoBlockMatch = {
  from: number;
  to: number;
  node: ProseMirrorNodeLike;
  selectionOffset?: number;
  selectAfterNode?: boolean;
};

type ProseMirrorNodeLike = {
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

type ProseMirrorSchemaLike = {
  nodes: Record<string, { create: (attrs?: Record<string, unknown> | null, content?: unknown) => ProseMirrorNodeLike }>;
  text: (text: string) => ProseMirrorNodeLike;
};

type MarkdownTextBlock = {
  node: ProseMirrorNodeLike;
  pos: number;
  text: string;
};

const calloutTypes = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);

const textContentNode = (schema: ProseMirrorSchemaLike, text: string) => (text ? schema.text(text) : undefined);

const sourceBackedNode = (
  schema: ProseMirrorSchemaLike,
  typeName: "mathBlock" | "chartBlock" | "footnoteBlock" | "detailsBlock" | "calloutBlock",
  source: string,
  attrs: Record<string, unknown> = {}
) => schema.nodes[typeName].create({ source, ...attrs }, textContentNode(schema, source));

const parseMarkdownTableRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = body.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
};

const isExplicitMarkdownTableRow = (line: string) => /^\|.*\|$/.test(line.trim());

const isMarkdownTableSeparator = (line: string, expectedCells: number) => {
  const cells = parseMarkdownTableRow(line);
  return Boolean(cells && cells.length === expectedCells && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
};

const markdownTableAlign = (separatorCell: string): HorizontalCellAlign => {
  const trimmed = separatorCell.trim();
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
  if (trimmed.endsWith(":")) return "right";
  return "left";
};

const createTableFromMarkdown = (schema: ProseMirrorSchemaLike, lines: string[]) => {
  const header = parseMarkdownTableRow(lines[0]);
  if (!header || !isMarkdownTableSeparator(lines[1], header.length)) return null;
  const separator = parseMarkdownTableRow(lines[1]) ?? header.map(() => "---");
  const dataRows = lines.slice(2).map(parseMarkdownTableRow).filter((row): row is string[] => Boolean(row && row.length === header.length));
  const rows = [header, ...(dataRows.length ? dataRows : [header.map(() => "")])];

  return schema.nodes.table.create(
    null,
    rows.map((cells, rowIndex) =>
      schema.nodes.tableRow.create(
        null,
        cells.map((cell, columnIndex) => {
          const cellType = rowIndex === 0 ? schema.nodes.tableHeader : schema.nodes.tableCell;
          return cellType.create({ align: markdownTableAlign(separator[columnIndex] ?? "---") }, schema.nodes.paragraph.create(null, textContentNode(schema, cell)));
        })
      )
    )
  );
};

const codeBlockFromFence = (schema: ProseMirrorSchemaLike, language: string, lines: string[]) =>
  schema.nodes.codeBlock.create({ language: language.trim() || "plaintext" }, textContentNode(schema, lines.join("\n")));

const isPlainParagraph = (block: MarkdownTextBlock) => block.node.type.name === "paragraph";

const topLevelTextBlocks = (doc: ProseMirrorNodeLike): MarkdownTextBlock[] => {
  const blocks: MarkdownTextBlock[] = [];
  doc.forEach((node, offset) => {
    if (node.isTextblock) {
      blocks.push({ node, pos: offset, text: node.textContent });
    }
  });
  return blocks;
};

const markdownAutoBlockMatch = (schema: ProseMirrorSchemaLike, doc: ProseMirrorNodeLike): MarkdownAutoBlockMatch | null => {
  const blocks = topLevelTextBlocks(doc);

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const text = block.text.trim();
    if (!text) continue;

    if (!isPlainParagraph(block)) continue;

    const singleLineMath = text.match(/^\$\$([\s\S]+?)\$\$$/);
    if (singleLineMath) {
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "mathBlock", text, { text: singleLineMath[1].trim() }),
        selectionOffset: text.length
      };
    }

    const footnote = text.match(/^\[\^([^\]]+)]:\s*([\s\S]*)$/);
    if (footnote) {
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "footnoteBlock", text, { index: footnote[1], text: footnote[2].trim() }),
        selectionOffset: text.length
      };
    }

    const singleLineDetails = text.match(/^<details(?:\s[^>]*)?>[\s\S]*<\/details>$/i);
    if (singleLineDetails) {
      const details = detailsFromSource(text);
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "detailsBlock", text, details),
        selectionOffset: text.length
      };
    }

    const headerCells = parseMarkdownTableRow(text);
    if (headerCells && blocks[index + 1] && isPlainParagraph(blocks[index + 1]) && isMarkdownTableSeparator(blocks[index + 1].text, headerCells.length)) {
      const tableLines = [text, blocks[index + 1].text.trim()];
      let endIndex = index + 1;
      while (blocks[endIndex + 1] && isPlainParagraph(blocks[endIndex + 1])) {
        const row = parseMarkdownTableRow(blocks[endIndex + 1].text);
        if (!row || row.length !== headerCells.length) break;
        tableLines.push(blocks[endIndex + 1].text.trim());
        endIndex += 1;
      }
      const table = createTableFromMarkdown(schema, tableLines);
      if (table) {
        return {
          from: block.pos,
          to: blocks[endIndex].pos + blocks[endIndex].node.nodeSize,
          node: table,
          selectionOffset: 4
        };
      }
    }

    const fence = text.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      const closingIndex = blocks.findIndex((candidate, candidateIndex) => candidateIndex > index && isPlainParagraph(candidate) && candidate.text.trim() === "```");
      if (closingIndex > index) {
        const language = fence[1] || "plaintext";
        const bodyLines = blocks.slice(index + 1, closingIndex).map((candidate) => candidate.text);
        const source = [text, ...bodyLines, "```"].join("\n");
        return {
          from: block.pos,
          to: blocks[closingIndex].pos + blocks[closingIndex].node.nodeSize,
          node:
            language.toLowerCase() === "mermaid"
              ? sourceBackedNode(schema, "chartBlock", source, { text: bodyLines.join("\n") })
              : codeBlockFromFence(schema, language, bodyLines),
          selectionOffset: language.toLowerCase() === "mermaid" ? source.length : bodyLines.join("\n").length
        };
      }
    }

    if (text === "$$") {
      const closingIndex = blocks.findIndex((candidate, candidateIndex) => candidateIndex > index && isPlainParagraph(candidate) && candidate.text.trim() === "$$");
      if (closingIndex > index) {
        const bodyLines = blocks.slice(index + 1, closingIndex).map((candidate) => candidate.text);
        const source = ["$$", ...bodyLines, "$$"].join("\n");
        return {
          from: block.pos,
          to: blocks[closingIndex].pos + blocks[closingIndex].node.nodeSize,
          node: sourceBackedNode(schema, "mathBlock", source, { text: bodyLines.join("\n").trim() }),
          selectionOffset: source.length
        };
      }
    }

    if (/^<details\b/i.test(text)) {
      const closingIndex = blocks.findIndex(
        (candidate, candidateIndex) => candidateIndex >= index && isPlainParagraph(candidate) && /<\/details>/i.test(candidate.text)
      );
      if (closingIndex >= index) {
        const source = blocks.slice(index, closingIndex + 1).map((candidate) => candidate.text).join("\n");
        const details = detailsFromSource(source);
        return {
          from: block.pos,
          to: blocks[closingIndex].pos + blocks[closingIndex].node.nodeSize,
          node: sourceBackedNode(schema, "detailsBlock", source, details),
          selectionOffset: source.length
        };
      }
    }
  }

  return null;
};

const markdownAutoInlineMathMatch = (schema: ProseMirrorSchemaLike, doc: ProseMirrorNodeLike): MarkdownAutoBlockMatch | null => {
  let found: MarkdownAutoBlockMatch | null = null;
  doc.descendants?.((node, pos, parent) => {
    if (found) return false;
    if (!node.isText || !node.text) return;
    const parentName = parent?.type.name ?? "";
    if (!["paragraph", "heading", "listItem", "tableCell", "tableHeader"].includes(parentName)) return;

    const matches = Array.from(node.text.matchAll(INLINE_MATH_AUTO_REGEX));
    for (const match of matches) {
      const content = match[2]?.trim() ?? "";
      if (isSkippableInlineMathContent(content)) continue;
      const prefix = match[1] ?? "";
      const source = `$${match[2]}$`;
      const from = pos + (match.index ?? 0) + prefix.length;
      found = {
        from,
        to: from + source.length,
        node: schema.nodes.mathInline.create({ source }, textContentNode(schema, source)),
        selectAfterNode: true
      };
      return false;
    }
  });
  return found;
};

const applyMarkdownAutoBlock = (editor: Editor) => {
  const schema = editor.state.schema as unknown as ProseMirrorSchemaLike;
  const doc = editor.state.doc as unknown as ProseMirrorNodeLike;
  const match = markdownAutoBlockMatch(schema, doc) ?? markdownAutoInlineMathMatch(schema, doc);
  if (!match) return false;

  const transaction = editor.state.tr.replaceWith(match.from, match.to, match.node as never);
  transaction.setMeta("addToHistory", true);
  editor.view.dispatch(transaction);

  const insertedTo = match.from + match.node.nodeSize;
  const wantedSelection = match.selectAfterNode
    ? insertedTo
    : match.selectionOffset === undefined
      ? insertedTo
      : match.from + 1 + match.selectionOffset;
  const selectionPosition = match.selectAfterNode
    ? insertedTo
    : clamp(wantedSelection, match.from + 1, Math.max(match.from + 1, insertedTo - 1));
  window.setTimeout(() => {
    if (!editor.isDestroyed) editor.commands.setTextSelection(selectionPosition);
  }, 0);
  return true;
};

function markdownToStatusText(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/```([\s\S]*?)```/g, (_match, code: string) => code)
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-+*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^\s*[-+*]\s+\[(?: |x)\]\s+/gim, "")
    .replace(/[*_~]/g, "")
    .replace(/<\/?[^>]+>/g, "");
}

function countWords(markdown: string) {
  const plainText = markdownToStatusText(markdown);
  const latinWords = plainText.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
  const cjkChars = plainText.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return latinWords + cjkChars;
}

function countCharacters(markdown: string) {
  return markdownToStatusText(markdown).length;
}

function countLines(markdown: string) {
  const content = markdownToStatusText(markdown).replace(/\n+$/g, "");
  return content ? content.split("\n").filter((line) => line.trim().length > 0).length : 0;
}

function getDocumentOutline(markdown: string): OutlineItem[] {
  return markdown
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      return {
        id: `${index}-${match[2]}`,
        title: match[2].replace(/[#*_`]/g, "").trim(),
        level: match[1].length,
        line: index + 1,
        order: -1
      };
    })
    .filter((item): item is OutlineItem => Boolean(item))
    .map((item, order) => ({ ...item, order }));
}

function buildOutlineTree(items: OutlineItem[]): OutlineTreeItem[] {
  const roots: OutlineTreeItem[] = [];
  const stack: OutlineTreeItem[] = [];

  for (const item of items) {
    const next: OutlineTreeItem = { ...item, children: [] };
    while (stack.length && stack[stack.length - 1].level >= next.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(next);
    else roots.push(next);
    stack.push(next);
  }

  return roots;
}

function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `edited ${hours}h ago`;
  return "edited yesterday";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function IconButton({
  label,
  children,
  className,
  disabled,
  onClick,
  pressed
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-md text-slate-600 transition-[background-color,transform,color] duration-150 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
            disabled && "cursor-not-allowed opacity-40 active:scale-100",
            pressed ? "bg-emerald-50 text-slate-950 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.24)]" : "hover:bg-slate-100",
            className
          )}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          className="z-50 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function WindowControls({ visible }: { visible: boolean }) {
  if (!visible) return null;
  const runWindowControl = (action: "minimize" | "toggleMaximize" | "close") => {
    void window.informio.windowControl(action);
  };
  return (
    <div className="window-controls no-drag flex h-full shrink-0 items-stretch">
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        className="window-control-button"
        onClick={() => runWindowControl("minimize")}
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="最大化或还原"
        title="最大化或还原"
        className="window-control-button"
        onClick={() => runWindowControl("toggleMaximize")}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        className="window-control-button is-close"
        onClick={() => runWindowControl("close")}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function ToolbarGlyphButton({
  label,
  icon: Icon,
  onClick,
  onMouseDown,
  pressed,
  disabled,
  className,
  iconClassName,
  iconSize = 14,
  tooltipSide = "top",
  ariaHasPopup,
  badgeColor
}: {
  label: string;
  icon: ToolbarIcon;
  onClick?: () => void;
  onMouseDown?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  iconSize?: number;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  ariaHasPopup?: "menu" | "listbox" | "tree" | "grid" | "dialog" | true;
  badgeColor?: string | null;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          aria-haspopup={ariaHasPopup}
          disabled={disabled}
          onMouseDown={onMouseDown}
          onClick={onClick}
          className={cn("relative", className)}
        >
          <Icon size={iconSize} strokeWidth={1.9} className={iconClassName} />
          {badgeColor ? (
            <span
              aria-hidden="true"
              className="absolute bottom-[4px] right-[4px] h-[6px] w-[6px] rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.92)]"
              style={{ backgroundColor: badgeColor }}
            />
          ) : null}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={tooltipSide} className="z-50 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function InsertToolbar({
  onAction,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  propertiesOpen,
  onToggleProperties
}: {
  onAction: (action: InsertToolbarAction) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  propertiesOpen?: boolean;
  onToggleProperties?: () => void;
}) {
  const showHistoryControls = Boolean(onUndo && onRedo);
  const showPropertiesToggle = Boolean(onToggleProperties);
  const showHistoryDivider = showHistoryControls && insertToolbarActions.length > 0;
  const showPropertiesDivider = showPropertiesToggle && insertToolbarActions.length > 0;

  return (
    <section className="informio-insert-toolbar" data-selection-toolbar-safe-area="true" onMouseDownCapture={markSelectionToolbarInteraction}>
      <div className="informio-insert-toolbar-row">
        <div className="informio-insert-toolbar-group">
          {showHistoryControls ? (
            <>
              <ToolbarGlyphButton
                label="撤销"
                icon={Undo2}
                disabled={!canUndo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onUndo}
                className="informio-insert-toolbar-button"
                iconClassName="text-[var(--text-muted)]"
              />
              <ToolbarGlyphButton
                label="重做"
                icon={Redo2}
                disabled={!canRedo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onRedo}
                className="informio-insert-toolbar-button"
                iconClassName="text-[var(--text-muted)]"
              />
            </>
          ) : null}
          {showHistoryDivider ? <div className="informio-insert-toolbar-divider" aria-hidden="true" /> : null}
          {insertToolbarActions.map((action) => (
            <ToolbarGlyphButton
              key={action.id}
              label={action.label}
              icon={action.icon}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onAction(action)}
              className="informio-insert-toolbar-button"
              iconClassName="text-[var(--text-muted)]"
            />
          ))}
          {showPropertiesDivider ? <div className="informio-insert-toolbar-divider" aria-hidden="true" /> : null}
          {showPropertiesToggle ? (
            <ToolbarGlyphButton
              label={propertiesOpen ? "隐藏属性" : "显示属性"}
              icon={Bookmark}
              pressed={propertiesOpen}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onToggleProperties}
              className={cn("informio-insert-toolbar-button", propertiesOpen && "is-open")}
              iconClassName="text-[var(--text-muted)]"
            />
          ) : null}
        </div>
      </div>
      <div className="informio-insert-toolbar-rule" aria-hidden="true" />
    </section>
  );
}

function PanelResizeHandle({
  label,
  onPointerDown
}: {
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="panel-resize-handle no-drag h-full w-1 shrink-0 cursor-col-resize touch-none"
    />
  );
}

type FileTreeNode = {
  folder: InformioFolder;
  documents: InformioDocument[];
  children: FileTreeNode[];
  documentCount: number;
};

type FileContextTarget =
  | { type: "folder"; path: string; title: string }
  | { type: "file"; path: string; title: string; documentId: string };

type FileContextMenuState = {
  x: number;
  y: number;
  target: FileContextTarget;
};

type ProjectContextMenuState = {
  x: number;
  y: number;
  path: string;
  title: string;
  pinned: boolean;
};

type BlankContextMenuState = {
  x: number;
  y: number;
};

type InlineRenameState =
  | { type: "file"; path: string; documentId: string; value: string; originalValue: string; selectBaseName?: boolean }
  | { type: "folder"; path: string; value: string; originalValue: string }
  | { type: "project"; path: string; value: string; originalValue: string };

type PendingCreationState =
  | { type: "file"; folderPath?: string }
  | { type: "folder"; folderPath?: string };

type TreeDropTarget = {
  path: string;
  depth: number;
};

type LinkRequest = {
  from: number;
  to: number;
  text: string;
  url: string;
  title?: string;
};

type ImageRequest = {
  pos: number;
  alt: string;
  src: string;
  title: string;
};

type EditorTextSearchIndex = {
  text: string;
  positions: number[];
};

type FindMatch = {
  start: number;
  end: number;
  from: number;
  to: number;
};

const buildEditorTextSearchIndex = (doc: ProseMirrorNode): EditorTextSearchIndex => {
  const chars: string[] = [];
  const positions: number[] = [];
  let firstBlock = true;

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!firstBlock) {
      chars.push("\n");
      positions.push(Math.max(0, pos));
    }
    firstBlock = false;
    node.descendants((child, childPos) => {
      const absolutePos = pos + 1 + childPos;
      if (child.isText) {
        Array.from(child.text ?? "").forEach((char, index) => {
          chars.push(char);
          positions.push(absolutePos + index);
        });
      } else if (child.type.name === "hardBreak") {
        chars.push("\n");
        positions.push(absolutePos);
      }
      return true;
    });
    return false;
  });

  return { text: chars.join(""), positions };
};

const findNextTextMatch = (text: string, query: string, fromIndex: number) => {
  if (!query) return null;
  const firstIndex = text.indexOf(query, Math.max(0, fromIndex));
  if (firstIndex >= 0) return { start: firstIndex, end: firstIndex + query.length };
  const wrappedIndex = text.indexOf(query, 0);
  return wrappedIndex >= 0 ? { start: wrappedIndex, end: wrappedIndex + query.length } : null;
};

const fallbackFolder = (path: string): InformioFolder => ({
  id: `folder-${path}`,
  title: pathBaseName(path),
  path,
  updatedAt: new Date().toISOString()
});

const treeNode = (folder: InformioFolder): FileTreeNode => ({ folder, documents: [], children: [], documentCount: 0 });

const documentStructureKey = (documents: InformioDocument[]) =>
  documents.map((doc) => `${doc.id}:${doc.title}:${doc.filePath ?? ""}:${documentKind(doc)}:${doc.collection}:${doc.pinned ? "1" : "0"}`).join("|");

const documentLookupKey = (documents: InformioDocument[], excludedSuggestionDocumentId?: string) =>
  `${excludedSuggestionDocumentId ?? ""}::${documentStructureKey(documents)}`;

const folderChain = (path: string, projectPaths: string[]) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return [];
  const containingProject = projectPaths.find((p) => pathContains(p, normalizedPath));
  const normalizedRoot = containingProject ? normalizePath(containingProject) : "";
  if (!normalizedRoot) return [normalizedPath];

  const chain: string[] = [];
  let current = normalizedPath;
  while (current && pathContains(normalizedRoot, current)) {
    chain.unshift(current);
    if (current === normalizedRoot) break;
    const parent = pathDirName(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return chain;
};

const buildFileTree = (folders: InformioFolder[], documents: InformioDocument[], projects: InformioProject[]): FileTreeNode[] => {
  const projectPaths = projects.map((p) => normalizePath(p.path));
  const projectsByPath = new Map(projects.map((project) => [normalizePath(project.path), project]));
  const folderRecords = new Map<string, InformioFolder>();
  const nodes = new Map<string, FileTreeNode>();

  folders.forEach((folder) => {
    if (folder.path) folderRecords.set(normalizePath(folder.path), folder);
  });
  projectPaths.forEach((p) => {
    const project = projectsByPath.get(p);
    const existing = folderRecords.get(p) ?? fallbackFolder(p);
    folderRecords.set(p, {
      ...existing,
      title: project?.title || existing.title
    });
  });

  const ensureNode = (path: string) => {
    const key = normalizePath(path);
    const folder = folderRecords.get(key) ?? fallbackFolder(path);
    folderRecords.set(key, folder);
    if (!nodes.has(key)) nodes.set(key, treeNode(folder));
    return nodes.get(key)!;
  };

  const ensureFolderPath = (path: string) => {
    folderChain(path, projectPaths).forEach((folderPath) => ensureNode(folderPath));
  };

  folders.forEach((folder) => {
    if (folder.path) ensureFolderPath(folder.path);
  });
  projectPaths.forEach((p) => ensureFolderPath(p));

  const looseDocuments: InformioDocument[] = [];

  documents.forEach((doc) => {
    if (!doc.filePath) {
      looseDocuments.push(doc);
      return;
    }
    const parent = pathDirName(doc.filePath);
    ensureFolderPath(parent);
    ensureNode(parent).documents.push(doc);
  });

  const roots: FileTreeNode[] = [];
  Array.from(nodes.values())
    .sort((a, b) => normalizePath(a.folder.path).length - normalizePath(b.folder.path).length)
    .forEach((node) => {
      const parentPath = pathDirName(node.folder.path);
      const parent = nodes.get(normalizePath(parentPath));
      if (parent && normalizePath(parent.folder.path) !== normalizePath(node.folder.path) && pathContains(parent.folder.path, node.folder.path)) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

  const sortNode = (node: FileTreeNode) => {
    node.documents.sort((a, b) => a.title.localeCompare(b.title));
    node.children.sort((a, b) => a.folder.title.localeCompare(b.folder.title));
    node.children.forEach(sortNode);
    node.documentCount = node.documents.length + node.children.reduce((total, child) => total + child.documentCount, 0);
  };
  roots.forEach(sortNode);

  if (looseDocuments.length) {
    roots.push({
      folder: { id: "local-drafts", title: "Local Drafts", path: "", updatedAt: new Date().toISOString() },
      documents: looseDocuments.sort((a, b) => a.title.localeCompare(b.title)),
      children: [],
      documentCount: looseDocuments.length
    });
  }

  return roots.sort((a, b) => {
    const aIsProject = projectPaths.includes(normalizePath(a.folder.path));
    const bIsProject = projectPaths.includes(normalizePath(b.folder.path));
    if (aIsProject !== bIsProject) return aIsProject ? -1 : 1;
    const aPinned = Boolean(projectsByPath.get(normalizePath(a.folder.path))?.pinned);
    const bPinned = Boolean(projectsByPath.get(normalizePath(b.folder.path))?.pinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return a.folder.title.localeCompare(b.folder.title);
  });
};

const filterFileTree = (nodes: FileTreeNode[], query: string): FileTreeNode[] =>
  nodes
    .map((node) => {
      const folderMatches = `${node.folder.title} ${node.folder.path}`.toLowerCase().includes(query);
      const documents = folderMatches
        ? node.documents
        : node.documents.filter((doc) => `${doc.title} ${doc.filePath ?? ""}`.toLowerCase().includes(query));
      const children = folderMatches ? node.children : filterFileTree(node.children, query);
      const documentCount = folderMatches
        ? node.documentCount
        : documents.length + children.reduce((total, child) => total + child.documentCount, 0);
      return folderMatches || documents.length || children.length ? { ...node, documents, children, documentCount } : null;
    })
    .filter((node): node is FileTreeNode => Boolean(node));

function ProjectContextMenu({
  state,
  onClose,
  onCreateFile,
  onCreateFolder,
  onRename,
  onTogglePinned,
  onReveal,
  onRemove
}: {
  state: ProjectContextMenuState;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onTogglePinned: () => void;
  onReveal: () => void;
  onRemove: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-44 overflow-hidden rounded-md bg-white py-1 text-[12px] font-semibold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: state.x, top: state.y }}
    >
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCreateFile(); }}
      >
        <FilePlus size={13} />
        <span>新建文件</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCreateFolder(); }}
      >
        <FolderPlus size={13} />
        <span>新建文件夹</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRename(); }}
      >
        <Pencil size={13} />
        <span>重命名项目</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePinned(); }}
      >
        {state.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        <span>{state.pinned ? "取消置顶项目" : "置顶项目"}</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReveal(); }}
      >
        <ExternalLink size={13} />
        <span>在 Finder 中打开</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left text-red-600 hover:bg-red-50 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
      >
        <X size={13} />
        <span>从列表中移除</span>
      </button>
    </div>
  );
}

function FileContextMenu({
  state,
  onClose,
  onCreateFile,
  onCreateFolder,
  onAction
}: {
  state: FileContextMenuState;
  onClose: () => void;
  onCreateFile: (folderPath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onAction: (action: FileSystemOperationInput["action"], target: FileContextTarget) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const closeOnScroll = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [onClose]);

  const menuItems: Array<{ action: FileSystemOperationInput["action"]; label: string; icon: ComponentType<{ size?: number }> }> = [
    { action: "rename", label: "重命名", icon: Pencil },
    { action: "duplicate", label: "复制", icon: Copy },
    { action: "delete", label: "删除", icon: Trash2 },
    { action: "reveal", label: revealInFolderLabel(), icon: ExternalLink }
  ];

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-44 overflow-hidden rounded-md bg-white py-1 text-[12px] font-semibold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: state.x, top: state.y }}
    >
      {state.target.type === "folder" ? (
        <>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] hover:bg-slate-100 active:scale-[0.99]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCreateFile(state.target.path);
              onClose();
            }}
          >
            <FilePlus size={14} />
            <span>新建文件</span>
          </button>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] hover:bg-slate-100 active:scale-[0.99]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCreateFolder(state.target.path);
              onClose();
            }}
          >
            <FolderPlus size={14} />
            <span>新建文件夹</span>
          </button>
        </>
      ) : null}
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            className={cn(
              "flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] active:scale-[0.99]",
              item.action === "delete" ? "text-red-600 hover:bg-red-50" : "hover:bg-slate-100"
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAction(item.action, state.target);
              onClose();
            }}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function BlankFileContextMenu({
  state,
  onClose,
  onCreateFile,
  onCreateFolder
}: {
  state: BlankContextMenuState;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const closeOnScroll = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [onClose]);

  const menuItems = [
    { label: "新建文件", icon: FilePlus, action: onCreateFile },
    { label: "新建文件夹", icon: FolderPlus, action: onCreateFolder }
  ];

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-40 overflow-hidden rounded-md bg-white py-1 text-[12px] font-semibold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: state.x, top: state.y }}
    >
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] hover:bg-slate-100 active:scale-[0.99]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              item.action();
              onClose();
            }}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FileList({
  folders,
  documents,
  projects,
  activeDocumentId,
  onSelect,
  onCreate,
  onCreateFolder,
  onFileAction,
  onImportExternalFiles,
  onRenameProject,
  onToggleProjectPinned,
  onRemoveProject,
  onDocumentDragStart,
  width,
  creationSignal
}: {
  folders: InformioFolder[];
  documents: InformioDocument[];
  projects: InformioProject[];
  activeDocumentId: string;
  onSelect: (id: string) => void;
  onCreate: (folderPath?: string) => void;
  onCreateFolder: (folderPath?: string) => void;
  onFileAction: (input: FileSystemOperationInput) => void;
  onImportExternalFiles: (sourcePaths: string[], destinationFolderPath: string) => void;
  onRenameProject: (path: string, title: string) => void | Promise<void>;
  onToggleProjectPinned: (path: string) => void;
  onRemoveProject: (path: string) => void;
  onDocumentDragStart: (documentId: string, event: ReactDragEvent<HTMLElement>) => void;
  width: number;
  creationSignal: number;
}) {
  const [contextMenu, setContextMenu] = useState<FileContextMenuState | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<BlankContextMenuState | null>(null);
  const [expandedFolderKeys, setExpandedFolderKeys] = useState<Set<string>>(() => new Set());
  const [inlineRename, setInlineRename] = useState<InlineRenameState | null>(null);
  const [pendingCreation, setPendingCreation] = useState<PendingCreationState | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const projectPaths = useMemo(() => new Set(projects.map((p) => normalizePath(p.path))), [projects]);
  const treeKey = useMemo(() => documentStructureKey(documents), [documents]);
  const tree = useMemo(() => buildFileTree(folders, documents, projects), [treeKey, folders, projects]);
  const projectsByPath = useMemo(() => new Map(projects.map((project) => [normalizePath(project.path), project])), [projects]);

  useEffect(() => {
    if (!inlineRename) return;
    if (inlineRename.type === "project") {
      if (!projects.some((project) => normalizePath(project.path) === normalizePath(inlineRename.path))) {
        setInlineRename(null);
      }
      return;
    }

    if (inlineRename.type === "folder") {
      if (!folders.some((folder) => normalizePath(folder.path) === normalizePath(inlineRename.path))) {
        setInlineRename(null);
      }
      return;
    }

    if (!documents.some((document) => document.id === inlineRename.documentId && normalizePath(document.filePath ?? "") === normalizePath(inlineRename.path))) {
      setInlineRename(null);
    }
  }, [documents, folders, inlineRename, projects]);

  useEffect(() => {
    if (!pendingCreation) return;
    if (pendingCreation.type === "file") {
      const created = documents.find((doc) => {
        if (!doc.filePath) return false;
        const normalizedPath = normalizePath(doc.filePath);
        if (pendingCreation.folderPath) {
          return normalizePath(pathDirName(normalizedPath)) === normalizePath(pendingCreation.folderPath) && pathBaseName(normalizedPath).startsWith("Untitled");
        }
        return pathBaseName(normalizedPath).startsWith("Untitled");
      });
      if (!created?.filePath) return;
      const parentKey = normalizePath(pathDirName(created.filePath));
      setExpandedFolderKeys((items) => new Set(items).add(parentKey));
      setInlineRename({
        type: "file",
        path: created.filePath,
        documentId: created.id,
        value: created.title,
        originalValue: created.title,
        selectBaseName: true
      });
      setPendingCreation(null);
      return;
    }

    const createdFolder = folders.find((folder) => {
      const normalizedPath = normalizePath(folder.path);
      if (pendingCreation.folderPath) {
        return normalizePath(pathDirName(normalizedPath)) === normalizePath(pendingCreation.folderPath) && pathBaseName(normalizedPath).startsWith("New Folder");
      }
      return pathBaseName(normalizedPath).startsWith("New Folder");
    });
    if (!createdFolder) return;
    const parentPath = pathDirName(createdFolder.path);
    const createdKey = normalizePath(createdFolder.path);
    setExpandedFolderKeys((items) => new Set(items).add(normalizePath(parentPath)).add(createdKey));
    setInlineRename({
      type: "folder",
      path: createdFolder.path,
      value: createdFolder.title,
      originalValue: createdFolder.title
    });
    setPendingCreation(null);
  }, [documents, folders, pendingCreation]);

  const toggleFolder = (folder: InformioFolder) => {
    const key = normalizePath(folder.path || folder.id);
    setExpandedFolderKeys((items) => {
      const next = new Set(items);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const startInlineRename = (target: InlineRenameState) => {
    if (target.type !== "project") {
      const parentPath = target.type === "file" ? pathDirName(target.path) : target.path;
      setExpandedFolderKeys((items) => new Set(items).add(normalizePath(parentPath)));
    }
    setInlineRename(target);
  };

  const commitInlineRename = async () => {
    if (!inlineRename) return;
    const nextName = inlineRename.value.trim();
    if (!nextName) {
      setInlineRename(null);
      return;
    }

    if (nextName === inlineRename.originalValue.trim()) {
      setInlineRename(null);
      return;
    }

    const request = inlineRename;
    setInlineRename(null);
    if (request.type === "project") {
      await onRenameProject(request.path, nextName);
      return;
    }
    onFileAction({
      action: "rename",
      targetType: request.type,
      path: request.path,
      documentId: request.type === "file" ? request.documentId : undefined,
      name: nextName
    });
  };

  const cancelInlineRename = () => setInlineRename(null);

  const handleCreateFile = (folderPath?: string) => {
    setPendingCreation({ type: "file", folderPath });
    onCreate(folderPath);
  };

  const handleCreateFolder = (folderPath?: string) => {
    if (folderPath) {
      setExpandedFolderKeys((items) => new Set(items).add(normalizePath(folderPath)));
    }
    setPendingCreation({ type: "folder", folderPath });
    onCreateFolder(folderPath);
  };

  const moveToFolder = (input: FileSystemOperationInput, destinationFolderPath: string) => {
    if (input.targetType === "folder") {
      const normalizedSource = normalizePath(input.path);
      const normalizedDestination = normalizePath(destinationFolderPath);
      if (normalizedSource === normalizedDestination || pathContains(input.path, destinationFolderPath)) return;
    }
    if (normalizePath(pathDirName(input.path)) === normalizePath(destinationFolderPath)) return;
    onFileAction({ ...input, action: "move", destinationFolderPath });
  };

  const handleTreeDrop = (dataTransfer: DataTransfer, destinationFolderPath: string) => {
    const externalPaths = dataTransferFilePaths(dataTransfer);
    if (externalPaths.length) {
      onImportExternalFiles(externalPaths, destinationFolderPath);
      return;
    }

    const payload = parseTreeDragPayload(dataTransfer);
    if (!payload) return;

    if (payload.type === "file") {
      const draggedDocument = documents.find((doc) => doc.id === payload.documentId);
      const sourcePath = payload.path || draggedDocument?.filePath;
      if (!sourcePath) return;
      moveToFolder(
        {
          action: "move",
          targetType: "file",
          path: sourcePath,
          documentId: payload.documentId
        },
        destinationFolderPath
      );
      return;
    }

    moveToFolder(
      {
        action: "move",
        targetType: "folder",
        path: payload.path
      },
      destinationFolderPath
    );
  };

  const renderInlineRenameInput = (state: InlineRenameState, className: string) => (
    <input
      key={`${state.type}:${state.path}`}
      value={state.value}
      autoFocus
      onFocus={(event) => {
        if (state.type === "file" && state.selectBaseName) {
          const extension = pathExtName(state.originalValue);
          const end = extension ? state.originalValue.length - extension.length : state.originalValue.length;
          event.currentTarget.setSelectionRange(0, Math.max(0, end));
        } else {
          event.currentTarget.select();
        }
      }}
      onChange={(event) => setInlineRename((current) => (current && current.path === state.path && current.type === state.type ? { ...current, value: event.target.value, selectBaseName: false } : current))}
      onBlur={() => { void commitInlineRename(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commitInlineRename();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelInlineRename();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className={className}
    />
  );

  const renderTreeNode = (node: FileTreeNode, depth = 0): ReactNode => {
    const folderKey = normalizePath(node.folder.path || node.folder.id);
    const isProject = depth === 0 && projectPaths.has(normalizePath(node.folder.path));
    const collapsed = !expandedFolderKeys.has(folderKey);
    const isEditingFolder = inlineRename?.type === "folder" && normalizePath(inlineRename.path) === folderKey;
    const isEditingProject = inlineRename?.type === "project" && normalizePath(inlineRename.path) === folderKey;
    const isDropTarget = dropTarget?.path === folderKey;
    return (
      <div key={node.folder.id} className="space-y-1">
        <button
          type="button"
          data-file-context-target={isProject ? "project" : "folder"}
          data-file-path={node.folder.path}
          data-file-title={node.folder.title}
          className={cn(
            "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold text-[var(--text-muted)] transition-[background-color,color] hover:bg-white/65 hover:text-[var(--text-main)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
            isDropTarget && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/35"
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggleFolder(node.folder)}
          onDragOver={(event) => {
            const isInternalDrag = isInternalTreeDrag(event.dataTransfer);
            const isExternalDrag = isExternalFileDrag(event.dataTransfer);
            if (!isInternalDrag && !isExternalDrag) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = isExternalDrag ? "copy" : "move";
            setDropTarget({ path: folderKey, depth });
          }}
          onDragLeave={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer) && !isExternalFileDrag(event.dataTransfer)) return;
            if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
            setDropTarget((current) => (current?.path === folderKey ? null : current));
          }}
          onDrop={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer) && !isExternalFileDrag(event.dataTransfer)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(null);
            handleTreeDrop(event.dataTransfer, node.folder.path);
          }}
          draggable={!isProject}
          onDragStart={(event) => {
            if (isProject) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(TREE_ITEM_DRAG_MIME, serializeTreeDragPayload({ type: "folder", path: node.folder.path }));
            event.dataTransfer.setData(FOLDER_DRAG_MIME, node.folder.path);
          }}
        >
          {isProject ? (
            <Folder size={14} className="shrink-0" />
          ) : (
            <FolderRoot size={14} className="shrink-0 text-slate-400" />
          )}
          {isEditingFolder || isEditingProject
            ? renderInlineRenameInput(
                (inlineRename as InlineRenameState),
                "min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-2 ring-emerald-500/45"
              )
            : <span className="min-w-0 flex-1 truncate">{node.folder.title}</span>}
          {isProject && projectsByPath.get(folderKey)?.pinned ? <Pin size={11} className="shrink-0 text-slate-400" /> : null}
        </button>
        {collapsed ? null : (
          <div className="space-y-1">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
            {node.documents.map((doc) => {
              const active = doc.id === activeDocumentId;
              const isEditingFile = inlineRename?.type === "file" && inlineRename.documentId === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  draggable
                  data-file-context-target="file"
                  data-file-path={doc.filePath ?? ""}
                  data-file-title={doc.title}
                  data-document-id={doc.id}
                  onClick={() => onSelect(doc.id)}
                  onDragStart={(event) => onDocumentDragStart(doc.id, event)}
                  className={cn(
                    "w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                    active
                      ? "bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(15,23,42,0.10)]"
                      : "hover:bg-white/75"
                  )}
                  style={{ paddingLeft: 8 + (depth + 1) * 14 }}
                >
                  <div className="flex items-center gap-2">
                    {documentKind(doc) === "video" ? (
                      <Film size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : documentKind(doc) === "audio" ? (
                      <Music size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : documentKind(doc) === "image" ? (
                      <ImageIcon size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : (
                      <FileText size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    )}
                    {isEditingFile
                      ? renderInlineRenameInput(
                          inlineRename,
                          "min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-2 ring-emerald-500/45"
                        )
                      : <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-main)]">{doc.title}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };
  const openContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-file-context-target]") : null;
    const targetType = target?.dataset.fileContextTarget;
    const path = target?.dataset.filePath;
    const title = target?.dataset.fileTitle;

    if (targetType === "project" && path) {
      setContextMenu(null);
      setBlankContextMenu(null);
      const project = projectsByPath.get(normalizePath(path));
      setProjectContextMenu({
        x: event.clientX,
        y: event.clientY,
        path,
        title: project?.title || title || pathBaseName(path),
        pinned: Boolean(project?.pinned)
      });
      return;
    }

    if (targetType === "folder" && path && title) {
      setBlankContextMenu(null);
      setProjectContextMenu(null);
      setContextMenu({ x: event.clientX, y: event.clientY, target: { type: "folder", path, title } });
      return;
    }

    if (targetType === "file" && path && title && target.dataset.documentId) {
      setBlankContextMenu(null);
      setProjectContextMenu(null);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { type: "file", path, title, documentId: target.dataset.documentId }
      });
      return;
    }

    setContextMenu(null);
    setProjectContextMenu(null);
    setBlankContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <aside
      className="context-panel h-full shrink-0"
      style={{ width }}
      onContextMenu={openContextMenu}
    >
      <div className="space-y-2 overflow-y-auto px-3 py-3 text-[13px]">
        {tree.map((node) => renderTreeNode(node))}
      </div>
      {contextMenu ? (
        <FileContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onAction={(action, target) =>
            action === "rename"
              ? startInlineRename(
                  target.type === "file"
                    ? { type: "file", path: target.path, documentId: target.documentId, value: target.title, originalValue: target.title }
                    : { type: "folder", path: target.path, value: target.title, originalValue: target.title }
                )
              : onFileAction({
                  action,
                  targetType: target.type,
                  path: target.path,
                  documentId: target.type === "file" ? target.documentId : undefined
                })
          }
        />
      ) : null}
      {projectContextMenu ? (
        <ProjectContextMenu
          state={projectContextMenu}
          onClose={() => setProjectContextMenu(null)}
          onCreateFile={() => {
            handleCreateFile(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
          onCreateFolder={() => {
            handleCreateFolder(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
          onRename={() => {
            startInlineRename({ type: "project", path: projectContextMenu.path, value: projectContextMenu.title, originalValue: projectContextMenu.title });
            setProjectContextMenu(null);
          }}
          onTogglePinned={() => {
            onToggleProjectPinned(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
          onReveal={() => {
            onFileAction({ action: "reveal", targetType: "folder", path: projectContextMenu.path });
            setProjectContextMenu(null);
          }}
          onRemove={() => {
            onRemoveProject(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
        />
      ) : null}
      {blankContextMenu ? (
        <BlankFileContextMenu
          state={blankContextMenu}
          onClose={() => setBlankContextMenu(null)}
          onCreateFile={() => handleCreateFile()}
          onCreateFolder={() => handleCreateFolder()}
        />
      ) : null}
    </aside>
  );
}

function LinkDialog({
  request,
  onClose,
  onConfirm
}: {
  request: LinkRequest | null;
  onClose: () => void;
  onConfirm: (input: { text: string; url: string; title?: string }) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setText(request.text || "链接文字");
    setUrl(request.url);
    setTitle(request.title ?? "");
    window.setTimeout(() => {
      (request.url ? urlInputRef.current : urlInputRef.current)?.focus();
      urlInputRef.current?.select();
    }, 0);
  }, [request]);

  const trimmedText = text.trim();
  const trimmedUrl = url.trim();
  const canSubmit = Boolean(trimmedText && trimmedUrl);

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">链接</Dialog.Title>
          <Dialog.Description className="sr-only">输入链接文字和地址，确认后插入或更新超链接。</Dialog.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) onConfirm({ text: trimmedText, url: trimmedUrl, title: title.trim() || undefined });
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">文字</span>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">地址</span>
              <input
                ref={urlInputRef}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">标题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="可选"
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-[background-color,transform] hover:bg-slate-100 active:scale-[0.99]"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-[background-color,opacity,transform] hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45"
              >
                确认
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImageDialog({
  request,
  onClose,
  onConfirm
}: {
  request: ImageRequest | null;
  onClose: () => void;
  onConfirm: (input: { alt: string; src: string; title: string }) => void;
}) {
  const [alt, setAlt] = useState("");
  const [src, setSrc] = useState("");
  const [title, setTitle] = useState("");
  const srcInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setAlt(request.alt);
    setSrc(request.src);
    setTitle(request.title);
    window.setTimeout(() => {
      srcInputRef.current?.focus();
      srcInputRef.current?.select();
    }, 0);
  }, [request]);

  const canSubmit = Boolean(src.trim());

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">图片</Dialog.Title>
          <Dialog.Description className="sr-only">编辑图片地址、替代文字和标题。</Dialog.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) onConfirm({ alt: alt.trim(), src: src.trim(), title: title.trim() });
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">地址</span>
              <input
                ref={srcInputRef}
                value={src}
                onChange={(event) => setSrc(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">替代文字</span>
              <input
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">标题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="可选"
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-[background-color,transform] hover:bg-slate-100 active:scale-[0.99]" onClick={onClose}>
                取消
              </button>
              <button type="submit" disabled={!canSubmit} className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-[background-color,opacity,transform] hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45">
                确认
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type SecretPromptRequest =
  | {
      mode: "set-passphrase";
      error?: string;
    }
  | {
      mode: "unlock-passphrase";
      intent: "encrypt" | "decrypt";
      error?: string;
    };

type PendingSecretAction =
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

function SecretPassphraseDialog({
  request,
  onClose,
  onConfirm
}: {
  request: SecretPromptRequest | null;
  onClose: () => void;
  onConfirm: (input: { passphrase: string; confirmPassphrase?: string }) => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setPassphrase("");
    setConfirmPassphrase("");
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [request]);

  const trimmedPassphrase = passphrase.trim();
  const trimmedConfirmPassphrase = confirmPassphrase.trim();
  const needsConfirmation = request?.mode === "set-passphrase";
  const canSubmit = needsConfirmation
    ? Boolean(trimmedPassphrase && trimmedConfirmPassphrase)
    : Boolean(trimmedPassphrase);

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">
            {request?.mode === "set-passphrase" ? "设置文档加密口令" : "输入文档加密口令"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
            {request?.mode === "set-passphrase"
              ? "首次加密这篇文档时需要先设置口令。后续同文档的所有加密片段都会共用它。"
              : request?.intent === "decrypt"
                ? "请输入这篇文档的加密口令。每次点击密文解密前都需要再次验证口令。"
                : "请输入这篇文档的加密口令。验证通过后才能继续新增加密内容。"}
          </Dialog.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              onConfirm({
                passphrase: trimmedPassphrase,
                confirmPassphrase: needsConfirmation ? trimmedConfirmPassphrase : undefined
              });
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">口令</span>
              <input
                ref={inputRef}
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            {needsConfirmation ? (
              <label className="grid gap-1.5">
                <span className="text-[12px] font-bold text-[var(--text-muted)]">确认口令</span>
                <input
                  type="password"
                  value={confirmPassphrase}
                  onChange={(event) => setConfirmPassphrase(event.target.value)}
                  className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
                />
              </label>
            ) : null}
            {request?.error ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-semibold leading-5 text-red-700">{request.error}</div> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-[background-color,transform] hover:bg-slate-100 active:scale-[0.99]"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-[background-color,opacity,transform] hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45"
              >
                确认
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ConflictDiffLine = {
  key: string;
  kind: "same" | "removed" | "added";
  text: string;
};

type MarkdownDiffHunk = {
  baseStart: number;
  baseEnd: number;
  replacement: string[];
};

const MAX_DIFF_MATRIX_CELLS = 600_000;
const MAX_CONFLICT_PREVIEW_LINES = 80;
const MAX_CONFLICT_PREVIEW_CHARS = 4000;

const canBuildDiffMatrix = (leftLength: number, rightLength: number) =>
  (leftLength + 1) * (rightLength + 1) <= MAX_DIFF_MATRIX_CELLS;

const conflictPreviewText = (lines: string[]) => {
  const text = lines.slice(0, MAX_CONFLICT_PREVIEW_LINES).join(" / ");
  return text.length > MAX_CONFLICT_PREVIEW_CHARS ? `${text.slice(0, MAX_CONFLICT_PREVIEW_CHARS)}...` : text;
};

const buildMarkdownDiffHunks = (base: string[], next: string[]): MarkdownDiffHunk[] => {
  const table = Array.from({ length: base.length + 1 }, () => Array(next.length + 1).fill(0) as number[]);
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = next.length - 1; j >= 0; j -= 1) {
      table[i][j] = base[i] === next[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const hunks: MarkdownDiffHunk[] = [];
  let i = 0;
  let j = 0;
  let current: MarkdownDiffHunk | null = null;

  const startHunk = () => {
    if (!current) current = { baseStart: i, baseEnd: i, replacement: [] };
    return current;
  };
  const closeHunk = () => {
    if (!current) return;
    hunks.push(current);
    current = null;
  };

  while (i < base.length && j < next.length) {
    if (base[i] === next[j]) {
      closeHunk();
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      const hunk = startHunk();
      hunk.baseEnd = i + 1;
      i += 1;
    } else {
      const hunk = startHunk();
      hunk.replacement.push(next[j]);
      j += 1;
    }
  }

  while (i < base.length) {
    const hunk = startHunk();
    hunk.baseEnd = i + 1;
    i += 1;
  }
  while (j < next.length) {
    const hunk = startHunk();
    hunk.replacement.push(next[j]);
    j += 1;
  }
  closeHunk();
  return hunks;
};

const sameHunkReplacement = (left: MarkdownDiffHunk, right: MarkdownDiffHunk) =>
  left.baseStart === right.baseStart &&
  left.baseEnd === right.baseEnd &&
  left.replacement.length === right.replacement.length &&
  left.replacement.every((line, index) => line === right.replacement[index]);

const hunksOverlap = (left: MarkdownDiffHunk, right: MarkdownDiffHunk) => {
  if (left.baseStart === left.baseEnd && right.baseStart === right.baseEnd) {
    return left.baseStart === right.baseStart;
  }
  return Math.max(left.baseStart, right.baseStart) < Math.min(left.baseEnd, right.baseEnd);
};

const mergeMarkdownWithBase = (
  baseMarkdown: string,
  localMarkdown: string,
  externalMarkdown: string
): { mergedMarkdown: string; conflicted: boolean } => {
  if (localMarkdown === externalMarkdown) return { mergedMarkdown: localMarkdown, conflicted: false };
  if (localMarkdown === baseMarkdown) return { mergedMarkdown: externalMarkdown, conflicted: false };
  if (externalMarkdown === baseMarkdown) return { mergedMarkdown: localMarkdown, conflicted: false };

  const base = baseMarkdown.split("\n");
  const localLines = localMarkdown.split("\n");
  const externalLines = externalMarkdown.split("\n");
  if (!canBuildDiffMatrix(base.length, localLines.length) || !canBuildDiffMatrix(base.length, externalLines.length)) {
    return { mergedMarkdown: localMarkdown, conflicted: true };
  }

  const localHunks = buildMarkdownDiffHunks(base, localLines);
  const externalHunks = buildMarkdownDiffHunks(base, externalLines);
  const merged: string[] = [];
  let baseIndex = 0;
  let localIndex = 0;
  let externalIndex = 0;

  const applyHunk = (hunk: MarkdownDiffHunk) => {
    merged.push(...base.slice(baseIndex, hunk.baseStart), ...hunk.replacement);
    baseIndex = hunk.baseEnd;
  };

  while (localIndex < localHunks.length || externalIndex < externalHunks.length) {
    const local = localHunks[localIndex];
    const external = externalHunks[externalIndex];
    if (!external || (local && local.baseStart < external.baseStart && !hunksOverlap(local, external))) {
      applyHunk(local);
      localIndex += 1;
      continue;
    }
    if (!local || (external.baseStart < local.baseStart && !hunksOverlap(local, external))) {
      applyHunk(external);
      externalIndex += 1;
      continue;
    }
    if (local && external && sameHunkReplacement(local, external)) {
      applyHunk(local);
      localIndex += 1;
      externalIndex += 1;
      continue;
    }
    return { mergedMarkdown: localMarkdown, conflicted: true };
  }

  merged.push(...base.slice(baseIndex));
  return { mergedMarkdown: merged.join("\n"), conflicted: false };
};

const buildConflictDiffLines = (externalMarkdown: string, localMarkdown: string): ConflictDiffLine[] => {
  const removed = externalMarkdown.split("\n");
  const added = localMarkdown.split("\n");
  if (!canBuildDiffMatrix(removed.length, added.length)) {
    return [
      {
        key: "diff-too-large",
        kind: "same",
        text: `文档过长，已跳过逐行 Diff 以避免界面卡顿。外部版本 ${removed.length} 行，我的版本 ${added.length} 行。`
      },
      { key: "diff-too-large-external", kind: "removed", text: `外部版本预览：${conflictPreviewText(removed)}` },
      { key: "diff-too-large-local", kind: "added", text: `我的版本预览：${conflictPreviewText(added)}` }
    ];
  }
  const table = Array.from({ length: removed.length + 1 }, () => Array(added.length + 1).fill(0) as number[]);
  for (let i = removed.length - 1; i >= 0; i -= 1) {
    for (let j = added.length - 1; j >= 0; j -= 1) {
      table[i][j] = removed[i] === added[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines: ConflictDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < removed.length && j < added.length) {
    if (removed[i] === added[j]) {
      lines.push({ key: `same-${i}-${j}`, kind: "same", text: removed[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ key: `removed-${i}-${j}`, kind: "removed", text: removed[i] });
      i += 1;
    } else {
      lines.push({ key: `added-${i}-${j}`, kind: "added", text: added[j] });
      j += 1;
    }
  }
  while (i < removed.length) {
    lines.push({ key: `removed-${i}-${j}`, kind: "removed", text: removed[i] });
    i += 1;
  }
  while (j < added.length) {
    lines.push({ key: `added-${i}-${j}`, kind: "added", text: added[j] });
    j += 1;
  }
  return lines;
};

function DocumentConflictDialog({
  conflict,
  document,
  onClose,
  onKeepLocal,
  onUseExternal
}: {
  conflict: DocumentConflict | null;
  document?: InformioDocument;
  onClose: () => void;
  onKeepLocal: (documentId: string) => void;
  onUseExternal: (documentId: string) => void;
}) {
  const diffLines = useMemo(
    () => (conflict ? buildConflictDiffLines(conflict.externalMarkdown, conflict.localMarkdown) : []),
    [conflict]
  );
  const copyExternal = () => {
    if (!conflict) return;
    void navigator.clipboard?.writeText(conflict.externalMarkdown);
  };

  return (
    <Dialog.Root open={Boolean(conflict)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[92] bg-slate-950/22 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[93] flex h-[min(720px,calc(100vh-40px))] w-[min(980px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[15px] font-extrabold">需要合并更改</Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-[12px] leading-5 text-[var(--text-muted)]">
                {document?.title ?? conflict?.filePath ?? "当前文档"} 的同一段内容同时被你和外部修改。自动保存已暂停，请选择如何处理。
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="关闭"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
            <aside className="border-r border-slate-200 bg-slate-50/80 p-3 text-[12px] leading-5 text-slate-600">
              <div className="font-bold text-slate-900">处理方式</div>
              <p className="mt-2">绿色是你当前编辑器里的内容，红色是外部版本中被替换或删除的内容。</p>
              <p className="mt-2">关闭不会解决冲突，自动保存会继续暂停。</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
                onClick={copyExternal}
              >
                <Copy size={13} />
                复制外部版本
              </button>
            </aside>
            <div className="min-h-0 overflow-auto p-3">
              <pre className="min-h-full whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[12px] leading-5 text-slate-200">
                {diffLines.map((line) => (
                  <div
                    key={line.key}
                    className={cn(
                      "block min-h-5 px-1",
                      line.kind === "removed" && "bg-red-500/20 text-red-100",
                      line.kind === "added" && "bg-emerald-500/20 text-emerald-100",
                      line.kind === "same" && "text-slate-300"
                    )}
                  >
                    <span className="select-none pr-2 text-slate-500">
                      {line.kind === "removed" ? "-" : line.kind === "added" ? "+" : " "}
                    </span>
                    {line.text || " "}
                  </div>
                ))}
              </pre>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <div className="text-[12px] text-[var(--text-muted)]">也可以手动合并后再选择“保留我的版本”保存。</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
                onClick={onClose}
              >
                稍后处理
              </button>
              <button
                type="button"
                disabled={!conflict}
                className="h-8 rounded-md bg-slate-900 px-3 text-[12px] font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-45"
                onClick={() => conflict && onUseExternal(conflict.documentId)}
              >
                采用外部版本
              </button>
              <button
                type="button"
                disabled={!conflict}
                className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-45"
                onClick={() => conflict && onKeepLocal(conflict.documentId)}
              >
                保留我的版本
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OutlineList({
  document,
  width,
  onJump
}: {
  document: InformioDocument;
  width: number;
  onJump: (item: OutlineItem) => void;
}) {
  const outline = useMemo(() => getDocumentOutline(document.markdown), [document.markdown]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const baseLevel = outline.reduce((level, item) => Math.min(level, item.level), 6);

  useEffect(() => {
    if (!activeOutlineId || outline.some((item) => item.id === activeOutlineId)) return;
    setActiveOutlineId(null);
  }, [activeOutlineId, outline]);

  return (
    <aside className="context-panel informio-outline-panel h-full shrink-0" style={{ width }}>
      <div className="informio-outline-list">
        {outline.length ? (
          outline.map((item) => {
            const depth = Math.max(0, item.level - baseLevel);
            const active = activeOutlineId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveOutlineId(item.id);
                  onJump(item);
                }}
                className={cn("informio-outline-item", active && "is-active", `is-level-${item.level}`)}
                style={{ paddingLeft: 18 + depth * 18 }}
              >
                <span>{item.title}</span>
              </button>
            );
          })
        ) : (
          <div className="informio-outline-empty">暂无大纲</div>
        )}
      </div>
    </aside>
  );
}

const stringifyPropertyValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (value === null) return "null";
  return String(value);
};

const propertyFrontmatterCache = new Map<string, { markdown: string; frontmatter: FrontmatterParseResult }>();

const cachedDocumentFrontmatter = (document: InformioDocument) => {
  const cached = propertyFrontmatterCache.get(document.id);
  if (cached?.markdown === document.markdown) return cached.frontmatter;
  const frontmatter = parseFrontmatter(document.markdown);
  propertyFrontmatterCache.set(document.id, { markdown: document.markdown, frontmatter });
  return frontmatter;
};

const buildPropertyGroups = (documents: InformioDocument[]): PropertyGroup[] => {
  const propertyMap = new Map<string, Map<string, InformioDocument[]>>();
  const documentIds = new Set(documents.map((document) => document.id));
  Array.from(propertyFrontmatterCache.keys()).forEach((id) => {
    if (!documentIds.has(id)) propertyFrontmatterCache.delete(id);
  });

  for (const document of documents) {
    const frontmatter = cachedDocumentFrontmatter(document);
    if (!frontmatter.hasFrontmatter || frontmatter.error) continue;
    const entries = Object.entries(frontmatter.values);
    if (!entries.length) continue;

    for (const [key, rawValue] of entries) {
      const values = Array.isArray(rawValue)
        ? rawValue.filter((item) => isFrontmatterPrimitive(item)).map(stringifyPropertyValue)
        : isFrontmatterPrimitive(rawValue)
          ? [stringifyPropertyValue(rawValue)]
          : [];
      if (!values.length) continue;

      const valueMap = propertyMap.get(key) ?? new Map<string, InformioDocument[]>();
      propertyMap.set(key, valueMap);
      for (const value of values) {
        const files = valueMap.get(value) ?? [];
        files.push(document);
        valueMap.set(value, files);
      }
    }
  }

  return Array.from(propertyMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, valueMap]) => ({
      name,
      values: Array.from(valueMap.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([value, files]) => ({
          value,
          files: [...files].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        }))
    }));
};

function PropertiesList({
  documents,
  activeDocumentId,
  width,
  onSelect
}: {
  documents: InformioDocument[];
  activeDocumentId: string;
  width: number;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(() => buildPropertyGroups(documents), [documents]);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(() => new Set());
  const [expandedValues, setExpandedValues] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const propertyNames = new Set(groups.map((group) => group.name));
    const valueKeys = new Set(groups.flatMap((group) => group.values.map((item) => `${group.name}::${item.value}`)));

    setExpandedProperties((current) => {
      const next = new Set(Array.from(current).filter((name) => propertyNames.has(name)));
      return next.size === current.size ? current : next;
    });
    setExpandedValues((current) => {
      const next = new Set(Array.from(current).filter((key) => valueKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  const toggleProperty = (name: string) => {
    setExpandedProperties((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleValue = (key: string) => {
    setExpandedValues((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className="context-panel h-full shrink-0" style={{ width }}>
      <div className="space-y-1.5 overflow-y-auto px-3 py-3">
        {groups.length ? (
          groups.map((group) => {
            const propertyOpen = expandedProperties.has(group.name);
            return (
              <div key={group.name} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleProperty(group.name)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-[background-color,transform] active:scale-[0.99] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                >
                  {propertyOpen ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-main)]">{group.name}</span>
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--text-muted)]">{group.values.length}</span>
                </button>

                {propertyOpen ? (
                  <div className="space-y-1">
                    {group.values.map((valueGroup) => {
                      const valueKey = `${group.name}::${valueGroup.value}`;
                      const valueOpen = expandedValues.has(valueKey);
                      return (
                        <div key={valueKey} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => toggleValue(valueKey)}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-[background-color,transform] active:scale-[0.99] hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                            style={{ paddingLeft: 24 }}
                          >
                            {valueOpen ? <ChevronDown size={13} className="shrink-0 text-slate-400" /> : <ChevronRight size={13} className="shrink-0 text-slate-400" />}
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700">{valueGroup.value}</span>
                            <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--text-muted)]">{valueGroup.files.length}</span>
                          </button>
                          {valueOpen ? (
                            <div className="space-y-1">
                              {valueGroup.files.map((document) => {
                                const active = document.id === activeDocumentId;
                                return (
                                  <button
                                    key={`${valueKey}:${document.id}`}
                                    type="button"
                                    onClick={() => onSelect(document.id)}
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-[background-color,transform] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                                      active
                                        ? "bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(15,23,42,0.10)]"
                                        : "hover:bg-white/65"
                                    )}
                                    style={{ paddingLeft: 40 }}
                                  >
                                    <FileText size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                                    <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-main)]">{document.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : null}
      </div>
    </aside>
  );
}

const isFrontmatterPrimitive = (value: unknown) =>
  value === null || ["string", "number", "boolean"].includes(typeof value) || value instanceof Date;

const editableFrontmatterEntries = (values: Record<string, unknown>) =>
  Object.entries(values).filter(([, value]) => isFrontmatterPrimitive(value) || (Array.isArray(value) && value.every(isFrontmatterPrimitive)));

const hasRawOnlyFrontmatter = (values: Record<string, unknown>) =>
  Object.entries(values).some(([, value]) => !isFrontmatterPrimitive(value) && !(Array.isArray(value) && value.every(isFrontmatterPrimitive)));

function PropertiesPanel({
  frontmatter,
  onChange
}: {
  frontmatter: FrontmatterParseResult;
  onChange: (nextRaw: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const newValueInputRef = useRef<HTMLInputElement | null>(null);
  const entries = editableFrontmatterEntries(frontmatter.values);
  const rawOnly = Boolean(frontmatter.error) || hasRawOnlyFrontmatter(frontmatter.values);
  const hasProperties = entries.length > 0;

  const updateValues = (nextValues: Record<string, unknown>) => onChange(YAML.stringify(nextValues, { lineWidth: 0 }).trimEnd());
  const updateField = (key: string, value: unknown) => updateValues({ ...frontmatter.values, [key]: value });
  const commitNewProperty = () => {
    const key = newKey.trim();
    if (!key) return;
    updateField(key, newValue);
    setNewKey("");
    setNewValue("");
  };
  const removeField = (key: string) => {
    const nextValues = { ...frontmatter.values };
    delete nextValues[key];
    updateValues(nextValues);
  };

  return (
    <section className="informio-properties">
      {frontmatter.error ? <div className="informio-properties-error">{frontmatter.error}</div> : null}
      {rawOnly ? (
        <textarea
          className="informio-properties-raw"
          value={frontmatter.raw}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <>
          {hasProperties ? (
            <div className="informio-property-list">
              {entries.map(([key, value]) => (
                <div key={key} className="informio-property-row">
                  <label>{key}</label>
                  {typeof value === "boolean" ? (
                    <Switch.Root className="switch-root" checked={value} onCheckedChange={(checked) => updateField(key, checked)}>
                      <Switch.Thumb className="switch-thumb" />
                    </Switch.Root>
                  ) : (
                    <input
                      value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                      onChange={(event) => updateField(key, Array.isArray(value) ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value)}
                    />
                  )}
                  <button type="button" aria-label={`Remove ${key}`} onClick={() => removeField(key)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <form
            className={cn("informio-property-new", !hasProperties && "is-standalone")}
            onSubmit={(event) => {
              event.preventDefault();
              if (document.activeElement === newValueInputRef.current) {
                commitNewProperty();
                return;
              }
              newValueInputRef.current?.focus();
            }}
          >
            <input
              value={newKey}
              placeholder="Tag"
              onChange={(event) => setNewKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "Tab") return;
                if (!newKey.trim()) return;
                event.preventDefault();
                newValueInputRef.current?.focus();
              }}
            />
            <input
              ref={newValueInputRef}
              value={newValue}
              placeholder="Content"
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitNewProperty();
              }}
            />
            <button type="submit">Save</button>
          </form>
        </>
      )}
    </section>
  );
}

function EditorPane({
  paneId,
  document,
  documents,
  settings,
  viewMode,
  outlineJumpRequest,
  onOutlineJumpHandled,
  onChange,
  onOpenInternalLink,
  onCreateInternalLink,
  onSelection,
  onCompositionChange,
  toolbarEnabled,
  toolbarTranslate,
  onTranslateSelection,
  onClearToolbarTranslate
}: {
  paneId: EditorPaneState["id"];
  document: InformioDocument;
  documents: InformioDocument[];
  settings: AppSettings;
  viewMode: EditorViewMode;
  outlineJumpRequest: OutlineJumpRequest | null;
  onOutlineJumpHandled: (request: OutlineJumpRequest) => void;
  onChange: (documentId: string, markdown: string, options?: { composing?: boolean }) => void;
  onOpenInternalLink: (documentId: string, sourcePaneId: EditorPaneState["id"]) => void;
  onCreateInternalLink: (title: string) => void;
  onSelection: (selection: AgentSelection | null) => void;
  onCompositionChange: (documentId: string, composing: boolean) => void;
  toolbarEnabled: boolean;
  toolbarTranslate: UnifiedToolbarTranslateState;
  onTranslateSelection: (selection: AgentSelection) => void;
  onClearToolbarTranslate: () => void;
}) {
  const composingRef = useRef(false);
  const applyingMarkdownAutoBlockRef = useRef(false);
  const markdownAutoBlockTimerRef = useRef<number | null>(null);
  const editorScrollTimerRef = useRef<number | null>(null);
  const editorInstanceRef = useRef<Editor | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const findQueryInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const contentColumnRef = useRef<HTMLDivElement | null>(null);
  const syncedDocumentIdRef = useRef<string | null>(null);
  const markdownToolbarRef = useRef<AgentSelection | null>(null);
  const pendingSecretActionRef = useRef<PendingSecretAction | null>(null);
  const requestDecryptSecretRef = useRef<(request: SecretDecryptRequest) => void>(() => undefined);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const [imageRequest, setImageRequest] = useState<ImageRequest | null>(null);
  const [secretPromptRequest, setSecretPromptRequest] = useState<SecretPromptRequest | null>(null);
  const [markdownToolbar, setMarkdownToolbar] = useState<AgentSelection | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [wikiSuggest, setWikiSuggest] = useState<{ query: string; from: number; to: number; left: number; top: number } | null>(null);
  const [wikiIndex, setWikiIndex] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findMatch, setFindMatch] = useState<FindMatch | null>(null);
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const [editorScrolling, setEditorScrolling] = useState(false);
  const frontmatter = useMemo(() => parseFrontmatter(document.markdown), [document.markdown]);
  const editorMarkdown = frontmatter.body;
  const activeDocumentKind = documentKind(document);
  const isPdfDocument = activeDocumentKind === "pdf";
  const isAssetDocument = isEmbeddableAssetDocument(document);
  const isReadOnlyDocument = !isWritableTextDocument(document);
  const isSourceMode = !isReadOnlyDocument && viewMode === "source";
  const documentLinkIndexKey = useMemo(
    () => documentLookupKey(documents, document.id),
    [documents]
  );
  const documentLookupIndex = useMemo(() => buildDocumentLookupIndex(documents, document.id), [documentLinkIndexKey]);
  const closeSecretPrompt = () => {
    pendingSecretActionRef.current = null;
    setSecretPromptRequest(null);
  };
  const cachedSecretPassphrase = () => documentSecretPassphraseCache.get(document.id) ?? null;
  const cacheSecretPassphrase = (passphrase: string) => {
    documentSecretPassphraseCache.set(document.id, passphrase);
  };
  const clearSecretPassphrase = () => {
    documentSecretPassphraseCache.delete(document.id);
  };
  const applyEncryptedSelection = async (currentEditor: Editor, action: Extract<PendingSecretAction, { type: "encrypt" }>, passphrase: string) => {
    if (selectionContainsSecretNode(currentEditor, action.from, action.to)) {
      window.alert("当前选区包含已加密内容，请先解密这些片段，再重新执行加密。");
      return;
    }

    const markdown = serializeSelectionFragmentToMarkdown(currentEditor, action.from, action.to, action.kind);
    const attrs = await encryptSecretMarkdown(markdown, passphrase, action.kind);
    currentEditor
      .chain()
      .focus()
      .insertContentAt(
        { from: action.from, to: action.to },
        action.kind === "inline"
          ? { type: "encryptedInline", attrs }
          : { type: "encryptedBlock", attrs }
      )
      .run();
  };
  const applyDecryptedSecret = async (currentEditor: Editor, request: SecretDecryptRequest, passphrase: string) => {
    const node = currentEditor.state.doc.nodeAt(request.pos);
    if (!node) return;
    const range = { from: request.pos, to: request.pos + node.nodeSize };
    const markdown = await decryptSecretMarkdown(request.attrs, passphrase);

    if (request.kind === "inline") {
      currentEditor.chain().focus().insertContentAt(range, parseInlineMarkdownContent(currentEditor, markdown)).run();
      return;
    }

    currentEditor.chain().focus().insertContentAt(range, markdown, { contentType: "markdown" }).run();
  };
  const beginEncryptSelection = async () => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    const { from, to, empty } = currentEditor.state.selection;
    if (empty) return;
    if (selectionContainsSecretNode(currentEditor, from, to)) {
      window.alert("当前选区包含已加密内容，请先解密这些片段，再重新执行加密。");
      return;
    }

    const action: Extract<PendingSecretAction, { type: "encrypt" }> = {
      type: "encrypt",
      from,
      to,
      kind: selectionShouldUseBlockSecret(currentEditor) ? "block" : "inline"
    };

    const cachedPassphrase = cachedSecretPassphrase();
    if (cachedPassphrase) {
      await applyEncryptedSelection(currentEditor, action, cachedPassphrase);
      return;
    }

    if (documentContainsSecretNode(currentEditor)) {
      const verifyAttrs = findFirstValidSecretInDocument(currentEditor);
      if (!verifyAttrs) {
        window.alert("这篇文档里已有损坏的加密片段。请先修复或删除损坏片段，再继续新增加密内容。");
        return;
      }
      pendingSecretActionRef.current = { ...action, verifyAttrs };
      setSecretPromptRequest({ mode: "unlock-passphrase", intent: "encrypt" });
      return;
    }

    pendingSecretActionRef.current = action;
    setSecretPromptRequest({ mode: "set-passphrase" });
  };
  const beginDecryptSecret = async (request: SecretDecryptRequest) => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed || !secretAttrsAreValid(request.attrs)) return;
    pendingSecretActionRef.current = { type: "decrypt", request };
    setSecretPromptRequest({ mode: "unlock-passphrase", intent: "decrypt" });
  };
  requestDecryptSecretRef.current = (request) => {
    void beginDecryptSecret(request);
  };
  const confirmSecretPrompt = async ({ passphrase, confirmPassphrase }: { passphrase: string; confirmPassphrase?: string }) => {
    const currentEditor = editorInstanceRef.current;
    const pendingAction = pendingSecretActionRef.current;
    if (!currentEditor || currentEditor.isDestroyed || !pendingAction) {
      closeSecretPrompt();
      return;
    }

    if (secretPromptRequest?.mode === "set-passphrase") {
      if (!confirmPassphrase || passphrase !== confirmPassphrase) {
        setSecretPromptRequest({ mode: "set-passphrase", error: "两次输入的口令不一致，请重新确认。" });
        return;
      }
      try {
        cacheSecretPassphrase(passphrase);
        await applyEncryptedSelection(currentEditor, pendingAction as Extract<PendingSecretAction, { type: "encrypt" }>, passphrase);
        closeSecretPrompt();
      } catch (error) {
        clearSecretPassphrase();
        setSecretPromptRequest({ mode: "set-passphrase", error: error instanceof Error ? error.message : "加密失败，请重试。" });
      }
      return;
    }

    if (pendingAction.type === "encrypt") {
      try {
        if (pendingAction.verifyAttrs) await decryptSecretMarkdown(pendingAction.verifyAttrs, passphrase);
        cacheSecretPassphrase(passphrase);
        await applyEncryptedSelection(currentEditor, pendingAction, passphrase);
        closeSecretPrompt();
      } catch {
        clearSecretPassphrase();
        setSecretPromptRequest({ mode: "unlock-passphrase", intent: "encrypt", error: "口令不正确，无法验证这篇文档已有的加密内容。" });
      }
      return;
    }

    try {
      cacheSecretPassphrase(passphrase);
      await applyDecryptedSecret(currentEditor, pendingAction.request, passphrase);
      closeSecretPrompt();
    } catch {
      clearSecretPassphrase();
      setSecretPromptRequest({ mode: "unlock-passphrase", intent: "decrypt", error: "口令不正确，或当前加密片段已损坏。" });
    }
  };
  const updateWikiSuggestion = (currentEditor: Editor) => {
    const { from, to } = currentEditor.state.selection;
    if (from !== to) {
      setWikiSuggest(null);
      return;
    }
    const before = currentEditor.state.doc.textBetween(Math.max(0, from - 80), from, "\n");
    const match = before.match(/\[\[([^\]\n]*)$/);
    if (!match) {
      setWikiSuggest(null);
      return;
    }
    const start = from - match[0].length;
    const coords = currentEditor.view.coordsAtPos(from);
    setWikiSuggest({ query: match[1].toLowerCase(), from: start, to: from, left: coords.left, top: coords.bottom + 8 });
    setWikiIndex(0);
  };
  const emitMarkdownSelection = (currentEditor: Editor) => {
    if (isReadOnlyDocument) return;
    const domSelection = typeof window !== "undefined" ? window.getSelection() : null;
    const editorDom = currentEditor.view.dom;
    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      if (isSelectionToolbarInteractionActive()) return;
      setMarkdownToolbar(null);
      onSelection(null);
      return;
    }
    const anchorNode = domSelection.anchorNode;
    const focusNode = domSelection.focusNode;
    if ((!anchorNode || !editorDom.contains(anchorNode)) && (!focusNode || !editorDom.contains(focusNode))) return;

    const { from, to } = currentEditor.state.selection;
    const text = from === to ? "" : domSelection.toString().trim();
    if (!text) {
      if (isSelectionToolbarInteractionActive()) return;
      setMarkdownToolbar(null);
      onSelection(null);
      return;
    }

    const markdown = composeMarkdownWithFrontmatter(frontmatter, currentEditor.getMarkdown());
    const markdownIndex = markdown.indexOf(text);
    const rangeRect = domSelection.getRangeAt(0).getBoundingClientRect();
    const nextSelection: AgentSelection = {
      kind: "markdown",
      documentId: document.id,
      from: markdownIndex,
      to: markdownIndex >= 0 ? markdownIndex + text.length : -1,
      text,
      markdown,
      overlayLeft: clamp(rangeRect.left + rangeRect.width / 2 - 72, 12, window.innerWidth - 220),
      overlayTop: Math.max(12, rangeRect.top - 52)
    };
    setMarkdownToolbar((current) => (sameAgentSelection(current, nextSelection) ? current : nextSelection));
    onSelection(nextSelection);
  };
  const scheduleMarkdownSelectionCapture = (currentEditor: Editor) => {
    window.setTimeout(() => {
      if (currentEditor.isDestroyed) return;
      emitMarkdownSelection(currentEditor);
    }, 0);
  };
  const clearMarkdownToolbarState = (options: { preserveDomSelection?: boolean } = {}) => {
    setMarkdownToolbar(null);
    onClearToolbarTranslate();
    onSelection(null);
    if (!options.preserveDomSelection) window.getSelection()?.removeAllRanges();
  };
  const editorExtensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false
      }),
      InformioCodeBlock.configure({
        lowlight,
        defaultLanguage: "plaintext",
        enableTabIndentation: true,
        tabSize: settings.markdown.tabSize
      }),
      Highlight,
      TyporaMarkdownInput,
      ResizableImage.configure({
        assetBasePath: document.filePath || settings.shortcuts.quickFolder,
        HTMLAttributes: { class: "informio-image" },
        resize: {
          enabled: true,
          directions: ["bottom-right"],
          minWidth: 120,
          minHeight: 80,
          alwaysPreserveAspectRatio: true
        }
      } as never),
      MarkdownLink.configure({
        autolink: true,
        defaultProtocol: "https",
        enableClickSelection: true,
        isAllowedUri: (url, context) => !INVALID_AUTO_LINK_CHAR_PATTERN.test(url) && context.defaultValidate(url),
        openOnClick: false
      }),
      EncryptedInline.configure({ onRequestDecrypt: (request) => requestDecryptSecretRef.current(request) }),
      EncryptedBlock.configure({ onRequestDecrypt: (request) => requestDecryptSecretRef.current(request) }),
      RichTable.configure({
        resizable: false,
        renderWrapper: true,
        cellMinWidth: TABLE_CELL_MIN_WIDTH,
        allowTableNodeSelection: true,
        HTMLAttributes: { class: "informio-table" }
      }),
      ResizableTableRow,
      AlignableTableHeader,
      AlignableTableCell,
      TableStructureKeymap,
      TaskList,
      TaskItem.configure({ nested: true }),
      SubscriptMark,
      SuperscriptMark,
      UnderlineMark,
      WikiLink.configure({
        documentLookupIndex,
        currentDocument: document,
        onOpen: (documentId: string) => onOpenInternalLink(documentId, paneId),
        onCreate: onCreateInternalLink
      }),
      MathInline,
      MathBlock,
      ChartBlock,
      MediaBlock.configure({ assetBasePath: document.filePath || settings.shortcuts.quickFolder }),
      PdfBlock,
      DetailsBlock,
      CalloutBlock,
      FootnoteBlock,
      Markdown.configure({ indentation: { style: "space", size: settings.markdown.tabSize } }),
      Placeholder.configure({ placeholder: "开始写。需要 AI 时选中一段，或直接问右侧 Agent。" })
    ],
    [document, documentLookupIndex, onCreateInternalLink, onOpenInternalLink, paneId, settings.markdown.tabSize]
  );
  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: editorMarkdown,
      contentType: "markdown",
      editable: !isReadOnlyDocument,
      editorProps: {
        clipboardTextSerializer: (slice) => slice.content.textBetween(0, slice.content.size, "\n"),
        attributes: {
          class: "informio-editor prose prose-slate max-w-none focus:outline-none",
          spellcheck: String(settings.editor.spellcheck)
        },
        handleDOMEvents: {
          dragover: (_view, event) => {
            if (!isInternalDocumentDrag(event.dataTransfer)) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
          },
          drop: (_view, event) => {
            if (!isInternalDocumentDrag(event.dataTransfer)) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
          },
          mouseup: () => {
            if (isReadOnlyDocument) return false;
            const instance = editorInstanceRef.current;
            if (!instance || instance.isDestroyed) return false;
            scheduleMarkdownSelectionCapture(instance);
            return false;
          },
          keydown: (view, event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
            const selection = view.state.selection;
            if (!selection.empty) return false;
            const resolved = selection.$from;
            for (let depth = resolved.depth; depth > 0; depth -= 1) {
              const node = resolved.node(depth);
              if (node.type.name !== "mathInline") continue;
              const start = resolved.before(depth);
              const offset = selection.from - start - 1;
              const atStart = offset <= 0;
              const atEnd = offset >= node.textContent.length;
              if ((event.key === "ArrowLeft" && !atStart) || (event.key === "ArrowRight" && !atEnd)) return false;
              event.preventDefault();
              editorInstanceRef.current?.commands.setTextSelection(event.key === "ArrowLeft" ? start : start + node.nodeSize);
              return true;
            }
            return false;
          },
          compositionstart: () => {
            composingRef.current = true;
            onCompositionChange(document.id, true);
            return false;
          },
          compositionend: () => {
            composingRef.current = false;
            onCompositionChange(document.id, false);
            return false;
          },
          paste: (view, event) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return false;

            event.preventDefault();
            files.forEach(async (file, index) => {
              const extension = imageExtensionFromMimeType(file.type);
              const fileName = file.name || `pasted-image-${Date.now()}-${index + 1}.${extension}`;
              const result = await window.informio.saveAttachment({
                documentId: document.id,
                fileName,
                mimeType: file.type,
                data: await file.arrayBuffer()
              });
              editor
                ?.chain()
                .focus()
                .setImage({ src: result.markdownPath, alt: result.fileName, title: result.fileName })
                .createParagraphNear()
                .run();
            });

            return true;
          },
          click: (_view, event) => {
            const target = event.target as HTMLElement;
            const anchor = target.closest("a");
            if (!anchor) return false;
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              const href = anchor.getAttribute("href");
              if (href?.startsWith("informio://pdf-annotation/")) {
                return true;
              } else if (href) {
                window.informio.openExternal(href);
              }
              return true;
            }
            return false;
          },
          dblclick: (view, event) => {
            if (isReadOnlyDocument) return false;
            const target = event.target as HTMLElement;
            const image = target.closest("img.informio-image");
            if (!image) return false;

            let imagePos: number | null = null;
            try {
              const domPos = view.posAtDOM(image, 0);
              for (const candidate of [domPos, domPos - 1, domPos + 1]) {
                const node = candidate >= 0 ? view.state.doc.nodeAt(candidate) : null;
                if (node?.type.name === "image") {
                  imagePos = candidate;
                  break;
                }
              }
            } catch {
              imagePos = null;
            }
            if (imagePos === null) return false;

            const node = view.state.doc.nodeAt(imagePos);
            if (node?.type.name !== "image") return false;
            event.preventDefault();
            editorInstanceRef.current?.chain().focus().setNodeSelection(imagePos).run();
            setImageRequest({
              pos: imagePos,
              alt: String(node.attrs.alt ?? ""),
              src: String(node.attrs.src ?? ""),
              title: String(node.attrs.title ?? "")
            });
            return true;
          },
          keyup: () => {
            if (isReadOnlyDocument) return false;
            const instance = editorInstanceRef.current;
            if (!instance || instance.isDestroyed) return false;
            scheduleMarkdownSelectionCapture(instance);
            return false;
          }
        }
      },
      onUpdate: ({ editor }) => {
        if (isReadOnlyDocument) return;
        const composing = composingRef.current || editor.view.composing;
        if (!composing && !applyingMarkdownAutoBlockRef.current) {
          if (markdownAutoBlockTimerRef.current !== null) window.clearTimeout(markdownAutoBlockTimerRef.current);
          markdownAutoBlockTimerRef.current = window.setTimeout(() => {
            markdownAutoBlockTimerRef.current = null;
            if (editor.isDestroyed || composingRef.current || editor.view.composing || applyingMarkdownAutoBlockRef.current) return;
            applyingMarkdownAutoBlockRef.current = true;
            applyMarkdownAutoBlock(editor);
            applyingMarkdownAutoBlockRef.current = false;
          }, 0);
        }
        updateWikiSuggestion(editor);
        onChange(document.id, composeMarkdownWithFrontmatter(frontmatter, editor.getMarkdown()), { composing });
      },
      onSelectionUpdate: ({ editor }) => {
        updateWikiSuggestion(editor);
        if (editor.state.selection.empty) {
          if (isSelectionToolbarInteractionActive()) return;
          setMarkdownToolbar(null);
          onSelection(null);
          return;
        }
      }
    },
    [document.id, documentLinkIndexKey, isReadOnlyDocument, settings.markdown.tabSize]
  );
  useEffect(() => {
    editorInstanceRef.current = editor;
    return () => {
      if (editorInstanceRef.current === editor) editorInstanceRef.current = null;
      if (editorScrollTimerRef.current !== null) {
        window.clearTimeout(editorScrollTimerRef.current);
        editorScrollTimerRef.current = null;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || isReadOnlyDocument || isSourceMode) return;

    let frameId = 0;
    const fitTableWithinContentWidth = (table: HTMLTableElement) => {
      const wrapper = table.closest(".tableWrapper");
      if (!(wrapper instanceof HTMLElement)) return;
      const contentColumn = contentColumnRef.current;
      if (!contentColumn) return;

      const tablePos = tablePosFromDom(editor, table);
      if (tablePos === null) return;

      const columns = Array.from(table.querySelectorAll<HTMLElement>("colgroup col"));
      if (!columns.length) return;

      const contentColumnStyle = window.getComputedStyle(contentColumn);
      const contentColumnWidth =
        contentColumn.clientWidth
        - Number.parseFloat(contentColumnStyle.paddingLeft || "0")
        - Number.parseFloat(contentColumnStyle.paddingRight || "0");
      const wrapperStyle = window.getComputedStyle(wrapper);
      const availableWidth =
        Math.min(wrapper.clientWidth, contentColumnWidth)
        - Number.parseFloat(wrapperStyle.paddingLeft || "0")
        - Number.parseFloat(wrapperStyle.paddingRight || "0");
      if (!Number.isFinite(availableWidth) || availableWidth <= 0) return;

      const baseWidths = measureNaturalTableColumnWidthInfo(editor, table, tablePos, columns);
      if (baseWidths.length !== columns.length) return;

      const adjustedWidths = baseWidths.map((item) => item.width);
      let overflow = adjustedWidths.reduce((total, width) => total + width, 0) - availableWidth;
      if (overflow > 0) {
        for (let index = adjustedWidths.length - 1; index >= 0 && overflow > 0; index -= 1) {
          const minWidth = index === adjustedWidths.length - 1 ? TABLE_EDGE_COMPRESS_MIN_WIDTH : TABLE_CELL_MIN_WIDTH;
          const reducible = Math.max(0, adjustedWidths[index] - minWidth);
          if (reducible <= 0) continue;
          const reduction = Math.min(reducible, overflow);
          adjustedWidths[index] -= reduction;
          overflow -= reduction;
        }
      }

      const clamped = overflow > 0 || adjustedWidths.some((width, index) => width < baseWidths[index].width);
      table.dataset.inlineFit = clamped ? "true" : "false";
      table.style.width = clamped ? `${availableWidth}px` : "";

      columns.forEach((column, index) => {
        const nextWidth = Math.max(0, adjustedWidths[index]);
        if (clamped || baseWidths[index].fixed) {
          (column as HTMLElement).style.width = `${nextWidth}px`;
        } else {
          (column as HTMLElement).style.width = "";
        }
      });
    };

    const fitAllTables = () => {
      frameId = 0;
      const root = editor.view.dom as HTMLElement;
      root.querySelectorAll("table").forEach((table) => fitTableWithinContentWidth(table as HTMLTableElement));
    };

    const scheduleFit = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(fitAllTables);
    };

    const resizeObserver = new ResizeObserver(() => scheduleFit());
    if (shellRef.current) resizeObserver.observe(shellRef.current);
    if (contentColumnRef.current) resizeObserver.observe(contentColumnRef.current);

    editor.on("update", scheduleFit);
    scheduleFit();

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      editor.off("update", scheduleFit);
    };
  }, [editor, isReadOnlyDocument, isSourceMode, settings.editor.contentWidth]);

  const focusFindInput = () => {
    window.requestAnimationFrame(() => {
      findQueryInputRef.current?.focus();
      findQueryInputRef.current?.select();
    });
  };

  const selectRichTextFindMatch = (match: { start: number; end: number }) => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return null;
    const index = buildEditorTextSearchIndex(currentEditor.state.doc);
    const from = index.positions[match.start];
    const to = index.positions[match.end - 1];
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    currentEditor.chain().focus().setTextSelection({ from, to: to + 1 }).run();
    currentEditor.view.dispatch(currentEditor.state.tr.scrollIntoView());
    const next = { ...match, from, to: to + 1 };
    setFindMatch(next);
    setFindStatus(null);
    return next;
  };

  const findNextInRichText = (query: string, fromIndex?: number) => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return null;
    const index = buildEditorTextSearchIndex(currentEditor.state.doc);
    const currentSelectionBoundary = Math.max(0, currentEditor.state.selection.to);
    const selectionIndex = index.positions.findIndex((position) => position >= currentSelectionBoundary);
    const startIndex = fromIndex ?? Math.max(0, selectionIndex + 1);
    const match = findNextTextMatch(index.text, query, startIndex);
    if (!match) return null;
    return selectRichTextFindMatch(match);
  };

  const findNextInSource = (query: string, fromIndex?: number) => {
    const textarea = sourceTextareaRef.current;
    if (!textarea || !query) return null;
    const startIndex = fromIndex ?? textarea.selectionEnd;
    const match = findNextTextMatch(document.markdown, query, startIndex);
    if (!match) return null;
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);
    textarea.scrollTop = Math.max(0, textarea.scrollHeight * (match.start / Math.max(1, textarea.value.length)) - textarea.clientHeight / 2);
    const next = { ...match, from: match.start, to: match.end };
    setFindMatch(next);
    setFindStatus(null);
    return next;
  };

  const runFindNext = (query = findQuery, options?: { fromIndex?: number }) => {
    if (!query.trim()) {
      setFindStatus("先输入要查找的文本。");
      return null;
    }
    const match = isSourceMode ? findNextInSource(query, options?.fromIndex) : findNextInRichText(query, options?.fromIndex);
    if (!match) {
      setFindMatch(null);
      setFindStatus("当前文档里没有找到匹配结果。");
      return null;
    }
    return match;
  };

  const openFindPanel = (seed?: string) => {
    const nextQuery = seed?.trim() ? seed : findQuery;
    setFindOpen(true);
    setFindStatus(null);
    if (seed?.trim()) setFindQuery(seed.trim());
    focusFindInput();
    if (nextQuery.trim()) {
      window.setTimeout(() => {
        runFindNext(nextQuery, { fromIndex: 0 });
      }, 0);
    }
  };

  const replaceCurrentFindMatch = () => {
    if (!findQuery.trim() || !findMatch) {
      setFindStatus("先找到一个匹配结果，再执行替换。");
      return;
    }

    if (isSourceMode) {
      const textarea = sourceTextareaRef.current;
      if (!textarea) return;
      const nextMarkdown = `${document.markdown.slice(0, findMatch.start)}${replaceQuery}${document.markdown.slice(findMatch.end)}`;
      onChange(document.id, nextMarkdown);
      window.setTimeout(() => {
        const nextStart = findMatch.start;
        textarea.focus();
        textarea.setSelectionRange(nextStart, nextStart + replaceQuery.length);
      }, 0);
      setFindStatus(null);
      setFindMatch(null);
      return;
    }

    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return;
    currentEditor.chain().focus().insertContentAt({ from: findMatch.from, to: findMatch.to }, replaceQuery).run();
    setFindStatus(null);
    setFindMatch(null);
  };

  useEffect(() => {
    if (!outlineJumpRequest || outlineJumpRequest.documentId !== document.id) return;

    if (isSourceMode) {
      const textarea = sourceTextareaRef.current;
      if (!textarea) {
        onOutlineJumpHandled(outlineJumpRequest);
        return;
      }
      const offset = markdownOffsetForLine(document.markdown, outlineJumpRequest.line);
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
      textarea.scrollTop = Math.max(0, textarea.scrollHeight * (offset / Math.max(1, document.markdown.length)) - textarea.clientHeight / 2);
      onOutlineJumpHandled(outlineJumpRequest);
      return;
    }

    if (!editor || editor.isDestroyed || isReadOnlyDocument) {
      onOutlineJumpHandled(outlineJumpRequest);
      return;
    }

    const headingPositions: Array<{ pos: number; text: string }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") headingPositions.push({ pos, text: node.textContent.trim() });
      return true;
    });

    const target =
      headingPositions[outlineJumpRequest.order]
      ?? headingPositions.find((item) => item.text === outlineJumpRequest.title);
    if (!target) {
      onOutlineJumpHandled(outlineJumpRequest);
      return;
    }

    editor.chain().focus().setTextSelection(target.pos + 1).run();
    window.requestAnimationFrame(() => {
      const headingDom = editor.view.nodeDOM(target.pos);
      if (headingDom instanceof HTMLElement) {
        headingDom.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        editor.view.dispatch(editor.state.tr.scrollIntoView());
      }
    });
    onOutlineJumpHandled(outlineJumpRequest);
  }, [document.id, document.markdown, editor, isReadOnlyDocument, isSourceMode, onOutlineJumpHandled, outlineJumpRequest]);

  useEffect(
    () => () => {
      if (markdownAutoBlockTimerRef.current !== null) window.clearTimeout(markdownAutoBlockTimerRef.current);
    },
    []
  );
  const wikiSuggestions = useMemo(() => {
    if (!wikiSuggest) return [];
    return collectWikiSuggestions(documentLookupIndex, wikiSuggest.query);
  }, [documentLookupIndex, wikiSuggest]);

  const insertWikiLink = (target: string) => {
    if (!editor || !wikiSuggest) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: wikiSuggest.from, to: wikiSuggest.to })
      .insertContent({ type: "wikiLink", attrs: { target, alias: "" } })
      .run();
    setWikiSuggest(null);
  };

  const updateFrontmatterRaw = (raw: string) => {
    const body = editor?.getMarkdown() ?? editorMarkdown;
    onChange(document.id, `---\n${raw.trimEnd()}\n---\n${body.replace(/^\n+/, "")}`);
  };

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    if (composingRef.current || editor.view.composing) return;
    if (syncedDocumentIdRef.current === null) {
      syncedDocumentIdRef.current = document.id;
      return;
    }
    const current = composeMarkdownWithFrontmatter(frontmatter, editor.getMarkdown());
    if (current !== document.markdown) {
      editor.commands.setContent(editorMarkdown, { contentType: "markdown", emitUpdate: false } as never);
    }
    syncedDocumentIdRef.current = document.id;
  }, [document.id, document.markdown, editor, editorMarkdown, frontmatter]);

  useEffect(() => {
    markdownToolbarRef.current = markdownToolbar;
  }, [markdownToolbar]);

  useEffect(() => {
    if (isReadOnlyDocument || !markdownToolbar?.text) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(selectionToolbarSafeAreaSelector)) return;
      clearMarkdownToolbarState({ preserveDomSelection: true });
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isReadOnlyDocument, markdownToolbar?.text]);

  useEffect(() => {
    setMarkdownToolbar(null);
    onClearToolbarTranslate();
    onSelection(null);
    setFindMatch(null);
    setFindStatus(null);
    setShowReplace(false);
    setImageRequest(null);
  }, [document.id]);

  useEffect(() => {
    setWikiSuggest(null);
    setLinkRequest(null);
    setImageRequest(null);
    setFindMatch(null);
    setFindStatus(null);
    if (isSourceMode) {
      clearMarkdownToolbarState();
    }
  }, [isSourceMode]);

  useEffect(() => {
    if (findOpen) focusFindInput();
  }, [findOpen]);

  useEffect(() => {
    if (!wikiSuggest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setWikiSuggest(null);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setWikiIndex((index) => Math.min(index + 1, Math.max(0, wikiSuggestions.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setWikiIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === "Enter" && wikiSuggestions[wikiIndex]) {
        event.preventDefault();
        insertWikiLink(wikilinkLabel(wikiSuggestions[wikiIndex]));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [wikiIndex, wikiSuggest, wikiSuggestions]);

  useEffect(() => {
    if (!findOpen) return;
    if (!findQuery.trim()) {
      setFindMatch(null);
      setFindStatus(null);
      return;
    }
    const timer = window.setTimeout(() => {
      runFindNext(findQuery, { fromIndex: 0 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [findOpen, findQuery, document.markdown, isSourceMode]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    editor.setEditable(!isReadOnlyDocument);
  }, [editor, isReadOnlyDocument]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    editor.view.dom.setAttribute("spellcheck", String(settings.editor.spellcheck));
  }, [editor, settings.editor.spellcheck]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;

    const selectedText = () => {
      if (isSourceMode) {
        const textarea = sourceTextareaRef.current;
        if (!textarea) return "";
        return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      }
      const { from, to } = editor.state.selection;
      return from === to ? "" : editor.state.doc.textBetween(from, to, "\n");
    };
    const selectedRange = () => {
      if (isSourceMode) {
        const textarea = sourceTextareaRef.current;
        return { from: textarea?.selectionStart ?? 0, to: textarea?.selectionEnd ?? 0 };
      }
      const { from, to } = editor.state.selection;
      return { from, to };
    };
    const insertText = (text: string) => editor.chain().focus().insertContent(text).run();
    const wrapSelection = (before: string, after: string, placeholder: string) => {
      const text = selectedText() || placeholder;
      insertText(`${before}${text}${after}`);
    };
    const transformSelection = (transform: (text: string) => string) => {
      const text = selectedText();
      if (!text) return;
      insertText(transform(text));
    };
    const toggleExclusiveScript = (script: "subscript" | "superscript") => {
      const targetActive = editor.isActive(script);
      const opposite = script === "subscript" ? "superscript" : "subscript";
      const oppositeActive = editor.isActive(opposite);
      const chain = editor.chain().focus();

      if (targetActive && !oppositeActive) {
        if (script === "subscript") chain.unsetSubscript().run();
        else chain.unsetSuperscript().run();
        return;
      }

      if (script === "subscript") {
        chain.unsetSuperscript().setSubscript().run();
      } else {
        chain.unsetSubscript().setSuperscript().run();
      }
    };
    const currentBlockRange = () => {
      const { $from } = editor.state.selection;
      const depth = Math.max(1, $from.depth);
      return { from: $from.start(depth), to: $from.end(depth) };
    };
    const currentBlockText = () => {
      const range = currentBlockRange();
      return editor.state.doc.textBetween(range.from, range.to, "\n").trim();
    };
    const replaceCurrentEmptyBlock = (content: Record<string, unknown>) => {
      const range = currentBlockRange();
      editor.chain().focus().deleteRange(range).insertContent(content).run();
    };

    const runEditorCommand = (command: MenuCommand, payload?: unknown) => {
      if (isReadOnlyDocument && command !== "edit:find" && command !== "edit:find-next") return;
      switch (command) {
        case "edit:find":
          openFindPanel(selectedText() || findQuery);
          return;
        case "edit:find-next":
          if (!findOpen || !findQuery.trim()) {
            openFindPanel(selectedText() || findQuery);
            return;
          }
          runFindNext();
          return;
        case "edit:select-block": {
          const range = currentBlockRange();
          editor.chain().focus().setTextSelection(range).run();
          return;
        }
        case "edit:duplicate-line": {
          const range = currentBlockRange();
          const text = editor.state.doc.textBetween(range.from, range.to, "\n");
          editor.chain().focus().setTextSelection(range.to).insertContent(`\n${text}`).run();
          return;
        }
        case "edit:delete-line": {
          const range = currentBlockRange();
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        case "edit:hard-break":
          editor.chain().focus().setHardBreak().run();
          return;
        case "insert:paragraph":
          insertText("\n\n");
          return;
        case "autofill:date":
          insertText(new Date().toLocaleDateString());
          return;
        case "autofill:title":
          insertText(document.title.replace(/\.[^.]+$/, ""));
          return;
        case "autofill:previous-block": {
          const before = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
          const previous = before.split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
          if (previous) insertText(previous);
          return;
        }
        case "format:paragraph":
          editor.chain().focus().setParagraph().run();
          return;
        case "format:heading":
          editor.chain().focus().toggleHeading({ level: payload as 1 | 2 | 3 }).run();
          return;
        case "format:bold":
          editor.chain().focus().toggleBold().run();
          return;
        case "format:italic":
          editor.chain().focus().toggleItalic().run();
          return;
        case "format:underline":
          editor.chain().focus().toggleUnderline().run();
          return;
        case "format:strike":
          editor.chain().focus().toggleStrike().run();
          return;
        case "format:inline-code":
          editor.chain().focus().toggleCode().run();
          return;
        case "format:highlight":
          editor.chain().focus().toggleHighlight().run();
          return;
        case "format:encrypt-text":
          void beginEncryptSelection();
          return;
        case "format:subscript":
          toggleExclusiveScript("subscript");
          return;
        case "format:superscript":
          toggleExclusiveScript("superscript");
          return;
        case "format:bullet-list":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
                }
              ]
            });
            return;
          }
          editor.chain().focus().toggleBulletList().run();
          return;
        case "format:ordered-list":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "orderedList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
                }
              ]
            });
            return;
          }
          editor.chain().focus().toggleOrderedList().run();
          return;
        case "format:blockquote":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "blockquote",
              content: [{ type: "paragraph" }]
            });
            return;
          }
          editor.chain().focus().toggleBlockquote().run();
          return;
        case "format:code-block":
          editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run();
          return;
        case "convert:uppercase":
          transformSelection((text) => text.toUpperCase());
          return;
        case "convert:lowercase":
          transformSelection((text) => text.toLowerCase());
          return;
        case "convert:plain-text":
          transformSelection((text) => text.replace(/[*_`#>~=\[\]()]/g, ""));
          return;
        case "insert:link": {
          const range = selectedRange();
          setLinkRequest({
            ...range,
            text: selectedText(),
            url: String(editor.getAttributes("link").href ?? "")
          });
          return;
        }
        case "insert:asset": {
          const asset = payload as { kind?: string; path?: string; name?: string };
          if (!asset.path) return;
          const name = asset.name ?? asset.path.split(/[\\/]/).at(-1) ?? asset.kind ?? "asset";
          const src = asset.path;
          if (asset.kind === "image") {
            editor.chain().focus().setImage({ src, alt: name, title: name }).createParagraphNear().run();
          }
          if (asset.kind === "video" || asset.kind === "audio") {
            editor
              .chain()
              .focus()
              .insertContent({ type: "mediaBlock", attrs: { kind: asset.kind, src, title: name } })
              .createParagraphNear()
              .run();
          }
          if (asset.kind === "pdf") {
            editor.chain().focus().insertContent(`[${name}](${src})`).createParagraphNear().run();
          }
          return;
        }
        case "insert:table":
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          return;
        case "format:task-list":
        case "insert:task-list":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [{ type: "paragraph" }]
                }
              ]
            });
            return;
          }
          editor.chain().focus().toggleTaskList().run();
          return;
        case "insert:math":
          {
            const source = defaultBlockSource("mathBlock");
            editor
              .chain()
              .focus()
              .insertContent({ type: "mathBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:chart":
          {
            const source = defaultBlockSource("chartBlock");
            editor
              .chain()
              .focus()
              .insertContent({ type: "chartBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:horizontal-rule":
          editor.chain().focus().setHorizontalRule().run();
          return;
        case "insert:footnote":
          {
            const source = defaultBlockSource("footnoteBlock");
            editor
              .chain()
              .focus()
              .insertContent(sourceBackedBlockJson("footnoteBlock", source))
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:details":
          {
            const source = defaultBlockSource("detailsBlock");
            editor
              .chain()
              .focus()
              .insertContent(sourceBackedBlockJson("detailsBlock", source))
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:callout":
          {
            const source = defaultBlockSource("calloutBlock");
            editor
              .chain()
              .focus()
              .insertContent(sourceBackedBlockJson("calloutBlock", source))
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:legacy-math":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("mathBlock", defaultBlockSource("mathBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-chart":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("chartBlock", defaultBlockSource("chartBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-footnote":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("footnoteBlock", defaultBlockSource("footnoteBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-details":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("detailsBlock", defaultBlockSource("detailsBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-callout":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("calloutBlock", defaultBlockSource("calloutBlock"), true))
            .createParagraphNear()
            .run();
          return;
      }
    };

    const removeMenuListener = window.informio.onMenuCommand(runEditorCommand);
    const onLocalCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ command: MenuCommand; payload?: unknown }>).detail;
      if (detail?.command) runEditorCommand(detail.command, detail.payload);
    };
    window.addEventListener("informio:command", onLocalCommand);
    return () => {
      removeMenuListener();
      window.removeEventListener("informio:command", onLocalCommand);
    };
  }, [document.title, editor, isReadOnlyDocument, isSourceMode]);

  const normalizeLinkHref = (value: string) => (/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);

  const applyLink = (input: { text: string; url: string; title?: string }) => {
    if (!editor || !linkRequest) return;
    const href = normalizeLinkHref(input.url.trim());
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: linkRequest.from, to: linkRequest.to },
        {
          type: "text",
          text: input.text.trim(),
          marks: [{ type: "link", attrs: { href, title: input.title || null } }]
        }
      )
      .run();
    setLinkRequest(null);
  };
  const applyImage = (input: { alt: string; src: string; title: string }) => {
    if (!editor || !imageRequest) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(imageRequest.pos)
      .updateAttributes("image", {
        alt: input.alt,
        src: input.src,
        title: input.title || null
      })
      .run();
    setImageRequest(null);
  };
  const closeMarkdownToolbar = () => {
    clearMarkdownToolbarState();
  };
  const canUndo = Boolean(editor?.can().chain().focus().undo().run());
  const canRedo = Boolean(editor?.can().chain().focus().redo().run());
  const handleUndo = () => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    editor.chain().focus().undo().run();
  };
  const handleRedo = () => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    editor.chain().focus().redo().run();
  };
  const linkRangeAtSelection = () => {
    if (!editor?.isActive("link")) return null;
    const { $from } = editor.state.selection;
    const linkType = editor.state.schema.marks.link;
    const linkMark = $from.marks().find((mark) => mark.type === linkType);
    if (!linkMark) return null;
    let from = $from.pos;
    let to = $from.pos;

    const parentStart = $from.start();
    const parent = $from.parent;
    parent.forEach((node, offset) => {
      const start = parentStart + offset;
      const end = start + node.nodeSize;
      if (end < $from.pos || start > $from.pos) return;
      if (linkMark.isInSet(node.marks)) {
        from = start;
        to = end;
      }
    });

    for (let index = $from.index() - 1, pos = from; index >= 0; index -= 1) {
      const node = parent.child(index);
      pos -= node.nodeSize;
      if (!linkMark.isInSet(node.marks)) break;
      from = pos;
    }
    for (let index = $from.indexAfter(), pos = to; index < parent.childCount; index += 1) {
      const node = parent.child(index);
      if (!linkMark.isInSet(node.marks)) break;
      to = pos + node.nodeSize;
      pos = to;
    }
    return { from, to, attrs: linkMark.attrs };
  };
  const openLinkDialogFromSelection = () => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    const linkRange = linkRangeAtSelection();
    const { from, to } = linkRange ?? editor.state.selection;
    setLinkRequest({
      from,
      to,
      text: from === to ? "" : editor.state.doc.textBetween(from, to, "\n"),
      url: String((linkRange?.attrs.href ?? editor.getAttributes("link").href) ?? ""),
      title: String((linkRange?.attrs.title ?? editor.getAttributes("link").title) ?? "")
    });
  };
  const runSelectionToolbarAction = (actionId: SelectionToolbarAction["id"]) => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    switch (actionId) {
      case "bold":
        editor.chain().focus().toggleBold().run();
        return;
      case "italic":
        editor.chain().focus().toggleItalic().run();
        return;
      case "underline":
        editor.chain().focus().toggleUnderline().run();
        return;
      case "strike":
        editor.chain().focus().toggleStrike().run();
        return;
      case "subscript":
        editor.chain().focus().unsetSuperscript().toggleSubscript().run();
        return;
      case "superscript":
        editor.chain().focus().unsetSubscript().toggleSuperscript().run();
        return;
      case "highlight":
        editor.chain().focus().toggleHighlight().run();
        return;
      case "link":
        if (editor.isActive("link")) {
          openLinkDialogFromSelection();
          return;
        }
        openLinkDialogFromSelection();
        return;
    }
  };
  const isSelectionToolbarActionActive = (actionId: SelectionToolbarAction["id"]) => {
    if (!editor) return false;
    switch (actionId) {
      case "bold":
        return editor.isActive("bold");
      case "italic":
        return editor.isActive("italic");
      case "underline":
        return editor.isActive("underline");
      case "strike":
        return editor.isActive("strike");
      case "subscript":
        return editor.isActive("subscript");
      case "superscript":
        return editor.isActive("superscript");
      case "highlight":
        return editor.isActive("highlight");
      case "link":
        return editor.isActive("link");
      default:
        return false;
    }
  };
  const selectionToolbarFormatItems = selectionToolbarActions.map((action) => ({
    ...action,
    pressed: isSelectionToolbarActionActive(action.id),
    label: action.id === "link" && editor?.isActive("link") ? "去链接" : action.label,
    onClick: () => runSelectionToolbarAction(action.id)
  }));
  const selectedText = () => {
    if (!editor || editor.isDestroyed) return "";
    const { from, to } = editor.state.selection;
    return from === to ? "" : editor.state.doc.textBetween(from, to, "\n");
  };
  const currentBlockRange = () => {
    if (!editor || editor.isDestroyed) return { from: 0, to: 0 };
    const { $from } = editor.state.selection;
    const depth = Math.max(1, $from.depth);
    return { from: $from.start(depth), to: $from.end(depth) };
  };
  const currentBlockText = () => {
    if (!editor || editor.isDestroyed) return "";
    const range = currentBlockRange();
    return editor.state.doc.textBetween(range.from, range.to, "\n").trim();
  };
  const replaceCurrentEmptyBlock = (content: Record<string, unknown>) => {
    if (!editor || editor.isDestroyed) return;
    const range = currentBlockRange();
    editor.chain().focus().deleteRange(range).insertContent(content).run();
  };
  const runInsertToolbarCommand = (
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
      | "insert:horizontal-rule"
  ) => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    switch (command) {
      case "insert:table":
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        return;
      case "format:bullet-list":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
              }
            ]
          });
          return;
        }
        editor.chain().focus().toggleBulletList().run();
        return;
      case "format:ordered-list":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
              }
            ]
          });
          return;
        }
        editor.chain().focus().toggleOrderedList().run();
        return;
      case "format:task-list":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph" }]
              }
            ]
          });
          return;
        }
        editor.chain().focus().toggleTaskList().run();
        return;
      case "format:blockquote":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "blockquote",
            content: [{ type: "paragraph" }]
          });
          return;
        }
        editor.chain().focus().toggleBlockquote().run();
        return;
      case "format:code-block":
        editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run();
        return;
      case "insert:math": {
        const source = defaultBlockSource("mathBlock");
        editor
          .chain()
          .focus()
          .insertContent({ type: "mathBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:chart": {
        const source = defaultBlockSource("chartBlock");
        editor
          .chain()
          .focus()
          .insertContent({ type: "chartBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:callout": {
        const source = defaultBlockSource("calloutBlock");
        editor
          .chain()
          .focus()
          .insertContent(sourceBackedBlockJson("calloutBlock", source))
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:footnote": {
        const source = defaultBlockSource("footnoteBlock");
        editor
          .chain()
          .focus()
          .insertContent(sourceBackedBlockJson("footnoteBlock", source))
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:details": {
        const source = defaultBlockSource("detailsBlock");
        editor
          .chain()
          .focus()
          .insertContent(sourceBackedBlockJson("detailsBlock", source))
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:horizontal-rule":
        editor.chain().focus().setHorizontalRule().run();
        return;
    }
  };
  const handleInsertToolbarAction = (action: InsertToolbarAction) => {
    if (action.kind === "asset") {
      void window.informio.insertAsset(action.assetKind);
      return;
    }
    runInsertToolbarCommand(action.command);
  };

  const pdfContext = useMemo<UnifiedPdfEditorContextValue>(
    () => ({
      paneId,
      document,
      settings,
      toolbarTranslate,
      onTranslateSelection,
      onClearToolbarTranslate
    }),
    [document, onClearToolbarTranslate, onTranslateSelection, paneId, settings, toolbarTranslate]
  );
  const editorContentMaxWidth = isReadOnlyDocument ? undefined : clamp(settings.editor.contentWidth, EDITOR_CONTENT_MIN_WIDTH, EDITOR_CONTENT_MAX_WIDTH);
  const showPinnedInsertToolbar = !isReadOnlyDocument && !isSourceMode;
  const showPdfTranslatePanel =
    isReadOnlyDocument && (toolbarTranslate.status === "loading" || Boolean(toolbarTranslate.response || toolbarTranslate.error));
  const pdfTranslatePanelStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!showPdfTranslatePanel) return undefined;
    const width = 320;
    const viewportWidth = typeof window === "undefined" ? width + 32 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
    const left = clamp(toolbarTranslate.anchor?.left ?? 24, 16, Math.max(16, viewportWidth - width - 16));
    const top = clamp(toolbarTranslate.anchor?.top ?? 96, 16, Math.max(16, viewportHeight - 140));
    const maxHeight = Math.max(120, viewportHeight - top - 16);
    return {
      left,
      top,
      width: "min(320px, calc(100vw - 32px))",
      maxHeight
    };
  }, [showPdfTranslatePanel, toolbarTranslate.anchor?.left, toolbarTranslate.anchor?.top]);
  const handleEditorScroll = () => {
    setEditorScrolling(true);
    if (editorScrollTimerRef.current !== null) window.clearTimeout(editorScrollTimerRef.current);
    editorScrollTimerRef.current = window.setTimeout(() => {
      setEditorScrolling(false);
      editorScrollTimerRef.current = null;
    }, 900);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showPinnedInsertToolbar ? (
        <div className="informio-insert-toolbar-header flex shrink-0 justify-center">
          <div className="w-full" style={editorContentMaxWidth ? { maxWidth: editorContentMaxWidth } : undefined}>
            <div className="informio-insert-toolbar-shell px-12 pt-2 max-[780px]:px-5 max-[780px]:pt-2">
              <InsertToolbar
                onAction={handleInsertToolbarAction}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                propertiesOpen={propertiesOpen}
                onToggleProperties={() => setPropertiesOpen((current) => !current)}
              />
            </div>
          </div>
        </div>
      ) : null}
      <main
        ref={shellRef}
        className={cn(
          "informio-editor-shell relative flex min-w-0 flex-1 justify-center",
          editorScrolling && "is-scrolling",
          isPdfDocument ? "is-pdf-document overflow-y-auto overflow-x-hidden" : isReadOnlyDocument ? "is-asset-document overflow-hidden" : "overflow-y-auto"
        )}
        onScroll={handleEditorScroll}
        onMouseUp={(event) => {
          if ((event.target as HTMLElement).closest(selectionToolbarSafeAreaSelector)) return;
          if (editor && !isReadOnlyDocument && !isSourceMode) scheduleMarkdownSelectionCapture(editor);
        }}
        onKeyUp={() => {
          if (editor && !isReadOnlyDocument && !isSourceMode) scheduleMarkdownSelectionCapture(editor);
        }}
        style={
          {
            "--editor-font-size": `${settings.editor.fontSize}px`,
            "--editor-line-height": String(Math.max(settings.editor.lineHeight, 1.72))
          } as React.CSSProperties
        }
      >
        <div className="w-full" style={editorContentMaxWidth ? { maxWidth: editorContentMaxWidth } : undefined}>
        <div
          ref={contentColumnRef}
          className={cn(
            "w-full",
            isReadOnlyDocument ? "h-full" : "px-12 pb-24 max-[780px]:px-5",
            showPinnedInsertToolbar ? "informio-content-under-toolbar" : undefined,
            isSourceMode ? "pt-2 max-[780px]:pt-2" : undefined
          )}
        >
        {isReadOnlyDocument || isSourceMode || !propertiesOpen ? null : <PropertiesPanel frontmatter={frontmatter} onChange={updateFrontmatterRaw} />}
        <UnifiedPdfEditorContext.Provider value={pdfContext}>
          {isSourceMode ? (
            <textarea
              ref={sourceTextareaRef}
              value={document.markdown}
              spellCheck={false}
              onChange={(event) => onChange(document.id, event.target.value)}
              onPaste={(event) => {
                const clipboard = event.clipboardData;
                const html = clipboard.getData("text/html");
                const markdown = clipboard.getData("text/markdown");
                const text = markdown || clipboardPlainTextForPaste(clipboard.getData("text/plain"), html);
                if (!html && !markdown && text === clipboard.getData("text/plain")) return;
                if (!text) return;
                event.preventDefault();
                const nextMarkdown = insertTextIntoTextarea(event.currentTarget, stripClipboardFragmentMarkers(text));
                onChange(document.id, nextMarkdown);
              }}
              className="informio-editor informio-editor-source w-full resize-none border-0 bg-transparent p-0"
            />
          ) : isPdfDocument ? (
            <UnifiedPdfViewerSurface />
          ) : isReadOnlyDocument ? (
            <AssetViewerSurface document={document} />
          ) : (
            <EditorContent editor={editor} className={isReadOnlyDocument ? "h-full" : undefined} />
          )}
        </UnifiedPdfEditorContext.Provider>
        </div>
      </div>
      {!isReadOnlyDocument && findOpen ? (
        <div className="pointer-events-auto absolute right-5 top-4 z-40 w-[340px] rounded-xl border border-slate-200/80 bg-white/95 p-3 text-[13px] shadow-[0_20px_45px_rgba(15,23,42,0.16)] backdrop-blur" data-selection-toolbar-safe-area="true">
          <div className="grid gap-2">
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
              <button
                type="button"
                aria-label={showReplace ? "收起替换" : "展开替换"}
                onClick={() => setShowReplace((current) => !current)}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                {showReplace ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <input
                ref={findQueryInputRef}
                value={findQuery}
                onChange={(event) => setFindQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runFindNext();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setFindOpen(false);
                  }
                }}
                placeholder="查找文本"
                className="h-8 rounded-md border-0 bg-slate-50 px-3 text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
              />
              <button
                type="button"
                aria-label="查找下一个"
                onClick={() => runFindNext()}
                className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-white transition-transform active:scale-95"
              >
                <Search size={14} />
              </button>
              <button
                type="button"
                aria-label="关闭查找"
                onClick={() => setFindOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>
            {showReplace ? (
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <div className="h-8 w-8" />
                <input
                  value={replaceQuery}
                  onChange={(event) => setReplaceQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      replaceCurrentFindMatch();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setFindOpen(false);
                    }
                  }}
                  placeholder="替换文本"
                  className="h-8 rounded-md border-0 bg-slate-50 px-3 text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                />
                <button
                  type="button"
                  aria-label="替换当前"
                  onClick={replaceCurrentFindMatch}
                  className="grid h-8 w-8 place-items-center rounded-md bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Replace size={14} />
                </button>
              </div>
            ) : null}
          </div>
          {findStatus || findMatch ? (
            <div className="mt-2 min-h-[18px] pl-10 text-[13px] text-[var(--text-muted)]">{findStatus ?? "已定位当前匹配。"}</div>
          ) : null}
        </div>
      ) : null}
      {isReadOnlyDocument || isSourceMode ? null : <TableControls editor={editor} containerRef={shellRef} />}
      {isReadOnlyDocument || isSourceMode ? null : <LinkDialog request={linkRequest} onClose={() => setLinkRequest(null)} onConfirm={applyLink} />}
      {isReadOnlyDocument || isSourceMode ? null : <ImageDialog request={imageRequest} onClose={() => setImageRequest(null)} onConfirm={applyImage} />}
      {isReadOnlyDocument || isSourceMode ? null : (
        <SecretPassphraseDialog
          request={secretPromptRequest}
          onClose={closeSecretPrompt}
          onConfirm={(input) => {
            void confirmSecretPrompt(input);
          }}
        />
      )}
      {!isReadOnlyDocument && !isSourceMode && wikiSuggest ? (
        <div className="informio-wiki-suggest no-drag fixed z-50 max-h-72 w-72 overflow-hidden rounded-md bg-white py-1 text-[13px] shadow-[0_18px_45px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]" style={{ left: wikiSuggest.left, top: wikiSuggest.top }}>
          {wikiSuggestions.length ? (
            wikiSuggestions.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                className={cn("flex w-full flex-col px-3 py-2 text-left transition-colors", index === wikiIndex ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-slate-50")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertWikiLink(wikilinkLabel(doc));
                }}
              >
                <span className="truncate font-semibold">{wikilinkLabel(doc)}</span>
                <span className="truncate text-[11px] text-slate-400">{doc.filePath ?? doc.title}</span>
              </button>
            ))
          ) : (
            <button
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-slate-600 hover:bg-slate-50"
              onMouseDown={(event) => {
                event.preventDefault();
                const title = wikiSuggest.query.trim() || "未命名";
                insertWikiLink(title);
                onCreateInternalLink(title);
              }}
            >
              <span className="font-semibold">创建 {wikiSuggest.query || "新笔记"}</span>
              <span className="text-[11px] text-slate-400">没有匹配的文档</span>
            </button>
          )}
        </div>
      ) : null}
      {showPdfTranslatePanel ? (
        <div
          className="pointer-events-auto fixed z-[90] overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 p-3 text-[13px] shadow-[0_20px_45px_rgba(15,23,42,0.16)] backdrop-blur"
          style={pdfTranslatePanelStyle}
          data-selection-toolbar-safe-area="true"
          onMouseDownCapture={markSelectionToolbarInteraction}
        >
          <SelectionTranslateSection
            variant="pdf"
            enabled={toolbarEnabled}
            busy={toolbarTranslate.status === "loading"}
            response={toolbarTranslate.response}
            error={toolbarTranslate.error}
            onClose={onClearToolbarTranslate}
          />
        </div>
      ) : null}
      {!isReadOnlyDocument && !isSourceMode ? (
        <SelectionToolbar
          visible={Boolean(markdownToolbar?.text)}
          enabled={toolbarEnabled}
          busy={toolbarTranslate.status === "loading"}
          left={markdownToolbar?.overlayLeft ?? 0}
          top={markdownToolbar?.overlayTop ?? 0}
          formatActions={selectionToolbarFormatItems}
          response={toolbarTranslate.response}
          error={toolbarTranslate.error}
          onEncrypt={() => {
            void beginEncryptSelection();
          }}
          onTranslate={() => {
            if (!markdownToolbar) return;
            onTranslateSelection(markdownToolbar);
          }}
          onClose={closeMarkdownToolbar}
        />
      ) : null}
      </main>
    </div>
  );
}

function EmptyEditorPane({ defaultFolder, onCreate }: { defaultFolder: string; onCreate: () => void }) {
  return (
    <main className="informio-editor-shell flex min-w-0 flex-1 items-center justify-center overflow-hidden px-6">
      <button
        type="button"
        onClick={onCreate}
        className="max-w-full break-all rounded-md px-3 py-2 text-center text-[15px] font-semibold text-slate-400 transition-[background-color,color,transform] active:scale-95 hover:bg-slate-500/5 hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        Create in {defaultFolder}
      </button>
    </main>
  );
}

function AssetViewerSurface({ document }: { document: InformioDocument }) {
  const filePath = document.filePath ?? "";
  const title = document.title || pathBaseName(filePath) || "Asset";
  const kind = documentKind(document);
  const [assetUrl, setAssetUrl] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (!filePath || (kind !== "image" && kind !== "video" && kind !== "audio")) {
      setAssetUrl("");
      setLoadFailed(false);
      setIsLoading(false);
      return;
    }
    let disposed = false;
    let objectUrl = "";
    setIsLoading(true);
    setLoadFailed(false);
    window.informio.loadAsset(filePath)
      .then((asset) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType }));
        setAssetUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) setLoadFailed(true);
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });
    return () => {
      disposed = true;
      setAssetUrl("");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath, kind]);
  const openInSystem = () => {
    if (filePath) void window.informio.openPath(filePath);
  };

  if (!filePath) {
    return <div className="informio-asset-message is-error">文件路径缺失，无法打开。</div>;
  }

  const isLoadableAsset = kind === "image" || kind === "video" || kind === "audio";
  const body = isLoadableAsset
    ? isLoading || (!assetUrl && !loadFailed) ? (
      <div className="informio-asset-message">正在加载文件...</div>
    ) : loadFailed ? (
      <div className="informio-asset-message is-error">文件已识别为{kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}，但当前文件无法被内置预览器解码。</div>
    ) : kind === "image" ? (
      <img className="informio-asset-image" src={assetUrl} alt={title} onError={() => setLoadFailed(true)} />
    ) : kind === "video" ? (
      <video className="informio-asset-video" src={assetUrl} controls onError={() => setLoadFailed(true)} />
    ) : (
      <audio className="informio-asset-audio" src={assetUrl} controls onError={() => setLoadFailed(true)} />
    )
    : <div className="informio-asset-message">当前文件类型无法内置预览。</div>;

  return (
    <div className="informio-asset-surface">
      <div className={cn("informio-asset-stage", kind === "audio" && "is-audio")}>{body}</div>
      <div className="informio-asset-footer">
        <span>{title}</span>
        <button type="button" onClick={openInSystem}>
          在系统中打开
        </button>
      </div>
    </div>
  );
}

class EditorSurfaceErrorBoundary extends Component<
  { children: ReactNode; documentId: string; onResetSelection: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Editor surface crashed", error, info.componentStack);
  }

  componentDidUpdate(previousProps: { documentId: string }) {
    if (previousProps.documentId !== this.props.documentId && this.state.error) {
      this.setState({ error: null });
      this.props.onResetSelection();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="informio-editor-shell flex min-w-0 flex-1 items-center justify-center overflow-hidden px-6">
        <div className="max-w-md text-center">
          <div className="text-[13px] font-semibold text-slate-500">这个文件暂时渲染失败</div>
          <button
            type="button"
            className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-slate-700"
            onClick={() => {
              this.setState({ error: null });
              this.props.onResetSelection();
            }}
          >
            重新打开
          </button>
        </div>
      </main>
    );
  }
}

const fuzzyScore = (item: CommandPaletteItem, query: string) => {
  const haystack = `${item.title} ${item.subtitle ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  let index = 0;
  let score = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, index);
    if (found < 0) return 0;
    score += found === index ? 3 : 1;
    index = found + 1;
  }
  return score + (haystack.includes(needle) ? 10 : 0);
};

function CommandPalette({ open, commands, onClose }: { open: boolean; commands: CommandPaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const matches = useMemo(
    () =>
      commands
        .map((command) => ({ command, score: fuzzyScore(command, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
        .slice(0, 80)
        .map((item) => item.command),
    [commands, query]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeItem = listRef.current?.querySelector<HTMLButtonElement>(".command-palette-item.is-active") ?? itemRefs.current[index];
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [index, matches, open]);

  useEffect(() => {
    if (!open) return;
    setIndex((value) => Math.min(value, Math.max(0, matches.length - 1)));
  }, [matches.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((value) => Math.min(value + 1, Math.max(0, matches.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "Enter" && matches[index]) {
        event.preventDefault();
        matches[index].run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, matches, onClose, open]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop no-drag" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-palette-input">
          <Search size={16} />
          <input ref={inputRef} value={query} placeholder="搜索系统命令或文档" onChange={(event) => { setQuery(event.target.value); setIndex(0); }} />
          <kbd>Esc</kbd>
        </div>
        <div ref={listRef} className="command-palette-list">
          {matches.map((command, itemIndex) => (
            <button
              key={command.id}
              ref={(element) => {
                itemRefs.current[itemIndex] = element;
              }}
              type="button"
              className={cn("command-palette-item", itemIndex === index && "is-active")}
              onMouseEnter={() => setIndex(itemIndex)}
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span>
                <strong>{command.title}</strong>
                {command.subtitle ? <small>{command.subtitle}</small> : null}
              </span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          ))}
          {!matches.length ? <div className="command-palette-empty">没有匹配的命令</div> : null}
        </div>
      </div>
    </div>
  );
}

type TableOverlayState = {
  table: HTMLTableElement;
  tablePos: number;
  rect: { top: number; left: number; width: number; height: number };
  rows: Array<{ top: number; height: number }>;
  columns: Array<{ left: number; width: number }>;
};

type TableSelectionShape = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  rowSelection: boolean;
  columnSelection: boolean;
  fullTable: boolean;
};

type TableColumnWidthInfo = {
  width: number;
  fixed: boolean;
};

type TableHoverTarget =
  | {
      axis: "row" | "column";
      index: number;
    }
  | null;

const tablePosFromDom = (editor: Editor, table: HTMLTableElement) => {
  const firstCell = table.querySelector("th, td");
  if (firstCell instanceof HTMLTableCellElement) {
    let cellPos: number | null = null;
    try {
      const contentPos = editor.view.posAtDOM(firstCell, 0);
      const nextCellPos = Math.max(0, contentPos - 1);
      const node = editor.state.doc.nodeAt(nextCellPos);
      if (node?.type.name === "tableCell" || node?.type.name === "tableHeader") cellPos = nextCellPos;
    } catch {
      cellPos = null;
    }
    if (cellPos !== null) {
      const $cell = editor.state.doc.resolve(cellPos);
      for (let depth = $cell.depth; depth > 0; depth -= 1) {
        if ($cell.node(depth).type.name === "table") return $cell.before(depth);
      }
    }
  }
  return null;
};

const selectCellForTableCommand = (editor: Editor, table: HTMLTableElement, rowIndex: number, columnIndex: number) => {
  const row = table.rows.item(rowIndex);
  const cell = row?.cells.item(columnIndex);
  if (!cell) return false;
  const pos = editor.view.posAtDOM(cell, 0);
  editor.chain().focus().setTextSelection(pos).run();
  return true;
};

const selectionTableFromEditor = (editor: Editor) => {
  const domAtSelection = editor.view.domAtPos(editor.state.selection.from);
  const target =
    domAtSelection.node instanceof Element ? domAtSelection.node : domAtSelection.node.parentElement;
  return target?.closest("table") as HTMLTableElement | null;
};

const tableCellPosAt = (table: ProseMirrorNode, tablePos: number, rowIndex: number, columnIndex: number) => {
  const map = TableMap.get(table);
  if (rowIndex < 0 || rowIndex >= map.height || columnIndex < 0 || columnIndex >= map.width) return null;
  const offset = map.map[rowIndex * map.width + columnIndex];
  return tablePos + 1 + offset;
};

const tableRowPosAt = (table: ProseMirrorNode, tablePos: number, rowIndex: number) => {
  if (rowIndex < 0 || rowIndex >= table.childCount) return null;
  let pos = tablePos + 1;
  for (let index = 0; index < rowIndex; index += 1) {
    pos += table.child(index).nodeSize;
  }
  return pos;
};

const tableSelectionShapeFromSelection = (selection: Editor["state"]["selection"], table: ProseMirrorNode, tablePos: number): TableSelectionShape | null => {
  if (selection instanceof CellSelection) {
    const map = TableMap.get(table);
    const tableStart = tablePos + 1;
    const rect = map.rectBetween(selection.$anchorCell.pos - tableStart, selection.$headCell.pos - tableStart);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      rowSelection: selection.isRowSelection(),
      columnSelection: selection.isColSelection(),
      fullTable: rect.top === 0 && rect.left === 0 && rect.bottom === map.height && rect.right === map.width
    };
  }

  if (selection instanceof NodeSelection && selection.node.type.name === "table" && selection.from === tablePos) {
    const map = TableMap.get(table);
    return {
      top: 0,
      bottom: map.height,
      left: 0,
      right: map.width,
      rowSelection: false,
      columnSelection: false,
      fullTable: true
    };
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") continue;
    const cellPos = $from.before(depth);
    const map = TableMap.get(table);
    const tableStart = tablePos + 1;
    const rect = map.findCell(cellPos - tableStart);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      rowSelection: false,
      columnSelection: false,
      fullTable: false
    };
  }

  return null;
};

const activeTableCellNodeFromSelection = (selection: Editor["state"]["selection"]) => {
  if (selection instanceof CellSelection) {
    return selection.$anchorCell.nodeAfter;
  }
  if (selection instanceof NodeSelection && (selection.node.type.name === "tableCell" || selection.node.type.name === "tableHeader")) {
    return selection.node;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") return node;
  }
  return null;
};

const tableColumnLabel = (index: number) => {
  let value = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

const tableColumnWidthInfo = (editor: Editor, table: HTMLTableElement, tablePos: number): TableColumnWidthInfo[] => {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (tableNode?.type.name !== "table") return [];

  const map = TableMap.get(tableNode);
  const fallbackWidths = Array.from(table.querySelectorAll("colgroup col")).map((column) => {
    const width = Number.parseFloat(window.getComputedStyle(column).width);
    return Number.isFinite(width) && width > 0 ? width : TABLE_CELL_MIN_WIDTH;
  });

  const widths = Array.from({ length: map.width }, (_, index) => ({
    width: fallbackWidths[index] ?? TABLE_CELL_MIN_WIDTH,
    fixed: false
  }));

  const tableStart = tablePos + 1;
  for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
      if (widths[columnIndex].fixed) continue;
      const cellPos = tableCellPosAt(tableNode, tablePos, rowIndex, columnIndex);
      if (cellPos === null) continue;

      const cellNode = editor.state.doc.nodeAt(cellPos);
      if (!cellNode) continue;

      const rect = map.findCell(cellPos - tableStart);
      const colwidth = Array.isArray(cellNode.attrs.colwidth) ? cellNode.attrs.colwidth : [];
      const width = Number(colwidth[columnIndex - rect.left] ?? 0);
      if (!Number.isFinite(width) || width <= 0) continue;

      widths[columnIndex] = { width, fixed: true };
    }
  }

  return widths;
};

const measureNaturalTableColumnWidthInfo = (
  editor: Editor,
  table: HTMLTableElement,
  tablePos: number,
  columns: HTMLElement[]
): TableColumnWidthInfo[] => {
  const previousInlineFit = table.dataset.inlineFit;
  const previousTableWidth = table.style.width;
  const previousColumnWidths = columns.map((column) => column.style.width);

  try {
    delete table.dataset.inlineFit;
    table.style.width = "";
    columns.forEach((column) => {
      column.style.width = "";
    });
    return tableColumnWidthInfo(editor, table, tablePos);
  } finally {
    if (previousInlineFit === undefined) delete table.dataset.inlineFit;
    else table.dataset.inlineFit = previousInlineFit;
    table.style.width = previousTableWidth;
    columns.forEach((column, index) => {
      column.style.width = previousColumnWidths[index] ?? "";
    });
  }
};

const nearestTableHoverTarget = (overlay: TableOverlayState, clientX: number, clientY: number): TableHoverTarget => {
  const tableRect = overlay.table.getBoundingClientRect();
  const relativeX = clientX - tableRect.left;
  const relativeY = clientY - tableRect.top;
  const columnLines = [0, ...overlay.columns.map((column) => column.left + column.width)];
  const rowLines = [0, ...overlay.rows.map((row) => row.top + row.height)];
  const nearestColumn = columnLines.reduce(
    (best, line, index) => {
      const distance = Math.abs(relativeX - line);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY }
  );
  const nearestRow = rowLines.reduce(
    (best, line, index) => {
      const distance = Math.abs(relativeY - line);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY }
  );
  const insideColumnBand = relativeY >= -TABLE_EDGE_HIT_DISTANCE && relativeY <= overlay.rect.height + TABLE_EDGE_HIT_DISTANCE;
  const insideRowBand = relativeX >= -TABLE_EDGE_HIT_DISTANCE && relativeX <= overlay.rect.width + TABLE_EDGE_HIT_DISTANCE;
  const columnTarget =
    insideColumnBand && nearestColumn.distance <= TABLE_EDGE_HIT_DISTANCE
      ? ({ axis: "column", index: nearestColumn.index } as const)
      : null;
  const rowTarget =
    insideRowBand && nearestRow.distance <= TABLE_EDGE_HIT_DISTANCE
      ? ({ axis: "row", index: nearestRow.index } as const)
      : null;
  if (columnTarget && rowTarget) return nearestColumn.distance <= nearestRow.distance ? columnTarget : rowTarget;
  return columnTarget ?? rowTarget;
};

function TableControls({ editor, containerRef }: { editor: Editor | null; containerRef: React.RefObject<HTMLElement | null> }) {
  const [overlay, setOverlay] = useState<TableOverlayState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<TableHoverTarget>(null);
  const selectionTableRef = useRef<HTMLTableElement | null>(null);

  const measureTable = (table: HTMLTableElement): TableOverlayState | null => {
    const container = containerRef.current;
    if (!container) return null;
    const tablePos = tablePosFromDom(editor!, table);
    if (tablePos === null) return null;
    const containerRect = container.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const firstRow = table.rows.item(0);
    if (!firstRow) return null;
    const tableNode = editor?.state.doc.nodeAt(tablePos);
    if (tableNode?.type.name !== "table") return null;
    const map = TableMap.get(tableNode);
    const colGroupColumns = Array.from(table.querySelectorAll("colgroup col"))
      .map((column) => Number.parseFloat(window.getComputedStyle(column).width))
      .filter((width) => Number.isFinite(width) && width > 0);
    const columns =
      colGroupColumns.length === map.width
        ? (() => {
            let accumulatedLeft = 0;
            return colGroupColumns.map((width) => {
              const column = { left: accumulatedLeft, width };
              accumulatedLeft += width;
              return column;
            });
          })()
        : Array.from(firstRow.cells).flatMap((cell) => {
            const rect = cell.getBoundingClientRect();
            const colspan = Math.max(1, cell.colSpan || 1);
            const logicalWidth = rect.width / colspan;
            return Array.from({ length: colspan }, (_, columnIndex) => ({
              left: rect.left - tableRect.left + logicalWidth * columnIndex,
              width: logicalWidth
            }));
          }).slice(0, map.width);
    return {
      table,
      tablePos,
      rect: {
        top: tableRect.top - containerRect.top + container.scrollTop,
        left: tableRect.left - containerRect.left + container.scrollLeft,
        width: tableRect.width,
        height: tableRect.height
      },
      rows: Array.from(table.rows).map((row) => {
        const rect = row.getBoundingClientRect();
        return { top: rect.top - tableRect.top, height: rect.height };
      }),
      columns
    };
  };

  const refreshOverlay = (table = overlay?.table) => {
    if (!table || !document.body.contains(table)) {
      setOverlay(null);
      return;
    }
    setOverlay(measureTable(table));
  };

  useEffect(() => {
    if (!editor) return;
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-table-controls]")) return;
      const table =
        (target?.closest("table") as HTMLTableElement | null) ??
        (target?.closest(".tableWrapper")?.querySelector("table") as HTMLTableElement | null);
      if (!table) {
        setHoverTarget(null);
        if (selectionTableRef.current) refreshOverlay(selectionTableRef.current);
        else setOverlay(null);
        return;
      }
      const measured = measureTable(table);
      setOverlay(measured);
      setHoverTarget(measured ? nearestTableHoverTarget(measured, event.clientX, event.clientY) : null);
    };
    const onPointerLeave = () => {
      setHoverTarget(null);
      if (selectionTableRef.current) refreshOverlay(selectionTableRef.current);
      else setOverlay(null);
    };
    const updateFromSelection = () => {
      const table = selectionTableFromEditor(editor);
      selectionTableRef.current = table;
      if (table) refreshOverlay(table);
      else if (!hoverTarget) setOverlay(null);
    };
    const onScroll = () => refreshOverlay();
    const onResize = () => refreshOverlay();

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    editor.on("selectionUpdate", updateFromSelection);
    editor.on("update", updateFromSelection);
    updateFromSelection();
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      editor.off("selectionUpdate", updateFromSelection);
      editor.off("update", updateFromSelection);
    };
  }, [containerRef, editor, hoverTarget, overlay?.table]);

  if (!editor || !overlay) return null;

  const selectionInOverlayTable = selectionTableRef.current === overlay.table;
  const tableNode = editor.state.doc.nodeAt(overlay.tablePos);
  if (tableNode?.type.name !== "table") return null;

  const hasCellSelection = selectionInOverlayTable && editor.state.selection instanceof CellSelection;
  const selectionShape = selectionInOverlayTable ? tableSelectionShapeFromSelection(editor.state.selection, tableNode, overlay.tablePos) : null;
  const activeCellNode = selectionInOverlayTable ? activeTableCellNodeFromSelection(editor.state.selection) : null;
  const currentHorizontalAlign = (activeCellNode?.attrs.align as HorizontalCellAlign | undefined) ?? "center";
  const currentVerticalAlign = (activeCellNode?.attrs.verticalAlign as VerticalCellAlign | undefined) ?? "middle";
  const canMergeCells = hasCellSelection && editor.can().chain().focus().mergeCells().run();
  const canSplitCell = selectionInOverlayTable && editor.can().chain().focus().splitCell().run();
  const canDeleteRow = selectionInOverlayTable && editor.can().chain().focus().deleteRow().run();
  const canDeleteColumn = selectionInOverlayTable && editor.can().chain().focus().deleteColumn().run();
  const canDeleteTable = selectionInOverlayTable && editor.can().chain().focus().deleteTable().run();

  const applyCellAttribute = (name: "align" | "verticalAlign", value: HorizontalCellAlign | VerticalCellAlign) => {
    if (!selectionInOverlayTable) return;
    editor.chain().focus().setCellAttribute(name, value).run();
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const setSelectionAndFocus = (selection: CellSelection) => {
    editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
    editor.view.focus();
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const selectTableRowAt = (rowIndex: number) => {
    const map = TableMap.get(tableNode);
    const anchor = tableCellPosAt(tableNode, overlay.tablePos, rowIndex, 0);
    const head = tableCellPosAt(tableNode, overlay.tablePos, rowIndex, map.width - 1);
    if (anchor === null || head === null) return;
    setSelectionAndFocus(CellSelection.rowSelection(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head)));
  };

  const selectTableColumnAt = (columnIndex: number) => {
    const map = TableMap.get(tableNode);
    const anchor = tableCellPosAt(tableNode, overlay.tablePos, 0, columnIndex);
    const head = tableCellPosAt(tableNode, overlay.tablePos, map.height - 1, columnIndex);
    if (anchor === null || head === null) return;
    setSelectionAndFocus(CellSelection.colSelection(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head)));
  };

  const selectWholeTable = () => {
    const map = TableMap.get(tableNode);
    const anchor = tableCellPosAt(tableNode, overlay.tablePos, 0, 0);
    const head = tableCellPosAt(tableNode, overlay.tablePos, map.height - 1, map.width - 1);
    if (anchor === null || head === null) return;
    setSelectionAndFocus(CellSelection.create(editor.state.doc, anchor, head));
  };

  const updateRowHeight = (rowIndex: number, nextHeight: number) => {
    const rowPos = tableRowPosAt(tableNode, overlay.tablePos, rowIndex);
    if (rowPos === null) return;
    const rowNode = tableNode.child(rowIndex);
    const rowHeight = Math.max(TABLE_ROW_MIN_HEIGHT, Math.round(nextHeight));
    const tr = editor.state.tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, rowHeight });
    editor.view.dispatch(tr);
  };

  const updateColumnWidth = (columnIndex: number, nextWidth: number) => {
    const map = TableMap.get(tableNode);
    const tableStart = overlay.tablePos + 1;
    const columnWidth = Math.max(TABLE_CELL_MIN_WIDTH, Math.round(nextWidth));
    const seenOffsets = new Set<number>();
    let tr = editor.state.tr;

    for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
      const offset = map.map[rowIndex * map.width + columnIndex];
      if (seenOffsets.has(offset)) continue;
      seenOffsets.add(offset);

      const cellPos = tableStart + offset;
      const cellNode = tr.doc.nodeAt(cellPos);
      if (!cellNode) continue;

      const rect = map.findCell(offset);
      const colspan = Math.max(1, Number(cellNode.attrs.colspan ?? 1));
      const currentColwidth = Array.isArray(cellNode.attrs.colwidth) ? [...cellNode.attrs.colwidth] : [];
      const nextColwidth = Array.from({ length: colspan }, (_, widthIndex) => {
        const currentWidth = Number(currentColwidth[widthIndex] ?? 0);
        return widthIndex === columnIndex - rect.left
          ? columnWidth
          : Number.isFinite(currentWidth) && currentWidth > 0
            ? currentWidth
            : 0;
      });

      tr = tr.setNodeMarkup(cellPos, undefined, { ...cellNode.attrs, colwidth: nextColwidth });
    }

    editor.view.dispatch(tr);
  };

  const startRowResize = (rowIndex: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const baseHeight = overlay.rows[rowIndex]?.height ?? TABLE_ROW_MIN_HEIGHT;
    const startY = event.clientY;
    const onPointerMove = (moveEvent: PointerEvent) => {
      updateRowHeight(rowIndex, baseHeight + (moveEvent.clientY - startY));
      refreshOverlay();
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      refreshOverlay();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const startColumnResize = (columnIndex: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const baseWidth = overlay.columns[columnIndex]?.width ?? TABLE_CELL_MIN_WIDTH;
    const startX = event.clientX;
    const onPointerMove = (moveEvent: PointerEvent) => {
      updateColumnWidth(columnIndex, baseWidth + (moveEvent.clientX - startX));
      refreshOverlay();
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      refreshOverlay();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const runTableTool = (
    action:
      | "merge-cells"
      | "split-cell"
      | "delete-row"
      | "delete-column"
      | "delete-table"
  ) => {
    if (!selectionInOverlayTable) return;
    if (action === "merge-cells") {
      if (!canMergeCells) return;
      editor.chain().focus().mergeCells().run();
    } else if (action === "split-cell") {
      if (!canSplitCell) return;
      editor.chain().focus().splitCell().run();
    } else if (action === "delete-row") {
      if (!canDeleteRow) return;
      editor.chain().focus().deleteRow().run();
    } else if (action === "delete-column") {
      if (!canDeleteColumn) return;
      editor.chain().focus().deleteColumn().run();
    } else if (action === "delete-table") {
      if (!canDeleteTable) return;
      editor.chain().focus().deleteTable().run();
      setHoverTarget(null);
      setOverlay(null);
      selectionTableRef.current = null;
      return;
    }
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const contextAddButtonPosition = hoverTarget
    ? hoverTarget.axis === "column"
      ? {
          top: overlay.rect.top - TABLE_CONTEXT_OFFSET,
          left:
            overlay.rect.left +
            (hoverTarget.index <= 0
              ? 0
              : hoverTarget.index >= overlay.columns.length
                ? overlay.rect.width
                : overlay.columns[hoverTarget.index].left) -
            TABLE_CONTROL_SIZE / 2
        }
      : {
          top:
            overlay.rect.top +
            (hoverTarget.index <= 0
              ? 0
              : hoverTarget.index >= overlay.rows.length
                ? overlay.rect.height
                : overlay.rows[hoverTarget.index].top) -
            TABLE_CONTROL_SIZE / 2,
          left: overlay.rect.left - TABLE_CONTEXT_OFFSET
        }
    : null;

  const runContextAdd = () => {
    if (!hoverTarget) return;
    if (hoverTarget.axis === "column") {
      if (hoverTarget.index <= 0) {
        if (!selectCellForTableCommand(editor, overlay.table, 0, 0)) return;
        editor.chain().focus().addColumnBefore().run();
      } else if (hoverTarget.index >= overlay.columns.length) {
        if (!selectCellForTableCommand(editor, overlay.table, 0, Math.max(0, overlay.columns.length - 1))) return;
        editor.chain().focus().addColumnAfter().run();
      }
      else {
        if (!selectCellForTableCommand(editor, overlay.table, 0, hoverTarget.index)) return;
        editor.chain().focus().addColumnBefore().run();
      }
      window.setTimeout(() => refreshOverlay(), 0);
      return;
    }

    if (hoverTarget.index <= 0) {
      if (!selectCellForTableCommand(editor, overlay.table, 0, 0)) return;
      editor.chain().focus().addRowBefore().run();
    } else if (hoverTarget.index >= overlay.rows.length) {
      if (!selectCellForTableCommand(editor, overlay.table, Math.max(0, overlay.rows.length - 1), 0)) return;
      editor.chain().focus().addRowAfter().run();
    }
    else {
      if (!selectCellForTableCommand(editor, overlay.table, hoverTarget.index, 0)) return;
      editor.chain().focus().addRowBefore().run();
    }
    window.setTimeout(() => refreshOverlay(), 0);
  };

  return (
    <div className="informio-table-controls" data-table-controls="true" contentEditable={false}>
      {contextAddButtonPosition ? (
        <button
          type="button"
          className="informio-table-context-add"
          style={contextAddButtonPosition}
          aria-label={hoverTarget?.axis === "column" ? "添加列" : "添加行"}
          title={hoverTarget?.axis === "column" ? "添加列" : "添加行"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={runContextAdd}
        >
          <Plus size={12} />
        </button>
      ) : null}

      <div
        className="informio-table-toolbar"
        style={{
          top: overlay.rect.top - TABLE_HEADER_STRIP_SIZE - TABLE_TOOLBAR_HEIGHT - 6,
          left: overlay.rect.left + TABLE_HEADER_STRIP_SIZE
        }}
      >
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentHorizontalAlign === "left" && "is-active")}
          aria-label="水平左对齐"
          title="水平左对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("align", "left")}
        >
          <AlignHorizontalJustifyStart size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentHorizontalAlign === "center" && "is-active")}
          aria-label="水平居中"
          title="水平居中"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("align", "center")}
        >
          <AlignHorizontalJustifyCenter size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentHorizontalAlign === "right" && "is-active")}
          aria-label="水平右对齐"
          title="水平右对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("align", "right")}
        >
          <AlignHorizontalJustifyEnd size={13} />
        </button>
        <div className="informio-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentVerticalAlign === "top" && "is-active")}
          aria-label="垂直顶对齐"
          title="垂直顶对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("verticalAlign", "top")}
        >
          <AlignVerticalJustifyStart size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentVerticalAlign === "middle" && "is-active")}
          aria-label="垂直居中"
          title="垂直居中"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("verticalAlign", "middle")}
        >
          <AlignVerticalJustifyCenter size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentVerticalAlign === "bottom" && "is-active")}
          aria-label="垂直底对齐"
          title="垂直底对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("verticalAlign", "bottom")}
        >
          <AlignVerticalJustifyEnd size={13} />
        </button>
        <div className="informio-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="informio-table-toolbutton"
          aria-label="合并单元格"
          title="合并单元格"
          disabled={!canMergeCells}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("merge-cells")}
        >
          <Merge size={13} />
        </button>
        <button
          type="button"
          className="informio-table-toolbutton"
          aria-label="拆分单元格"
          title="拆分单元格"
          disabled={!canSplitCell}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("split-cell")}
        >
          <Split size={13} />
        </button>
        <div className="informio-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="informio-table-toolbutton is-danger"
          aria-label="删除行"
          title="删除行"
          disabled={!canDeleteRow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("delete-row")}
        >
          <Rows3 size={13} />
        </button>
        <button
          type="button"
          className="informio-table-toolbutton is-danger"
          aria-label="删除列"
          title="删除列"
          disabled={!canDeleteColumn}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("delete-column")}
        >
          <Columns3 size={13} />
        </button>
        <button
          type="button"
          className="informio-table-toolbutton is-danger"
          aria-label="删除表格"
          title="删除表格"
          disabled={!canDeleteTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("delete-table")}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <button
        type="button"
        className={cn("informio-table-corner-button", selectionShape?.fullTable && "is-active")}
        style={{
          top: overlay.rect.top - TABLE_HEADER_STRIP_SIZE,
          left: overlay.rect.left - TABLE_HEADER_STRIP_SIZE,
          width: TABLE_HEADER_STRIP_SIZE,
          height: TABLE_HEADER_STRIP_SIZE
        }}
        aria-label="选中整个表格"
        title="选中整个表格"
        onMouseDown={(event) => event.preventDefault()}
        onClick={selectWholeTable}
      >
        <AlignCenter size={12} />
      </button>

      {overlay.columns.map((column, columnIndex) => (
        <div
          key={`column-header-${columnIndex}`}
          className="informio-table-column-header"
          style={{
            top: overlay.rect.top - TABLE_HEADER_STRIP_SIZE,
            left: overlay.rect.left + column.left,
            width: column.width,
            height: TABLE_HEADER_STRIP_SIZE
          }}
        >
          <button
            type="button"
            className={cn(
              "informio-table-header-button is-column",
              selectionShape && columnIndex >= selectionShape.left && columnIndex < selectionShape.right && "is-active"
            )}
            style={{ width: column.width, height: TABLE_HEADER_STRIP_SIZE }}
            aria-label={`选中第 ${columnIndex + 1} 列`}
            title={`选中第 ${columnIndex + 1} 列`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectTableColumnAt(columnIndex)}
          >
            <span>{tableColumnLabel(columnIndex)}</span>
          </button>
          <button
            type="button"
            className="informio-table-column-resize-handle"
            aria-label={`调整第 ${columnIndex + 1} 列宽度`}
            title={`调整第 ${columnIndex + 1} 列宽度`}
            onMouseDown={(event) => startColumnResize(columnIndex, event)}
          />
        </div>
      ))}

      {overlay.rows.map((row, rowIndex) => (
        <div
          key={`row-header-${rowIndex}`}
          className="informio-table-row-header"
          style={{
            top: overlay.rect.top + row.top,
            left: overlay.rect.left - TABLE_HEADER_STRIP_SIZE,
            width: TABLE_HEADER_STRIP_SIZE,
            height: row.height
          }}
        >
          <button
            type="button"
            className={cn(
              "informio-table-header-button is-row",
              selectionShape && rowIndex >= selectionShape.top && rowIndex < selectionShape.bottom && "is-active"
            )}
            style={{ width: TABLE_HEADER_STRIP_SIZE, height: row.height }}
            aria-label={`选中第 ${rowIndex + 1} 行`}
            title={`选中第 ${rowIndex + 1} 行`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectTableRowAt(rowIndex)}
          >
            <span>{rowIndex + 1}</span>
          </button>
          <button
            type="button"
            className="informio-table-row-resize-handle"
            aria-label={`调整第 ${rowIndex + 1} 行高度`}
            title={`调整第 ${rowIndex + 1} 行高度`}
            onMouseDown={(event) => startRowResize(rowIndex, event)}
          />
        </div>
      ))}
    </div>
  );
}

function AgentApprovalCard({
  action,
  fontSize,
  lineHeight,
  onApprovalResponse,
  onOpenActionPath
}: {
  action: AgentSessionAction;
  fontSize: number;
  lineHeight: number;
  onApprovalResponse: (approvalId: string, decision: AgentApprovalDecision) => void;
  onOpenActionPath: (path: string) => void;
}) {
  if (!action.approval) return null;
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
      style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="font-semibold">{action.approval.title || action.label}</div>
        {action.path ? (
          <button
            type="button"
            onClick={() => onOpenActionPath(action.path!)}
            className="rounded px-1.5 py-0.5 font-semibold text-amber-700 hover:bg-amber-100"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            打开
          </button>
        ) : null}
      </div>
      {action.approval.message ? <div className="mb-1 whitespace-pre-wrap">{action.approval.message}</div> : null}
      {action.approval.command ? (
        <pre
          className="mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-white/70 px-2 py-1 text-amber-900"
          style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
        >
          {action.approval.command}
        </pre>
      ) : null}
      {action.approval.cwd ? <div className="mb-2 text-amber-700">cwd: {action.approval.cwd}</div> : null}
      {action.status === "pending" ? (
        <div className="flex flex-wrap gap-1.5">
          {action.approval.availableDecisions.includes("accept") ? (
            <button
              type="button"
              onClick={() => onApprovalResponse(action.approval!.id, "accept")}
              className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700"
              style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
            >
              批准本次
            </button>
          ) : null}
          {action.approval.availableDecisions.includes("acceptForSession") ? (
            <button
              type="button"
              onClick={() => onApprovalResponse(action.approval!.id, "acceptForSession")}
              className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-100"
              style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
            >
              本会话批准
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onApprovalResponse(action.approval!.id, "decline")}
            className="rounded bg-white px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            拒绝
          </button>
        </div>
      ) : null}
    </div>
  );
}

type ProviderExecutionFlowProps = {
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

const renderActionStatusDot = (status: AgentSessionAction["status"]) =>
  cn("h-2 w-2 rounded-full", status === "pending" ? "bg-amber-400" : status === "error" ? "bg-red-500" : "bg-emerald-500");

const actionCategoryIcon = (category: AgentProcessCategory) => {
  if (category === "search") return Search;
  if (category === "read") return FileText;
  if (category === "edit") return Pencil;
  if (category === "command") return Code2;
  if (category === "approval") return Shield;
  return Bot;
};

const summarizeByCategory = (actions: AgentSessionAction[]) => {
  const counts = new Map<AgentProcessCategory, number>();
  actions.forEach((action) => {
    const category = classifyAgentAction(action);
    if (category === "system") return;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  return Array.from(counts.entries());
};

const providerPhaseTone = (status: AgentSessionStatus) =>
  status === "error"
    ? "text-red-700 bg-red-50 border-red-200"
    : status === "done"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-slate-700 bg-slate-100 border-slate-200";

const latestVisibleAction = (actions: AgentSessionAction[]) => {
  const visible = actions.filter((action) => classifyAgentAction(action) !== "system");
  return visible.at(-1);
};

const hasVisibleActionError = (actions: AgentSessionAction[]) =>
  actions.some((action) => classifyAgentAction(action) !== "system" && action.status === "error");

const actionShortLabel = (action?: AgentSessionAction) => {
  if (!action) return "";
  return (action.label || action.tool || "").replace(/\s+/g, " ").trim();
};

const isVerificationAction = (action: AgentSessionAction) => {
  const haystack = `${action.tool} ${action.label} ${action.input ?? ""}`.toLowerCase();
  return /test|typecheck|build|lint|verify|check|pytest|cargo test|pnpm build|tsc/.test(haystack);
};

const firstProcessLine = (processText: string) => processText.trim().split("\n").find(Boolean) ?? "";

const providerExecutionRenderer = (providerId: string) => {
  if (providerId === "opencode") return OpenCodeExecutionFlow;
  if (providerId === "claude-code") return ClaudeCodeExecutionFlow;
  if (providerId === "codex") return CodexExecutionFlow;
  return GenericExecutionFlow;
};

function AgentActionDetails({
  action,
  fontSize,
  lineHeight,
  onApprovalResponse,
  onOpenActionPath,
  mode = "generic"
}: {
  action: AgentSessionAction;
  fontSize: number;
  lineHeight: number;
  onApprovalResponse: (approvalId: string, decision: AgentApprovalDecision) => void;
  onOpenActionPath: (path: string) => void;
  mode?: "generic" | "opencode" | "claude" | "codex";
}) {
  const shellClassName =
    mode === "opencode"
      ? "px-0 py-1 text-slate-700"
      : mode === "codex"
        ? "px-0 py-1 text-slate-700"
        : "px-0 py-1 text-slate-600";
  return (
    <details className={shellClassName} style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
      <summary className="flex cursor-default list-none items-center gap-2">
        <span className={renderActionStatusDot(action.status)} />
        <span className="min-w-0 flex-1 truncate font-semibold">{action.label || action.tool}</span>
        {action.path ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onOpenActionPath(action.path!);
            }}
            className="rounded px-1.5 py-0.5 font-semibold text-slate-500 hover:bg-slate-200"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            打开
          </button>
        ) : null}
      </summary>
      {action.approval && action.status !== "pending" ? (
        <div className="mt-2">
          <AgentApprovalCard
            action={action}
            fontSize={fontSize}
            lineHeight={lineHeight}
            onApprovalResponse={onApprovalResponse}
            onOpenActionPath={onOpenActionPath}
          />
        </div>
      ) : null}
      {action.input && !action.approval ? (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap" style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
          {action.input}
        </pre>
      ) : null}
      {action.output ? (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap" style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
          {action.output}
        </pre>
      ) : null}
    </details>
  );
}

function ProviderSummaryBadges({
  actions,
  fontSize
}: {
  actions: AgentSessionAction[];
  fontSize: number;
}) {
  const segments = summarizeByCategory(actions);
  if (!segments.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
      {segments.map(([category, count]) => {
        const Icon = actionCategoryIcon(category);
        const label = category === "other" ? "step" : processCategoryLabel[category as Exclude<AgentProcessCategory, "system">];
        return (
          <span key={category} className="inline-flex items-center gap-1" style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}>
            <Icon size={Math.max(10, fontSize)} />
            <span>{label}</span>
            <span className="font-semibold text-slate-600">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

function SectionLabel({ children, fontSize }: { children: ReactNode; fontSize: number }) {
  return (
    <div className="mb-1 text-slate-400" style={{ fontSize: `${fontSize}px`, lineHeight: 1.3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </div>
  );
}

function AgentMarkdownPreview({
  markdown,
  align = "left",
  className,
  fontSize,
  lineHeight
}: {
  markdown: string;
  align?: "left" | "right";
  className?: string;
  fontSize: number;
  lineHeight: number;
}) {
  const normalizedMarkdown = useMemo(() => normalizeAgentMathMarkdown(markdown), [markdown]);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: false,
          underline: false
        }),
        Highlight,
        MarkdownLink.configure({
          autolink: true,
          defaultProtocol: "https",
          enableClickSelection: false,
          isAllowedUri: (url, context) => !INVALID_AUTO_LINK_CHAR_PATTERN.test(url) && context.defaultValidate(url),
          openOnClick: true
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        SubscriptMark,
        SuperscriptMark,
        UnderlineMark,
        MathInline,
        MathBlock,
        Markdown.configure({ indentation: { style: "space", size: 2 } })
      ],
      content: normalizedMarkdown,
      contentType: "markdown",
      editable: false,
      editorProps: {
        attributes: {
          class: cn("informio-agent-markdown prose prose-slate max-w-none text-left focus:outline-none", align === "right" && "ml-auto"),
          "data-agent-markdown": "true"
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(normalizedMarkdown, { contentType: "markdown", emitUpdate: false } as never);
  }, [editor, normalizedMarkdown]);

  return (
    <div
      className={cn("cursor-text select-text text-[var(--text-main)]", className)}
      style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function GenericExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const processSummary = summarizeAgentProcess(message.actions);
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  return (
    <>
      {pendingApprovalActions.length ? (
        <div className="mb-2 space-y-2">
          {pendingApprovalActions.map((action) => (
            <AgentApprovalCard
              key={action.approval?.id ?? action.toolId}
              action={action}
              fontSize={processFontSize}
              lineHeight={processLineHeight}
              onApprovalResponse={onApprovalResponse}
              onOpenActionPath={onOpenActionPath}
            />
          ))}
        </div>
      ) : null}
      <div className="mb-2">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex max-w-full items-center gap-1 py-0.5 text-left text-[var(--text-muted)]"
          style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
        >
          {isExpanded ? <ChevronDown size={Math.max(10, transcriptFontSize)} className="shrink-0" /> : <ChevronRight size={Math.max(10, transcriptFontSize)} className="shrink-0" />}
          <span className="text-[var(--text-muted)]">已处理 {duration}</span>
          {processSummary.summary ? <span className="min-w-0 truncate text-slate-400">{processSummary.summary}</span> : null}
          {message.status === "thinking" || message.status === "tool-executing" ? (
            <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
          ) : null}
        </button>
        {isExpanded ? (
          <div className="pb-2 pl-5">
            {message.reasoning.trim() ? (
              <div className="mb-3 text-[var(--text-muted)]" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
                <div className="font-semibold text-slate-700">可见过程</div>
                <div className="mt-1 whitespace-pre-wrap">{message.reasoning}</div>
              </div>
            ) : null}
            {visibleActions.length ? (
              <div className="space-y-1.5">
                {visibleActions.map((action) => (
                  <AgentActionDetails
                    key={action.toolId}
                    action={action}
                    fontSize={processFontSize}
                    lineHeight={processLineHeight}
                    onApprovalResponse={onApprovalResponse}
                    onOpenActionPath={onOpenActionPath}
                  />
                ))}
              </div>
            ) : null}
            {!message.reasoning.trim() && !visibleActions.length ? (
              <div className="text-slate-500" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
                {message.status === "thinking" || message.status === "tool-executing"
                  ? "正在等待 Agent 返回可展示的过程事件。"
                  : "这次运行没有返回可展示的过程事件。"}
              </div>
            ) : null}
            {processSummary.hiddenSystemActions ? (
              <div className="mt-3 text-slate-400" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
                已隐藏 {processSummary.hiddenSystemActions} 个既定上下文步骤
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function OpenCodeExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const completedActions = visibleActions.filter((action) => action.status !== "pending");
  const actionError = hasVisibleActionError(visibleActions);
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  const badgeFontSize = Math.max(10, processFontSize - 1);
  const lastAction = latestVisibleAction(visibleActions);
  const hasProcessContent = Boolean(message.reasoning.trim() || visibleActions.length || pendingApprovalActions.length);
  const subtitle =
    pendingApprovalActions.length
      ? `需要确认: ${actionShortLabel(pendingApprovalActions[0]) || "当前操作"}`
      : lastAction
        ? `最近步骤: ${actionShortLabel(lastAction)}`
        : message.reasoning.trim()
          ? "正在组织回复"
          : "";
  const phaseLabel =
    pendingApprovalActions.length
      ? "等待授权"
      : actionError
        ? "部分失败"
      : message.status === "tool-executing"
        ? "运行工具"
        : message.status === "thinking"
          ? "生成中"
          : message.status === "error"
            ? isCancelledAgentMessage(message) ? "已中断" : "运行失败"
            : "已完成";
  return (
    <div className="mb-3 px-0 py-1">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-start justify-between gap-3 text-left"
        style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
      >
        <div className="flex min-w-0 items-start gap-2">
          {isExpanded ? <ChevronDown size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">{phaseLabel}</span>
              {message.status === "thinking" || message.status === "tool-executing" ? (
                <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
              ) : null}
            </div>
            {subtitle ? <div className="mt-1 text-slate-500">{subtitle}</div> : null}
            <ProviderSummaryBadges actions={visibleActions} fontSize={badgeFontSize} />
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-slate-400">{duration}</div>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-3 pl-4">
          {message.reasoning.trim() ? (
            <div className="text-slate-600" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>可见过程</SectionLabel>
              <div className="whitespace-pre-wrap">{message.reasoning}</div>
            </div>
          ) : null}
          {pendingApprovalActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>授权</SectionLabel>
              {pendingApprovalActions.map((action) => (
                <AgentApprovalCard
                  key={action.approval?.id ?? action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                />
              ))}
            </div>
          ) : null}
          {completedActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>执行流</SectionLabel>
              {completedActions.map((action) => (
                <AgentActionDetails
                  key={action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                  mode="opencode"
                />
              ))}
            </div>
          ) : null}
          {!message.reasoning.trim() && !visibleActions.length && (message.status === "thinking" || message.status === "tool-executing") ? (
            <div className="text-slate-500" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              正在等待 OpenCode 返回阶段事件。
            </div>
          ) : null}
          {!hasProcessContent && message.status !== "thinking" && message.status !== "tool-executing" ? (
            <div className="text-slate-400" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              这次运行没有返回可展示的中间过程。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ClaudeCodeExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const processSummary = summarizeAgentProcess(message.actions);
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  const reasoningPreview = firstProcessLine(message.reasoning);
  const actionError = hasVisibleActionError(visibleActions);
  const statusLabel =
    pendingApprovalActions.length ? "等待授权" : actionError ? "部分失败" : message.status === "tool-executing" ? "执行中" : message.status === "thinking" ? "处理中" : message.status === "error" ? isCancelledAgentMessage(message) ? "已中断" : "运行失败" : "完成";
  return (
    <div className="mb-3 px-0 py-1">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-start justify-between gap-3 text-left"
        style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
      >
        <div className="flex min-w-0 items-start gap-2">
          {isExpanded ? <ChevronDown size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">{statusLabel}</span>
              {message.status === "thinking" || message.status === "tool-executing" ? (
                <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
              ) : null}
            </div>
            <div className="mt-1 text-slate-500">{reasoningPreview ? `最近步骤: ${reasoningPreview}` : "最近步骤: Claude Code"}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-slate-400">
              {processSummary.summary ? <span>{processSummary.summary}</span> : null}
              {message.reasoning.trim() ? <span>summary</span> : null}
              {pendingApprovalActions.length ? <span>approval</span> : null}
            </div>
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-slate-400">{duration}</div>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-3 pl-4">
          {message.reasoning.trim() ? (
            <div className="text-[var(--text-muted)]" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>可见过程</SectionLabel>
              <div className="mt-1 whitespace-pre-wrap">{message.reasoning}</div>
            </div>
          ) : null}
          {pendingApprovalActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>授权</SectionLabel>
              {pendingApprovalActions.map((action) => (
                <AgentApprovalCard
                  key={action.approval?.id ?? action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                />
              ))}
            </div>
          ) : null}
          {visibleActions.length ? (
            <div className="space-y-1.5">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>执行流</SectionLabel>
              {visibleActions.map((action) => (
                <AgentActionDetails
                  key={action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                  mode="claude"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CodexExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const verificationActions = visibleActions.filter((action) => isVerificationAction(action));
  const actionError = hasVisibleActionError(visibleActions);
  const grouped = {
    command: visibleActions.filter((action) => classifyAgentAction(action) === "command" && !isVerificationAction(action)),
    edit: visibleActions.filter((action) => classifyAgentAction(action) === "edit"),
    inspect: visibleActions.filter((action) => {
      const category = classifyAgentAction(action);
      return category === "read" || category === "search" || category === "explore";
    }),
    other: visibleActions.filter((action) => {
      const category = classifyAgentAction(action);
      return !["command", "edit", "read", "search", "explore"].includes(category) && !isVerificationAction(action);
    })
  };
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  const summary = [
    grouped.inspect.length ? `检查 ${grouped.inspect.length}` : "",
    grouped.command.length ? `命令 ${grouped.command.length}` : "",
    grouped.edit.length ? `改动 ${grouped.edit.length}` : "",
    verificationActions.length ? `验证 ${verificationActions.length}` : ""
  ].filter(Boolean).join(" · ");
  const statusLabel =
    pendingApprovalActions.length ? "等待授权" : actionError ? "部分失败" : message.status === "tool-executing" ? "执行中" : message.status === "thinking" ? "处理中" : message.status === "error" ? "失败" : "完成";
  const lastAction = latestVisibleAction(visibleActions);
  return (
    <div className="mb-3 px-0 py-1">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-start justify-between gap-3 text-left"
        style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
      >
        <div className="flex min-w-0 items-start gap-2">
          {isExpanded ? <ChevronDown size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">{statusLabel}</span>
              {message.status === "thinking" || message.status === "tool-executing" ? (
                <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
              ) : null}
            </div>
            <div className="mt-1 text-slate-500">{lastAction ? `最近步骤: ${actionShortLabel(lastAction)}` : "最近步骤: Codex"}</div>
            {summary ? <div className="mt-1 text-slate-400">{summary}</div> : null}
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-slate-400">{duration}</div>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-3 pl-4">
          {message.reasoning.trim() ? (
            <div className="text-slate-400" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>可见过程</SectionLabel>
              <div className="whitespace-pre-wrap">{message.reasoning}</div>
            </div>
          ) : null}
          {pendingApprovalActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Approval</SectionLabel>
              {pendingApprovalActions.map((action) => (
                <AgentApprovalCard
                  key={action.approval?.id ?? action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                />
              ))}
            </div>
          ) : null}
          {([
            ["检查", grouped.inspect],
            ["命令", grouped.command],
            ["改动", grouped.edit],
            ["验证", verificationActions],
            ["其他", grouped.other]
          ] as Array<[string, AgentSessionAction[]]>)
            .filter(([, actions]) => actions.length)
            .map(([label, actions]) => (
              <div key={label}>
                <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>{label}</SectionLabel>
                <div className="space-y-1.5">
                  {actions.map((action) => (
                    <AgentActionDetails
                      key={action.toolId}
                      action={action}
                      fontSize={processFontSize}
                      lineHeight={processLineHeight}
                      onApprovalResponse={onApprovalResponse}
                      onOpenActionPath={onOpenActionPath}
                      mode="codex"
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentPanel({
  providers,
  provider,
  connection,
  conversations,
  activeConversationId,
  pendingNewConversation,
  messages,
  selectedSelection,
  busy,
  enabled,
  currentModel,
  availableModels,
  chatFontSize,
  connections,
  onConnect,
  onSend,
  onCancel,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onSelectProvider,
  onApprovalResponse,
  onOpenActionPath,
  onModelChange,
  onOpenSettings,
  width
}: {
  providers: AgentProvider[];
  provider: AgentProvider;
  connection?: AgentConnection;
  conversations: AgentConversation[];
  activeConversationId: string | null;
  pendingNewConversation: boolean;
  messages: AgentSessionMessage[];
  selectedSelection: AgentSelection | null;
  busy: boolean;
  enabled: boolean;
  currentModel: string;
  availableModels: AgentModel[];
  chatFontSize: number;
  connections: AgentConnection[];
  onConnect: () => void;
  onSend: (text: string, permissionMode: AgentPermissionMode, attachments: AgentMessageAttachment[]) => void;
  onCancel: () => void;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onSelectProvider: (providerId: string) => void;
  onApprovalResponse: (approvalId: string, decision: AgentApprovalDecision) => void;
  onOpenActionPath: (path: string) => void;
  onModelChange: (model: string) => void;
  onOpenSettings: () => void;
  width: number;
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<AgentMessageAttachment[]>([]);
  const [composerHeight, setComposerHeight] = useState(() => {
    const saved = Number(window.localStorage.getItem("informio-agent-composer-height") ?? 0);
    return Number.isFinite(saved) && saved >= 80 ? saved : 96;
  });
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>("full_access");
  const [pendingPermissionMode, setPendingPermissionMode] = useState<AgentPermissionMode | null>(null);
  const [fullAccessConfirmOpen, setFullAccessConfirmOpen] = useState(false);
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(() => new Set());
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compactAgentControls, setCompactAgentControls] = useState(false);
  const [copiedAgentMessageId, setCopiedAgentMessageId] = useState<string | null>(null);
  const [transcriptContextMenu, setTranscriptContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const previousStatusesRef = useRef<Map<string, AgentSessionStatus>>(new Map());
  const agentMenuRef = useRef<HTMLDivElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const composerControlsRef = useRef<HTMLDivElement | null>(null);
  const fullControlsMeasureRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(messages.length);
  const status = connection?.status ?? "idle";
  const reconnectLabel = status === "connected" ? `重新连接 ${provider.name}` : "连接 Agent";
  const transcriptFontSize = clamp(chatFontSize, CHAT_PANEL_FONT_MIN, CHAT_PANEL_FONT_MAX);
  const transcriptLineHeight = Math.max(Math.round(transcriptFontSize * 1.7), transcriptFontSize + 6);
  const processFontSize = Math.max(CHAT_PANEL_FONT_MIN - 1, transcriptFontSize - 2);
  const processLineHeight = Math.max(Math.round(processFontSize * 1.6), processFontSize + 5);
  const currentModelLabel = modelLabel(availableModels, currentModel);
  const currentPermissionLabel = permissionModeLabel[permissionMode];
  const handlePermissionModeChange = (value: string) => {
    const next = value as AgentPermissionMode;
    if (next === "full_access" && permissionMode !== "full_access") {
      setPendingPermissionMode(next);
      setFullAccessConfirmOpen(true);
      return;
    }
    setPermissionMode(next);
  };
  const sendDraft = () => {
    const text = draft.trim();
    if ((!text && !attachments.length) || busy || !enabled) return;
    const nextAttachments = attachments;
    setDraft("");
    setAttachments([]);
    onSend(text || "请处理这些附件。", permissionMode, nextAttachments);
  };

  const addAttachmentFiles = (files: File[]) => {
    const nextItems = files
      .map((file) => {
        const path = filePathForFile(file);
        if (!path) return null;
        return {
          id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name || pathBaseName(path),
          path,
          kind: fileKindFromName(file.name || path),
          mimeType: file.type || mimeTypeFromName(file.name || path),
          size: file.size
        } satisfies AgentMessageAttachment;
      })
      .filter(Boolean) as AgentMessageAttachment[];
    if (!nextItems.length) return;
    setAttachments((items) => {
      const existingPaths = new Set(items.map((item) => normalizePath(item.path)));
      return [...items, ...nextItems.filter((item) => !existingPaths.has(normalizePath(item.path)))];
    });
  };

  const startComposerResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    document.body.classList.add("is-resizing-panel");
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(startHeight + startY - moveEvent.clientY, 80, 260);
      setComposerHeight(nextHeight);
      window.localStorage.setItem("informio-agent-composer-height", String(Math.round(nextHeight)));
    };
    const onPointerUp = () => {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const copyAgentMessage = async (id: string, text: string) => {
    const content = text.trim();
    if (!content) return;
    await writeClipboardText(content);
    setCopiedAgentMessageId(id);
    window.setTimeout(() => {
      setCopiedAgentMessageId((current) => (current === id ? null : current));
    }, 1200);
  };

  const selectedTranscriptText = () => {
    const container = transcriptScrollRef.current;
    const selection = window.getSelection();
    if (!container || !selection || !selectionIsInsideElement(selection, container)) return "";
    return selection.toString();
  };

  const copySelectedTranscriptText = async (text = selectedTranscriptText()) => {
    const content = text.trim();
    if (!content) return false;
    await writeClipboardText(content);
    setTranscriptContextMenu(null);
    return true;
  };

  useEffect(() => {
    const hasActiveMessage = messages.some((message) => message.status === "thinking" || message.status === "tool-executing");
    if (!hasActiveMessage) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [messages]);

  useEffect(() => {
    setExpandedProcessIds((current) => {
      const next = new Set(current);
      const nextStatuses = new Map<string, AgentSessionStatus>();
      messages.forEach((message) => {
        const previous = previousStatusesRef.current.get(message.id);
        const isActive = message.status === "thinking" || message.status === "tool-executing";
        const hasPendingApproval = message.actions.some((action) => action.approval && action.status === "pending");
        const justFinished =
          (previous === "thinking" || previous === "tool-executing")
          && (message.status === "done" || message.status === "error");
        if (isActive || hasPendingApproval || justFinished) next.add(message.id);
        nextStatuses.set(message.id, message.status);
      });
      previousStatusesRef.current = nextStatuses;
      return next;
    });
  }, [messages]);

  useEffect(() => {
    if (!historyOpen && !agentMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (agentMenuOpen && !agentMenuRef.current?.contains(event.target as globalThis.Node | null)) setAgentMenuOpen(false);
      if (!historyMenuRef.current?.contains(event.target as globalThis.Node | null)) setHistoryOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [agentMenuOpen, historyOpen]);

  useEffect(() => {
    if (messages.length > previousMessageCountRef.current) shouldStickToBottomRef.current = true;
    previousMessageCountRef.current = messages.length;

    if (!shouldStickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const container = transcriptScrollRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const container = transcriptScrollRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, pendingNewConversation]);

  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      const text = selectedTranscriptText();
      if (!text.trim()) return;
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      const text = selectedTranscriptText();
      if (!text.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      void copySelectedTranscriptText(text);
    };

    window.addEventListener("copy", onCopy, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("copy", onCopy, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [copySelectedTranscriptText, selectedTranscriptText]);

  useEffect(() => {
    if (!transcriptContextMenu) return;
    const close = () => setTranscriptContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [transcriptContextMenu]);

  useEffect(() => {
    const controls = composerControlsRef.current;
    const measure = fullControlsMeasureRef.current;
    if (!controls || !measure) return;

    const updateCompactMode = () => {
      const availableWidth = controls.clientWidth;
      const requiredWidth = Math.ceil(measure.scrollWidth) + 8;
      setCompactAgentControls(requiredWidth > availableWidth);
    };

    updateCompactMode();

    const resizeObserver = new ResizeObserver(() => updateCompactMode());
    resizeObserver.observe(controls);
    resizeObserver.observe(measure);
    return () => resizeObserver.disconnect();
  }, [currentModelLabel, currentPermissionLabel, busy, enabled, selectedSelection?.text]);

  return (
    <aside className="assistant-panel flex h-full shrink-0 flex-col" style={{ width }}>
      <div className="relative flex h-[48px] items-center justify-between border-b px-4">
        <div className="relative" ref={agentMenuRef}>
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(false);
              setAgentMenuOpen((open) => !open);
            }}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-slate-500/5 hover:text-[var(--text-main)]"
          >
            <span className={cn("h-2 w-2 rounded-full", connectionTone[status])} />
            <span className="text-[13px] leading-[1]">{provider.name}</span>
            <ChevronDown size={13} className={cn("transition-transform", agentMenuOpen && "rotate-180")} />
          </button>
          {agentMenuOpen ? (
            <div className="absolute left-0 top-[38px] z-30 w-[220px] overflow-hidden rounded-xl bg-white shadow-[0_20px_48px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]">
              <div className="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                切换 Agent
              </div>
              <div className="p-2">
                <div className="space-y-1">
                  {providers.map((item) => {
                    const itemStatus = connections.find((connectionItem) => connectionItem.providerId === item.id)?.status ?? "idle";
                    const active = item.id === provider.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setAgentMenuOpen(false);
                          onSelectProvider(item.id);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          active ? "bg-slate-100 text-[var(--text-main)]" : "text-[var(--text-muted)] hover:bg-slate-50"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-[inherit]">{item.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-[10px] text-slate-400">
                          <span className={cn("h-2 w-2 rounded-full", connectionTone[itemStatus])} />
                          {connectionLabel[itemStatus]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex gap-1" ref={historyMenuRef}>
          <IconButton
            label="历史会话"
            className="h-7 w-7"
            onClick={() => {
              setAgentMenuOpen(false);
              setHistoryOpen((open) => !open);
            }}
            disabled={!conversations.length && pendingNewConversation}
          >
            <History size={15} />
          </IconButton>
          <IconButton label={reconnectLabel} className="h-7 w-7" onClick={onConnect} disabled={!enabled}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />}
          </IconButton>
          <IconButton label="Agent 设置" className="h-7 w-7" onClick={onOpenSettings}>
            <Settings size={15} />
          </IconButton>
          {historyOpen ? (
            <div className="absolute right-4 top-[42px] z-30 w-[min(240px,calc(100vw-32px))] overflow-hidden rounded-xl bg-white shadow-[0_20px_48px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]">
              <div className="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                此 Agent 的历史会话
              </div>
              <div className="max-h-[320px] overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen(false);
                    onNewConversation();
                  }}
                  disabled={busy}
                  className="mb-2 flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  新建会话
                </button>
                {conversations.length ? (
                  <div className="space-y-1">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1 transition-colors",
                          activeConversationId === conversation.id ? "bg-slate-100" : "hover:bg-slate-50"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryOpen(false);
                            onSelectConversation(conversation.id);
                          }}
                          disabled={busy}
                          className={cn(
                            "min-w-0 flex-1 text-left disabled:cursor-not-allowed",
                            activeConversationId === conversation.id ? "text-[var(--text-main)]" : "text-[var(--text-muted)]"
                          )}
                        >
                          <span className="block truncate text-[12px] font-semibold text-[inherit]">{conversation.title}</span>
                          <span className="block truncate text-[10px] text-slate-400">来自：{conversation.workspaceLabel || "未命名工作区"}</span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {conversation.messages.find((message) => message.role === "user")?.content || "空会话"}
                          </span>
                        </button>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatConversationUpdatedAt(conversation.updatedAt)}</span>
                        <button
                          type="button"
                          aria-label={`删除 ${conversation.title}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onDeleteConversation(conversation.id);
                          }}
                          disabled={busy}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-[12px] leading-5 text-[var(--text-muted)]">还没有历史会话。</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={transcriptScrollRef}
        data-agent-transcript="true"
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
        onContextMenu={(event) => {
          const text = selectedTranscriptText();
          if (!text.trim()) return;
          event.preventDefault();
          setTranscriptContextMenu({ x: event.clientX, y: event.clientY, text });
        }}
        onScroll={(event) => {
          const container = event.currentTarget;
          const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          shouldStickToBottomRef.current = distanceFromBottom <= 48;
          setTranscriptContextMenu(null);
        }}
      >
        {transcriptContextMenu ? (
          <div
            className="fixed z-[120] min-w-28 rounded-lg bg-white p-1 text-[13px] shadow-[0_16px_40px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
            style={{ left: transcriptContextMenu.x, top: transcriptContextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => void copySelectedTranscriptText(transcriptContextMenu.text)}
            >
              <Copy size={14} />
              <span>复制</span>
            </button>
          </div>
        ) : null}
        {selectedSelection?.text ? (
          <div className="rounded-md px-2 py-1.5 text-[12px] leading-5 text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              已包含当前选区
            </div>
          </div>
        ) : null}

        {connection?.message && status === "error" ? (
          <div className={cn("rounded-lg px-3 py-2 text-xs leading-5", status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
            {connection.message}
          </div>
        ) : null}

        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              {(() => {
                const isExpanded = expandedProcessIds.has(message.id);
                const ExecutionFlow = providerExecutionRenderer(provider.id);
                return (
                  <>
              <div className="flex justify-end">
                <div className="w-[86%] px-3 text-right">
                  <div className="mb-1 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label="复制用户消息"
                      onClick={() => void copyAgentMessage(`${message.id}:user`, message.userMessage)}
                      className="no-drag inline-grid h-5 w-5 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      {copiedAgentMessageId === `${message.id}:user` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <div
                      className="font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                      style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                    >
                      User
                    </div>
                  </div>
                  <AgentMarkdownPreview
                    markdown={message.userMessage}
                    align="right"
                    className="rounded-md bg-[color-mix(in_srgb,var(--surface-sidebar)_72%,var(--surface-elevated))] py-2"
                    fontSize={transcriptFontSize}
                    lineHeight={transcriptLineHeight}
                  />
                </div>
              </div>
              <div className="px-1 py-1">
                <div className="mb-1 flex items-center gap-1">
                  <div
                    className="font-bold tracking-[0.12em] text-[var(--text-muted)] uppercase"
                    style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                  >
                    {provider.name}
                  </div>
                  {message.response ? (
                    <button
                      type="button"
                      aria-label="复制 AI 回复"
                      onClick={() => void copyAgentMessage(`${message.id}:assistant`, message.response)}
                      className="no-drag inline-grid h-5 w-5 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      {copiedAgentMessageId === `${message.id}:assistant` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  ) : null}
                </div>
                <ExecutionFlow
                  provider={provider}
                  message={message}
                  transcriptFontSize={transcriptFontSize}
                  transcriptLineHeight={transcriptLineHeight}
                  processFontSize={processFontSize}
                  processLineHeight={processLineHeight}
                  isExpanded={isExpanded}
                  now={now}
                  onToggleExpanded={() =>
                    setExpandedProcessIds((current) => {
                      const next = new Set(current);
                      if (next.has(message.id)) next.delete(message.id);
                      else next.add(message.id);
                      return next;
                    })
                  }
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                />
                {message.response ? (
                  <AgentMarkdownPreview markdown={message.response} fontSize={transcriptFontSize} lineHeight={transcriptLineHeight} />
                ) : null}
                {message.error ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">{message.error}</div> : null}
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      </div>

      <form
        className="border-t p-3"
        onDragOver={(event) => {
          if (!isExternalFileDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          if (!isExternalFileDrag(event.dataTransfer)) return;
          event.preventDefault();
          addAttachmentFiles(Array.from(event.dataTransfer.files));
        }}
        onSubmit={(event) => {
          event.preventDefault();
          sendDraft();
        }}
      >
        <div className="surface-card rounded-lg p-3 shadow-[0_1px_5px_rgba(15,23,42,0.12),inset_0_0_0_1px_rgba(15,23,42,0.08)]">
          <div
            className="-mx-3 -mt-3 mb-2 h-2 cursor-row-resize rounded-t-lg"
            title="拖拽调整输入区高度"
            onPointerDown={startComposerResize}
          />
          {attachments.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative inline-flex max-w-full items-center rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-9 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
                  title={attachment.path}
                >
                  <div className="max-w-56 truncate text-[13px] font-semibold leading-5 text-slate-900">{attachment.name}</div>
                  <button
                    type="button"
                    aria-label={`移除 ${attachment.name}`}
                    onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}
                    className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-950 text-white transition-colors hover:bg-slate-700"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              sendDraft();
            }}
            placeholder=""
            style={{ height: composerHeight }}
            className="w-full resize-none bg-transparent text-[13px] leading-6 text-[var(--text-main)] outline-none placeholder:text-slate-500"
            disabled={!enabled}
          />
          <div className="relative pt-2">
            <div
              ref={fullControlsMeasureRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-2 h-8 w-max overflow-hidden whitespace-nowrap opacity-0"
            >
              <div className="flex h-8 items-center gap-2">
                <div className="flex h-8 items-center gap-2 whitespace-nowrap">
                  <span className="grid h-8 w-8 shrink-0 place-items-center" />
                  <span className="flex h-8 items-center gap-1 px-1.5 text-[13px] font-semibold text-slate-400">
                    <span className="block text-[13px] leading-8">{currentModelLabel}</span>
                    <ChevronDown size={13} className="block shrink-0" />
                  </span>
                  <span className="flex h-8 items-center gap-1 px-1.5 text-[13px] font-semibold text-slate-400">
                    <span className="block text-[13px] leading-8">{currentPermissionLabel}</span>
                    <ChevronDown size={13} className="block shrink-0" />
                  </span>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center" />
              </div>
            </div>
          <div ref={composerControlsRef} className="flex h-8 items-center justify-between gap-2">
            <div className={cn("flex h-8 min-w-0 items-center overflow-hidden", compactAgentControls ? "gap-1" : "gap-2")}>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  addAttachmentFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                aria-label="添加图片或文件"
                title="添加图片或文件"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={!enabled || busy}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-500/5 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Paperclip size={14} />
              </button>
              <Select.Root value={currentModel} onValueChange={onModelChange} disabled={!enabled || !availableModels.length}>
                <Select.Trigger
                  aria-label={`模型：${currentModelLabel}`}
                  title={`模型：${currentModelLabel}`}
                  className={cn(
                    "flex h-8 min-w-0 items-center rounded-md bg-transparent text-[13px] font-semibold text-slate-400 outline-none transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-45",
                    compactAgentControls ? "w-8 shrink-0 justify-center px-0" : "shrink-0 gap-1 whitespace-nowrap px-1.5"
                  )}
                >
                  <Select.Value aria-label={currentModelLabel}>
                    {compactAgentControls ? (
                      <span className="grid h-8 w-8 place-items-center">
                        <Bot size={14} className="shrink-0" />
                      </span>
                    ) : (
                      <span className="block text-[13px] leading-8">{currentModelLabel}</span>
                    )}
                  </Select.Value>
                  <Select.Icon>
                    <ChevronDown size={13} className={cn("block shrink-0", compactAgentControls && "hidden")} />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-[80] max-h-72 overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                    <Select.Viewport>
                      {availableModels.map((model) => (
                        <Select.Item
                          key={model.id}
                          value={model.id}
                          className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950"
                        >
                          <Select.ItemText>{model.label || model.id}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              <Select.Root value={permissionMode} onValueChange={handlePermissionModeChange}>
                <Select.Trigger
                  aria-label={`权限：${currentPermissionLabel}`}
                  title={`权限：${currentPermissionLabel}`}
                  className={cn(
                    "flex h-8 min-w-0 items-center rounded-md bg-transparent text-[13px] font-semibold text-slate-400 outline-none transition-colors hover:text-slate-600",
                    compactAgentControls ? "w-8 shrink-0 justify-center px-0" : "shrink-0 gap-1 whitespace-nowrap px-1.5"
                  )}
                >
                  <Select.Value aria-label={currentPermissionLabel}>
                    {compactAgentControls ? (
                      <span className="grid h-8 w-8 place-items-center">
                        <Shield size={14} className="shrink-0" />
                      </span>
                    ) : (
                      <span className="block text-[13px] leading-8">{currentPermissionLabel}</span>
                    )}
                  </Select.Value>
                  <Select.Icon>
                    <ChevronDown size={13} className={cn("block shrink-0", compactAgentControls && "hidden")} />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-[80] overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                    <Select.Viewport>
                      {agentPermissionModes.map((item) => (
                        <Select.Item
                          key={item}
                          value={item}
                          className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950"
                        >
                          <Select.ItemText>{permissionModeLabel[item]}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <button
              type={busy ? "button" : "submit"}
              onClick={busy ? onCancel : undefined}
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-transparent transition-[background-color,transform,color] active:scale-95 disabled:cursor-not-allowed",
                busy
                  ? "text-slate-600 hover:bg-slate-500/5"
                  : "text-slate-600 hover:bg-slate-500/5 hover:text-slate-800 disabled:text-slate-300"
              )}
              disabled={!enabled || (!busy && !draft.trim() && !attachments.length)}
              aria-label={busy ? "取消当前运行" : "发送"}
            >
              {busy ? <X size={15} /> : <ArrowUp size={16} />}
            </button>
          </div>
          </div>
        </div>
      </form>
      <Dialog.Root
        open={fullAccessConfirmOpen}
        onOpenChange={(open) => {
          setFullAccessConfirmOpen(open);
          if (!open) setPendingPermissionMode(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/22 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
            <Dialog.Title className="text-[16px] font-bold text-[var(--text-main)]">切换到默认权限</Dialog.Title>
            <Dialog.Description className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-muted)]">
              默认权限下，Agent 将不再请求审批，并且可以访问和修改工作区外的系统文件。
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFullAccessConfirmOpen(false);
                  setPendingPermissionMode(null);
                }}
                className="rounded-md px-3 py-2 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingPermissionMode) setPermissionMode(pendingPermissionMode);
                  setFullAccessConfirmOpen(false);
                  setPendingPermissionMode(null);
                }}
                className="rounded-md bg-[#d8c2a1] px-3 py-2 text-[13px] font-semibold text-[#3d2d1f] transition-colors hover:bg-[#ccb089]"
              >
                确认切换
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}

function SelectionToolbar({
  visible,
  enabled,
  busy,
  left,
  top,
  formatActions,
  response,
  error,
  onEncrypt,
  onTranslate,
  onClose
}: {
  visible: boolean;
  enabled: boolean;
  busy: boolean;
  left: number;
  top: number;
  formatActions: Array<SelectionToolbarAction & { pressed?: boolean; onClick: () => void }>;
  response: string;
  error?: string;
  onEncrypt?: () => void;
  onTranslate: () => void;
  onClose: () => void;
}) {
  const preserveSelection = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed z-[90] max-w-[360px]"
      style={{ left, top }}
      data-selection-toolbar-safe-area="true"
      onMouseDownCapture={markSelectionToolbarInteraction}
    >
      <div className="surface-card w-fit max-w-[min(420px,calc(100vw-32px))] rounded-xl p-[5px] shadow-[0_14px_36px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]">
        <div className={cn("space-y-2", response || error ? "w-[min(360px,calc(100vw-32px))]" : "w-fit")}>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5">
              {formatActions.map((action) => (
                <ToolbarGlyphButton
                  key={action.id}
                  label={action.label}
                  icon={action.icon}
                  pressed={action.pressed}
                  disabled={!enabled}
                  onMouseDown={preserveSelection}
                  onClick={action.onClick}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-md text-slate-600 transition-[background-color,color,transform] active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                    action.pressed ? "bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]" : "hover:bg-slate-100 hover:text-slate-900",
                    !enabled && "cursor-not-allowed opacity-35 active:scale-100"
                  )}
                />
              ))}
            </div>
            <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
            {onEncrypt ? (
              <ToolbarGlyphButton
                label="加密"
                icon={Shield}
                disabled={!enabled}
                onMouseDown={preserveSelection}
                onClick={onEncrypt}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md text-slate-600 transition-[background-color,color,transform] active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                  "hover:bg-slate-100 hover:text-slate-900",
                  !enabled && "cursor-not-allowed opacity-35 active:scale-100"
                )}
              />
            ) : null}
            <ToolbarGlyphButton
              label="翻译"
              icon={busy ? Loader2 : Languages}
              disabled={!enabled || busy}
              onMouseDown={preserveSelection}
              onClick={onTranslate}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md text-slate-600 transition-[background-color,color,transform] active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                "hover:bg-slate-100 hover:text-slate-900",
                (!enabled || busy) && "cursor-not-allowed opacity-35 active:scale-100"
              )}
              iconClassName={busy ? "animate-spin" : undefined}
            />
            <button
              type="button"
              onMouseDown={preserveSelection}
              onClick={onClose}
              className="ml-0.5 grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="关闭工具栏"
            >
              <X size={12} />
            </button>
          </div>
          {response ? (
            <TranslationResultText
              text={response}
              onSelectionChange={(value) => {
                lastToolbarSelectionText = value;
              }}
            />
          ) : null}
          {error ? (
            <div
              className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700 cursor-text select-text"
              onMouseDown={(event) => event.stopPropagation()}
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SelectionTranslateSection({
  variant = "floating",
  enabled,
  busy,
  response,
  error,
  onEncrypt,
  onTranslate,
  onClose,
  preserveSelection: preserveSelectionHandler,
  className
}: {
  variant?: "floating" | "compact" | "pdf";
  enabled: boolean;
  busy: boolean;
  response: string;
  error?: string;
  onEncrypt?: () => void;
  onTranslate?: () => void;
  onClose?: () => void;
  preserveSelection?: (event: ReactMouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  const preserveSelection = (event: ReactMouseEvent<HTMLElement>) => {
    preserveSelectionHandler?.(event);
  };
  const hasOutput = Boolean(response || error);
  const buttonClassName =
    variant === "pdf"
      ? "inline-flex shrink-0 items-center gap-1.5 text-left"
      : variant === "compact"
        ? "inline-flex h-5 items-center gap-0.5 rounded-md px-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        : "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35";
  const closeButtonClassName =
    variant === "compact"
      ? "grid h-5 w-5 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      : "ml-auto grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600";
  const spinnerSize = variant === "compact" ? 12 : 14;
  const spinnerSlotClassName = variant === "compact" ? "inline-flex w-3 items-center justify-center" : "inline-flex w-4 items-center justify-center";
  const containerClassName =
    variant === "compact"
      ? hasOutput
        ? "w-[min(320px,calc(100vw-32px))] space-y-2"
        : "w-fit space-y-0"
      : variant === "pdf"
        ? hasOutput
          ? "min-w-[220px] max-w-[320px] space-y-2"
          : "flex min-w-0 items-center"
        : "space-y-2";
  return (
    <div className={cn(containerClassName, className)}>
      <div className={cn("flex items-center gap-1", variant === "compact" && "w-fit gap-0.5")}>
        {variant === "pdf" || !onEncrypt ? null : (
          <button
            type="button"
            onMouseDown={preserveSelection}
            onClick={onEncrypt}
            disabled={!enabled}
            className={buttonClassName}
          >
            <span>加密</span>
          </button>
        )}
        {onTranslate ? (
          <button
            type="button"
            onMouseDown={preserveSelection}
            onClick={onTranslate}
            disabled={!enabled || busy}
            className={buttonClassName}
          >
            <span>{selectionToolbarLabel}</span>
            <span className={spinnerSlotClassName} aria-hidden="true">
              {busy ? <Loader2 size={spinnerSize} className="animate-spin" /> : null}
            </span>
          </button>
        ) : (
          <div className={cn(buttonClassName, "text-[var(--text-main)]")} aria-live="polite">
            <span>{busy ? "正在翻译" : "翻译结果"}</span>
            <span className={spinnerSlotClassName} aria-hidden="true">
              {busy ? <Loader2 size={spinnerSize} className="animate-spin" /> : null}
            </span>
          </div>
        )}
        {onClose ? (
          <button
            type="button"
            onMouseDown={preserveSelection}
            onClick={onClose}
            className={closeButtonClassName}
            aria-label="关闭工具栏"
          >
            <X size={variant === "compact" ? 12 : 14} />
          </button>
        ) : null}
      </div>
      {response ? (
        <TranslationResultText
          text={response}
          onSelectionChange={(value) => {
            lastToolbarSelectionText = value;
          }}
        />
      ) : null}
      {error ? (
        <div
          className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700 cursor-text select-text"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function SettingRow({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-5 py-4">
      <div>
        <div className="text-[15px] font-bold text-[var(--text-main)]">{title}</div>
        {description ? <div className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</div> : null}
      </div>
      {children}
    </div>
  );
}

function ShortcutBindingControl({
  value,
  recording,
  onStartRecording,
  onCapture,
  onClear,
  onRestoreDefault
}: {
  value?: string;
  recording: boolean;
  onStartRecording: () => void;
  onCapture: (accelerator: string) => void;
  onClear: () => void;
  onRestoreDefault: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onStartRecording}
        onKeyDown={(event) => {
          if (!recording) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            onStartRecording();
            return;
          }
          const accelerator = acceleratorFromKeyboardEvent(event);
          if (accelerator) onCapture(accelerator);
        }}
        className={cn(
          "min-w-[132px] rounded-md bg-white px-2.5 py-1.5 text-left font-mono text-[12px] text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
          recording && "bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.28)]"
        )}
      >
        {recording ? "按下新快捷键" : acceleratorToDisplay(value, shortcutDisplayPlatform)}
      </button>
      <button
        type="button"
        onClick={onRestoreDefault}
        className="rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        默认
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!value}
        className="rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
      >
        清空
      </button>
    </div>
  );
}

function FontFamilySelect({
  value,
  options,
  onValueChange,
  onOpenChange
}: {
  value: string;
  options: LocalFontOption[];
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((font) => {
      const haystacks = [font.family, font.fullName, font.style]
        .filter(Boolean)
        .map((item) => item!.toLowerCase());
      return haystacks.some((item) => item.includes(normalizedQuery));
    });
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
      onOpenChange(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setQuery("");
      onOpenChange(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative min-w-[260px] max-w-[360px]">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (!nextOpen) setQuery("");
          onOpenChange(nextOpen);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (open) return;
          setOpen(true);
          onOpenChange(true);
        }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md bg-white px-3 text-left text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45"
      >
        <span className="block truncate">{value}</span>
        <span aria-hidden="true">
          <ChevronDown size={14} className="block text-slate-400" />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-full overflow-hidden rounded-lg bg-white p-1 shadow-xl ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-2 pb-2 pt-1">
            <input
              ref={searchInputRef}
              value={query}
              placeholder="搜索字体名，例如 PingFang、苹方、Mono"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  setQuery("");
                  onOpenChange(false);
                }
              }}
              className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-medium text-slate-700 outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filteredOptions.map((font) => (
              <button
                type="button"
                key={`font-family-${font.family}`}
                onClick={() => {
                  onValueChange(font.family);
                  setOpen(false);
                  setQuery("");
                  onOpenChange(false);
                }}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-slate-700 outline-none transition-colors hover:bg-emerald-50 hover:text-slate-950 focus:bg-emerald-50 focus:text-slate-950",
                  font.family === value && "bg-emerald-50 text-slate-950"
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{font.family}</div>
                  {font.fullName && font.fullName !== font.family ? (
                    <div className="truncate text-[11px] font-medium text-slate-500">{font.fullName}</div>
                  ) : null}
                </div>
              </button>
            ))}
            {!filteredOptions.length ? (
              <div className="px-3 py-3 text-[12px] text-slate-500">没有匹配的字体，换个关键词试试。</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SettingsView({
  settings,
  connections,
  onChange,
  onCheckAgents,
  checkingAgents,
  onCheckApiModels,
  checkingApiModels,
  apiCheckState,
  appInfo,
  showWindowControls
}: {
  settings: AppSettings;
  connections: AgentConnection[];
  onChange: (settings: AppSettings) => void;
  onCheckAgents: () => void;
  checkingAgents: boolean;
  onCheckApiModels: () => void;
  checkingApiModels: boolean;
  apiCheckState: ApiCheckState;
  appInfo: AppInfo;
  showWindowControls: boolean;
}) {
  const apiSettings = normalizeApiSettings(settings.api);
  const customThemeColor = settings.appearance.customThemeColor || DEFAULT_CUSTOM_THEME_COLOR;
  const updateAppearance = (patch: Partial<AppSettings["appearance"]>) =>
    onChange({ ...settings, appearance: { ...settings.appearance, ...patch } });
  const [recordingShortcutId, setRecordingShortcutId] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [section, setSection] = useState<(typeof settingsNav)[number]["id"]>(() => {
    const requested = window.localStorage.getItem("informio-settings-section");
    window.localStorage.removeItem("informio-settings-section");
    const normalized = requested === "markdown" ? "editor" : requested === "integrations" ? "agent" : requested;
    return settingsNav.some((item) => item.id === normalized) ? (normalized as (typeof settingsNav)[number]["id"]) : "appearance";
  });
  const [localFontsState, setLocalFontsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    fonts: LocalFontOption[];
    error?: string;
  }>({
    status: "idle",
    fonts: []
  });
  const ensureLocalFontsLoaded = async () => {
    if (localFontsState.status === "loading" || localFontsState.status === "ready") return;
    setLocalFontsState((current) => ({ ...current, status: "loading", error: undefined }));
    const result = await window.informio.listLocalFonts();
    setLocalFontsState({
      status: result.error ? "error" : "ready",
      fonts: result.fonts,
      error: result.error
    });
  };
  const localFontOptions = useMemo(
    () =>
      mergeFontOptions(
        localFontsState.fonts,
        settings.appearance.chineseFontFamily,
        settings.appearance.englishFontFamily,
        settings.appearance.codeFontFamily
      ),
    [
      localFontsState.fonts,
      settings.appearance.chineseFontFamily,
      settings.appearance.englishFontFamily,
      settings.appearance.codeFontFamily
    ]
  );
  const shortcutGroups = useMemo(() => {
    const groups = new Map<string, Array<(typeof configurableShortcutEntries)[number]>>();
    configurableShortcutEntries.forEach((entry) => {
      const items = groups.get(entry.category) ?? [];
      items.push(entry);
      groups.set(entry.category, items);
    });
    return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
  }, []);
  const updateShortcutBinding = (id: string, accelerator: string) => {
    const nextBindings = {
      ...settings.shortcuts.bindings,
      [id]: normalizeAccelerator(accelerator)
    };
    const conflict = findShortcutConflict(nextBindings, id, nextBindings[id]);
    if (conflict) {
      setShortcutError(`“${shortcutRegistryById.get(id)?.label || id}” 与 “${conflict.label}” 不能使用同一个快捷键。`);
      return;
    }
    setShortcutError(null);
    setRecordingShortcutId(null);
    onChange({ ...settings, shortcuts: { ...settings.shortcuts, bindings: nextBindings } });
  };
  const clearShortcutBinding = (id: string) => {
    const nextBindings = { ...settings.shortcuts.bindings, [id]: "" };
    setShortcutError(null);
    setRecordingShortcutId(null);
    onChange({ ...settings, shortcuts: { ...settings.shortcuts, bindings: nextBindings } });
  };
  const restoreShortcutBinding = (id: string) => {
    const fallback = defaultShortcutBindings[id];
    if (!fallback) {
      clearShortcutBinding(id);
      return;
    }
    updateShortcutBinding(id, fallback);
  };
  return (
    <div className="settings-window grid h-screen grid-cols-[246px_1fr] overflow-hidden">
          <div className="settings-sidebar drag-region border-r px-3 pb-5 pt-[50px]">
            <nav className="space-y-2">
              {settingsNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "flex h-10 w-full items-center gap-3 rounded-md px-3 text-[14px] font-bold transition-[background-color,transform,color] active:scale-[0.99]",
                      section === item.id ? "settings-nav-active" : "settings-nav-idle"
                    )}
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="settings-main flex min-w-0 flex-col overflow-hidden">
            <div className="settings-titlebar drag-region relative flex h-[42px] shrink-0 items-center justify-center border-b">
              <div className="absolute right-0 top-0 h-full">
                <WindowControls visible={showWindowControls} />
              </div>
              <h1 className="text-[12px] font-bold">设置</h1>
            </div>
            <div className="no-drag overflow-y-auto px-10 py-7">

            {section === "appearance" && (
              <section>
                <h2 className="text-[18px] font-bold">主题</h2>
                <div className="mt-4 flex flex-wrap gap-6">
                  {themeOptions.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => updateAppearance({ theme: theme.id })}
                      className="text-center transition-transform active:scale-95"
                    >
                      <span
                        className={cn(
                          "grid h-11 w-11 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]",
                          settings.appearance.theme === theme.id && "ring-2 ring-slate-400 ring-offset-4"
                        )}
                        style={getThemeSwatchStyle(theme.id, customThemeColor)}
                      >
                        {settings.appearance.theme === theme.id ? (
                          <Check
                            size={18}
                            className={theme.id === "night" || (theme.id === "custom" && isDarkColor(customThemeColor)) ? "text-white" : "text-slate-950"}
                          />
                        ) : null}
                      </span>
                      <span className="mt-2 block text-[12px] font-medium text-[var(--text-muted)]">{theme.label}</span>
                    </button>
                  ))}
                </div>
                {settings.appearance.theme === "custom" ? (
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 py-3">
                    <div>
                      <div className="text-[14px] font-bold text-[var(--text-main)]">自定义颜色</div>
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                        保持当前界面对比度，只把整体基调换成你选的颜色。
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="relative block h-11 w-11 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]">
                        <span
                          className="pointer-events-none absolute inset-0 rounded-full"
                          style={{ backgroundColor: customThemeColor }}
                        />
                        <input
                          type="color"
                          value={customThemeColor}
                          aria-label="选择自定义主题颜色"
                          onChange={(event) => updateAppearance({ theme: "custom", customThemeColor: event.target.value })}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <code className="rounded-full bg-[var(--surface-panel)] px-3 py-1 text-[12px] font-semibold tracking-[0.06em] text-[var(--text-main)] uppercase">
                        {customThemeColor}
                      </code>
                    </div>
                  </div>
                ) : null}

                <h2 className="mt-12 text-[18px] font-bold">字体</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title="中文字体" description="影响整个软件里的中文显示，包括侧栏、工具栏、设置页和编辑器正文。">
                    <FontFamilySelect
                      value={settings.appearance.chineseFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ chineseFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                  <SettingRow title="英文字体" description="影响整个软件里的英文、数字和拉丁字符显示。">
                    <FontFamilySelect
                      value={settings.appearance.englishFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ englishFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                  <SettingRow title="代码字体" description="影响代码块、源码模式，以及路径、命令、日志这类等宽信息。">
                    <FontFamilySelect
                      value={settings.appearance.codeFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ codeFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                </div>
                {localFontsState.status === "loading" ? (
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">正在读取本地字体列表……</p>
                ) : null}
                {localFontsState.error ? (
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">{localFontsState.error}</p>
                ) : null}

                <h2 className="mt-12 text-[18px] font-bold">窗口</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title="自动隐藏状态栏" description="不交互时隐藏底部统计">
                    <Switch.Root
                      checked={settings.appearance.autoHideStatusBar}
                      onCheckedChange={(value) => updateAppearance({ autoHideStatusBar: value })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                </div>

                <h2 className="mt-12 text-[18px] font-bold">编辑器</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title="编辑字号" description={`${settings.editor.fontSize}px，影响正文阅读密度`}>
                    <input
                      type="range"
                      min={12}
                      max={19}
                      value={settings.editor.fontSize}
                      onChange={(event) =>
                        onChange({ ...settings, editor: { ...settings.editor, fontSize: Number(event.target.value) } })
                      }
                    />
                  </SettingRow>
                  <SettingRow title="编辑宽度" description={`${settings.editor.contentWidth}px，控制正文列总宽度`}>
                    <input
                      type="range"
                      min={EDITOR_CONTENT_MIN_WIDTH}
                      max={EDITOR_CONTENT_MAX_WIDTH}
                      value={settings.editor.contentWidth}
                      onChange={(event) =>
                        onChange({ ...settings, editor: { ...settings.editor, contentWidth: Number(event.target.value) } })
                      }
                    />
                  </SettingRow>
                </div>

                <h2 className="mt-12 text-[18px] font-bold">对话栏</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow
                    title="对话字号"
                    description={`${settings.appearance.chatFontSize}px，影响 User、Agent 名称、用户消息、AI 回复和“已处理”这一行；执行流内部会自动小 2px`}
                  >
                    <input
                      type="range"
                      min={CHAT_PANEL_FONT_MIN}
                      max={CHAT_PANEL_FONT_MAX}
                      value={settings.appearance.chatFontSize}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          appearance: { ...settings.appearance, chatFontSize: Number(event.target.value) }
                        })
                      }
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {section === "agent" && (
              <section>
                <div className="flex items-start gap-5">
                  <div>
                    <h2 className="text-[18px] font-bold text-[var(--text-main)]">Agent</h2>
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">Informio 会用选中文本、当前文档、打开 Tab、项目文件结构作为上下文，调用本机已安装的 Agent。</p>
                  </div>
                </div>

                <div className="settings-divide mt-6 divide-y">
                  <SettingRow title="启用 Agent" description="关闭后不会启动本机 Agent，也不会发送文档上下文。">
                    <Switch.Root
                      checked={settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, enabled: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title="自动启动" description="打开应用后自动预连接全部已启用 Agent，首次切换更快。">
                    <Switch.Root
                      checked={settings.agentRuntime.autoStart}
                      disabled={!settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, autoStart: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)] disabled:opacity-50"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title="保留会话数量" description="每个 Agent 最多保留多少条历史会话。">
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={settings.agentRuntime.conversationRetentionLimit}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          agentRuntime: {
                            ...settings.agentRuntime,
                            conversationRetentionLimit: Math.max(1, Math.min(200, Number(event.target.value) || 1))
                          }
                        })
                      }
                      className="h-9 w-20 rounded-md bg-white px-3 text-center font-mono text-[13px] ring-1 ring-slate-200"
                    />
                  </SettingRow>
                  <SettingRow title="保留会话时间" description="超出这个时间的历史会话会自动清理。">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={settings.agentRuntime.conversationRetentionDays}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          agentRuntime: {
                            ...settings.agentRuntime,
                            conversationRetentionDays: Math.max(1, Math.min(3650, Number(event.target.value) || 1))
                          }
                        })
                      }
                      className="h-9 w-20 rounded-md bg-white px-3 text-center font-mono text-[13px] ring-1 ring-slate-200"
                    />
                  </SettingRow>
                </div>

                <div className="surface-card mt-6 rounded-lg p-4 shadow-[0_1px_5px_rgba(15,23,42,0.12)]">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[13px] font-bold text-[var(--text-main)]">工作 Agent</div>
                    <button
                      type="button"
                      onClick={onCheckAgents}
                      disabled={!settings.agentRuntime.enabled || checkingAgents}
                      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {checkingAgents ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      检测
                    </button>
                  </div>
                  <p className="mb-3 text-[12px] leading-5 text-[var(--text-muted)]">用于右侧工作面板，适合较重的问答、改写和上下文任务。</p>
                  <div className="divide-y divide-[var(--divider)]">
                    {settings.agents.map((agent) => {
                      const connection = connections.find((item) => item.providerId === agent.id);
                      const status = connection?.status ?? "idle";
                      const active = agent.id === settings.activeAgentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => onChange({ ...settings, activeAgentId: agent.id })}
                          className={cn(
                            "flex w-full items-center justify-between gap-4 rounded-md px-3 py-3 text-left transition-colors",
                            active ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "hover:bg-slate-500/5"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-bold text-[var(--text-main)]">{agent.name}</span>
                            {connection?.status === "error" && connection.message ? (
                              <span className="mt-1 block truncate text-[11px] text-red-600">{connection.message}</span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-[12px] font-bold text-[var(--text-muted)]">
                            <span className={cn("h-2.5 w-2.5 rounded-full", connectionTone[status])} />
                            {connectionLabel[status]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {section === "api" && (
              <section>
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h2 className="text-[18px] font-bold text-[var(--text-main)]">API</h2>
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">Markdown 和 PDF 的划词翻译都会走这里配置的接口，不再依赖 Agent runtime。</p>
                  </div>
                </div>

                <div className="settings-divide mt-6 divide-y">
                  <SettingRow title="Provider" description={apiProviderOptions.find((item) => item.id === apiSettings.provider)?.description}>
                    <Select.Root
                      value={apiSettings.provider}
                      onValueChange={(value) => {
                        const provider = value as ApiProviderKind;
                        const nextBaseUrl =
                          !apiSettings.baseUrl.trim() || isBuiltinApiBaseUrl(apiSettings.baseUrl)
                            ? defaultApiBaseUrl(provider)
                            : apiSettings.baseUrl;
                        onChange({
                          ...settings,
                          api: { ...apiSettings, provider, baseUrl: nextBaseUrl, model: "", models: [] }
                        });
                      }}
                    >
                      <Select.Trigger className="flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45">
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown size={14} className="block text-slate-400" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="z-[80] overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                          <Select.Viewport>
                            {apiProviderOptions.map((item) => (
                              <Select.Item
                                key={`api-provider-${item.id}`}
                                value={item.id}
                                className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950"
                              >
                                <Select.ItemText>{item.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </SettingRow>

                  <div className="grid gap-2 py-5">
                    <div className="text-[15px] font-bold text-[var(--text-main)]">base_url</div>
                    <input
                      value={apiSettings.baseUrl}
                      placeholder={defaultApiBaseUrl(apiSettings.provider)}
                      onChange={(event) =>
                        onChange({ ...settings, api: { ...apiSettings, baseUrl: event.target.value, model: "", models: [] } })
                      }
                      className="h-9 min-w-0 rounded-md bg-white px-3 font-mono text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                    />
                    <p className="text-[12px] text-[var(--text-muted)]">例如 {defaultApiBaseUrl(apiSettings.provider)}</p>
                  </div>

                  <div className="grid gap-2 py-5">
                    <div className="text-[15px] font-bold text-[var(--text-main)]">api_key</div>
                    <input
                      type="password"
                      value={apiSettings.apiKey}
                      placeholder="sk-..."
                      onChange={(event) => onChange({ ...settings, api: { ...apiSettings, apiKey: event.target.value } })}
                      className="h-9 min-w-0 rounded-md bg-white px-3 font-mono text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                    />
                  </div>
                </div>

                <div className="surface-card mt-6 rounded-lg p-4 shadow-[0_1px_5px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                    <span className="text-[12px] font-semibold text-[var(--text-muted)]">翻译模型</span>
                    <div className="flex items-center gap-2">
                      <Select.Root
                        value={apiSettings.model}
                        onValueChange={(value) => onChange({ ...settings, api: { ...apiSettings, model: value } })}
                        disabled={!apiSettings.models.length}
                      >
                        <Select.Trigger className="flex h-8 min-w-[220px] max-w-[320px] items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45 disabled:cursor-not-allowed disabled:opacity-45">
                          <Select.Value placeholder="先检测可用模型">
                            <span className="block truncate text-[13px] leading-8">
                              {apiSettings.model ? modelLabel(apiSettings.models, apiSettings.model) : "先检测可用模型"}
                            </span>
                          </Select.Value>
                          <Select.Icon>
                            <ChevronDown size={13} className="block text-slate-400" />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="z-[80] max-h-72 overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                            <Select.Viewport>
                              {apiSettings.models.map((model) => (
                                <Select.Item
                                  key={`api-model-${model.id}`}
                                  value={model.id}
                                  className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950"
                                >
                                  <Select.ItemText>{model.label || model.id}</Select.ItemText>
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                      <button
                        type="button"
                        onClick={onCheckApiModels}
                        disabled={checkingApiModels}
                        className="inline-flex h-8 items-center gap-2 rounded-md bg-slate-950 px-3 text-[13px] font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {checkingApiModels ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        检测
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-[var(--text-muted)]">检测会读取当前接口下可用模型，成功后即可给划词翻译单独指定一个更快的模型。</p>
                  {apiCheckState.message ? <p className="mt-3 text-[12px] text-emerald-700">{apiCheckState.message}</p> : null}
                  {apiCheckState.error ? <p className="mt-3 text-[12px] text-red-700">{apiCheckState.error}</p> : null}
                </div>
              </section>
            )}

            {section === "about" && (
              <section className="max-w-4xl">
                <h2 className="text-[18px] font-bold text-[var(--text-main)]">关于</h2>
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="flex items-start gap-5">
                    <img
                      src={appInfo.iconDataUrl || appIconUrl}
                      alt="Informio"
                      className="h-18 w-18 rounded-[18px] object-cover shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                    />
                    <div className="pt-1">
                      <div className="text-[15px] font-bold text-[var(--text-main)]">{appInfo.name || "Informio"}</div>
                      <p className="mt-1 text-[13px] text-[var(--text-muted)]">版本 {appInfo.version || "-"}</p>
                    </div>
                  </div>

                  <div className="justify-self-start pt-1 lg:justify-self-end">
                    <button
                      type="button"
                      disabled={!appInfo.githubUrl}
                      onClick={() => {
                        if (appInfo.githubUrl) window.informio.openExternal(appInfo.githubUrl);
                      }}
                      className="inline-flex items-center gap-3 text-[14px] font-semibold text-[var(--text-main)] transition-colors hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
                    >
                      <Github size={18} />
                      <span className="border-b border-current/25 pb-0.5">GitHub</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {section !== "appearance" && section !== "agent" && section !== "api" && section !== "about" && (
              <section>
                <h2 className="text-[18px] font-bold text-[var(--text-main)]">{settingsNav.find((item) => item.id === section)?.label}</h2>
                <div className="mt-5 divide-y">
                  {section === "editor" && (
                    <>
                      <SettingRow title="拼写检查" description="控制正文编辑器的系统拼写检查">
                        <Switch.Root
                          checked={settings.editor.spellcheck}
                          onCheckedChange={(value) =>
                            onChange({ ...settings, editor: { ...settings.editor, spellcheck: value } })
                          }
                          className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                        >
                          <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                        </Switch.Root>
                      </SettingRow>
	                      <SettingRow title="自动保存" description="输入后自动保存到本地应用数据">
                        <Switch.Root
                          checked={settings.markdown.autoSave}
                          onCheckedChange={(value) => onChange({ ...settings, markdown: { ...settings.markdown, autoSave: value } })}
                          className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                        >
                          <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                        </Switch.Root>
                      </SettingRow>
                      <SettingRow title="缩进宽度" description="用于 Markdown 列表与代码块">
                        <input
                          type="number"
                          min={2}
                          max={8}
                          value={settings.markdown.tabSize}
                          onChange={(event) =>
                            onChange({ ...settings, markdown: { ...settings.markdown, tabSize: Number(event.target.value) } })
                          }
                          className="h-9 w-18 rounded-md bg-white px-3 text-center font-mono text-[13px] ring-1 ring-slate-200"
                        />
                      </SettingRow>
                      <SettingRow title="插入文件" description="控制通过菜单插入图片、音频、视频和 PDF 时如何写入路径">
                        <Select.Root
                          value={settings.editor.assetImportMode}
                          onValueChange={(value) =>
                            onChange({
                              ...settings,
                              editor: { ...settings.editor, assetImportMode: value as AppSettings["editor"]["assetImportMode"] }
                            })
                          }
                        >
                          <Select.Trigger className="flex h-9 min-w-44 items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45">
                            <Select.Value />
                            <Select.Icon><ChevronDown size={14} /></Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="z-[80] overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                              <Select.Viewport>
                                <Select.Item value="copy-to-attachment" className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950">
                                  <Select.ItemText>复制到 attachments</Select.ItemText>
                                </Select.Item>
                                <Select.Item value="link-original-file" className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950">
                                  <Select.ItemText>保持原路径</Select.ItemText>
                                </Select.Item>
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </SettingRow>
                      <div className="grid gap-2 py-5">
                        <div className="text-[15px] font-bold text-[var(--text-main)]">默认文件夹</div>
                        <div className="flex gap-3">
                          <input
                            value={settings.shortcuts.quickFolder}
                            onChange={(event) =>
                              onChange({ ...settings, shortcuts: { ...settings.shortcuts, quickFolder: event.target.value } })
                            }
                            className="h-9 min-w-0 flex-1 rounded-md bg-white px-3 font-mono text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const folder = await window.informio.chooseFolder();
                              if (folder) onChange({ ...settings, shortcuts: { ...settings.shortcuts, quickFolder: folder } });
                            }}
                            className="rounded-md bg-slate-950 px-3 text-[13px] font-bold text-white transition-transform active:scale-95"
                          >
                            选择
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {section === "shortcuts" && (
                    <>
                      <div className="mb-5">
                        <h2 className="text-[18px] font-bold text-[var(--text-main)]">可配置快捷键</h2>
                        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-muted)]">这里直接改当前生效的快捷键。点一下键位开始录制，冲突时会当场阻止保存。</p>
                      </div>
                      {shortcutError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">{shortcutError}</p> : null}
                      <div className="space-y-6">
                        {shortcutGroups.map((group) => (
                          <section key={group.title}>
                            <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[var(--text-muted)] uppercase">{group.title}</div>
                            <div className="divide-y divide-[var(--divider)] border-y border-[var(--divider)]/80">
                              {group.items.map((entry) => (
                                <SettingRow key={entry.id} title={entry.label} description={entry.description}>
                                  <ShortcutBindingControl
                                    value={settings.shortcuts.bindings[entry.id]}
                                    recording={recordingShortcutId === entry.id}
                                    onStartRecording={() =>
                                      setRecordingShortcutId((current) => (current === entry.id ? null : entry.id))
                                    }
                                    onCapture={(accelerator) => updateShortcutBinding(entry.id, accelerator)}
                                    onClear={() => clearShortcutBinding(entry.id)}
                                    onRestoreDefault={() => restoreShortcutBinding(entry.id)}
                                  />
                                </SettingRow>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </>
                  )}
                  {section !== "editor" && section !== "shortcuts" && (
                    <>
                      <SettingRow title="保持极简默认值" description="这一页的高级配置会在后续版本逐步展开">
                        <Square size={18} className="text-slate-400" />
                      </SettingRow>
                      <SettingRow title="当前策略" description="先保证写作主路径顺滑，再开放低频细项">
                        <Check size={18} className="text-emerald-600" />
                      </SettingRow>
                    </>
                  )}
                </div>
              </section>
            )}
            </div>
          </div>
    </div>
  );
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

  const resolveReferencedDocumentsFromMessage = (message: string) =>
    documentLookupIndex ? resolveReferencedDocuments(message, documentLookupIndex) : [];

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
                  (action) => ({ ...action, output: `${action.output ?? ""}${event.outputDelta}` })
                )
              };
            }
            if (event.type === "tool_done") {
              return {
                ...item,
                actions: updateSessionActionByToolId(
                  item.actions,
                  event.toolId,
                  (action) => ({ ...action, status: event.status ?? "done", output: event.output ?? action.output })
                )
              };
            }
            if (event.type === "approval_resolved") {
              return {
                ...item,
                actions: updateSessionActionByToolId(
                  item.actions,
                  event.toolId,
                  (action) => ({ ...action, status: event.status, output: event.output ?? action.output })
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
