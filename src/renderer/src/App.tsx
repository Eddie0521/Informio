import { Component, Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ComponentType,
  DragEvent as ReactDragEvent,
  ErrorInfo,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent
} from "react";
import type { Editor } from "@tiptap/core";
import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import katex from "katex";
import { common, createLowlight } from "lowlight";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import * as YAML from "yaml";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Bot,
  Bookmark,
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
  History,
  ImageIcon,
  Info,
  Keyboard,
  LayoutList,
  Loader2,
  Maximize2,
  Music,
  Pencil,
  Palette,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Shield,
  Square,
  Text,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import type {
  ApiProviderKind,
  AgentApprovalDecision,
  AgentConversation,
  AgentConversationMessage,
  AgentConnection,
  AgentModel,
  AgentPermissionMode,
  AgentProvider,
  AgentSessionAction,
  AgentSessionStatus,
  AppInfo,
  AppData,
  AppSettings,
  FileSystemOperationInput,
  InformioFolder,
  InformioDocument,
  InformioProject,
  MenuCommand,
  PdfAnnotation,
  PdfAnnotationRect,
  PdfAnnotationSelection,
  PdfMarkdownTarget,
  ThemeName,
  UpdaterState
} from "../../shared/types";
import { DEFAULT_CUSTOM_THEME_COLOR } from "../../shared/theme";
import { buildWorkspaceScopeId } from "../../shared/workspaceScope";
import { cn } from "./lib/utils";
import "katex/dist/katex.min.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

const updaterStateTone: Record<UpdaterState["status"], string> = {
  idle: "text-[var(--text-muted)]",
  checking: "text-amber-700",
  available: "text-emerald-700",
  downloading: "text-emerald-700",
  downloaded: "text-emerald-700",
  "up-to-date": "text-[var(--text-muted)]",
  error: "text-red-700"
};

