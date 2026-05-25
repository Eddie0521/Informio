import {
  query,
  resolveSettings,
  type AccountInfo,
  type PermissionResult,
  type PostToolUseFailureHookInput,
  type PostToolUseHookInput,
  type PreToolUseHookInput,
  type Query,
  type SDKAssistantMessage,
  type SDKAssistantMessageError,
  type SDKMessage,
  type SDKPartialAssistantMessage,
  type SDKResultError,
  type SDKResultMessage,
  type SDKTaskNotificationMessage,
  type SDKTaskProgressMessage,
  type SDKTaskStartedMessage
} from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "node:os";
import { basename, normalize, resolve } from "node:path";
import type {
  AgentApprovalDecision,
  AgentApprovalResponseInput,
  AgentConnection,
  AgentConversationMessage,
  AgentPermissionMode,
  AgentProvider,
  AgentSessionAction,
  AgentSessionEvent,
  AgentSessionInput,
  AgentSessionResult,
  AgentSessionTraceKind,
  AgentStreamEvent,
  ToolSummary
} from "../shared/types.js";
import {
  collectFileChangePaths,
  createFileChangeAudit,
  mergeToolOutput,
  type FileChangeAudit,
  verifyFileChangeAudit
} from "./fileChangeVerification.js";
import { formatAgentLaunchError } from "./runtimeEnvironment.js";

type PromptRunOptions = {
  model?: string;
  cwd?: string;
  onEvent: (event: AgentStreamEvent) => void;
};

type SessionRunOptions = {
  prompt: string;
  runtimeThreadId?: string;
  conversationHistory?: AgentConversationMessage[];
  onEvent: (event: AgentSessionEvent) => void;
  permissionMode: AgentPermissionMode;
  context: AgentSessionInput["context"];
  model?: string;
};

type ActiveRun = {
  providerId: string;
  query: Query;
  onEvent: (event: AgentSessionEvent) => void;
  permissionMode: AgentPermissionMode;
  roots: string[];
  content: string;
  rawEvents: unknown[];
  sessionId?: string;
  toolStates: Map<string, AgentSessionAction>;
  fileChangeAudits: Map<string, FileChangeAudit>;
  sessionApprovalKeys: Set<string>;
};

type PendingApproval = {
  providerId: string;
  approvalToolId: string;
  approvalKey: string;
  decisionPromise: {
    resolve: (decision: AgentApprovalDecision) => void;
    reject: (error: Error) => void;
  };
};

const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const modelId = (provider: AgentProvider, override?: string) => {
  const value = override || provider.model || provider.models?.[0]?.id || "";
  return value && value !== "default" ? value : undefined;
};

const truncate = (value: string, maxLength = 12000) => (value.length > maxLength ? `${value.slice(0, maxLength)}\n…` : value);

const compactJson = (value: unknown) => {
  try {
    return truncate(JSON.stringify(value, null, 2));
  } catch {
    return String(value);
  }
};

const mergeAssistantText = (current: string, next?: string) => {
  if (!next) return current;
  if (!current) return next;
  if (next === current) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  if (next.includes(current)) return next;
  if (current.includes(next)) return current;
  return next.length >= current.length ? next : current;
};

const extractAssistantText = (message: SDKAssistantMessage) =>
  message.message.content
    .flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : []))
    .join("");

const claudeRuntimeAliases = new Set(["default", "sonnet", "opus", "haiku"]);

const isClaudeRuntimeAlias = (value: string) => claudeRuntimeAliases.has(value.trim().toLowerCase());

