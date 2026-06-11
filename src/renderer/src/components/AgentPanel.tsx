import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAgentStore } from "../stores";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  Paperclip,
  Settings,
  Shield,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import type {
  AgentApprovalDecision,
  AgentConnection,
  AgentConversation,
  AgentMessageAttachment,
  AgentModel,
  AgentPermissionMode,
  AgentProvider,
  AgentSelection,
  AgentSessionMessage,
  AgentSessionStatus,
} from "../types";
import { cn } from "../lib/utils";
import {
  connectionTone,
  agentPermissionModes,
  CHAT_PANEL_FONT_MIN,
  CHAT_PANEL_FONT_MAX,
} from "../constants";
import {
  modelLabel,
  classifyAgentAction,
  isCancelledAgentMessage,
  formatProcessDuration,
  formatConversationUpdatedAt,
} from "../lib/agent";
import { normalizePath, pathBaseName } from "../lib/path";
import { writeClipboardText, selectionIsInsideElement } from "../lib/clipboard";
import { fileKindFromName, mimeTypeFromName } from "../lib/file-type";
import { IconButton } from "./IconButton";
import { AgentMarkdownPreview } from "./AgentMarkdownPreview";
import { GenericExecutionFlow } from "./GenericExecutionFlow";
import { OpenCodeExecutionFlow } from "./OpenCodeExecutionFlow";
import { ClaudeCodeExecutionFlow } from "./ClaudeCodeExecutionFlow";
import { CodexExecutionFlow } from "./CodexExecutionFlow";

// ─── Helpers ───

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

const isExternalFileDrag = (dataTransfer: DataTransfer | null) =>
  Boolean(dataTransfer?.types.includes("Files") && !isInternalTreeDrag(dataTransfer) && !isInternalDocumentDrag(dataTransfer));