const updaterStateSummary = (state: UpdaterState) => {
  if (state.message?.trim()) return state.message.trim();
  switch (state.status) {
    case "checking":
      return "正在检查更新...";
    case "available":
      return state.version ? `发现新版本 ${state.version}，正在下载...` : "发现新版本，正在下载...";
    case "downloading":
      return typeof state.progress === "number" ? `正在下载更新 ${Math.round(state.progress)}%...` : "正在下载更新...";
    case "downloaded":
      return state.version ? `新版本 ${state.version} 已下载，重启后安装。` : "更新已下载，重启后安装。";
    case "up-to-date":
      return "当前已经是最新版本。";
    case "error":
      return "检查更新失败，请稍后重试。";
    default:
      return "自动更新尚未检查。";
  }
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

type SidebarMode = "files" | "outline" | "properties";

type OutlineItem = {
  id: string;
  title: string;
  level: number;
  line: number;
  order: number;
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
  rects?: PdfAnnotationRect[];
  overlayLeft?: number;
  overlayTop?: number;
};

type ToolbarTranslateState = {
  status: "idle" | "loading" | "done" | "error";
  response: string;
  error?: string;
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

const samePdfRects = (left: PdfAnnotationRect[] | undefined, right: PdfAnnotationRect[] | undefined) => {
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
    samePdfRects(left.rects, right.rects)
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
  return actions.map((action, actionIndex) => (actionIndex === index ? merged : action));
};

type EditorPaneState = {
  id: "main" | "secondary";
  documentId: string;
};

type EditorViewMode = "rich-text" | "source";

type SplitDirection = "horizontal" | "vertical";

type EditorDropZone = "left" | "right" | "top" | "bottom";

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
  default: "默认权限",
  full_access: "完全权限"
};

const agentPermissionModes: AgentPermissionMode[] = ["read_only", "default", "full_access"];

const sessionStatusLabel: Record<AgentSessionStatus, string> = {
  idle: "空闲",
  thinking: "思考中",
  "tool-executing": "执行工具",
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

type CommandPaletteItem = {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

const normalizePath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

const pathBaseName = (path: string) => normalizePath(path).split("/").filter(Boolean).at(-1) ?? path;

const pathDirName = (path: string) => normalizePath(path).split("/").slice(0, -1).join("/") || path;

const pathExtName = (path: string) => {
  const base = pathBaseName(path);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
};

const pathContains = (folder: string, path: string) => {
  const normalizedFolder = normalizePath(folder);
  const normalizedPath = normalizePath(path);
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

const isImageFile = (path?: string) => {
  if (!path) return false;
  return imageExtensions.has(path.split(".").pop()?.toLowerCase() ?? "");
};

const isPdfFile = (path?: string) => {
  if (!path) return false;
  return pdfExtensions.has(path.split(".").pop()?.toLowerCase() ?? "");
};

const videoExtensions = new Set(["mp4", "mov", "webm"]);
const audioExtensions = new Set(["mp3", "wav", "m4a", "ogg"]);
const lowlight = createLowlight(common);
lowlight.registerAlias({
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  markdown: ["md"],
  shell: ["sh", "zsh"],
  xml: ["html"]
});

const codeLanguageOptions = [
  "plaintext",
  "markdown",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "html",
  "css",
  "json",
  "bash",
  "python",
  "sql",
  "yaml"
] as const;
let mermaidInitialized = false;

const isVideoFile = (path?: string) => {
  if (!path) return false;
  return videoExtensions.has(path.split(".").pop()?.toLowerCase() ?? "");
};

const isAudioFile = (path?: string) => {
  if (!path) return false;
  return audioExtensions.has(path.split(".").pop()?.toLowerCase() ?? "");
};

const isEmbeddableAssetFile = (path?: string) =>
  isPdfFile(path) || isImageFile(path) || isVideoFile(path) || isAudioFile(path);

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
};

type MarkdownHelperLike = {
  createTextNode: (text: string) => unknown;
  createNode: (name: string, attrs?: Record<string, unknown>, content?: unknown[]) => unknown;
};

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
  if (name === "detailsBlock") return "<details>\n<summary>Summary</summary>\n\nContent\n\n</details>";
  return "> [!NOTE]\n> Important note";
};

const sourceText = (node: ReactNodeViewProps["node"]) => {
  const attrs = node.attrs as { source?: string };
  return node.textContent || attrs.source || defaultBlockSource(node.type.name);
};

const jsonTextContent = (node?: JSONContent): string =>
  node?.text ?? node?.content?.map((child) => jsonTextContent(child)).join("") ?? "";

const jsonSourceText = (node: JSONContent, fallbackType: string) =>
  jsonTextContent(node) || (node.attrs as { source?: string } | undefined)?.source || defaultBlockSource(fallbackType);

const sourceContent = (source: string, h: MarkdownHelperLike) => [h.createTextNode(source)];

const mathTextFromSource = (source: string) => {
  const trimmed = source.trim();
  const match =
    trimmed.match(/^\$\$\s*\n?([\s\S]*?)\n?\$\$$/) ??
    trimmed.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
  return (match?.[1] ?? source).trim();
};

const chartTextFromSource = (source: string) => {
  const match = source.trim().match(/^```mermaid[^\n]*\n([\s\S]*?)\n```$/);
  return (match?.[1] ?? source).trim();
};

const footnoteFromSource = (source: string) => {
  const match = source.trim().match(/^\[\^([^\]]+)]:\s*([\s\S]*)$/);
  return { index: match?.[1] ?? "1", text: match?.[2]?.trim() ?? source.trim() };
};

const detailsFromSource = (source: string) => {
  const match = source
    .trim()
    .match(/^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>$/i);
  return { summary: plainText(match?.[1] ?? "Summary"), text: plainText(match?.[2] ?? source.trim()) };
};

const calloutFromSource = (source: string) => {
  const match = source.trim().match(/^>\s*\[!([A-Za-z0-9_-]+)]\s*\n?([\s\S]*)$/);
  const title = (match?.[1] ?? "NOTE").toUpperCase();
  const text = (match?.[2] ?? source)
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

const highlightedCodeHtml = (language: string, code: string) => {
  try {
    const tree = language && language !== "plaintext" ? lowlight.highlight(language, code) : lowlight.highlightAuto(code);
    return tree.children.map((child) => hastToHtml(child as LowlightNode)).join("");
  } catch {
    return escapeHtml(code);
  }
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
  const language = String(node.attrs.language || "plaintext");
  const active = useNodeLivePreviewState(editor, getPos, node, selected);
  const previewHtml = highlightedCodeHtml(language, node.textContent);
  const updateLanguageFromFence = (value: string) => {
    const nextLanguage = value.replace(/^```/, "").trim() || "plaintext";
    if (nextLanguage !== language) updateAttributes({ language: nextLanguage });
  };

  return (
    <NodeViewWrapper
      className={cn("informio-code-block", active && "is-editing")}
      onMouseDown={(event: ReactMouseEvent) => {
        if (active) return;
        event.preventDefault();
        focusNodeSource(editor, getPos);
      }}
    >
      <div className={cn("informio-code-source", !active && "is-hidden-source-content")}>
        <div
          className="informio-source-fence"
          contentEditable={active}
          suppressContentEditableWarning
          onInput={(event) => updateLanguageFromFence(event.currentTarget.textContent ?? "")}
          onBlur={(event) => updateLanguageFromFence(event.currentTarget.textContent ?? "")}
        >
          {`${"```"}${language === "plaintext" ? "" : language}`}
        </div>
        <NodeViewContent as={"pre" as "div"} className="informio-code-source-content" />
        <div className="informio-source-fence">```</div>
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
  const source = sourceText(node) || String((node.attrs as { source?: string }).source || "$x$");
  const formula = mathTextFromSource(source);
  const moveOutAtSourceEdge = (event: ReactKeyboardEvent) => {
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

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(({ default: mermaid }) => {
        if (!mermaidInitialized) {
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
          mermaidInitialized = true;
        }
        return mermaid.render(id, chartTextFromSource(source));
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
  }, [id, source]);

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
      <p>{callout.text}</p>
    </div>
  );
}

function EditableSourceBlockView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const focusKey = (node.attrs as { focusKey?: string }).focusKey;
  const active = useNodeLivePreviewState(editor, getPos, node, selected);
  const source = sourceText(node);

  useEffect(() => {
    if (focusKey) {
      window.setTimeout(() => focusNodeSource(editor, getPos), 0);
    }
  }, [editor, focusKey, getPos]);

  return (
    <NodeViewWrapper
      className={cn("informio-source-block", active && "is-editing")}
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
      const match = src.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
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
      mathTextFromSource(node.textContent || node.attrs.source)
    ];
  },
  renderMarkdown(node: { attrs?: { source?: string } }) {
    return jsonSourceText(node as JSONContent, "mathInline");
  },
  addInputRules() {
    return [
      new InputRule({
        find: /(^|[^\$])\$([^\n$]+?)\$$/,
        handler: ({ match, range, chain }) => {
          const prefix = match[1] ?? "";
          const content = match[2]?.trim() ?? "";
          if (!content || /^\d+(?:\.\d+)?$/.test(content)) return;
          const source = `$${match[2]}$`;
          const from = range.from + prefix.length;
          chain()
            .deleteRange({ from, to: range.to })
            .insertContent({ type: "mathInline", attrs: { source }, content: [{ type: "text", text: source }] })
            .setTextSelection(from + 1 + source.length)
            .run();
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
    const source = node.textContent || (node.attrs as { source?: string }).source || defaultBlockSource("mathBlock");
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
    const source = node.textContent || (node.attrs as { source?: string }).source || defaultBlockSource("chartBlock");
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
      return src.match(/^<(video|audio)\b/im)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^<(video|audio)\b([^>]*)><\/\1>(?:\n|$)/i);
      if (!match) return undefined;
      return {
        type: "mediaBlock",
        raw: match[0],
        kind: match[1].toLowerCase(),
        src: parseHtmlAttr(match[2], "src"),
        title: parseHtmlAttr(match[2], "title") || "Media"
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

    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-type": "media-block", class: "informio-media-block" }),
      [kind, { controls: "", src: node.attrs.src || "", class: "informio-media" }],
      ["figcaption", {}, node.attrs.title || "Media"]
    ];
  },
  addNodeView() {
    return ({ node }: { node: { attrs: { kind: string; src: string; title: string } } }) => {
      const kind = node.attrs.kind === "audio" ? "audio" : "video";
      const wrapper = document.createElement("figure");
      wrapper.setAttribute("data-type", "media-block");
      wrapper.className = "informio-media-block";
      wrapper.contentEditable = "false";

      const media = document.createElement(kind);
      media.setAttribute("controls", "");
      media.setAttribute("src", node.attrs.src || "");
      media.className = "informio-media";
      wrapper.appendChild(media);

      const caption = document.createElement("figcaption");
      caption.textContent = node.attrs.title || "Media";
      wrapper.appendChild(caption);

      return { dom: wrapper };
    };
  },
  renderMarkdown(node: { attrs?: { kind?: string; src?: string; title?: string } }) {
    const kind = node.attrs?.kind === "audio" ? "audio" : "video";
    const title = escapeHtml(node.attrs?.title ?? "Media");
    const src = escapeHtml(node.attrs?.src ?? "");
    return `\n<${kind} controls src="${src}" title="${title}"></${kind}>\n`;
  }
} as never);

type PdfSelectionState = PdfAnnotationSelection & {
  left: number;
  top: number;
};

type PdfEditorContextValue = {
  document: InformioDocument;
  settings: AppSettings;
  markdownTarget: PdfMarkdownTarget | null;
  focusAnnotationId: string | null;
  toolbarEnabled: boolean;
  toolbarTranslate: ToolbarTranslateState;
  onPdfSelection: (selection: PdfSelectionState | null) => void;
  onTranslateSelection: (selection: AgentSelection) => void;
  onClearToolbarTranslate: () => void;
  onRegisterPdfAnnotation: (annotation: PdfAnnotation) => void;
  onDeletePdfAnnotation: (annotationId: string) => void;
  onInsertPdfBacklink: (annotation: PdfAnnotation) => void;
  onOpenMarkdownTarget: (target: PdfMarkdownTarget) => void;
};

type PdfAnnotationMenuState = {
  annotation: PdfAnnotation;
  left: number;
  top: number;
};

const pdfAnnotationColors = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74"];

const PdfEditorContext = createContext<PdfEditorContextValue | null>(null);

const usePdfEditorContext = () => useContext(PdfEditorContext);

const fingerprintForPdf = (pdf: PDFDocumentProxy | null, fallback: string) => {
  const fingerprints = (pdf as (PDFDocumentProxy & { fingerprints?: string[] }) | null)?.fingerprints;
  return fingerprints?.[0] || fallback;
};

const rectStyle = (rect: PdfAnnotationRect): React.CSSProperties => ({
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.width * 100}%`,
  height: `${rect.height * 100}%`
});

function PdfPageCanvas({
  pdf,
  pageNumber,
  frameWidth,
  zoom,
  annotations
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  frameWidth: number;
  zoom: number;
  annotations: PdfAnnotation[];
}) {
  const pdfContext = usePdfEditorContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [rendered, setRendered] = useState(false);
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rendered) return;
    let cancelled = false;
    setPdfPage(null);
    setError(null);
    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (!cancelled) setPdfPage(page);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, rendered]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setRendered(true);
      },
      { rootMargin: "640px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!rendered || !pdfPage || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    textLayerTaskRef.current?.cancel();
    textLayerTaskRef.current = null;
    if (textLayer) textLayer.replaceChildren();
    setError(null);

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const fitScale = frameWidth ? clamp((frameWidth - 32) / baseViewport.width, 0.35, 3) : 1;
    const targetScale = clamp(fitScale * zoom, 0.35, 4);
    const viewport = pdfPage.getViewport({ scale: targetScale });
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    setPageSize({ width: viewport.width, height: viewport.height });
    context.clearRect(0, 0, canvas.width, canvas.height);

    const task = pdfPage.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
    });
    renderTaskRef.current = task;
    if (textLayer) {
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      const TextLayer = (pdfjsLib as typeof pdfjsLib & {
        TextLayer: new (options: { textContentSource: ReadableStream | Awaited<ReturnType<PDFPageProxy["getTextContent"]>>; container: HTMLElement; viewport: ReturnType<PDFPageProxy["getViewport"]> }) => {
          render: () => Promise<unknown>;
          cancel: () => void;
        };
      }).TextLayer;
      const layer = new TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: textLayer,
        viewport
      });
      textLayerTaskRef.current = layer;
      void layer.render().catch((reason: unknown) => {
        if (!cancelled && !(reason instanceof Error && reason.name === "AbortException")) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    }
    task.promise
      .catch((reason: unknown) => {
        if (!cancelled && !(reason instanceof Error && reason.name === "RenderingCancelledException")) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      });

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
        textLayerTaskRef.current?.cancel();
      } catch {
        // PDF.js may already have completed or cancelled the task while switching documents.
      }
    };
  }, [frameWidth, pdfPage, rendered, zoom]);

  return (
    <div
      ref={wrapperRef}
      className="informio-pdf-page"
      data-page-number={pageNumber}
      style={pageSize ? { width: pageSize.width, height: pageSize.height } : undefined}
    >
      {error ? <div className="informio-pdf-message is-error">{error}</div> : null}
      {rendered ? (
        <>
          <canvas ref={canvasRef} className="informio-pdf-canvas" />
          <div ref={textLayerRef} className="textLayer informio-pdf-text-layer" />
          <div className="informio-pdf-annotation-layer">
            {annotations.map((annotation) =>
              annotation.rects.map((rect, index) => (
                <span
                  key={`${annotation.id}-${index}`}
                  data-annotation-id={annotation.id}
                  className={cn("informio-pdf-annotation", `is-${annotation.type}`)}
                  style={{ ...rectStyle(rect), "--annotation-color": annotation.color } as React.CSSProperties}
                  title={annotation.comment || annotation.text}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (annotation.markdownTarget) {
                      pdfContext?.onOpenMarkdownTarget(annotation.markdownTarget);
                      return;
                    }
                    if (annotation.comment) window.alert(annotation.comment);
                  }}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <div className="informio-pdf-page-placeholder" />
      )}
    </div>
  );
}

function PdfBlockView({ node }: ReactNodeViewProps) {
  const src = String((node.attrs as { src?: string }).src ?? "");
  const title = String((node.attrs as { title?: string }).title ?? "PDF");
  const pdfContext = usePdfEditorContext();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [zoom, setZoom] = useState(1);
  const [frameWidth, setFrameWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [selection, setSelection] = useState<PdfSelectionState | null>(null);
  const [annotationMenu, setAnnotationMenu] = useState<PdfAnnotationMenuState | null>(null);
  const [selectedColor, setSelectedColor] = useState(pdfAnnotationColors[0]);
  const [notice, setNotice] = useState<string | null>(null);
  const pdfPath = localFilePathFromUrl(src);
  const fingerprint = fingerprintForPdf(pdf, src);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver((entries) => {
      setFrameWidth(entries[0]?.contentRect.width ?? 0);
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    setPdf(null);
    setZoom(1);
    setLoading(true);
    setError(null);

    const loadingTask = pdfjsLib.getDocument(src);
    loadingTask.promise
      .then((document) => {
        loadedDocument = document;
        if (cancelled) {
          void document.destroy();
          return;
        }
        setPdf(document);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => undefined);
      if (loadedDocument) void loadedDocument.destroy().catch(() => undefined);
    };
  }, [src]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    window.informio
      .loadPdfAnnotations({ pdfPath, fingerprint })
      .then((items) => {
        if (!cancelled) {
          setAnnotations(items);
          items.forEach((annotation) => pdfContext?.onRegisterPdfAnnotation(annotation));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setNotice(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [fingerprint, pdf, pdfContext, pdfPath]);

  useEffect(() => {
    if (!pdfContext?.focusAnnotationId) return;
    const element = frameRef.current?.querySelector(`[data-annotation-id="${CSS.escape(pdfContext.focusAnnotationId)}"]`);
    if (element) {
      element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      (element as HTMLElement).classList.add("is-focused");
      window.setTimeout(() => (element as HTMLElement).classList.remove("is-focused"), 1400);
    }
  }, [annotations, pdfContext?.focusAnnotationId]);

  const pageCount = pdf?.numPages ?? 0;
  const clearPdfSelection = () => {
    setSelection(null);
    pdfContext?.onPdfSelection(null);
    pdfContext?.onClearToolbarTranslate();
  };
  const translatePdfSelection = () => {
    if (!selection || !pdfContext) return;
    pdfContext.onTranslateSelection({
      kind: "pdf",
      documentId: pdfContext.document.id,
      from: -1,
      to: -1,
      text: selection.text,
      markdown: `PDF: ${title}\nPage: ${selection.page}\n\n${selection.text}`,
      title,
      filePath: pdfPath,
      page: selection.page,
      rects: selection.rects,
      overlayLeft: selection.left,
      overlayTop: selection.top - 54
    });
  };
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    setZoom((value) => clamp(value + delta, 0.45, 3));
  };

  const captureSelection = () => {
    const frame = frameRef.current;
    if (!frame || !pdf) return;
    const browserSelection = window.getSelection();
    const text = browserSelection?.toString().trim() ?? "";
    if (!browserSelection || !text || browserSelection.rangeCount === 0) {
      if (isSelectionToolbarInteractionActive()) return;
      clearPdfSelection();
      return;
    }
    const anchorNode = browserSelection.anchorNode;
    if (!anchorNode || !frame.contains(anchorNode)) return;
    const range = browserSelection.getRangeAt(0);
    const firstPage = (range.startContainer.parentElement ?? range.commonAncestorContainer.parentElement)?.closest?.(".informio-pdf-page") as HTMLElement | null;
    if (!firstPage) return;
    const page = Number(firstPage.dataset.pageNumber || "1");
    const pageRect = firstPage.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .map((rect) => {
        const left = Math.max(rect.left, pageRect.left);
        const right = Math.min(rect.right, pageRect.right);
        const top = Math.max(rect.top, pageRect.top);
        const bottom = Math.min(rect.bottom, pageRect.bottom);
        if (right <= left || bottom <= top) return null;
        return {
          x: clamp((left - pageRect.left) / pageRect.width, 0, 1),
          y: clamp((top - pageRect.top) / pageRect.height, 0, 1),
          width: clamp((right - left) / pageRect.width, 0, 1),
          height: clamp((bottom - top) / pageRect.height, 0, 1)
        };
      })
      .filter((rect): rect is PdfAnnotationRect => Boolean(rect));
    if (!rects.length) return;
    const frameRect = frame.getBoundingClientRect();
    const lastRect = range.getBoundingClientRect();
    const nextSelection: PdfSelectionState = {
      pdfPath,
      fingerprint,
      title,
      page,
      text,
      rects,
      left: clamp(lastRect.left - frameRect.left + frame.scrollLeft, 8, Math.max(8, frame.scrollLeft + frameRect.width - 260)),
      top: Math.max(8, lastRect.top - frameRect.top + frame.scrollTop - 42)
    };
    setSelection(nextSelection);
    setAnnotationMenu(null);
    pdfContext?.onPdfSelection(nextSelection);
  };

  const openAnnotationMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame || window.getSelection()?.toString().trim()) return;
    if ((event.target as HTMLElement).closest(".informio-pdf-selection-popover, .informio-pdf-annotation-menu")) return;
    const pageElement = (event.target as HTMLElement).closest(".informio-pdf-page") as HTMLElement | null;
    if (!pageElement) {
      setAnnotationMenu(null);
      return;
    }
    const page = Number(pageElement.dataset.pageNumber || "1");
    const rect = pageElement.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const hit = annotations
      .filter((annotation) => annotation.page === page)
      .filter((annotation) =>
        annotation.rects.some((annotationRect) => {
          const padding = 0.006;
          return (
            x >= annotationRect.x - padding &&
            x <= annotationRect.x + annotationRect.width + padding &&
            y >= annotationRect.y - padding &&
            y <= annotationRect.y + annotationRect.height + padding
          );
        })
      )
      .sort((a, b) => {
        const area = (annotation: PdfAnnotation) =>
          annotation.rects.reduce((sum, item) => sum + item.width * item.height, 0);
        return area(a) - area(b);
      })[0];
    if (!hit) {
      setAnnotationMenu(null);
      return;
    }
    const frameRect = frame.getBoundingClientRect();
    clearPdfSelection();
    setAnnotationMenu({
      annotation: hit,
      left: clamp(event.clientX - frameRect.left + frame.scrollLeft, 8, Math.max(8, frame.scrollLeft + frameRect.width - 260)),
      top: Math.max(8, event.clientY - frameRect.top + frame.scrollTop - 42)
    });
  };

  const saveAnnotation = async (type: PdfAnnotation["type"]) => {
    if (!selection || !pdfContext) return;
    const now = new Date().toISOString();
    const markdownTarget = type === "link" ? pdfContext.markdownTarget ?? undefined : undefined;
    const comment = type === "comment" ? window.prompt("批注", "")?.trim() : undefined;
    if (type === "comment" && !comment) return;
    const annotation: PdfAnnotation = {
      id: `pdf-annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      pdfPath,
      fingerprint,
      page: selection.page,
      type,
      color: selectedColor,
      rects: selection.rects,
      text: selection.text,
      comment,
      markdownTarget,
      createdAt: now,
      updatedAt: now
    };
    const result = await window.informio.savePdfAnnotation({
      annotation,
      writeToSource: pdfContext.settings.editor.writePdfAnnotationsToSource
    });
    setAnnotations((items) => [...items.filter((item) => item.id !== result.annotation.id), result.annotation]);
    pdfContext.onRegisterPdfAnnotation(result.annotation);
    if (type === "link") pdfContext.onInsertPdfBacklink(result.annotation);
    if (result.sourceWrite?.attempted && !result.sourceWrite.ok) setNotice(result.sourceWrite.message ?? "源 PDF 写回失败，已保存在本地标注数据。");
    clearPdfSelection();
    setAnnotationMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const deleteAnnotation = async (annotation: PdfAnnotation) => {
    const result = await window.informio.deletePdfAnnotation({
      pdfPath,
      fingerprint,
      annotationId: annotation.id
    });
    setAnnotations((items) => items.filter((item) => item.id !== annotation.id));
    pdfContext?.onDeletePdfAnnotation(annotation.id);
    setAnnotationMenu(null);
    if (result.sourceWrite?.attempted && !result.sourceWrite.ok) {
      setNotice(result.sourceWrite.message ?? "已删除本地标注数据；源 PDF 中已写入的视觉痕迹无法自动擦除。");
    }
  };

  const pageAnnotations = useMemo(() => {
    const byPage = new Map<number, PdfAnnotation[]>();
    annotations.forEach((annotation) => {
      byPage.set(annotation.page, [...(byPage.get(annotation.page) ?? []), annotation]);
    });
    return byPage;
  }, [annotations]);

  return (
    <NodeViewWrapper className="informio-pdf-block" contentEditable={false}>
      <div
        ref={frameRef}
        className="informio-pdf-frame"
        aria-label={title}
        onWheel={handleWheel}
        onClick={openAnnotationMenu}
      onMouseUp={(event) => {
        if ((event.target as HTMLElement).closest(selectionToolbarSafeAreaSelector)) return;
        window.setTimeout(captureSelection, 0);
      }}
      onKeyUp={() => window.setTimeout(captureSelection, 0)}
      >
        {loading ? <div className="informio-pdf-message">Loading PDF...</div> : null}
        {error ? <div className="informio-pdf-message is-error">{error}</div> : null}
        {notice ? (
          <button type="button" className="informio-pdf-notice" onClick={() => setNotice(null)}>
            {notice}
          </button>
        ) : null}
        {pdf && pageCount
          ? Array.from({ length: pageCount }, (_, index) => (
              <PdfPageCanvas
                key={`${src}:${index + 1}`}
                pdf={pdf}
                pageNumber={index + 1}
                frameWidth={frameWidth}
                zoom={zoom}
                annotations={pageAnnotations.get(index + 1) ?? []}
              />
            ))
          : null}
        {selection ? (
          <div
            className="informio-pdf-selection-popover"
            style={{ left: selection.left, top: selection.top }}
            data-selection-toolbar-safe-area="true"
            onMouseDownCapture={markSelectionToolbarInteraction}
          >
            <div className="informio-pdf-color-row">
              {pdfAnnotationColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`颜色 ${color}`}
                  className={cn("informio-pdf-color", color === selectedColor && "is-selected")}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
            <button type="button" onClick={() => saveAnnotation("highlight")}>高亮</button>
            <button type="button" onClick={() => saveAnnotation("underline")}>下划线</button>
            <button type="button" onClick={() => saveAnnotation("comment")}>批注</button>
            <button type="button" onClick={() => saveAnnotation("link")} disabled={!pdfContext?.markdownTarget}>
              链接
            </button>
            <SelectionTranslateSection
              variant="pdf"
              enabled={Boolean(pdfContext?.toolbarEnabled)}
              busy={pdfContext?.toolbarTranslate.status === "loading"}
              response={pdfContext?.toolbarTranslate.response ?? ""}
              error={pdfContext?.toolbarTranslate.error}
              onTranslate={translatePdfSelection}
            />
          </div>
        ) : null}
        {annotationMenu ? (
          <div className="informio-pdf-annotation-menu" style={{ left: annotationMenu.left, top: annotationMenu.top }}>
            <div className="informio-pdf-annotation-menu-title">
              {annotationMenu.annotation.type === "highlight"
                ? "高亮"
                : annotationMenu.annotation.type === "underline"
                  ? "下划线"
                  : annotationMenu.annotation.type === "comment"
                    ? "批注"
                    : "链接"}
            </div>
            {annotationMenu.annotation.comment ? <div className="informio-pdf-annotation-menu-comment">{annotationMenu.annotation.comment}</div> : null}
            {annotationMenu.annotation.markdownTarget ? (
              <button type="button" onClick={() => pdfContext?.onOpenMarkdownTarget(annotationMenu.annotation.markdownTarget!)}>
                打开 Markdown
              </button>
            ) : null}
            <button type="button" className="is-danger" onClick={() => deleteAnnotation(annotationMenu.annotation)}>
              删除
            </button>
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

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
    const title = escapeHtml(node.attrs?.title ?? "PDF");
    const src = escapeHtml(node.attrs?.src ?? "");
    return `\n<iframe data-type="pdf" src="${src}" title="${title}"></iframe>\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(PdfBlockView);
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
      return src.match(/^<details\b/im)?.index ?? -1;
    },
    tokenize(src: string) {
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
    const source = node.textContent || (node.attrs as { source?: string }).source || defaultBlockSource("detailsBlock");
    const details = detailsFromSource(source);
    return [
      "details",
      mergeAttributes(HTMLAttributes, { "data-type": "details-block", class: "informio-details-block", open: "true" }),
      ["summary", {}, details.summary],
      ["p", {}, details.text]
    ];
  },
  renderMarkdown(node: { attrs?: { summary?: string; text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "detailsBlock")}\n`;
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
      return src.match(/^>\s*\[![A-Za-z0-9_-]+]/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^>\s*\[!([A-Za-z0-9_-]+)]\s*\n((?:>\s?.*(?:\n|$))+)/);
      if (!match) return undefined;
      return {
        type: "calloutBlock",
        raw: match[0],
        title: match[1],
        text: match[2]
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
    const source = node.textContent || (node.attrs as { source?: string }).source || defaultBlockSource("calloutBlock");
    const callout = calloutFromSource(source);
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-type": "callout-block", class: "informio-callout-block" }),
      ["strong", {}, normalizeCalloutTitle(callout.title)],
      ["p", {}, callout.text]
    ];
  },
  renderMarkdown(node: { attrs?: { title?: string; text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "calloutBlock")}\n`;
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
    const source = node.textContent || (node.attrs as { source?: string }).source || defaultBlockSource("footnoteBlock");
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

const isMarkdownTableSeparator = (line: string, expectedCells: number) => {
  const cells = parseMarkdownTableRow(line);
  return Boolean(cells && cells.length === expectedCells && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
};

const createTableFromMarkdown = (schema: ProseMirrorSchemaLike, lines: string[]) => {
  const header = parseMarkdownTableRow(lines[0]);
  if (!header || !isMarkdownTableSeparator(lines[1], header.length)) return null;
  const dataRows = lines.slice(2).map(parseMarkdownTableRow).filter((row): row is string[] => Boolean(row && row.length === header.length));
  const rows = [header, ...(dataRows.length ? dataRows : [header.map(() => "")])];

  return schema.nodes.table.create(
    null,
    rows.map((cells, rowIndex) =>
      schema.nodes.tableRow.create(
        null,
        cells.map((cell) => {
          const cellType = rowIndex === 0 ? schema.nodes.tableHeader : schema.nodes.tableCell;
          return cellType.create(null, schema.nodes.paragraph.create(null, textContentNode(schema, cell)));
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
    if (node.isTextblock || node.type.name === "blockquote") {
      blocks.push({ node, pos: offset, text: node.textContent });
    }
  });
  return blocks;
};

const calloutSourceFromBlockquote = (node: ProseMirrorNodeLike) => {
  const lines: string[] = [];
  node.forEach((child) => {
    if (child.isTextblock) lines.push(`> ${child.textContent}`);
  });
  const source = lines.join("\n").trim();
  const match = source.match(/^>\s*\[!([A-Za-z0-9_-]+)]/);
  const title = normalizeCalloutTitle(match?.[1] ?? "NOTE");
  return calloutTypes.has(title) && source ? { source, title } : null;
};

const markdownAutoBlockMatch = (schema: ProseMirrorSchemaLike, doc: ProseMirrorNodeLike): MarkdownAutoBlockMatch | null => {
  const blocks = topLevelTextBlocks(doc);

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const text = block.text.trim();
    if (!text) continue;

    if (block.node.type.name === "blockquote") {
      const callout = calloutSourceFromBlockquote(block.node);
      if (callout) {
        return {
          from: block.pos,
          to: block.pos + block.node.nodeSize,
          node: sourceBackedNode(schema, "calloutBlock", callout.source, { title: callout.title, text: calloutFromSource(callout.source).text }),
          selectionOffset: callout.source.length
        };
      }
      continue;
    }

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

    const callout = text.match(/^>\s*\[!([A-Za-z0-9_-]+)]/);
    const calloutTitle = normalizeCalloutTitle(callout?.[1] ?? "");
    if (callout && calloutTypes.has(calloutTitle)) {
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "calloutBlock", text, { title: calloutTitle, text: calloutFromSource(text).text }),
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

    const matches = Array.from(node.text.matchAll(/(^|[^\$])\$([^\n$]+?)\$(?!\$)/g));
    for (const match of matches) {
      const content = match[2]?.trim() ?? "";
      if (!content || /^\d+(?:\.\d+)?$/.test(content)) continue;
      const prefix = match[1] ?? "";
      const source = `$${match[2]}$`;
      const from = pos + (match.index ?? 0) + prefix.length;
      found = {
        from,
        to: from + source.length,
        node: schema.nodes.mathInline.create({ source }, textContentNode(schema, source)),
        selectionOffset: source.length
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
  const wantedSelection = match.selectionOffset === undefined ? insertedTo : match.from + 1 + match.selectionOffset;
  const selectionPosition = clamp(wantedSelection, match.from + 1, Math.max(match.from + 1, insertedTo - 1));
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

type RenameRequest =
  | (FileSystemOperationInput & { currentName: string; kind?: "filesystem" })
  | { kind: "project"; path: string; currentName: string };

type LinkRequest = {
  from: number;
  to: number;
  text: string;
  url: string;
};

const fallbackFolder = (path: string): InformioFolder => ({
  id: `folder-${path}`,
  title: pathBaseName(path),
  path,
  updatedAt: new Date().toISOString()
});

const treeNode = (folder: InformioFolder): FileTreeNode => ({ folder, documents: [], children: [], documentCount: 0 });

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
    { action: "reveal", label: "在 Finder 中打开", icon: ExternalLink }
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
  onRenameProject: (path: string, title: string) => void;
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
  const tree = useMemo(() => buildFileTree(folders, documents, projects), [documents, folders, projects]);
  const projectsByPath = useMemo(() => new Map(projects.map((project) => [normalizePath(project.path), project])), [projects]);

  useEffect(() => {
    setExpandedFolderKeys((current) => {
      if (current.size) return current;
      return new Set(projects.map((project) => normalizePath(project.path)));
    });
  }, [projects]);

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
      onRenameProject(request.path, nextName);
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
    const documentCount = node.documentCount;
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
            "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] font-bold text-[var(--text-muted)] transition-[background-color,color] hover:bg-white/65 hover:text-[var(--text-main)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
            isDropTarget && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/35"
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggleFolder(node.folder)}
          onDragOver={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropTarget({ path: folderKey, depth });
          }}
          onDragLeave={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer)) return;
            if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
            setDropTarget((current) => (current?.path === folderKey ? null : current));
          }}
          onDrop={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer)) return;
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
          <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--text-muted)]">{documentCount}</span>
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
                    "w-full rounded-md px-2.5 py-2 text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                    active
                      ? "bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(15,23,42,0.10)]"
                      : "hover:bg-white/75"
                  )}
                  style={{ paddingLeft: 8 + (depth + 1) * 14 }}
                >
                  <div className="flex items-center gap-2">
                    {isVideoFile(doc.filePath) ? (
                      <Film size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : isAudioFile(doc.filePath) ? (
                      <Music size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : isImageFile(doc.filePath) ? (
                      <ImageIcon size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : (
                      <FileText size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    )}
                    {isEditingFile
                      ? renderInlineRenameInput(
                          inlineRename,
                          "min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-2 ring-emerald-500/45"
                        )
                      : <span className="min-w-0 truncate text-[13px] font-bold text-[var(--text-main)]">{doc.title}</span>}
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
      <div className="space-y-2 overflow-y-auto px-3 py-3">
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

function RenameDialog({
  request,
  onClose,
  onConfirm
}: {
  request: RenameRequest | null;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setName(request.currentName);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [request]);

  const trimmedName = name.trim();
  const canSubmit = Boolean(trimmedName) && trimmedName !== request?.currentName;

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">
            {request?.kind === "project" ? "重命名项目" : request?.targetType === "folder" ? "重命名文件夹" : "重命名文件"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">输入新名称，确认后重命名磁盘上的项目。</Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) onConfirm(trimmedName);
            }}
          >
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
            />
            <div className="flex justify-end gap-2">
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

function LinkDialog({
  request,
  onClose,
  onConfirm
}: {
  request: LinkRequest | null;
  onClose: () => void;
  onConfirm: (input: { text: string; url: string }) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setText(request.text || "链接文字");
    setUrl(request.url);
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
              if (canSubmit) onConfirm({ text: trimmedText, url: trimmedUrl });
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

function OutlineList({
  document,
  width,
  onJump
}: {
  document: InformioDocument;
  width: number;
  onJump: (item: OutlineItem) => void;
}) {
  const outline = getDocumentOutline(document.markdown);

  return (
    <aside className="context-panel h-full shrink-0" style={{ width }}>
      <div className="flex h-[48px] items-center justify-between gap-2 border-b px-3">
        <div className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Outline</div>
        <ChevronDown size={16} className="text-slate-500" />
      </div>

      <div className="space-y-1.5 px-3 py-3">
        {outline.length ? (
          outline.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item)}
              className={cn(
                "w-full rounded-md px-3 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.99]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                index === 0 ? "bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(15,23,42,0.10)]" : "hover:bg-white/70",
                item.level > 1 && "pl-8"
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] font-extrabold text-[var(--text-muted)]">{`H${item.level}`}</span>
                <span className="min-w-0 truncate text-[13px] font-bold text-[var(--text-main)]">{item.title}</span>
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-lg bg-white px-4 py-3 text-sm leading-6 text-slate-500 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
            当前文档还没有标题。使用 Markdown 标题后会自动生成大纲。
          </div>
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

const buildPropertyGroups = (documents: InformioDocument[]): PropertyGroup[] => {
  const propertyMap = new Map<string, Map<string, InformioDocument[]>>();

  for (const document of documents) {
    const frontmatter = parseFrontmatter(document.markdown);
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
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(() => new Set(groups.map((group) => group.name)));
  const [expandedValues, setExpandedValues] = useState<Set<string>>(
    () => new Set(groups.flatMap((group) => group.values.map((item) => `${group.name}::${item.value}`)))
  );

  useEffect(() => {
    setExpandedProperties((current) => {
      const next = new Set(current);
      groups.forEach((group) => next.add(group.name));
      return next;
    });
    setExpandedValues((current) => {
      const next = new Set(current);
      groups.forEach((group) => {
        group.values.forEach((item) => next.add(`${group.name}::${item.value}`));
      });
      return next;
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
      <div className="flex h-[48px] items-center justify-between gap-2 border-b px-3">
        <div className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Properties</div>
        <Bookmark size={15} className="text-slate-500" />
      </div>

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
                  <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--text-main)]">{group.name}</span>
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
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{valueGroup.value}</span>
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
                                    <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--text-main)]">{document.title}</span>
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
        ) : (
          <div className="rounded-lg bg-white px-4 py-3 text-sm leading-6 text-slate-500 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
            当前工作区还没有可展示的 Property。只有带有效 frontmatter 的文档会出现在这里。
          </div>
        )}
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
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [newKey, setNewKey] = useState("");
  const entries = editableFrontmatterEntries(frontmatter.values);
  const rawOnly = Boolean(frontmatter.error) || hasRawOnlyFrontmatter(frontmatter.values);
  const hasProperties = entries.length > 0;

  const updateValues = (nextValues: Record<string, unknown>) => onChange(YAML.stringify(nextValues, { lineWidth: 0 }).trimEnd());
  const updateField = (key: string, value: unknown) => updateValues({ ...frontmatter.values, [key]: value });
  const removeField = (key: string) => {
    const nextValues = { ...frontmatter.values };
    delete nextValues[key];
    updateValues(nextValues);
  };

  return (
    <section className="informio-properties">
      <div className="informio-properties-header">
        <button
          type="button"
          className="informio-properties-toggle"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand properties" : "Collapse properties"}
          onClick={() => setIsCollapsed((current) => !current)}
        >
          <span>Properties</span>
          <ChevronDown size={13} className={cn("informio-properties-toggle-icon", isCollapsed && "is-collapsed")} />
        </button>
        {frontmatter.error ? <strong>{frontmatter.error}</strong> : null}
      </div>
      {isCollapsed ? null : rawOnly ? (
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
              const key = newKey.trim();
              if (!key) return;
              updateField(key, "");
              setNewKey("");
            }}
          >
            <input value={newKey} placeholder="New property" onChange={(event) => setNewKey(event.target.value)} />
            <button type="submit">Add</button>
          </form>
        </>
      )}
    </section>
  );
}

function EditorPane({
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
  markdownTarget,
  focusPdfAnnotationId,
  onRegisterPdfAnnotation,
  onDeletePdfAnnotation,
  onInsertPdfBacklink,
  onOpenPdfAnnotation,
  onOpenMarkdownTarget,
  onCompositionChange,
  toolbarEnabled,
  toolbarTranslate,
  onTranslateSelection,
  onClearToolbarTranslate
}: {
  document: InformioDocument;
  documents: InformioDocument[];
  settings: AppSettings;
  viewMode: EditorViewMode;
  outlineJumpRequest: OutlineJumpRequest | null;
  onOutlineJumpHandled: (request: OutlineJumpRequest) => void;
  onChange: (documentId: string, markdown: string, options?: { composing?: boolean }) => void;
  onOpenInternalLink: (documentId: string) => void;
  onCreateInternalLink: (title: string) => void;
  onSelection: (selection: AgentSelection | null) => void;
  markdownTarget: PdfMarkdownTarget | null;
  focusPdfAnnotationId: string | null;
  onRegisterPdfAnnotation: (annotation: PdfAnnotation) => void;
  onDeletePdfAnnotation: (annotationId: string) => void;
  onInsertPdfBacklink: (annotation: PdfAnnotation) => void;
  onOpenPdfAnnotation: (annotationId: string) => void;
  onOpenMarkdownTarget: (target: PdfMarkdownTarget) => void;
  onCompositionChange: (documentId: string, composing: boolean) => void;
  toolbarEnabled: boolean;
  toolbarTranslate: ToolbarTranslateState;
  onTranslateSelection: (selection: AgentSelection) => void;
  onClearToolbarTranslate: () => void;
}) {
  const composingRef = useRef(false);
  const applyingMarkdownAutoBlockRef = useRef(false);
  const markdownAutoBlockTimerRef = useRef<number | null>(null);
  const editorInstanceRef = useRef<Editor | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const syncedDocumentIdRef = useRef<string | null>(null);
  const markdownToolbarRef = useRef<AgentSelection | null>(null);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const [markdownToolbar, setMarkdownToolbar] = useState<AgentSelection | null>(null);
  const [wikiSuggest, setWikiSuggest] = useState<{ query: string; from: number; to: number; left: number; top: number } | null>(null);
  const [wikiIndex, setWikiIndex] = useState(0);
  const frontmatter = useMemo(() => parseFrontmatter(document.markdown), [document.markdown]);
  const editorMarkdown = frontmatter.body;
  const isReadOnlyDocument = isPdfFile(document.filePath ?? document.title);
  const isSourceMode = !isReadOnlyDocument && viewMode === "source";
  const documentLookupIndex = useMemo(() => buildDocumentLookupIndex(documents, document.id), [document.id, documents]);
  const documentLinkIndexKey = useMemo(
    () => documents.map((doc) => `${doc.id}:${doc.title}:${doc.filePath ?? ""}`).join("|"),
    [documents]
  );
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
      Image.configure({ HTMLAttributes: { class: "informio-image" } }),
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        enableClickSelection: true,
        openOnClick: false
      }),
      Table.configure({
        resizable: true,
        renderWrapper: true,
        handleWidth: 8,
        cellMinWidth: 88,
        lastColumnResizable: false,
        HTMLAttributes: { class: "informio-table" }
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      Underline,
      WikiLink.configure({
        documentLookupIndex,
        currentDocument: document,
        onOpen: onOpenInternalLink,
        onCreate: onCreateInternalLink
      }),
      MathInline,
      MathBlock,
      ChartBlock,
      MediaBlock,
      PdfBlock,
      DetailsBlock,
      CalloutBlock,
      FootnoteBlock,
      Markdown.configure({ indentation: { style: "space", size: settings.markdown.tabSize } }),
      Placeholder.configure({ placeholder: "开始写。需要 AI 时选中一段，或直接问右侧 Agent。" })
    ],
    [document, documentLookupIndex, onCreateInternalLink, onOpenInternalLink, settings.markdown.tabSize]
  );
  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: editorMarkdown,
      contentType: "markdown",
      editable: !isReadOnlyDocument,
      editorProps: {
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
                .setImage({ src: fileUrl(result.path), alt: result.fileName, title: result.fileName })
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
                onOpenPdfAnnotation(decodeURIComponent(href.slice("informio://pdf-annotation/".length)));
              } else if (href) {
                window.informio.openExternal(href);
              }
              return true;
            }
            return false;
          },
          mouseup: () => {
            if (isReadOnlyDocument) return false;
            const instance = editorInstanceRef.current;
            if (!instance || instance.isDestroyed) return false;
            scheduleMarkdownSelectionCapture(instance);
            return false;
          },
          keyup: () => {
            if (isReadOnlyDocument) return false;
            const instance = editorInstanceRef.current;
            if (!instance || instance.isDestroyed) return false;
            scheduleMarkdownSelectionCapture(instance);
            return false;
          },
          blur: () => false
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
        scheduleMarkdownSelectionCapture(editor);
      }
    },
    [document.id, documentLinkIndexKey, isReadOnlyDocument, settings.markdown.tabSize]
  );
  useEffect(() => {
    editorInstanceRef.current = editor;
    return () => {
      if (editorInstanceRef.current === editor) editorInstanceRef.current = null;
    };
  }, [editor]);

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
  }, [document.id]);

  useEffect(() => {
    setWikiSuggest(null);
    setLinkRequest(null);
    if (isSourceMode) {
      clearMarkdownToolbarState();
    }
  }, [isSourceMode]);

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
      const { from, to } = editor.state.selection;
      return from === to ? "" : editor.state.doc.textBetween(from, to, "\n");
    };
    const selectedRange = () => {
      const { from, to } = editor.state.selection;
      return { from, to };
    };
    const insertText = (text: string) => editor.chain().focus().insertContent(text).run();
    const wrapSelection = (before: string, after: string, placeholder: string) => {
      const text = selectedText() || placeholder;
      insertText(`${before}${text}${after}`);
    };
    const findInWindow = (text: string) => {
      (window as Window & { find?: (value: string) => boolean }).find?.(text);
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
      if (isReadOnlyDocument && command !== "edit:find-selection" && command !== "edit:find-next") return;
      switch (command) {
        case "edit:find-selection": {
          const text = selectedText();
          if (text) findInWindow(text);
          return;
        }
        case "edit:find-next":
          if (selectedText()) findInWindow(selectedText());
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
              content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }]
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
          const src = fileUrl(asset.path);
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
            editor
              .chain()
              .focus()
              .insertContent({ type: "pdfBlock", attrs: { src, title: name } })
              .createParagraphNear()
              .run();
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
              .insertContent({ type: "footnoteBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
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
              .insertContent({ type: "detailsBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
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
              .insertContent({ type: "calloutBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:legacy-math":
          editor
            .chain()
            .focus()
            .insertContent({ type: "mathBlock", attrs: { source: defaultBlockSource("mathBlock"), focusKey: String(Date.now()) } })
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-chart":
          editor
            .chain()
            .focus()
            .insertContent({ type: "chartBlock", attrs: { source: defaultBlockSource("chartBlock"), focusKey: String(Date.now()) } })
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-footnote":
          editor
            .chain()
            .focus()
            .insertContent({ type: "footnoteBlock", attrs: { source: defaultBlockSource("footnoteBlock"), focusKey: String(Date.now()) } })
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-details":
          editor
            .chain()
            .focus()
            .insertContent({ type: "detailsBlock", attrs: { source: defaultBlockSource("detailsBlock"), focusKey: String(Date.now()) } })
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-callout":
          editor
            .chain()
            .focus()
            .insertContent({ type: "calloutBlock", attrs: { source: defaultBlockSource("calloutBlock"), focusKey: String(Date.now()) } })
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
  }, [document.title, editor, isReadOnlyDocument]);

  const normalizeLinkHref = (value: string) => (/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);

  const applyLink = (input: { text: string; url: string }) => {
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
          marks: [{ type: "link", attrs: { href } }]
        }
      )
      .run();
    setLinkRequest(null);
  };
  const closeMarkdownToolbar = () => {
    clearMarkdownToolbarState();
  };

  const pdfContext = useMemo<PdfEditorContextValue>(
    () => ({
      document,
      settings,
      markdownTarget,
      focusAnnotationId: focusPdfAnnotationId,
      toolbarEnabled,
      toolbarTranslate,
      onPdfSelection: (selection) => {
        onSelection(
          selection
            ? {
                kind: "pdf",
                documentId: document.id,
                from: -1,
                to: -1,
                text: selection.text,
                markdown: `PDF: ${selection.title}\nPage: ${selection.page}\n\n${selection.text}`,
                title: selection.title,
                filePath: selection.pdfPath,
                page: selection.page,
                rects: selection.rects,
                overlayLeft: selection.left,
                overlayTop: selection.top - 54
              }
            : null
        );
      },
      onTranslateSelection,
      onClearToolbarTranslate,
      onRegisterPdfAnnotation,
      onDeletePdfAnnotation,
      onInsertPdfBacklink,
      onOpenMarkdownTarget
    }),
    [
      document,
      focusPdfAnnotationId,
      markdownTarget,
      onClearToolbarTranslate,
      onDeletePdfAnnotation,
      onInsertPdfBacklink,
      onOpenMarkdownTarget,
      onRegisterPdfAnnotation,
      onSelection,
      onTranslateSelection,
      settings,
      toolbarEnabled,
      toolbarTranslate
    ]
  );

  return (
    <main
      ref={shellRef}
      className={cn(
        "informio-editor-shell relative flex min-w-0 flex-1 justify-center",
        isReadOnlyDocument ? "is-pdf-document overflow-y-auto overflow-x-hidden" : "overflow-y-auto"
      )}
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
          "--editor-line-height": String(settings.editor.lineHeight)
        } as React.CSSProperties
      }
    >
      <div
        className={cn("w-full", isReadOnlyDocument ? "h-full" : "px-12 pb-24 pt-12 max-[780px]:px-5")}
        style={isReadOnlyDocument ? undefined : { maxWidth: clamp(settings.editor.contentWidth, EDITOR_CONTENT_MIN_WIDTH, EDITOR_CONTENT_MAX_WIDTH) }}
      >
        {isReadOnlyDocument || isSourceMode ? null : <PropertiesPanel frontmatter={frontmatter} onChange={updateFrontmatterRaw} />}
        <PdfEditorContext.Provider value={pdfContext}>
          {isSourceMode ? (
            <textarea
              ref={sourceTextareaRef}
              value={document.markdown}
              spellCheck={false}
              onChange={(event) => onChange(document.id, event.target.value)}
              className="informio-editor informio-editor-source w-full resize-none border-0 bg-transparent p-0"
            />
          ) : (
            <EditorContent editor={editor} className={isReadOnlyDocument ? "h-full" : undefined} />
          )}
        </PdfEditorContext.Provider>
      </div>
      {isReadOnlyDocument || isSourceMode ? null : <TableControls editor={editor} containerRef={shellRef} />}
      {isReadOnlyDocument || isSourceMode ? null : <LinkDialog request={linkRequest} onClose={() => setLinkRequest(null)} onConfirm={applyLink} />}
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
      {!isReadOnlyDocument && !isSourceMode ? (
        <SelectionToolbar
          visible={Boolean(markdownToolbar?.text)}
          enabled={toolbarEnabled}
          busy={toolbarTranslate.status === "loading"}
          left={markdownToolbar?.overlayLeft ?? 0}
          top={markdownToolbar?.overlayTop ?? 0}
          response={toolbarTranslate.response}
          error={toolbarTranslate.error}
          onTranslate={() => {
            if (!markdownToolbar) return;
            onTranslateSelection(markdownToolbar);
          }}
          onClose={closeMarkdownToolbar}
        />
      ) : null}
    </main>
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
          <input ref={inputRef} value={query} placeholder="输入命令或打开文档" onChange={(event) => { setQuery(event.target.value); setIndex(0); }} />
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
  rect: { top: number; left: number; width: number; height: number };
  rows: Array<{ top: number; height: number }>;
  columns: Array<{ left: number; width: number }>;
  merged: boolean;
};

type TableDragState = { type: "row" | "column"; from: number } | null;

const tableHasMergedCells = (table: HTMLTableElement) =>
  Array.from(table.rows).some((row) =>
    Array.from(row.cells).some((cell) => Number(cell.getAttribute("colspan") ?? "1") > 1 || Number(cell.getAttribute("rowspan") ?? "1") > 1)
  );

const moveArrayItem = <T,>(items: T[], from: number, to: number) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const serializeCellAttributes = (cell: HTMLTableCellElement) =>
  Array.from(cell.attributes)
    .filter((attribute) => attribute.name !== "class" && attribute.name !== "style")
    .filter((attribute) => !attribute.name.startsWith("data-") || attribute.name === "data-colwidth")
    .map((attribute) => ` ${attribute.name}="${escapeHtml(attribute.value)}"`)
    .join("");

const tableToHtml = (rows: HTMLTableCellElement[][]) =>
  `<table><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<${cell.tagName.toLowerCase()}${serializeCellAttributes(cell)}>${cell.innerHTML}</${cell.tagName.toLowerCase()}>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

const findTableRange = (editor: Editor, table: HTMLTableElement) => {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof Element && (dom === table || dom.contains(table))) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return range;
};

const selectCellForTableCommand = (editor: Editor, table: HTMLTableElement, rowIndex: number, columnIndex: number) => {
  const row = table.rows.item(rowIndex);
  const cell = row?.cells.item(columnIndex);
  if (!cell) return false;
  const pos = editor.view.posAtDOM(cell, 0) + 1;
  editor.chain().focus().setTextSelection(pos).run();
  return true;
};

function TableControls({ editor, containerRef }: { editor: Editor | null; containerRef: React.RefObject<HTMLElement | null> }) {
  const [overlay, setOverlay] = useState<TableOverlayState | null>(null);
  const [dragState, setDragState] = useState<TableDragState>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const measureTable = (table: HTMLTableElement): TableOverlayState | null => {
    const container = containerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const firstRow = table.rows.item(0);
    if (!firstRow) return null;
    return {
      table,
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
      columns: Array.from(firstRow.cells).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left - tableRect.left, width: rect.width };
      }),
      merged: tableHasMergedCells(table)
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
      const table =
        (target?.closest("table") as HTMLTableElement | null) ??
        (target?.closest(".tableWrapper")?.querySelector("table") as HTMLTableElement | null);
      if (table) refreshOverlay(table);
    };
    const updateFromSelection = () => {
      const domAtSelection = editor.view.domAtPos(editor.state.selection.from);
      const target =
        domAtSelection.node instanceof Element ? domAtSelection.node : domAtSelection.node.parentElement;
      const table = target?.closest("table") as HTMLTableElement | null;
      if (table) refreshOverlay(table);
    };
    const onScroll = () => refreshOverlay();
    const onResize = () => refreshOverlay();

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    editor.on("selectionUpdate", updateFromSelection);
    editor.on("update", updateFromSelection);
    updateFromSelection();
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      editor.off("selectionUpdate", updateFromSelection);
      editor.off("update", updateFromSelection);
    };
  }, [containerRef, editor, overlay?.table]);

  if (!editor || !overlay) return null;

  const runTableCommand = (side: "top" | "right" | "bottom" | "left") => {
    const rowIndex = side === "bottom" ? overlay.rows.length - 1 : 0;
    const columnIndex = side === "right" ? overlay.columns.length - 1 : 0;
    if (!selectCellForTableCommand(editor, overlay.table, rowIndex, columnIndex)) return;
    if (side === "top") editor.chain().focus().addRowBefore().run();
    if (side === "bottom") editor.chain().focus().addRowAfter().run();
    if (side === "left") editor.chain().focus().addColumnBefore().run();
    if (side === "right") editor.chain().focus().addColumnAfter().run();
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const reorderTable = (type: "row" | "column", from: number, to: number) => {
    if (overlay.merged || from === to) return;
    const range = findTableRange(editor, overlay.table);
    if (!range) return;
    const rows = Array.from(overlay.table.rows).map((row) => Array.from(row.cells));
    const reordered = type === "row" ? moveArrayItem(rows, from, to) : rows.map((row) => moveArrayItem(row, from, to));
    editor.chain().focus().insertContentAt(range, tableToHtml(reordered)).run();
    setDragState(null);
    setDropTarget(null);
    window.setTimeout(() => {
      const nextTable = editor.view.dom.querySelector("table") as HTMLTableElement | null;
      if (nextTable) refreshOverlay(nextTable);
    }, 0);
  };

  const startDrag = (type: "row" | "column", from: number, event: React.DragEvent<HTMLButtonElement>) => {
    if (overlay.merged) {
      event.preventDefault();
      return;
    }
    setDragState({ type, from });
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (type: "row" | "column", to: number, event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (dragState?.type !== type) return;
    reorderTable(type, dragState.from, to);
  };

  return (
    <div className="informio-table-controls" contentEditable={false}>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <button
          key={side}
          type="button"
          aria-label={`Add ${side === "top" || side === "bottom" ? "row" : "column"} ${side}`}
          className={cn("informio-table-add", `is-${side}`)}
          style={{
            top: side === "top" ? overlay.rect.top - 13 : side === "bottom" ? overlay.rect.top + overlay.rect.height - 13 : overlay.rect.top + overlay.rect.height / 2 - 13,
            left: side === "left" ? overlay.rect.left - 13 : side === "right" ? overlay.rect.left + overlay.rect.width - 13 : overlay.rect.left + overlay.rect.width / 2 - 13
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableCommand(side)}
        >
          <Plus size={13} />
        </button>
      ))}

      {overlay.columns.map((column, index) => (
        <button
          key={`column-${index}`}
          type="button"
          draggable={!overlay.merged}
          aria-label={`Move column ${index + 1}`}
          className={cn("informio-table-handle is-column", dropTarget === index && dragState?.type === "column" && "is-drop-target")}
          style={{ top: overlay.rect.top - 24, left: overlay.rect.left + column.left + column.width / 2 - 12 }}
          onDragStart={(event) => startDrag("column", index, event)}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(index);
          }}
          onDrop={(event) => handleDrop("column", index, event)}
          onDragEnd={() => {
            setDragState(null);
            setDropTarget(null);
          }}
        />
      ))}

      {overlay.rows.map((row, index) => (
        <button
          key={`row-${index}`}
          type="button"
          draggable={!overlay.merged}
          aria-label={`Move row ${index + 1}`}
          className={cn("informio-table-handle is-row", dropTarget === index && dragState?.type === "row" && "is-drop-target")}
          style={{ top: overlay.rect.top + row.top + row.height / 2 - 12, left: overlay.rect.left - 24 }}
          onDragStart={(event) => startDrag("row", index, event)}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(index);
          }}
          onDrop={(event) => handleDrop("row", index, event)}
          onDragEnd={() => {
            setDragState(null);
            setDropTarget(null);
          }}
        />
      ))}

      {overlay.merged ? (
        <div className="informio-table-merged-note" style={{ top: overlay.rect.top - 28, left: overlay.rect.left }}>
          合并单元格表格暂不支持拖动排序
        </div>
      ) : null}
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