const prettifyResolvedModelName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const claudeMatch = trimmed.match(/^claude-(haiku|sonnet|opus)-(\d+)-(\d+)(?:-\d{8})?$/i);
  if (claudeMatch) {
    const [, family, major, minor] = claudeMatch;
    return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}.${minor}`;
  }
  if (/^deepseek-chat$/i.test(trimmed)) return "DeepSeek Chat";
  if (/^deepseek-reasoner$/i.test(trimmed)) return "DeepSeek Reasoner";
  if (/^gpt-\d+(?:\.\d+)?(?:-[a-z0-9]+)*$/i.test(trimmed)) return trimmed.toUpperCase().replace(/-MINI\b/, " Mini").replace(/-CODEX\b/, " Codex");

  return trimmed
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) return segment;
      if (segment.toLowerCase() === "gpt") return "GPT";
      if (segment.toLowerCase() === "claude") return "Claude";
      if (segment.toLowerCase() === "deepseek") return "DeepSeek";
      return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
    })
    .join(" ");
};

const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);

const buildUrl = (baseUrl: string, path: string) =>
  new URL(path.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl.trim())).toString();

const readJsonResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown) => {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const candidate = payload as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof candidate.error === "string") return candidate.error;
    if (candidate.error && typeof candidate.error === "object" && typeof candidate.error.message === "string") return candidate.error.message;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "";
};

const requestJson = async (url: string, init: RequestInit, fallbackMessage: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const detail = extractErrorMessage(payload);
      throw new Error(detail ? `${fallbackMessage}（${response.status}）：${detail}` : `${fallbackMessage}（${response.status}）`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求 Claude 模型列表超时，请检查网络、Claude 网关或 API 配置。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const normalizeDiscoveredClaudeModels = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as { data?: unknown; models?: unknown };
  const list = Array.isArray(candidate.data) ? candidate.data : (Array.isArray(candidate.models) ? candidate.models : []);
  const byId = new Map<string, { id: string; label: string }>();
  list.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const model = item as { id?: unknown; name?: unknown; display_name?: unknown; displayName?: unknown };
    const id = typeof model.id === "string" ? model.id.trim() : "";
    if (!id || isClaudeRuntimeAlias(id)) return;
    const labelSource =
      [model.display_name, model.displayName, model.name].find((value) => typeof value === "string") as string | undefined;
    byId.set(id, { id, label: prettifyResolvedModelName(labelSource?.trim() || id) });
  });
  return Array.from(byId.values());
};

const normalizeClaudeModels = (models: Array<{ value: string; displayName: string }>) => {
  const normalized = models
    .map((model) => ({
      id: model.value.trim(),
      label: model.displayName?.trim() || model.value.trim()
    }))
    .filter((model) => model.id);
  return Array.from(new Map(normalized.map((model) => [model.id, model])).values());
};

const buildResolvedClaudeModels = (settings: {
  model?: string;
  availableModels?: string[];
  modelOverrides?: Record<string, string>;
}) => {
  const overrides = settings.modelOverrides ?? {};
  const selectors = Array.from(
    new Set(
      [...(settings.availableModels ?? []), settings.model ?? ""]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  return selectors.flatMap((selector) => {
    const resolved = (overrides[selector] ?? selector).trim();
    if (!resolved || isClaudeRuntimeAlias(resolved)) return [];
    return [{
      id: selector,
      label: prettifyResolvedModelName(resolved)
    }];
  });
};

const discoverConfiguredClaudeModels = async (settings: { env?: Record<string, string> | undefined }) => {
  const env = settings.env ?? {};
  const configuredBaseUrl = env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com";
  const authToken = env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim() || "";
  if (!authToken) return [];
  const url = buildUrl(configuredBaseUrl, "v1/models");
  const attempts: Array<Record<string, string>> = [
    { "content-type": "application/json", "x-api-key": authToken, "anthropic-version": "2023-06-01" },
    { "content-type": "application/json", authorization: `Bearer ${authToken}`, "anthropic-version": "2023-06-01" }
  ];

  let lastError: Error | null = null;
  for (const headers of attempts) {
    try {
      const payload = await requestJson(url, { method: "GET", headers }, "Claude 模型检测失败");
      const models = normalizeDiscoveredClaudeModels(payload);
      if (models.length) return models;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (lastError) throw lastError;
  return [];
};

const emptySdkPrompt = async function* () {
  return;
};

const buildFallbackConversationHistory = (history: AgentConversationMessage[] | undefined) => {
  if (!history?.length) return "";
  const recent = history.slice(-16);
  const lines = recent
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const body = message.content.trim() || (message.role === "assistant" && message.errorMessage ? `(error) ${message.errorMessage}` : "");
      return body ? `${role}:\n${body}` : "";
    })
    .filter(Boolean);
  return lines.join("\n\n");
};

const withFallbackConversationHistory = (prompt: string, history: AgentConversationMessage[] | undefined) => {
  const conversationHistory = buildFallbackConversationHistory(history);
  if (!conversationHistory) return prompt;
  return [
    "Recent conversation history:",
    conversationHistory,
    "",
    "Continue naturally from the history above.",
    "",
    prompt
  ].join("\n");
};

const normalizePath = (value: string) => normalize(resolve(value)).replace(/\\/g, "/");

const pathInside = (root: string, target: string) => {
  const normalizedRoot = normalizePath(root);
  const normalizedTarget = normalizePath(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
};

const collectRoots = (context: AgentSessionInput["context"], provider: AgentProvider) => {
  const roots = new Set<string>();
  if (context.workspacePath) roots.add(normalizePath(context.workspacePath));
  context.projectRoots?.forEach((root) => roots.add(normalizePath(root)));
  if (!roots.size && provider.cwd) roots.add(normalizePath(provider.cwd));
  return Array.from(roots);
};

const defaultCwd = (context: AgentSessionInput["context"], provider: AgentProvider) =>
  context.workspacePath || context.projectRoots?.[0] || provider.cwd || process.cwd();

const additionalDirectories = (permissionMode: AgentPermissionMode, roots: string[], cwd: string) => {
  if (permissionMode === "full_access") {
    const driveRoot = resolve(cwd).startsWith("/") ? "/" : resolve(cwd).slice(0, 3);
    return Array.from(new Set([driveRoot, homedir()].filter(Boolean)));
  }
  return roots.filter((root) => normalizePath(root) !== normalizePath(cwd));
};

const collectPathStrings = (value: unknown, pathKeysOnly = true, parentKey = ""): string[] => {
  if (!value) return [];
  if (typeof value === "string") {
    if (!pathKeysOnly || /(^|_)(path|file|cwd|dir|directory)$/i.test(parentKey)) return [value];
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPathStrings(item, pathKeysOnly, parentKey));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => collectPathStrings(item, pathKeysOnly, key));
  }
  return [];
};

const firstPath = (value: unknown) => {
  const paths = collectPathStrings(value);
  return paths.find((item) => item.trim());
};

const firstString = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) return item;
  }
  return "";
};

const toolKind = (toolName: string): AgentSessionTraceKind => {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("bash")) return "command";
  if (normalized.includes("edit") || normalized.includes("write") || normalized.includes("multi") || normalized.includes("replace")) {
    return "file_change";
  }
  if (
    normalized.includes("grep")
    || normalized.includes("glob")
    || normalized.includes("search")
    || normalized.includes("find")
  ) {
    return "search";
  }
  if (normalized.includes("read") || normalized === "ls" || normalized.includes("open")) return "read";
  return "tool";
};

const isExternalTool = (toolName: string) => {
  const normalized = toolName.toLowerCase();
  return normalized.includes("websearch") || normalized.includes("web_search") || normalized.includes("webfetch") || normalized.includes("web_fetch");
};

const isReadOnlySafe = (toolName: string) => {
  const normalized = toolName.toLowerCase();
  return (
    normalized === "task"
    || normalized.includes("agent")
    || normalized.includes("read")
    || normalized === "ls"
    || normalized.includes("grep")
    || normalized.includes("glob")
    || normalized.includes("search")
  );
};

const approvalKindForAction = (kind: AgentSessionTraceKind) => {
  if (kind === "command") return "command";
  if (kind === "file_change") return "file_change";
  if (kind === "tool" || kind === "search" || kind === "read") return "tool";
  return "other";
};

const labelForAction = (toolName: string, input: unknown, kind: AgentSessionTraceKind) => {
  const path = firstPath(input);
  const queryText = firstString(input, ["query", "pattern", "command", "note"]);
  if (kind === "command") return "运行命令";
  if (kind === "file_change") return path ? `编辑 ${basename(path)}` : "编辑文件";
  if (kind === "read") return path ? `读取 ${basename(path)}` : "读文件";
  if (kind === "search") {
    if (toolName.toLowerCase().includes("web")) return queryText ? `网页搜索 ${queryText}` : "网页搜索";
    return queryText ? `搜索 ${queryText}` : "搜索";
  }
  return toolName;
};

const summarizeToolOutput = (value: unknown) => {
  if (typeof value === "string") return truncate(value);
  return compactJson(value);
};

const sdkPermissionMode = (mode: AgentPermissionMode) => {
  if (mode === "read_only") return "dontAsk";
  if (mode === "full_access") return "bypassPermissions";
  return "default";
};

const errorMessageForAssistantError = (error: SDKAssistantMessageError | undefined, model?: string) => {
  if (!error) return "";
  switch (error) {
    case "authentication_failed":
      return "Claude Code 鉴权失败。请先运行 `claude` 完成登录。";
    case "model_not_found":
      return model ? `Claude Code 可启动，但当前模型“${model}”不可用。请切换模型后重试。` : "Claude Code 当前模型不可用。请切换模型后重试。";
    case "billing_error":
      return "Claude Code 计费不可用，请检查账号订阅或额度。";
    case "rate_limit":
      return "Claude Code 当前受到速率限制，请稍后再试。";
    case "invalid_request":
      return "Claude Code 拒绝了当前请求参数，请检查模型和权限配置。";
    case "max_output_tokens":
      return "Claude Code 达到了输出上限，请缩小任务范围后重试。";
    default:
      return `Claude Code 返回了错误：${error}。`;
  }
};

const errorMessageForResult = (result: SDKResultError, model?: string) => {
  const permissionError = result.permission_denials[0];
  if (permissionError) return `Claude Code 未获准执行 ${permissionError.tool_name}。`;
  const firstError = result.errors[0]?.trim();
  if (firstError) {
    if (/model/i.test(firstError) && /not found|unknown|unsupported/i.test(firstError)) {
      return model ? `Claude Code 可启动，但当前模型“${model}”不可用。请切换模型后重试。` : firstError;
    }
    if (/auth|login|oauth|token/i.test(firstError)) {
      return "Claude Code 鉴权失败。请先运行 `claude` 完成登录。";
    }
    return firstError;
  }
  return "Claude Code 这一轮没有成功完成。";
};

const isResumeError = (message: string) => /resume|session|not found|unknown session|missing session|invalid session/i.test(message);

const approvalSessionKey = (
  toolName: string,
  kind: AgentSessionTraceKind,
  input: unknown,
  path: string | undefined,
  outsideRoots: boolean,
  externalTool: boolean
) => {
  const command = firstString(input, ["command", "cmd"]);
  const queryText = firstString(input, ["query", "pattern"]);
  return JSON.stringify({
    toolName,
    kind,
    path: path ? normalizePath(path) : "",
    command,
    queryText,
    outsideRoots,
    externalTool
  });
};

const permissionResultForDecision = (
  decision: AgentApprovalDecision,
  _toolUseID: string,
  _suggestions?: unknown,
  toolInput?: Record<string, unknown>
): PermissionResult => {
  if (decision === "acceptForSession") return { behavior: "allow", updatedInput: toolInput ?? {} };
  if (decision === "accept") return { behavior: "allow", updatedInput: toolInput ?? {} };
  return {
    behavior: "deny",
    message: "用户拒绝了这次操作。",
    interrupt: false
  };
};

export class ClaudeAgentSdkManager {
  private connections = new Map<string, AgentConnection>();
  private lastErrors = new Map<string, string>();
  private activeRuns = new Map<string, ActiveRun>();
  private pendingApprovals = new Map<string, PendingApproval>();
  private sessionApprovalCache = new Map<string, Set<string>>();

  getConnection(provider: AgentProvider): AgentConnection | undefined {
    return this.connections.get(provider.id) ?? (this.lastErrors.has(provider.id)
      ? {
          providerId: provider.id,
          status: "error",
          message: this.lastErrors.get(provider.id) ?? "Claude Code unavailable.",
          tools: [],
          models: provider.models
        }
      : undefined);
  }

  async connect(provider: AgentProvider): Promise<AgentConnection> {
    await this.disconnect(provider.id);
    try {
      const detected = await this.runHealthCheck(provider);
      this.connections.set(provider.id, detected);
      this.lastErrors.delete(provider.id);
      return detected;
    } catch (error) {
      const message = formatAgentLaunchError("Claude Code", provider.command, error);
      this.lastErrors.set(provider.id, message);
      const connection: AgentConnection = {
        providerId: provider.id,
        status: "error",
        message,
        tools: [],
        models: provider.models
      };
      this.connections.set(provider.id, connection);
      return connection;
    }
  }

  async disconnect(providerId: string): Promise<AgentConnection> {
    const run = this.activeRuns.get(providerId);
    run?.query.close();
    this.activeRuns.delete(providerId);
    for (const [approvalId, approval] of this.pendingApprovals.entries()) {
      if (approval.providerId !== providerId) continue;
      approval.decisionPromise.reject(new Error("The Claude Code run ended before this approval was answered."));
      this.pendingApprovals.delete(approvalId);
    }
    this.connections.delete(providerId);
    this.lastErrors.delete(providerId);
    return { providerId, status: "idle", message: "Disconnected.", tools: [] };
  }

  cancelRun(providerId: string): boolean {
    const run = this.activeRuns.get(providerId);
    if (!run) return false;
    run.query.close();
    run.onEvent({ type: "error", message: "已取消当前运行。" });
    this.activeRuns.delete(providerId);
    return true;
  }

  async runPromptStream(provider: AgentProvider, prompt: string, options: PromptRunOptions): Promise<{ content: string; raw: unknown[] }> {
    let content = "";
    const raw: unknown[] = [];
    const instance = query({
      prompt,
      options: {
        cwd: options.cwd || provider.cwd || process.cwd(),
        pathToClaudeCodeExecutable: provider.command,
        model: modelId(provider, options.model),
        includePartialMessages: true,
        persistSession: false,
        settingSources: ["user"],
        tools: { type: "preset", preset: "claude_code" },
        env: {
          ...process.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "informio/0.1.1"
        }
      }
    });
    try {
      for await (const message of instance) {
        raw.push(message);
        if (message.type === "stream_event") {
          const delta = this.partialTextDelta(message);
          if (delta) {
            content += delta;
            options.onEvent({ type: "delta", content: delta });
          }
        }
        if (message.type === "assistant") {
          if (message.error) {
            throw new Error(errorMessageForAssistantError(message.error, modelId(provider, options.model)));
          }
          content = mergeAssistantText(content, extractAssistantText(message));
        }
        if (message.type === "result") {
          if (message.subtype !== "success") {
            throw new Error(errorMessageForResult(message, modelId(provider, options.model)));
          }
          content = mergeAssistantText(content, message.result);
        }
      }
      const finalContent = content.trim() || "Claude Code returned an empty response.";
      options.onEvent({ type: "done", content: finalContent });
      return { content: finalContent, raw };
    } finally {
      instance.close();
    }
  }

  async runSessionStream(input: AgentSessionInput, provider: AgentProvider, prompt: string, onEvent: (event: AgentSessionEvent) => void): Promise<AgentSessionResult> {
    try {
      return await this.executeSessionRun(provider, {
        prompt,
        runtimeThreadId: input.runtimeThreadId,
        conversationHistory: input.conversationHistory,
        permissionMode: input.permissionMode,
        context: input.context,
        model: input.model,
        onEvent
      });
    } catch (error) {
      if (!input.runtimeThreadId || !isResumeError(asErrorMessage(error))) throw error;
      return this.executeSessionRun(provider, {
        prompt: withFallbackConversationHistory(prompt, input.conversationHistory),
        permissionMode: input.permissionMode,
        context: input.context,
        model: input.model,
        onEvent
      });
    }
  }

  respondApproval(input: AgentApprovalResponseInput): boolean {
    const approval = this.pendingApprovals.get(input.approvalId);
    if (!approval || approval.providerId !== input.providerId) return false;
    this.pendingApprovals.delete(input.approvalId);
    if (input.decision === "acceptForSession") {
      const run = this.activeRuns.get(input.providerId);
      run?.sessionApprovalKeys.add(approval.approvalKey);
      if (run?.sessionId) {
        const cached = this.sessionApprovalCache.get(run.sessionId) ?? new Set<string>();
        cached.add(approval.approvalKey);
        this.sessionApprovalCache.set(run.sessionId, cached);
      }
    }
    approval.decisionPromise.resolve(input.decision);
    const accepted = input.decision === "accept" || input.decision === "acceptForSession";
    const output = accepted ? "已批准，等待 Claude Code 执行。" : "已拒绝。";
    this.activeRuns.get(input.providerId)?.onEvent({
      type: "approval_resolved",
      toolId: approval.approvalToolId,
      status: accepted ? "done" : "error",
      output
    });
    return true;
  }

  private async runHealthCheck(provider: AgentProvider): Promise<AgentConnection> {
    const healthQuery = query({
      prompt: emptySdkPrompt(),
      options: {
        cwd: provider.cwd || process.cwd(),
        pathToClaudeCodeExecutable: provider.command,
        model: modelId(provider),
        permissionMode: "plan",
        persistSession: false,
        includePartialMessages: false,
        settingSources: ["user"],
        tools: [],
        env: {
          ...process.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "informio/0.1.1"
        }
      }
    });
    let initializationAccount: AccountInfo | undefined;
    let runtimeModels: ReturnType<typeof normalizeClaudeModels> = [];
    const resolvedSettings = await resolveSettings({
      cwd: provider.cwd || process.cwd(),
      settingSources: ["user"]
    }).catch(() => null);
    const discoveredModelsPromise = discoverConfiguredClaudeModels({
      env: resolvedSettings?.effective.env
    }).catch(() => []);
    try {
      const initialization = await healthQuery.initializationResult();
      initializationAccount = initialization.account;
      runtimeModels = normalizeClaudeModels(initialization.models ?? []);
    } finally {
      healthQuery.close();
    }
    const discoveredModels = await discoveredModelsPromise;
    const resolvedModels = buildResolvedClaudeModels({
      model: resolvedSettings?.effective.model,
      availableModels: resolvedSettings?.effective.availableModels,
      modelOverrides: resolvedSettings?.effective.modelOverrides
    });
    const supportedModels =
      discoveredModels.length
        ? discoveredModels
        : (resolvedModels.length ? resolvedModels : runtimeModels.filter((model) => !isClaudeRuntimeAlias(model.id)));
    const selectedModel = modelId(provider);
    if (selectedModel && supportedModels.length && !supportedModels.some((model) => model.id === selectedModel)) {
      throw new Error(`Claude Code 可启动，但当前模型不可用：${selectedModel}`);
    }
    const accountLabel = initializationAccount?.email || initializationAccount?.organization || initializationAccount?.apiProvider;

    return {
      providerId: provider.id,
      status: "connected",
      message: accountLabel ? `Claude Code 已连接 (${accountLabel})` : "Claude Code 已连接。",
      tools: [{ name: "claude_agent_sdk", description: "Claude Agent SDK runtime." }],
      models: supportedModels
    };
  }

  private async executeSessionRun(provider: AgentProvider, options: SessionRunOptions): Promise<AgentSessionResult> {
    const cwd = defaultCwd(options.context, provider);
    const roots = collectRoots(options.context, provider);
    const runQuery = query({
      prompt: options.prompt,
      options: {
        cwd,
        additionalDirectories: additionalDirectories(options.permissionMode, roots, cwd),
        pathToClaudeCodeExecutable: provider.command,
        model: modelId(provider, options.model),
        permissionMode: sdkPermissionMode(options.permissionMode),
        allowDangerouslySkipPermissions: options.permissionMode === "full_access",
        persistSession: true,
        resume: options.runtimeThreadId,
        includePartialMessages: true,
        tools: { type: "preset", preset: "claude_code" },
        settingSources: ["user"],
        includeHookEvents: false,
        canUseTool: (toolName, toolInput, ctx) =>
          this.handleCanUseTool(provider, options.permissionMode, roots, cwd, toolName, toolInput, ctx),
        hooks: {
          PreToolUse: [
            {
              hooks: [async (hookInput) => {
                if (hookInput.hook_event_name === "PreToolUse") {
                  this.handlePreToolUse(provider.id, hookInput, options.onEvent);
                }
                return { continue: true };
              }]
            }
          ],
          PostToolUse: [
            {
              hooks: [async (hookInput) => {
                if (hookInput.hook_event_name === "PostToolUse") {
                  this.handlePostToolUse(provider.id, hookInput, options.onEvent);
                }
                return { continue: true };
              }]
            }
          ],
          PostToolUseFailure: [
            {
              hooks: [async (hookInput) => {
                if (hookInput.hook_event_name === "PostToolUseFailure") {
                  this.handlePostToolUseFailure(provider.id, hookInput, options.onEvent);
                }
                return { continue: true };
              }]
            }
          ]
        },
        env: {
          ...process.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "informio/0.1.1"
        }
      }
    });

    const run: ActiveRun = {
      providerId: provider.id,
      query: runQuery,
      onEvent: options.onEvent,
      permissionMode: options.permissionMode,
      roots,
      content: "",
      rawEvents: [],
      toolStates: new Map(),
      fileChangeAudits: new Map(),
      sessionApprovalKeys: new Set(options.runtimeThreadId ? this.sessionApprovalCache.get(options.runtimeThreadId) ?? [] : [])
    };
    this.activeRuns.set(provider.id, run);

    try {
      for await (const message of runQuery) {
        run.rawEvents.push(message);
        if ("session_id" in message && typeof message.session_id === "string") run.sessionId = message.session_id;
        this.handleSdkMessage(run, provider, message);
      }
      const finalContent = run.content.trim() || "Claude Code returned an empty response.";
      options.onEvent({ type: "done", content: finalContent });
      return { content: finalContent, runtimeThreadId: run.sessionId, raw: run.rawEvents };
    } catch (error) {
      const message = asErrorMessage(error);
      options.onEvent({ type: "error", message });
      throw error;
    } finally {
      if (run.sessionId && run.sessionApprovalKeys.size) {
        this.sessionApprovalCache.set(run.sessionId, new Set(run.sessionApprovalKeys));
      }
      runQuery.close();
      this.activeRuns.delete(provider.id);
      for (const [approvalId, approval] of this.pendingApprovals.entries()) {
        if (approval.providerId !== provider.id) continue;
        approval.decisionPromise.reject(new Error("The Claude Code run ended before this approval was answered."));
        this.pendingApprovals.delete(approvalId);
      }
    }
  }

  private handleSdkMessage(run: ActiveRun, provider: AgentProvider, message: SDKMessage) {
    if (message.type === "stream_event") {
      const delta = this.partialTextDelta(message);
      if (delta) {
        run.content += delta;
        run.onEvent({ type: "text_delta", content: delta, kind: "message", itemId: message.uuid });
      }
      return;
    }

    if (message.type === "assistant") {
      if (message.error) throw new Error(errorMessageForAssistantError(message.error, modelId(provider)));
      const finalText = extractAssistantText(message);
      if (finalText && finalText.startsWith(run.content) && finalText.length > run.content.length) {
        const delta = finalText.slice(run.content.length);
        run.content = finalText;
        run.onEvent({ type: "text_delta", content: delta, kind: "message", itemId: message.uuid });
        return;
      }
      run.content = mergeAssistantText(run.content, finalText);
      return;
    }

    if (message.type === "tool_use_summary") {
      const summary = message.summary.trim();
      if (summary) run.onEvent({ type: "thinking_delta", content: `${summary}\n`, kind: "reasoning", itemId: message.uuid });
      return;
    }

    if (message.type === "system" && message.subtype === "task_started") {
      this.handleTaskStarted(run, message);
      return;
    }

    if (message.type === "system" && message.subtype === "task_progress") {
      this.handleTaskProgress(run, message);
      return;
    }

    if (message.type === "system" && message.subtype === "task_notification") {
      this.handleTaskNotification(run, message);
      return;
    }

    if (message.type === "result") {
      if (message.subtype !== "success") throw new Error(errorMessageForResult(message, modelId(provider)));
      run.content = mergeAssistantText(run.content, message.result);
      return;
    }
  }

  private partialTextDelta(message: SDKPartialAssistantMessage) {
    const event = message.event;
    if (event.type !== "content_block_delta") return "";
    return event.delta.type === "text_delta" ? event.delta.text : "";
  }

  private handleTaskStarted(run: ActiveRun, message: SDKTaskStartedMessage) {
    if (message.skip_transcript) return;
    const toolId = `task-${message.task_id}`;
    run.toolStates.set(toolId, {
      tool: "task",
      toolId,
      label: message.description || "子任务",
      kind: "tool",
      status: "pending",
      input: message.prompt ? truncate(message.prompt) : undefined,
      startedAt: Date.now()
    });
    run.onEvent({
      type: "tool_start",
      action: {
        tool: "task",
        toolId,
        label: message.description || "子任务",
        kind: "tool",
        status: "pending",
        input: message.prompt ? truncate(message.prompt) : undefined,
        startedAt: Date.now()
      }
    });
  }

  private handleTaskProgress(run: ActiveRun, message: SDKTaskProgressMessage) {
    const toolId = `task-${message.task_id}`;
    const segments = [message.description, message.summary, message.last_tool_name].filter(Boolean);
    if (segments.length) {
      run.onEvent({ type: "tool_delta", toolId, outputDelta: `${segments.join("\n")}\n` });
    }
  }

  private handleTaskNotification(run: ActiveRun, message: SDKTaskNotificationMessage) {
    const toolId = `task-${message.task_id}`;
    run.onEvent({
      type: "tool_done",
      toolId,
      status: message.status === "completed" ? "done" : "error",
      output: truncate(message.summary || message.output_file)
    });
  }

  private handlePreToolUse(providerId: string, hookInput: PreToolUseHookInput, onEvent: (event: AgentSessionEvent) => void) {
    const run = this.activeRuns.get(providerId);
    if (!run) return;
    const kind = toolKind(hookInput.tool_name);
    const path = firstPath(hookInput.tool_input);
    const action: AgentSessionAction = {
      tool: hookInput.tool_name,
      toolId: hookInput.tool_use_id,
      label: labelForAction(hookInput.tool_name, hookInput.tool_input, kind),
      kind,
      status: "pending",
      input: compactJson(hookInput.tool_input),
      path,
      startedAt: Date.now()
    };
    run.toolStates.set(hookInput.tool_use_id, action);
    if (kind === "file_change") {
      run.fileChangeAudits.set(
        hookInput.tool_use_id,
        createFileChangeAudit(collectFileChangePaths(hookInput.tool_input), { cwd: run.roots[0] || process.cwd(), roots: run.roots })
      );
    }
    onEvent({ type: "tool_start", action });
  }

  private handlePostToolUse(providerId: string, hookInput: PostToolUseHookInput, onEvent: (event: AgentSessionEvent) => void) {
    const run = this.activeRuns.get(providerId);
    const existing = run?.toolStates.get(hookInput.tool_use_id);
    const output = summarizeToolOutput(hookInput.tool_response);
    const verification = existing?.kind === "file_change" ? verifyFileChangeAudit(
      run?.fileChangeAudits.get(hookInput.tool_use_id)
      ?? createFileChangeAudit(collectFileChangePaths(hookInput.tool_input), { cwd: run?.roots[0] || process.cwd(), roots: run?.roots ?? [] })
    ) : null;
    const finalStatus = verification ? (verification.ok ? "done" : "error") : "done";
    const finalOutput = mergeToolOutput([output, verification?.message]);
    onEvent({
      type: "tool_done",
      toolId: hookInput.tool_use_id,
      status: finalStatus,
      output: finalOutput || undefined
    });
    if (existing) {
      existing.output = finalOutput || undefined;
      existing.status = finalStatus;
      existing.completedAt = Date.now();
      existing.durationMs = hookInput.duration_ms;
    }
  }

  private handlePostToolUseFailure(providerId: string, hookInput: PostToolUseFailureHookInput, onEvent: (event: AgentSessionEvent) => void) {
    const run = this.activeRuns.get(providerId);
    const existing = run?.toolStates.get(hookInput.tool_use_id);
    const output = truncate(hookInput.error || "Tool execution failed.");
    onEvent({
      type: "tool_done",
      toolId: hookInput.tool_use_id,
      status: "error",
      output
    });
    if (existing) {
      existing.output = output;
      existing.status = "error";
      existing.completedAt = Date.now();
      existing.durationMs = hookInput.duration_ms;
    }
  }

  private async handleCanUseTool(
    provider: AgentProvider,
    permissionMode: AgentPermissionMode,
    roots: string[],
    cwd: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    context: {
      signal: AbortSignal;
      suggestions?: unknown;
      blockedPath?: string;
      decisionReason?: string;
      title?: string;
      displayName?: string;
      description?: string;
      toolUseID: string;
      agentID?: string;
    }
  ): Promise<PermissionResult> {
    const run = this.activeRuns.get(provider.id);
    const kind = toolKind(toolName);
    const path = context.blockedPath || firstPath(toolInput);
    const normalizedPath = path ? normalizePath(path) : "";
    const outsideRoots = normalizedPath ? roots.length > 0 && !roots.some((root) => pathInside(root, normalizedPath)) : false;
    const externalTool = isExternalTool(toolName);
    const readOnlySafe = isReadOnlySafe(toolName) && !externalTool && !outsideRoots;
    const defaultSafe =
      (((kind === "read" || kind === "search") && !externalTool && !outsideRoots) || toolName.toLowerCase() === "task" || toolName.toLowerCase().includes("agent"));
    const approvalKey = approvalSessionKey(toolName, kind, toolInput, path, outsideRoots, externalTool);

    if (permissionMode === "full_access") {
      return { behavior: "allow", updatedInput: toolInput };
    }

    if (permissionMode === "read_only") {
      if (readOnlySafe) return { behavior: "allow", updatedInput: toolInput };
      const denyMessage = "当前处于只读模式，这一轮不能改文件、运行写操作命令或访问工作区外路径。";
      if (run) {
        const action: AgentSessionAction = {
          tool: toolName,
          toolId: context.toolUseID,
          label: labelForAction(toolName, toolInput, kind),
          kind,
          status: "pending",
          input: compactJson(toolInput),
          path
        };
        run.onEvent({ type: "tool_start", action });
        run.onEvent({ type: "tool_done", toolId: context.toolUseID, status: "error", output: denyMessage });
      }
      return {
        behavior: "deny",
        message: denyMessage
      };
    }

    if (defaultSafe) {
      return { behavior: "allow", updatedInput: toolInput };
    }

    if (run?.sessionApprovalKeys.has(approvalKey)) {
      return { behavior: "allow", updatedInput: toolInput };
    }

    const approvalId = `${provider.id}:${context.toolUseID}`;
    const approvalToolId = `approval-${context.toolUseID}`;
    const title = context.title || context.displayName || labelForAction(toolName, toolInput, kind);
    const approvalMessage =
      context.description
      || context.decisionReason
      || (kind === "command"
        ? "Claude Code 需要运行命令。"
        : kind === "file_change"
          ? "Claude Code 需要修改文件。"
          : outsideRoots
            ? "Claude Code 需要访问工作区外路径。"
            : "Claude Code 需要使用额外工具。");

    return new Promise<PermissionResult>((resolve, reject) => {
      this.pendingApprovals.set(approvalId, {
        providerId: provider.id,
        approvalToolId,
        approvalKey,
        decisionPromise: {
          resolve: (decision) => {
            resolve(permissionResultForDecision(decision, context.toolUseID, context.suggestions, toolInput));
          },
          reject
        }
      });

      run?.onEvent({
        type: "approval_request",
        action: {
          tool: "approval",
          toolId: approvalToolId,
          label: title,
          kind: "approval",
          status: "pending",
          input: compactJson(toolInput),
          path,
          approval: {
            id: approvalId,
            kind: outsideRoots ? "permissions" : approvalKindForAction(kind),
            title,
            message: approvalMessage,
            command: kind === "command" ? firstString(toolInput, ["command", "cmd"]) : undefined,
            cwd,
            path,
            availableDecisions: ["accept", "acceptForSession", "decline"]
          }
        }
      });
      context.signal.addEventListener("abort", () => {
        this.pendingApprovals.delete(approvalId);
        reject(new Error("The approval request was aborted."));
      }, { once: true });
    });
  }
}