const filePathForFile = (file: File) => {
  const legacyPath = (file as File & { path?: string }).path;
  if (legacyPath) return legacyPath;
  return window.informio.getPathForFile(file);
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const providerExecutionRenderer = (providerId: string) => {
  if (providerId === "opencode") return OpenCodeExecutionFlow;
  if (providerId === "claude-code") return ClaudeCodeExecutionFlow;
  if (providerId === "codex") return CodexExecutionFlow;
  return GenericExecutionFlow;
};

// ─── Component ───

export function AgentPanel({
  providers,
  provider,
  connection,
  conversations,
  enabled,
  currentModel,
  availableModels,
  chatFontSize,
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
  enabled: boolean;
  currentModel: string;
  availableModels: AgentModel[];
  chatFontSize: number;
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
  const { connections, activeConversationId, pendingNewConversation, agentMessages: messages, agentSelection: selectedSelection, agentBusy: busy } = useAgentStore();
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
  const { t } = useTranslation();

  // Virtual scrolling for messages
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => transcriptScrollRef.current,
    estimateSize: () => 120,
    overscan: 3,
    getItemKey: (index) => messages[index]?.id ?? index
  });
  const status = connection?.status ?? "idle";
  const reconnectLabel = status === "connected" ? t("agentpanel.reconnect", { name: provider.name }) : t("agentpanel.connectAgent");
  const transcriptFontSize = clamp(chatFontSize, CHAT_PANEL_FONT_MIN, CHAT_PANEL_FONT_MAX);
  const transcriptLineHeight = Math.max(Math.round(transcriptFontSize * 1.7), transcriptFontSize + 6);
  const processFontSize = Math.max(CHAT_PANEL_FONT_MIN - 1, transcriptFontSize - 2);
  const processLineHeight = Math.max(Math.round(processFontSize * 1.6), processFontSize + 5);
  const currentModelLabel = modelLabel(availableModels, currentModel, t("settings.api.detectModelsFirst"));
  const currentPermissionLabel = t(`permission.${permissionMode}`);
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
    onSend(text || t("agentpanel.processAttachments"), permissionMode, nextAttachments);
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
      if (messages.length > 0) {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, virtualizer]);

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
                {t("agentpanel.switchAgent")}
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
                          {t(`status.connection.${itemStatus}`)}
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
            label={t("agentpanel.history")}
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
          <IconButton label={t("agentpanel.agentSettings")} className="h-7 w-7" onClick={onOpenSettings}>
            <Settings size={15} />
          </IconButton>
          {historyOpen ? (
            <div className="absolute right-4 top-[42px] z-30 w-[min(240px,calc(100vw-32px))] overflow-hidden rounded-xl bg-white shadow-[0_20px_48px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]">
              <div className="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {t("agentpanel.agentHistory")}
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
                  {t("agentpanel.newSession")}
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
                          <span className="block truncate text-[10px] text-slate-400">{t("agentpanel.from", { workspace: conversation.workspaceLabel || t("agentpanel.unnamedWorkspace") })}</span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {conversation.messages.find((message) => message.role === "user")?.content || t("agentpanel.emptySession")}
                          </span>
                        </button>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatConversationUpdatedAt(conversation.updatedAt)}</span>
                        <button
                          type="button"
                          aria-label={t("agentpanel.deleteSession", { title: conversation.title })}
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
                  <div className="px-3 py-4 text-[12px] leading-5 text-[var(--text-muted)]">{t("agentpanel.noHistoryYet")}</div>
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
              <span>{t("common.copy")}</span>
            </button>
          </div>
        ) : null}
        {selectedSelection?.text ? (
          <div className="rounded-md px-2 py-1.5 text-[12px] leading-5 text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {t("agentpanel.selectionIncluded")}
            </div>
          </div>
        ) : null}

        {connection?.message && status === "error" ? (
          <div className={cn("rounded-lg px-3 py-2 text-xs leading-5", status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
            {connection.message}
          </div>
        ) : null}

        <div className="space-y-4" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            return (
            <div
              key={message.id}
              className="space-y-2 absolute left-0 right-0"
              style={{ top: virtualRow.start }}
              ref={(node) => virtualizer.measureElement(node)}
              data-index={virtualRow.index}
            >
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
                      aria-label={t("agentpanel.copyUserMessage")}
                      onClick={() => void copyAgentMessage(`${message.id}:user`, message.userMessage)}
                      className="no-drag inline-grid h-5 w-5 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      {copiedAgentMessageId === `${message.id}:user` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <div
                      className="font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                      style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
                    >
                      {t("agent.user")}
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
                      aria-label={t("agentpanel.copyAiReply")}
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
          );
          })}
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
            title={t("agentpanel.dragToResize")}
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
                    aria-label={t("agentpanel.removeAttachment", { name: attachment.name })}
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
                aria-label={t("agentpanel.addImageOrFile")}
                title={t("agentpanel.addImageOrFile")}
                onClick={() => attachmentInputRef.current?.click()}
                disabled={!enabled || busy}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-500/5 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Paperclip size={14} />
              </button>
              <Select.Root value={currentModel} onValueChange={onModelChange} disabled={!enabled || !availableModels.length}>
                <Select.Trigger
                  aria-label={t("agentpanel.modelLabel", { label: currentModelLabel })}
                  title={t("agentpanel.modelLabel", { label: currentModelLabel })}
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
                  aria-label={t("agentpanel.permissionLabel", { label: currentPermissionLabel })}
                  title={t("agentpanel.permissionLabel", { label: currentPermissionLabel })}
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
                          <Select.ItemText>{t(`permission.${item}`)}</Select.ItemText>
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
              aria-label={busy ? t("agentpanel.cancelRun") : t("agentpanel.send")}
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
            <Dialog.Title className="text-[16px] font-bold text-[var(--text-main)]">{t("agentpanel.switchToDefaultPermission")}</Dialog.Title>
            <Dialog.Description className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-muted)]">
              {t("agentpanel.defaultPermissionDesc")}
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
                {t("common.cancel")}
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
                {t("agentpanel.confirmSwitch")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}