const actionShortLabel = (action?: AgentSessionAction) => {
  if (!action) return "";
  return (action.label || action.tool || "").replace(/\s+/g, " ").trim();
};

const isVerificationAction = (action: AgentSessionAction) => {
  const haystack = `${action.tool} ${action.label} ${action.input ?? ""}`.toLowerCase();
  return /test|typecheck|build|lint|verify|check|pytest|cargo test|pnpm build|tsc/.test(haystack);
};

const firstReasoningLine = (reasoning: string) => reasoning.trim().split("\n").find(Boolean) ?? "";

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
                <div className="font-semibold text-slate-700">过程摘要</div>
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
      : message.status === "tool-executing"
        ? "运行工具"
        : message.status === "thinking"
          ? "生成中"
          : message.status === "error"
            ? "已中断"
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
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Reasoning</SectionLabel>
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
          {completedActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Timeline</SectionLabel>
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
  const reasoningPreview = firstReasoningLine(message.reasoning);
  const statusLabel =
    pendingApprovalActions.length ? "Needs approval" : message.status === "tool-executing" ? "Using tools" : message.status === "thinking" ? "Thinking" : message.status === "error" ? "Stopped" : "Done";
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
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Summary</SectionLabel>
              <div className="mt-1 whitespace-pre-wrap">{message.reasoning}</div>
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
          {visibleActions.length ? (
            <div className="space-y-1.5">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Tools</SectionLabel>
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
    pendingApprovalActions.length ? "Waiting approval" : message.status === "tool-executing" ? "Executing" : message.status === "thinking" ? "Planning" : message.status === "error" ? "Failed" : "Complete";
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
            <div className="text-slate-700" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Plan</SectionLabel>
              <div className="whitespace-pre-wrap text-slate-700">{message.reasoning}</div>
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
            ["Inspect", grouped.inspect],
            ["Command", grouped.command],
            ["Change", grouped.edit],
            ["Verify", verificationActions],
            ["Other", grouped.other]
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
  onSend: (text: string, permissionMode: AgentPermissionMode) => void;
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
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>("default");
  const [pendingPermissionMode, setPendingPermissionMode] = useState<AgentPermissionMode | null>(null);
  const [fullAccessConfirmOpen, setFullAccessConfirmOpen] = useState(false);
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(() => new Set());
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compactAgentControls, setCompactAgentControls] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const previousStatusesRef = useRef<Map<string, AgentSessionStatus>>(new Map());
  const agentMenuRef = useRef<HTMLDivElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const composerControlsRef = useRef<HTMLDivElement | null>(null);
  const fullControlsMeasureRef = useRef<HTMLDivElement | null>(null);
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
    if (!text || busy || !enabled) return;
    setDraft("");
    onSend(text, permissionMode);
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
    const controls = composerControlsRef.current;
    const measure = fullControlsMeasureRef.current;
    if (!controls || !measure) return;

    const updateCompactMode = () => {
      const availableWidth = controls.clientWidth;
      const requiredWidth = Math.ceil(measure.scrollWidth);
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
                历史会话
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
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
        onScroll={(event) => {
          const container = event.currentTarget;
          const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          shouldStickToBottomRef.current = distanceFromBottom <= 48;
        }}
      >
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
                  <div
                    className="mb-1 font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                    style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                  >
                    User
                  </div>
                  <div
                    className="whitespace-pre-wrap rounded-md bg-[color-mix(in_srgb,var(--surface-sidebar)_72%,var(--surface-elevated))] py-2 text-right text-[var(--text-main)]"
                    style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                  >
                    {message.userMessage}
                  </div>
                </div>
              </div>
              <div className="px-1 py-1">
                <div
                  className="mb-1 font-bold tracking-[0.12em] text-[var(--text-muted)] uppercase"
                  style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                >
                  {provider.name}
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
                  <div
                    className="whitespace-pre-wrap text-[var(--text-main)]"
                    style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                  >
                    {message.response}
                  </div>
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
        onSubmit={(event) => {
          event.preventDefault();
          sendDraft();
        }}
      >
        <div className="surface-card rounded-lg p-3 shadow-[0_1px_5px_rgba(15,23,42,0.12),inset_0_0_0_1px_rgba(15,23,42,0.08)]">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              sendDraft();
            }}
            placeholder=""
            className="min-h-20 w-full resize-none bg-transparent text-[13px] leading-6 text-[var(--text-main)] outline-none placeholder:text-slate-500"
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
                  <span className="flex h-8 items-center gap-1 px-1.5 text-[13px] font-semibold text-slate-400">
                    <span className="block text-[13px] leading-8">{currentModelLabel}</span>
                    <ChevronDown size={13} className="block shrink-0" />
                  </span>
                  <span className="flex h-8 items-center gap-1 px-1.5 text-[13px] font-semibold text-slate-400">
                    <span className="block text-[13px] leading-8">{currentPermissionLabel}</span>
                    <ChevronDown size={13} className="block shrink-0" />
                  </span>
                </div>
                <span className="grid h-8 min-w-8 shrink-0 place-items-center px-2" />
              </div>
            </div>
          <div ref={composerControlsRef} className="flex h-8 items-center justify-between gap-2">
            <div className={cn("flex h-8 min-w-0 items-center overflow-hidden", compactAgentControls ? "gap-1" : "gap-2")}>
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
              className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md px-2 text-slate-600 transition-[background-color,transform,color] active:scale-95 hover:bg-slate-500/5 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!enabled}
              aria-label={busy ? "取消当前运行" : "发送"}
            >
              {busy ? <X size={16} /> : <ChevronRight size={17} />}
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
            <Dialog.Title className="text-[16px] font-bold text-[var(--text-main)]">切换到完全权限</Dialog.Title>
            <Dialog.Description className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-muted)]">
              完全权限下，Agent 将不再请求审批，并且可以访问和修改工作区外的系统文件。
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
  response,
  error,
  onTranslate,
  onClose
}: {
  visible: boolean;
  enabled: boolean;
  busy: boolean;
  left: number;
  top: number;
  response: string;
  error?: string;
  onTranslate: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  const preserveSelection = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
  };
  return (
    <div
      className="fixed z-[90] max-w-[360px]"
      style={{ left, top }}
      data-selection-toolbar-safe-area="true"
      onMouseDownCapture={markSelectionToolbarInteraction}
    >
      <div className="surface-card w-fit max-w-[min(360px,calc(100vw-32px))] rounded-xl p-[5px] shadow-[0_14px_36px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]">
        <SelectionTranslateSection
          variant="compact"
          enabled={enabled}
          busy={busy}
          response={response}
          error={error}
          onTranslate={onTranslate}
          onClose={onClose}
          preserveSelection={preserveSelection}
        />
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
  onTranslate: () => void;
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
        <div
          className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-[var(--text-main)] select-text cursor-text"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {response}
        </div>
      ) : null}
      {error ? (
        <div
          className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700 select-text cursor-text"
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
  updaterState,
  checkingForUpdates,
  onCheckForUpdates,
  onRestartToInstallUpdate
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
  updaterState: UpdaterState;
  checkingForUpdates: boolean;
  onCheckForUpdates: () => void;
  onRestartToInstallUpdate: () => void;
}) {
  const apiSettings = normalizeApiSettings(settings.api);
  const customThemeColor = settings.appearance.customThemeColor || DEFAULT_CUSTOM_THEME_COLOR;
  const updateAppearance = (patch: Partial<AppSettings["appearance"]>) =>
    onChange({ ...settings, appearance: { ...settings.appearance, ...patch } });
  const [section, setSection] = useState<(typeof settingsNav)[number]["id"]>(() => {
    const requested = window.localStorage.getItem("informio-settings-section");
    window.localStorage.removeItem("informio-settings-section");
    const normalized = requested === "markdown" ? "editor" : requested === "integrations" ? "agent" : requested;
    return settingsNav.some((item) => item.id === normalized) ? (normalized as (typeof settingsNav)[number]["id"]) : "appearance";
  });
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
            <div className="settings-titlebar drag-region flex h-[42px] shrink-0 items-center justify-center border-b">
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
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">Informio 会用当前文档和选中文本作为上下文，调用本机已安装的 Agent runtime。</p>
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
                  <SettingRow title="自动启动" description="打开应用后自动连接当前选择的 Agent。">
                    <Switch.Root
                      checked={settings.agentRuntime.autoStart}
                      disabled={!settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, autoStart: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)] disabled:opacity-50"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title="保留会话数量" description="每个工作区下每个 Agent 最多保留多少条历史会话。">
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
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="flex items-start gap-5">
                    <img
                      src="/icon.png"
                      alt="Informio"
                      className="h-18 w-18 rounded-[18px] object-cover shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                    />
                    <div className="pt-1">
                      <h2 className="text-[32px] leading-none font-bold tracking-[0] text-[var(--text-main)]">{appInfo.name || "Informio"}</h2>
                      <p className="mt-3 text-[17px] text-[var(--text-muted)]">版本 {appInfo.version || "-"}</p>
                    </div>
                  </div>

                  <div className="justify-self-start pt-1 lg:justify-self-end">
                    <button
                      type="button"
                      disabled={!appInfo.githubUrl}
                      onClick={() => {
                        if (appInfo.githubUrl) window.informio.openExternal(appInfo.githubUrl);
                      }}
                      className="inline-flex items-center gap-3 text-[15px] text-[var(--text-main)] transition-colors hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
                    >
                      <Github size={18} />
                      <span className="border-b border-current/25 pb-0.5">GitHub</span>
                    </button>
                  </div>
                </div>

                <div className="mt-18">
                  <h3 className="text-[30px] font-bold tracking-[0] text-[var(--text-main)]">更新</h3>

                  <div className="settings-divide mt-8 divide-y">
                    <SettingRow title="自动更新" description="启动时检查更新">
                      <Switch.Root
                        checked={settings.updates.autoCheckOnLaunch}
                        onCheckedChange={(value) => onChange({ ...settings, updates: { ...settings.updates, autoCheckOnLaunch: value } })}
                        className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                      >
                        <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                      </Switch.Root>
                    </SettingRow>

                    <SettingRow title="检查更新" description={updaterStateSummary(updaterState)}>
                      {updaterState.status === "downloaded" ? (
                        <button
                          type="button"
                          onClick={onRestartToInstallUpdate}
                          className="rounded-[10px] bg-[var(--text-main)] px-4 py-2 text-[14px] font-bold text-[var(--surface)] transition-transform active:scale-[0.98]"
                        >
                          重启安装
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onCheckForUpdates}
                          disabled={checkingForUpdates || updaterState.status === "checking" || updaterState.status === "downloading"}
                          className="inline-flex min-w-[108px] items-center justify-center gap-2 rounded-[10px] bg-slate-200 px-4 py-2 text-[14px] font-bold text-[var(--text-main)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          {checkingForUpdates || updaterState.status === "checking" ? <Loader2 size={14} className="animate-spin" /> : null}
                          立即检查
                        </button>
                      )}
                    </SettingRow>
                  </div>

                  <div className={cn("mt-4 text-[13px] leading-6", updaterStateTone[updaterState.status])}>
                    {updaterState.status === "downloading" && typeof updaterState.progress === "number"
                      ? `下载进度 ${Math.round(updaterState.progress)}%`
                      : updaterState.status === "available" && updaterState.version
                        ? `将升级到 ${updaterState.version}`
                        : updaterState.status === "downloaded" && updaterState.version
                          ? `已准备安装 ${updaterState.version}`
                          : appInfo.githubUrl
                            ? `发布源：${appInfo.githubUrl}`
                            : "发布仓库地址尚未配置。"}
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
                      <SettingRow title="更改 PDF 源文件" description="开启后会尝试把高亮、下划线和批注写回 PDF；Informio 跳转仍保存在本地标注数据中。">
                        <Switch.Root
                          checked={settings.editor.writePdfAnnotationsToSource}
                          onCheckedChange={(value) =>
                            onChange({ ...settings, editor: { ...settings.editor, writePdfAnnotationsToSource: value } })
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
                      <SettingRow title="快速保存" description="保存当前文档，保存后标签栏绿点消失">
                        <kbd className="rounded-md bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]">
                          {settings.shortcuts.quickSave}
                        </kbd>
                      </SettingRow>
                      <SettingRow title="快速唤起窗口" description="打开一个左右栏全折叠的空白速记窗口">
                        <kbd className="rounded-md bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]">
                          {settings.shortcuts.quickCapture}
                        </kbd>
                      </SettingRow>
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
  const [lastMarkdownTarget, setLastMarkdownTarget] = useState<PdfMarkdownTarget | null>(null);
  const [pdfAnnotationIndex, setPdfAnnotationIndex] = useState<Map<string, PdfAnnotation>>(() => new Map());
  const [focusPdfAnnotationId, setFocusPdfAnnotationId] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [checkingAgents, setCheckingAgents] = useState(false);
  const [checkingApiModels, setCheckingApiModels] = useState(false);
  const [apiCheckState, setApiCheckState] = useState<ApiCheckState>({ status: "idle" });
  const [appInfo, setAppInfo] = useState<AppInfo>({ name: "Informio", version: "", githubUrl: "" });
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: "idle", message: "自动更新尚未检查。" });
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
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
  const [renameRequest, setRenameRequest] = useState<RenameRequest | null>(null);
  const [fileListCreationSignal, setFileListCreationSignal] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [toolbarTranslate, setToolbarTranslate] = useState<ToolbarTranslateState>({ status: "idle", response: "" });
  const saveTimer = useRef<number | null>(null);
  const saveQueueRef = useRef(Promise.resolve<AppData | null>(null));
  const pendingAutoSaveIdsRef = useRef<Set<string>>(new Set());
  const dirtyDocumentIdsRef = useRef<Set<string>>(new Set());
  const latestDataRef = useRef<AppData | null>(null);
  const composingDocumentIdRef = useRef<string | null>(null);
  const initializedTabsRef = useRef(false);
  const lastActiveDocumentIdRef = useRef<string | null>(null);

  useEffect(() => {
    window.informio
      .loadApp()
      .then((loaded) => {
        setLoadError(null);
        latestDataRef.current = loaded;
        setData(loaded);
        window.informio.listAgentRuntimeConnections().then(setConnections);
        const active = loaded.settings.agents.find((agent) => agent.id === loaded.settings.activeAgentId) ?? loaded.settings.agents[0];
        if (loaded.settings.agentRuntime.enabled && loaded.settings.agentRuntime.autoStart && active) {
          setConnections((items) => [
            ...items.filter((item) => item.providerId !== active.id),
            { providerId: active.id, status: "connecting", message: "正在启动 Agent...", tools: [] }
          ]);
          window.informio.connectAgentRuntime(active.id).then((connection) => {
            setConnections((items) => [...items.filter((item) => item.providerId !== active.id), connection]);
          });
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("loadApp failed", error);
        setLoadError(message || "无法加载应用数据。");
      });
    return window.informio.onAppDataUpdated((updated) => {
      const current = latestDataRef.current;
      const dirtyIds = dirtyDocumentIdsRef.current;
      if (!current || !dirtyIds.size) {
        latestDataRef.current = updated;
        setData(updated);
        setDirtyDocumentIds(new Set());
        return;
      }

      const localDirtyDocs = new Map(
        current.documents.filter((doc) => dirtyIds.has(doc.id)).map((doc) => [doc.id, doc])
      );
      const preservedDirtyIds = new Set<string>();
      const merged: AppData = {
        ...updated,
        documents: updated.documents.map((doc) => {
          const local = localDirtyDocs.get(doc.id);
          if (!local) return doc;
          preservedDirtyIds.add(doc.id);
          return { ...doc, markdown: local.markdown, updatedAt: local.updatedAt };
        })
      };
      latestDataRef.current = merged;
      setData(merged);
      setDirtyDocumentIds(preservedDirtyIds);
    });
  }, []);

  useEffect(() => {
    window.informio.getAppInfo().then(setAppInfo).catch(() => {
      setAppInfo({ name: "Informio", version: "", githubUrl: "" });
    });
    window.informio.getUpdaterState().then(setUpdaterState).catch(() => {
      setUpdaterState({ status: "idle", message: "自动更新尚未检查。" });
    });
    return window.informio.onUpdaterStateChanged((state) => {
      setUpdaterState(state);
      if (state.status !== "checking") setCheckingForUpdates(false);
    });
  }, []);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    dirtyDocumentIdsRef.current = dirtyDocumentIds;
  }, [dirtyDocumentIds]);

  useEffect(() => {
    if (!data) return;
    const activeDocumentChanged = lastActiveDocumentIdRef.current !== data.activeDocumentId;
    setOpenDocumentIds((ids) => {
      const validIds = ids.filter((id) => data.documents.some((doc) => doc.id === id));

      if (!initializedTabsRef.current) {
        initializedTabsRef.current = true;
        const seeded = [data.activeDocumentId, ...validIds, ...data.documents.slice(0, 2).map((doc) => doc.id)].filter(Boolean);
        const nextIds = Array.from(new Set(seeded)).slice(0, 6);
        return nextIds.length === ids.length && nextIds.every((id, index) => id === ids[index]) ? ids : nextIds;
      }

      if (activeDocumentChanged && data.activeDocumentId && !validIds.includes(data.activeDocumentId)) {
        return [data.activeDocumentId, ...validIds].slice(0, 6);
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
    const merged = [
      ...(activeConnection?.models ?? []),
      ...(activeAgent?.models ?? []),
      ...(activeAgent?.model ? [{ id: activeAgent.model, label: activeAgent.model }] : [])
    ];
    return Array.from(new Map(merged.filter((item) => item.id).map((item) => [item.id, item])).values());
  }, [activeAgent?.model, activeAgent?.models, activeConnection?.models]);
  const scopedAgentConversations = useMemo(
    () =>
      (data?.agentConversations ?? [])
        .filter((conversation) => conversation.workspaceScopeId === workspaceScopeId && conversation.providerId === activeAgent?.id)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [activeAgent?.id, data?.agentConversations, workspaceScopeId]
  );
  const activeConversation = useMemo(
    () => scopedAgentConversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, scopedAgentConversations]
  );
  const activeModel = useMemo(() => {
    if (activeAgent?.model?.trim()) return activeAgent.model;
    return activeModels[0]?.id || "";
  }, [activeAgent?.model, activeModels]);
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

  useEffect(() => {
    if (!data) return;
    setEditorPanes((panes) => {
      const normalized = normalizeEditorPanes(panes, (documentId) => data.documents.some((doc) => doc.id === documentId));
      if (!normalized.length) return data.activeDocumentId ? [{ id: "main", documentId: data.activeDocumentId }] : [];
      if (normalized.length === 1 && splitDirection !== "horizontal") setSplitDirection("horizontal");
      return normalized;
    });
  }, [data?.activeDocumentId, data?.documents, splitDirection]);

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
    if (scopedAgentConversations.length) {
      setActiveConversationId(scopedAgentConversations[0].id);
      setAgentMessages(buildSessionMessagesFromConversation(scopedAgentConversations[0]));
      setPendingNewConversation(false);
      return;
    }
    setActiveConversationId(null);
    setAgentMessages([]);
    setPendingNewConversation(true);
  }, [activeConversation, agentBusy, pendingNewConversation, scopedAgentConversations]);

  const clearSavedDirtyIds = (cleanIds: string[], savedDocuments: InformioDocument[]) => {
    const savedById = new Map(savedDocuments.map((doc) => [doc.id, doc]));
    setDirtyDocumentIds((items) => {
      const next = new Set(items);
      cleanIds.forEach((id) => {
        const current = latestDataRef.current?.documents.find((doc) => doc.id === id);
        const saved = savedById.get(id);
        if (current && saved && current.markdown === saved.markdown) next.delete(id);
      });
      return next;
    });
  };

  const saveDocumentsNow = async (
    nextDocuments: InformioDocument[],
    activeDocumentId: string,
    cleanIds?: string[],
    options: { syncData?: boolean } = {}
  ) => {
    if (!cleanIds?.length) pendingAutoSaveIdsRef.current.clear();
    const runSave = async () => {
      const result = await window.informio.saveNow(nextDocuments, activeDocumentId);
      if (options.syncData !== false) {
        latestDataRef.current = result.data;
        setData(result.data);
      }
      if (cleanIds?.length) {
        clearSavedDirtyIds(cleanIds, nextDocuments);
      } else {
        setDirtyDocumentIds(new Set());
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
      });
    }, 900);
  };

  const updateDocument = (documentId: string, markdown: string, options?: { composing?: boolean }) => {
    if (!data) return;
    const sourceDocument = data.documents.find((doc) => doc.id === documentId);
    if (!sourceDocument) return;
    const documents = data.documents.map((doc) =>
      doc.id === documentId ? { ...doc, markdown, updatedAt: new Date().toISOString() } : doc
    );
    const nextData = { ...data, documents };
    latestDataRef.current = nextData;
    setData(nextData);
    setDirtyDocumentIds((items) => new Set(items).add(sourceDocument.id));
    if (!options?.composing) persistDocuments(sourceDocument.id);
  };

  const handleAgentSelection = (selection: AgentSelection | null) => {
    setAgentSelection((current) => (sameAgentSelection(current, selection) ? current : selection));
    setToolbarTranslate((current) =>
      current.status === "idle" && !current.response && !current.error ? current : { status: "idle", response: "" }
    );
    if (!selection || selection.kind !== "markdown" || !selection.text) return;
    const doc = latestDataRef.current?.documents.find((item) => item.id === selection.documentId);
    if (!doc) return;
    setLastMarkdownTarget({
      documentId: doc.id,
      title: doc.title,
      filePath: doc.filePath,
      from: selection.from,
      to: selection.to,
      text: selection.text
    });
  };

  const registerPdfAnnotation = (annotation: PdfAnnotation) => {
    setPdfAnnotationIndex((items) => {
      if (items.get(annotation.id)?.updatedAt === annotation.updatedAt) return items;
      const next = new Map(items);
      next.set(annotation.id, annotation);
      return next;
    });
  };

  const unregisterPdfAnnotation = (annotationId: string) => {
    setPdfAnnotationIndex((items) => {
      if (!items.has(annotationId)) return items;
      const next = new Map(items);
      next.delete(annotationId);
      return next;
    });
    if (focusPdfAnnotationId === annotationId) setFocusPdfAnnotationId(null);
  };

  const insertPdfBacklink = (annotation: PdfAnnotation) => {
    const target = annotation.markdownTarget ?? lastMarkdownTarget;
    const current = latestDataRef.current;
    if (!target || !current) return;
    const doc = current.documents.find((item) => item.id === target.documentId);
    if (!doc || isPdfFile(doc.filePath ?? doc.title)) return;
    const link = `[PDF 标注](informio://pdf-annotation/${encodeURIComponent(annotation.id)})`;
    const insertAt = typeof target.to === "number" && target.to >= 0 ? target.to : doc.markdown.length;
    const needsLeadingBreak = insertAt > 0 && !doc.markdown.slice(0, insertAt).endsWith("\n");
    const insertion = `${needsLeadingBreak ? "\n" : ""}${link}\n`;
    const markdown = `${doc.markdown.slice(0, insertAt)}${insertion}${doc.markdown.slice(insertAt)}`;
    const documents = current.documents.map((item) =>
      item.id === doc.id ? { ...item, markdown, updatedAt: new Date().toISOString() } : item
    );
    const next = { ...current, documents };
    latestDataRef.current = next;
    setData(next);
    setDirtyDocumentIds((items) => new Set(items).add(doc.id));
    window.informio.saveDocuments(documents, current.activeDocumentId);
  };

  const openMarkdownTarget = (target: PdfMarkdownTarget) => {
    selectDocument(target.documentId);
  };

  const openPdfAnnotation = (annotationId: string) => {
    const annotation = pdfAnnotationIndex.get(annotationId);
    setFocusPdfAnnotationId(annotationId);
    if (!annotation || !data) return;
    const doc = data.documents.find((item) => item.filePath && normalizePath(item.filePath) === normalizePath(annotation.pdfPath));
    if (doc) selectDocument(doc.id);
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
    setData(next);
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
    setData(next);
    window.informio.saveDocuments(next.documents, pane.documentId);
  };

  const selectDocument = (id: string) => {
    if (!data) return;
    setOpenDocumentIds((ids) => (ids.includes(id) ? ids : [...ids, id].slice(-6)));
    setEditorPanes((panes) => {
      if (!panes.length) return [{ id: "main", documentId: id }];
      const targetPaneId = panes.some((pane) => pane.id === activePaneId) ? activePaneId : panes[0].id;
      const nextPanes = normalizeEditorPanes(panes.map((pane) => (pane.id === targetPaneId ? { ...pane, documentId: id } : pane)));
      setActivePaneId(nextPanes.length === 1 ? "main" : targetPaneId);
      return nextPanes;
    });
    const next = { ...data, activeDocumentId: id };
    setData(next);
    window.informio.saveDocuments(next.documents, id);
  };

  const closeDocumentTab = (id: string) => {
    if (!data) return;
    const currentTabs = openDocumentIds;
    const closingIndex = currentTabs.indexOf(id);
    const nextTabs = currentTabs.filter((item) => item !== id);
    const nextActiveDocumentId =
      data.activeDocumentId === id && nextTabs.length
        ? (currentTabs[closingIndex + 1] ?? currentTabs[closingIndex - 1] ?? nextTabs[0])
        : data.activeDocumentId;

    setOpenDocumentIds(nextTabs);
    setEditorPanes((panes) => {
      const remaining = panes.filter((pane) => pane.documentId !== id);
      const replacementId = nextTabs.includes(nextActiveDocumentId) ? nextActiveDocumentId : nextTabs[0];
      if (!remaining.length && replacementId) return [{ id: "main", documentId: replacementId }];
      return normalizeEditorPanes(remaining);
    });
    setActivePaneId((current) => (current === "secondary" && nextTabs.length < 2 ? "main" : current));
    if (nextActiveDocumentId !== data.activeDocumentId) {
      const next = { ...data, activeDocumentId: nextActiveDocumentId };
      setData(next);
      window.informio.saveDocuments(next.documents, nextActiveDocumentId);
    }
  };

  const createDocument = async (folderPath?: string) => {
    setFileListCreationSignal((value) => value + 1);
    const next = folderPath ? await window.informio.createDocumentInFolder(folderPath) : await window.informio.createDocument();
    setOpenDocumentIds((ids) => [next.activeDocumentId, ...ids.filter((item) => item !== next.activeDocumentId)].slice(0, 6));
    setEditorPanes((panes) =>
      panes.length
        ? normalizeEditorPanes(panes.map((pane) => (pane.id === activePaneId ? { ...pane, documentId: next.activeDocumentId } : pane)))
        : [{ id: "main", documentId: next.activeDocumentId }]
    );
    setActivePaneId((current) => (editorPanes.some((pane) => pane.id === current) ? current : "main"));
    setData(next);
  };

  const createDefaultMarkdownDocument = async () => {
    const next = await window.informio.createDefaultMarkdownDocument();
    setOpenDocumentIds((ids) => [next.activeDocumentId, ...ids.filter((item) => item !== next.activeDocumentId)].slice(0, 6));
    setEditorPanes((panes) =>
      panes.length
        ? normalizeEditorPanes(panes.map((pane) => (pane.id === activePaneId ? { ...pane, documentId: next.activeDocumentId } : pane)))
        : [{ id: "main", documentId: next.activeDocumentId }]
    );
    setActivePaneId((current) => (editorPanes.some((pane) => pane.id === current) ? current : "main"));
    setData(next);
  };

  const createLinkedDocument = async (title: string) => {
    const next = await window.informio.createLinkedDocument(title);
    setOpenDocumentIds((ids) => [next.activeDocumentId, ...ids.filter((item) => item !== next.activeDocumentId)].slice(0, 6));
    setEditorPanes((panes) =>
      panes.length
        ? normalizeEditorPanes(panes.map((pane) => (pane.id === activePaneId ? { ...pane, documentId: next.activeDocumentId } : pane)))
        : [{ id: "main", documentId: next.activeDocumentId }]
    );
    setActivePaneId((current) => (editorPanes.some((pane) => pane.id === current) ? current : "main"));
    setData(next);
  };

  const dispatchEditorCommand = (command: MenuCommand, payload?: unknown) => {
    window.dispatchEvent(new CustomEvent("informio:command", { detail: { command, payload } }));
  };

  const createFolder = async (folderPath?: string) => {
    setFileListCreationSignal((value) => value + 1);
    const next = folderPath ? await window.informio.createFolderInFolder(folderPath) : await window.informio.createFolder();
    setData(next);
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
    setOpenDocumentIds((ids) => (ids.includes(documentId) ? ids : [...ids, documentId].slice(-6)));
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
    setData(next);
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
              if (!doc.filePath || !isEmbeddableAssetFile(doc.filePath)) return false;
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
    setData(next);
    setOpenDocumentIds((ids) => ids.filter((id) => next.documents.some((doc) => doc.id === id)));
    setDirtyDocumentIds(new Set());
    if (saved.activeDocumentId !== next.activeDocumentId && next.documents.some((doc) => doc.id === next.activeDocumentId)) {
      setOpenDocumentIds((ids) => (ids.includes(next.activeDocumentId) ? ids : [next.activeDocumentId, ...ids].slice(0, 6)));
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

  const runFileSystemAction = (input: FileSystemOperationInput) => {
    if (input.action === "rename") {
      setRenameRequest({ ...input, currentName: pathBaseName(input.path) });
      return;
    }
    executeFileSystemAction(input);
  };

  const renameProject = (path: string, title: string) => {
    setRenameRequest({ kind: "project", path, currentName: title });
  };

  const toggleProjectPinned = async (path: string) => {
    const next = await window.informio.toggleProjectPinned(path);
    setData(next);
  };

  const updateSettings = (settings: AppSettings) => {
    if (!data) return;
    setData({ ...data, settings });
    window.informio.saveSettings(settings);
  };

  const checkForUpdates = async () => {
    setCheckingForUpdates(true);
    try {
      const state = await window.informio.checkForUpdates();
      setUpdaterState(state);
    } catch (error) {
      setUpdaterState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "检查更新失败，请稍后重试。"
      });
    } finally {
      setCheckingForUpdates(false);
    }
  };

  const restartToInstallUpdate = async () => {
    try {
      await window.informio.restartToInstallUpdate();
    } catch (error) {
      setUpdaterState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "更新安装失败，请稍后再试。"
      });
    }
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

  useEffect(() => {
    return window.informio.onMenuCommand((command) => {
      if (!data) return;
      if (command === "file:new") {
        createDocument();
        return;
      }
      if (command === "command:open-palette") {
        setCommandPaletteOpen(true);
        return;
      }
      if (command === "file:save") {
        saveDocumentsNow(data.documents, data.activeDocumentId);
        return;
      }
      if (command === "file:close-workspace") {
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, leftPanel: "collapsed", rightPanel: "collapsed" }
        });
        return;
      }
      if (command === "view:toggle-left-panel") {
        const leftOpen = data.settings.appearance.leftPanel === "expanded";
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, leftPanel: leftOpen ? "collapsed" : "expanded" }
        });
        return;
      }
      if (command === "view:toggle-right-panel") {
        const rightOpen = data.settings.appearance.rightPanel === "expanded";
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, rightPanel: rightOpen ? "collapsed" : "expanded" }
        });
        return;
      }
      if (command === "view:toggle-status-bar") {
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, autoHideStatusBar: !data.settings.appearance.autoHideStatusBar }
        });
      }
    });
  }, [data]);

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
      setData((current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                appearance: {
                  ...current.settings.appearance,
                  [key]: nextWidth
                }
              }
            }
          : current
      );
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (data) saveDocumentsNow(data.documents, data.activeDocumentId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data]);

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
    setCheckingAgents(true);
    try {
      setConnections((items) => [
        ...items.filter((item) => !targetAgents.some((agent) => agent.id === item.providerId)),
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
      setConnections((items) => [
        ...items.filter((item) => !results.some((result) => result.providerId === item.providerId)),
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

  const refreshAppDataFromDisk = async () => {
    const updated = await window.informio.loadApp();
    latestDataRef.current = updated;
    setData(updated);
  };

  const saveAgentConversations = async (conversations: AgentConversation[]) => {
    const saved = await window.informio.saveAgentConversations({ conversations });
    setData((current) => {
      if (!current) return current;
      const next = { ...current, agentConversations: saved };
      latestDataRef.current = next;
      return next;
    });
    return saved;
  };

  const selectAgentConversation = (conversationId: string) => {
    if (agentBusy) return;
    const conversation = scopedAgentConversations.find((item) => item.id === conversationId);
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
    const remainingScoped = saved
      .filter((conversation) => conversation.workspaceScopeId === workspaceScopeId && conversation.providerId === activeAgent?.id)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    if (activeConversationId === conversationId) {
      const nextConversation = remainingScoped[0] ?? null;
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

  const sendAgentSession = async (text: string, permissionMode: AgentPermissionMode) => {
    if (!data || !activeAgent) return;
    const currentDoc = activeOpenDoc;
    const selection = agentSelection?.documentId === currentDoc?.id ? agentSelection : null;
    const references = resolveReferencedDocumentsFromMessage(text);
    const nowIso = new Date().toISOString();
    const existingConversation = activeConversation;
    const conversationId = existingConversation?.id ?? `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const baseConversationMessages = existingConversation?.messages ?? buildConversationMessagesFromSession(agentMessages);
    const baseRuntimeThreadId = existingConversation?.runtimeThreadId;
    const baseCreatedAt = existingConversation?.createdAt ?? nowIso;
    const baseTitle = existingConversation?.title ?? createConversationTitle(text);
    const conversationBase: Omit<AgentConversation, "messages" | "updatedAt" | "runtimeThreadId"> = {
      id: conversationId,
      workspaceScopeId,
      workspaceLabel,
      providerId: activeAgent.id,
      title: baseTitle,
      createdAt: baseCreatedAt
    };
    const messageId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message: AgentSessionMessage = {
      id: messageId,
      userMessage: text,
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
          message: text,
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
            }))
          }
        },
        (event) => {
          applySessionMessageUpdate((item) => {
            if (event.type === "thinking_delta") return { ...item, reasoning: item.reasoning + event.content, status: "thinking" };
            if (event.type === "text_delta") return { ...item, response: item.response + event.content, status: "thinking" };
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
                actions: item.actions.map((action) =>
                  action.toolId === event.toolId
                    ? { ...action, output: `${action.output ?? ""}${event.outputDelta}` }
                    : action
                )
              };
            }
            if (event.type === "tool_done") {
              return {
                ...item,
                actions: item.actions.map((action) =>
                  action.toolId === event.toolId
                    ? { ...action, status: event.status ?? "done", output: event.output ?? action.output }
                    : action
                )
              };
            }
            if (event.type === "approval_resolved") {
              return {
                ...item,
                actions: item.actions.map((action) =>
                  action.toolId === event.toolId
                    ? { ...action, status: event.status, output: event.output ?? action.output }
                    : action
                )
              };
            }
            if (event.type === "done") {
              return {
                ...item,
                status: "done",
                response: mergeFinalAgentResponse(item.response, event.content),
                completedAt: item.completedAt ?? Date.now()
              };
            }
            return { ...item, status: "error", error: event.message, completedAt: item.completedAt ?? Date.now() };
          });
        }
      );
      applySessionMessageUpdate((item) => ({
        ...item,
        status: "done",
        response: mergeFinalAgentResponse(item.response, result.content),
        completedAt: item.completedAt ?? Date.now()
      }));
      await persistConversationSnapshot(result.runtimeThreadId ?? baseRuntimeThreadId);
      if (permissionMode !== "read_only") await refreshAppDataFromDisk();
      window.informio.listAgentRuntimeConnections().then(setConnections);
    } catch (error) {
      applySessionMessageUpdate((item) => ({
        ...item,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
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
    if (!api.baseUrl.trim() || !api.apiKey.trim() || !api.model.trim()) {
      setToolbarTranslate({
        status: "error",
        response: "",
        error: "翻译 API 还没配置完成。请在设置 → API 填写 base_url、api_key，并检测后选择一个模型。"
      });
      return;
    }

    setToolbarTranslate({ status: "loading", response: "" });
    try {
      const result = await window.informio.translateSelection({
        provider: api.provider,
        baseUrl: api.baseUrl,
        apiKey: api.apiKey,
        model: api.model,
        targetLanguage,
        text: selection.text
      });
      setToolbarTranslate({ status: "done", response: result.content.trim() });
    } catch (error) {
      setToolbarTranslate({
        status: "error",
        response: "",
        error: error instanceof Error ? error.message : String(error)
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
  const shellStyle =
    data.settings.appearance.theme === "custom"
      ? ({ "--custom-theme-color": data.settings.appearance.customThemeColor || DEFAULT_CUSTOM_THEME_COLOR } as CSSProperties)
      : undefined;
  const lineCount = activeOpenDoc ? countLines(activeOpenDoc.markdown) : 0;
  const activePaneViewMode = editorViewModes[activePaneId] ?? "rich-text";
  const canToggleMarkdownSource = Boolean(activeOpenDoc) && !isPdfFile(activeOpenDoc.filePath ?? activeOpenDoc.title);
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
  const commandPaletteItems: CommandPaletteItem[] = [
    { id: "file:new", title: "新建文档", shortcut: "Cmd+N", keywords: "新建 文档 new document", run: createDocument },
    { id: "file:save", title: "保存", shortcut: "Cmd+S", keywords: "保存 save", run: () => saveDocumentsNow(data.documents, data.activeDocumentId) },
    { id: "file:open", title: "打开文件", keywords: "打开 文件 open files", run: () => window.informio.openFiles().then((next) => next && setData(next)) },
    { id: "settings", title: "打开设置", shortcut: "Cmd+,", keywords: "设置 settings", run: () => window.informio.openSettings() },
    {
      id: "view:left",
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
      title: rightOpen ? "隐藏 Agent Session" : "显示 Agent Session",
      keywords: "assistant agent session ai 右栏 助手 任务 切换",
      run: () =>
        updateSettings({
          ...data.settings,
          appearance: { ...data.settings.appearance, rightPanel: rightOpen ? "collapsed" : "expanded" }
        })
    },
    { id: "format:bold", title: "加粗", shortcut: "Cmd+B", keywords: "加粗 bold", run: () => dispatchEditorCommand("format:bold") },
    { id: "format:italic", title: "倾斜", shortcut: "Cmd+I", keywords: "倾斜 斜体 italic", run: () => dispatchEditorCommand("format:italic") },
    { id: "format:heading1", title: "标题 1", keywords: "标题 h1 heading", run: () => dispatchEditorCommand("format:heading", 1) },
    { id: "format:heading2", title: "标题 2", keywords: "标题 h2 heading", run: () => dispatchEditorCommand("format:heading", 2) },
    { id: "format:heading3", title: "标题 3", keywords: "标题 h3 heading", run: () => dispatchEditorCommand("format:heading", 3) },
    { id: "insert:table", title: "插入表格", keywords: "表格 table", run: () => dispatchEditorCommand("insert:table") },
    { id: "format:code-block", title: "插入代码块", keywords: "代码 code", run: () => dispatchEditorCommand("format:code-block") },
    { id: "insert:pdf", title: "插入 PDF", keywords: "pdf 文件 附件", run: () => window.informio.insertAsset("pdf") },
    { id: "insert:math", title: "插入数学公式块", keywords: "公式 math", run: () => dispatchEditorCommand("insert:math") },
    { id: "insert:chart", title: "插入 Mermaid 图表", keywords: "图表 mermaid", run: () => dispatchEditorCommand("insert:chart") },
    { id: "insert:callout", title: "插入信息框", keywords: "信息框 callout note", run: () => dispatchEditorCommand("insert:callout") },
    { id: "insert:footnote", title: "插入脚注", keywords: "脚注 footnote", run: () => dispatchEditorCommand("insert:footnote") },
    { id: "insert:details", title: "插入折叠块", keywords: "折叠 details", run: () => dispatchEditorCommand("insert:details") },
    ...data.documents.map((doc) => ({
      id: `doc:${doc.id}`,
      title: `打开 ${markdownTitle(doc.title)}`,
      subtitle: doc.filePath ?? doc.title,
      keywords: `打开 文档 open ${doc.title}`,
      run: () => selectDocument(doc.id)
    }))
  ];
  const visibleEditorPanes =
    normalizeEditorPanes(editorPanes, (documentId) => documentsById.has(documentId)).length > 0
      ? normalizeEditorPanes(editorPanes, (documentId) => documentsById.has(documentId))
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
            <EditorPane
              key={`${pane.id}-${document.id}-${documentRefreshTokens[document.id] ?? 0}`}
              document={document}
              documents={data.documents}
              settings={data.settings}
              viewMode={editorViewModes[pane.id] ?? "rich-text"}
              outlineJumpRequest={outlineJumpRequest}
              onOutlineJumpHandled={handleOutlineJumpHandled}
              onChange={updateDocument}
              onOpenInternalLink={selectDocument}
              onCreateInternalLink={createLinkedDocument}
              onSelection={handleAgentSelection}
              markdownTarget={lastMarkdownTarget}
              focusPdfAnnotationId={focusPdfAnnotationId}
              onRegisterPdfAnnotation={registerPdfAnnotation}
              onDeletePdfAnnotation={unregisterPdfAnnotation}
              onInsertPdfBacklink={insertPdfBacklink}
              onOpenPdfAnnotation={openPdfAnnotation}
              onOpenMarkdownTarget={openMarkdownTarget}
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
      <Tooltip.Provider delayDuration={300}>
        <div className={cn("app-shell h-screen overflow-hidden", `theme-${data.settings.appearance.theme}`)} style={shellStyle}>
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
            updaterState={updaterState}
            checkingForUpdates={checkingForUpdates}
            onCheckForUpdates={checkForUpdates}
            onRestartToInstallUpdate={restartToInstallUpdate}
          />
        </div>
      </Tooltip.Provider>
    );
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className={cn("app-shell h-screen overflow-hidden", `theme-${data.settings.appearance.theme}`)} style={shellStyle}>
        <div className="flex h-full flex-col overflow-hidden">
	          <header className="top-bar drag-region flex h-[42px] shrink-0 items-center border-b">
	            <div
	              className={cn("titlebar-left h-full shrink-0", leftOpen ? "border-r" : "w-[86px]")}
	              style={leftOpen ? { width: leftPanelWidth + 1 } : undefined}
	            />
            <div className="flex min-w-0 flex-1 items-center justify-between px-2">
              <div className="flex h-full min-w-0 items-center gap-2">
                {openDocuments.map((doc) => {
                  const active = doc.id === activeOpenDoc?.id;
                  const dirty = dirtyDocumentIds.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      draggable
                      onDragStart={(event) => startDocumentDrag(doc.id, event)}
                      className={cn(
	                        "group relative flex h-7 min-w-28 max-w-40 items-center rounded-md text-[12px] font-semibold text-[var(--text-muted)] transition-[background-color,transform,color]",
                        active && "surface-card text-[var(--text-main)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectDocument(doc.id)}
	                        className="no-drag flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 pr-7 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                      >
                        {dirty ? <span className="h-2 w-2 rounded-full bg-emerald-600" /> : null}
                        <span className="truncate">{doc.title}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Close ${doc.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          closeDocumentTab(doc.id);
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
	                  onFileAction={runFileSystemAction}
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
	                    conversations={scopedAgentConversations}
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
	                onClick={() => window.informio.addProject().then((next) => { if (next) setData(next); })}
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
        <RenameDialog
          request={renameRequest}
          onClose={() => setRenameRequest(null)}
          onConfirm={async (name) => {
            if (!renameRequest) return;
            if (renameRequest.kind === "project") {
              const request = renameRequest;
              setRenameRequest(null);
              const next = await window.informio.renameProject(request.path, name);
              setData(next);
              return;
            }
            setRenameRequest(null);
            executeFileSystemAction({ ...renameRequest, name });
          }}
        />
        <CommandPalette open={commandPaletteOpen} commands={commandPaletteItems} onClose={() => setCommandPaletteOpen(false)} />
      </div>
    </Tooltip.Provider>
  );
}
