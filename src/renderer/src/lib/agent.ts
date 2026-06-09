import type {
  AgentSessionMessage,
  AgentSessionAction,
  AgentProcessCategory,
  AgentConversation,
  AgentConversationMessage,
  AgentPermissionMode,
  AgentSessionStatus,
  AgentModel,
  ApiProviderKind,
  AppData,
  AppSettings,
  AgentMessageAttachment,
} from "../types";
import { defaultApiSettings, processCategoryLabel } from "../constants";

export const modelLabel = (models: AgentModel[], id?: string) => {
  const model = models.find((item) => item.id === id);
  return model?.label || id || "先检测模型";
};

export const defaultApiBaseUrl = (provider: ApiProviderKind) =>
  provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1";

export const isBuiltinApiBaseUrl = (value: string) => {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized === "https://api.openai.com/v1" || normalized === "https://api.anthropic.com";
};

export const normalizeApiSettings = (api: AppSettings["api"] | undefined) => ({
  ...defaultApiSettings,
  ...api,
  models: api?.models ?? defaultApiSettings.models
});

export const buildWorkspaceLabel = (data: Pick<AppData, "projects" | "workspacePath">) => {
  const titles = (data.projects ?? []).map((project) => project.title?.trim() || project.path).filter(Boolean);
  if (titles.length) return titles.join(" · ");
  if (data.workspacePath) {
    const normalized = data.workspacePath.replace(/\\/g, "/").replace(/\/+$/, "");
    return normalized.split("/").filter(Boolean).at(-1) || normalized;
  }
  return "未命名工作区";
};

export const createConversationTitle = (text: string) => {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 36 ? `${singleLine.slice(0, 36)}…` : singleLine || "新会话";
};

const codexFinalResponseBoundaryPattern = /(^|\n)(结论(?:先行)?\s*[:：]|Conclusion\s*[:：])/i;

export const splitCodexFinalResponse = (content: string) => {
  const match = content.match(codexFinalResponseBoundaryPattern);
  if (!match || match.index === undefined) return null;
  const boundaryIndex = match.index + match[1].length;
  const process = content.slice(0, boundaryIndex).trim();
  const response = content.slice(boundaryIndex).trimStart();
  return { process, response };
};

export const appendWithParagraphBreak = (current: string, next: string) => {
  const cleanNext = next.trim();
  if (!cleanNext) return current;
  const cleanCurrent = current.trimEnd();
  if (!cleanCurrent) return cleanNext;
  if (cleanCurrent.endsWith(cleanNext)) return cleanCurrent;
  return `${cleanCurrent}\n\n${cleanNext}`;
};

export const attachmentsMarkdown = (attachments: AgentMessageAttachment[]) => {
  if (!attachments.length) return "";
  const lines = attachments.map((attachment) => {
    const label = attachment.kind === "image" ? "image" : "file";
    const mimeType = attachment.mimeType ? `, mime: ${attachment.mimeType}` : "";
    return `- ${attachment.name} (${label}${mimeType}): ${attachment.path}`;
  });
  return `\n\nAttachments:\n${lines.join("\n")}`;
};

export const buildSessionMessagesFromConversation = (conversation: AgentConversation | null): AgentSessionMessage[] => {
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

export const buildConversationMessagesFromSession = (messages: AgentSessionMessage[]): AgentConversationMessage[] =>
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

export const upsertSessionAction = (actions: AgentSessionAction[], nextAction: AgentSessionAction, approvalId?: string) => {
  const index = actions.findIndex((action) =>
    (approvalId && action.approval?.id === approvalId) || action.toolId === nextAction.toolId
  );
  if (index === -1) return [...actions, nextAction];
  const updated = [...actions];
  updated[index] = { ...updated[index], ...nextAction };
  return updated;
};

export const updateSessionActionByToolId = (
  actions: AgentSessionAction[],
  toolId: string,
  patch: Partial<AgentSessionAction>
) => {
  const index = actions.findIndex((action) => action.toolId === toolId);
  if (index === -1) return actions;
  const updated = [...actions];
  updated[index] = { ...updated[index], ...patch };
  return updated;
};

export const classifyAgentAction = (action: AgentSessionAction): AgentProcessCategory => {
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

export const didAgentEditFiles = (messages: AgentSessionMessage[]) =>
  messages.some((message) => message.actions.some((action) => action.kind === "file_change" && action.status !== "error"));

export const summarizeAgentProcess = (actions: AgentSessionAction[]) => {
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

export const mergeFinalAgentResponse = (current: string, next?: string) => {
  if (!next) return current;
  if (!current) return next;
  if (next === current) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  if (next.includes(current)) return next;
  if (current.includes(next)) return current;
  return next.length >= current.length ? next : current;
};

export const isCancelledAgentMessage = (message: Pick<AgentSessionMessage, "error">) =>
  /取消|中断|cancel|cancelled|canceled|abort|aborted/i.test(message.error ?? "");

export const formatProcessDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

export const formatConversationUpdatedAt = (value: string) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
};
