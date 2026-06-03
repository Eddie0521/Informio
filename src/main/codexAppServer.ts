import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  AgentModel,
  AgentConversationMessage,
  AgentApprovalDecision,
  AgentApprovalResponseInput,
  AgentConnection,
  AgentProvider,
  AgentSessionAction,
  AgentSessionActionStatus,
  AgentSessionEvent,
  AgentSessionInput,
  AgentSessionResult,
  AgentSessionTraceKind
} from "../shared/types.js";
import {
  collectFileChangePaths,
  createFileChangeAudit,
  mergeToolOutput,
  type FileChangeAudit,
  verifyFileChangeAudit
} from "./fileChangeVerification.js";
import { formatAgentLaunchError, spawnRuntimeCommand, summarizeAgentStderr } from "./runtimeEnvironment.js";

type JsonRpcId = string | number;

type JsonRpcMessage = {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type CodexClientSession = {
  provider: AgentProvider;
  child: ChildProcessWithoutNullStreams;
  stdoutBuffer: string;
  stderr: string[];
  pendingRequests: Map<JsonRpcId, PendingJsonRpcRequest>;
  ready: boolean;
  userAgent?: string;
  models?: AgentModel[];
};

type PendingJsonRpcRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type ActiveRun = {
  providerId: string;
  threadId: string;
  cwd: string;
  roots: string[];
  turnId?: string;
  onEvent: (event: AgentSessionEvent) => void;
  resolve: (result: AgentSessionResult) => void;
  reject: (error: Error) => void;
  content: string;
  rawEvents: unknown[];
  actionsByItemId: Map<string, string>;
  outputsByToolId: Map<string, string>;
  statusesByToolId: Map<string, AgentSessionActionStatus>;
  fileChangeAuditsByToolId: Map<string, FileChangeAudit>;
  completed: boolean;
  timer: NodeJS.Timeout;
};

type PendingApproval = {
  providerId: string;
  serverRequestId: JsonRpcId;
  method: string;
  params: Record<string, unknown>;
  toolId: string;
  onEvent: (event: AgentSessionEvent) => void;
};

const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asNumber = (value: unknown) => (typeof value === "number" ? value : undefined);

const asBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);

const toJson = (value: unknown) => JSON.stringify(value, null, 2);

const compactJson = (value: unknown) => JSON.stringify(value);

const truncate = (value: string, maxLength = 12000) => (value.length > maxLength ? `${value.slice(0, maxLength)}\n…` : value);

const modelId = (provider: AgentProvider, override?: string) => {
  const value = override || provider.model || provider.models?.[0]?.id || "";
  return value && value !== "default" ? value : "";
};

const dedupeModels = (models: AgentModel[]) =>
  Array.from(new Map(models.filter((model) => model.id).map((model) => [model.id, model])).values());

const normalizeRuntimeModels = (value: unknown): AgentModel[] => {
  const payload = asRecord(value);
  const data = Array.isArray(payload.data) ? payload.data : [];
  const normalized = data.map((item): AgentModel | null => {
    const model = asRecord(item);
    const hidden = asBoolean(model.hidden) ?? false;
    if (hidden) return null;
    const id = asString(model.id) || asString(model.model);
    if (!id) return null;
    return {
      id,
      label: asString(model.displayName) || id
    };
  });
  return dedupeModels(normalized.filter((model): model is AgentModel => model !== null));
};

const providerArgs = (provider: AgentProvider) =>
  provider.args.length ? provider.args : ["app-server", "--listen", "stdio://"];

const statusFromCodex = (status: unknown): AgentSessionActionStatus => {
  if (status === "failed" || status === "declined") return "error";
  if (status === "completed") return "done";
  return "pending";
};

const actionKindFromCommandActions = (actions: unknown): AgentSessionTraceKind => {
  if (!Array.isArray(actions)) return "command";
  const types = actions.map((action) => asString(asRecord(action).type));
  if (types.includes("search")) return "search";
  if (types.includes("read")) return "read";
  if (types.includes("listFiles")) return "search";
  return "command";
};

const summarizePatchChanges = (changes: unknown) => {
  if (!Array.isArray(changes) || !changes.length) return "";
  return changes
    .map((change) => {
      const item = asRecord(change);
      const kind = asRecord(item.kind);
      const type = asString(kind.type) || "update";
      const path = asString(item.path) || "(unknown)";
      const movePath = asString(kind.move_path);
      const label = type === "add" ? "新增" : type === "delete" ? "删除" : movePath ? "移动/更新" : "更新";
      return `- ${label}: ${path}${movePath ? ` -> ${movePath}` : ""}`;
    })
    .join("\n");
};

const summarizePlan = (params: Record<string, unknown>) => {
  const explanation = asString(params.explanation);
  const plan = Array.isArray(params.plan) ? params.plan : [];
  const steps = plan
    .map((step) => {
      const item = asRecord(step);
      const status = asString(item.status);
      return `- ${status ? `[${status}] ` : ""}${asString(item.step)}`;
    })
    .filter((line) => line.trim() !== "-");
  return [explanation, ...steps].filter(Boolean).join("\n");
};

const firstPathFromChanges = (changes: unknown) => {
  if (!Array.isArray(changes)) return undefined;
  const first = changes.map(asRecord).find((change) => asString(change.path));
  return first ? asString(first.path) : undefined;
};

const firstPathFromCommandActions = (actions: unknown) => {
  if (!Array.isArray(actions)) return undefined;
  for (const action of actions) {
    const item = asRecord(action);
    const path = asString(item.path);
    if (path) return path;
  }
  return undefined;
};

const extractTurnError = (turn: Record<string, unknown>) => {
  const error = asRecord(turn.error);
  return asString(error.message) || (Object.keys(error).length ? compactJson(error) : "Codex turn failed.");
};

const buildFallbackConversationHistory = (history: AgentConversationMessage[] | undefined) => {
  if (!history?.length) return "";
  const recent = history.slice(-16);
  const blocks = recent
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const content = message.content.trim() || (message.role === "assistant" && message.errorMessage ? `(error) ${message.errorMessage}` : "");
      return content ? `${role}:\n${content}` : "";
    })
    .filter(Boolean);
  return blocks.join("\n\n");
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

export class CodexAppServerManager {
  private sessions = new Map<string, CodexClientSession>();
  private activeRuns = new Map<string, ActiveRun>();
  private pendingApprovals = new Map<string, PendingApproval>();
  private lastErrors = new Map<string, string>();
  private nextRequestId = 1;

  private isSessionAlive(session: CodexClientSession) {
    return session.ready && !session.child.killed && session.child.exitCode === null;
  }

  private connectedConnection(provider: AgentProvider, session: CodexClientSession): AgentConnection {
    const models = session.models?.length ? session.models : provider.models;
    return {
      providerId: provider.id,
      status: "connected",
      message: session.userAgent ? `Codex app-server connected: ${session.userAgent}` : "Codex app-server connected.",
      tools: [{ name: "codex_app_server", description: "Codex app-server v2 runtime trace." }],
      models
    };
  }

  getConnection(provider: AgentProvider): AgentConnection | undefined {
    const session = this.sessions.get(provider.id);
    if (session && this.isSessionAlive(session)) return this.connectedConnection(provider, session);

    const message = this.lastErrors.get(provider.id);
    if (!message) return undefined;
    return {
      providerId: provider.id,
      status: "error",
      message,
      tools: [],
      models: provider.models
    };
  }

  async connect(provider: AgentProvider): Promise<AgentConnection> {
    const existing = this.sessions.get(provider.id);
    if (existing && this.isSessionAlive(existing)) {
      this.lastErrors.delete(provider.id);
      return this.connectedConnection(provider, existing);
    }
    await this.disconnect(provider.id);

    let session: CodexClientSession | null = null;
    try {
      const child = await spawnRuntimeCommand(provider.command, providerArgs(provider), {
        cwd: provider.cwd || undefined,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false
      });
      const nextSession: CodexClientSession = {
        provider,
        child,
        stdoutBuffer: "",
        stderr: [],
        pendingRequests: new Map(),
        ready: false
      };
      session = nextSession;

      child.stdout.on("data", (chunk) => this.handleStdout(nextSession, String(chunk)));
      child.stderr.on("data", (chunk) => {
        const text = String(chunk).trim();
        if (!text) return;
        nextSession.stderr.push(text.slice(0, 1000));
        if (nextSession.stderr.length > 8) nextSession.stderr.shift();
      });
      child.on("error", (error) => {
        this.failSession(
          provider.id,
          new Error(formatAgentLaunchError("Codex CLI", provider.command, error, summarizeAgentStderr(nextSession.stderr)))
        );
      });
      child.on("close", (code) => {
        const baseError = new Error(`Codex app-server exited${code === null ? "" : ` with code ${code}`}.`);
        this.failSession(
          provider.id,
          new Error(formatAgentLaunchError("Codex CLI", provider.command, baseError, summarizeAgentStderr(nextSession.stderr)))
        );
      });

      this.sessions.set(provider.id, nextSession);
      const initialized = asRecord(
        await this.request(nextSession, "initialize", {
          clientInfo: { name: "informio", version: "0.10.0" },
          capabilities: { experimentalApi: true }
        })
      );
      nextSession.ready = true;
      nextSession.userAgent = asString(initialized.userAgent);
      nextSession.models = await this.listModels(nextSession).catch(() => provider.models);
      this.lastErrors.delete(provider.id);
      return this.connectedConnection(provider, nextSession);
    } catch (error) {
      await this.disconnect(provider.id);
      const message = formatAgentLaunchError("Codex CLI", provider.command, error, summarizeAgentStderr(session?.stderr));
      this.lastErrors.set(provider.id, message);
      return { providerId: provider.id, status: "error", message, tools: [], models: provider.models };
    }
  }

  async disconnect(providerId: string): Promise<void> {
    const session = this.sessions.get(providerId);
    this.sessions.delete(providerId);
    if (!session) return;
    for (const pending of session.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex app-server disconnected."));
    }
    session.pendingRequests.clear();
    session.child.kill("SIGTERM");
  }

  async runPromptStream(
    provider: AgentProvider,
    prompt: string,
    options: {
      model?: string;
      cwd?: string;
      onEvent: (event: AgentSessionEvent) => void;
    }
  ): Promise<AgentSessionResult> {
    return this.runTurn(provider, {
      prompt,
      model: options.model,
      cwd: options.cwd || provider.cwd,
      permissionMode: "read_only",
      onEvent: options.onEvent
    });
  }

  async runSessionStream(
    input: AgentSessionInput,
    provider: AgentProvider,
    prompt: string,
    onEvent: (event: AgentSessionEvent) => void
  ): Promise<AgentSessionResult> {
    return this.runTurn(provider, {
      prompt,
      model: input.model,
      cwd: input.context.workspacePath || provider.cwd,
      roots: [input.context.workspacePath, ...(input.context.projectRoots ?? [])].filter((value): value is string => Boolean(value?.trim())),
      permissionMode: input.permissionMode,
      runtimeThreadId: input.runtimeThreadId,
      conversationHistory: input.conversationHistory,
      onEvent
    });
  }

  respondApproval(input: AgentApprovalResponseInput): boolean {
    const approval = this.pendingApprovals.get(input.approvalId);
    if (!approval || approval.providerId !== input.providerId) return false;

    const session = this.sessions.get(input.providerId);
    if (!session) return false;

    this.pendingApprovals.delete(input.approvalId);
    this.sendResponse(session, approval.serverRequestId, this.approvalResult(approval.method, approval.params, input.decision));
    approval.onEvent({
      type: "approval_resolved",
      toolId: approval.toolId,
      status: input.decision === "accept" || input.decision === "acceptForSession" ? "done" : "error",
      output: input.decision === "accept" || input.decision === "acceptForSession" ? "已批准，继续执行。" : "已拒绝，相关操作不会执行。"
    });
    return true;
  }

  cancelRun(providerId: string): boolean {
    const run = Array.from(this.activeRuns.values()).find((item) => item.providerId === providerId);
    if (!run) return false;
    this.rejectRun(run, new Error("已取消当前运行。"));
    return true;
  }

  private async runTurn(
    provider: AgentProvider,
    options: {
      prompt: string;
      model?: string;
      cwd?: string;
      roots?: string[];
      permissionMode: AgentSessionInput["permissionMode"];
      runtimeThreadId?: string;
      conversationHistory?: AgentConversationMessage[];
      onEvent: (event: AgentSessionEvent) => void;
    }
  ): Promise<AgentSessionResult> {
    const session = await this.ensureConnected(provider);
    const cwd = options.cwd || provider.cwd || process.cwd();
    const selectedModel = modelId(provider, options.model);
    const permissionMode = options.permissionMode;
    const threadApprovalPolicy = permissionMode === "default" ? "on-request" : "never";
    const threadSandbox =
      permissionMode === "full_access"
        ? "danger-full-access"
        : permissionMode === "default"
          ? "workspace-write"
          : "read-only";
    const loadThread = async (): Promise<{ result: Record<string, unknown>; resumed: boolean }> => {
      if (!options.runtimeThreadId) {
        return {
          result: asRecord(
            await this.request(session, "thread/start", {
              model: selectedModel || null,
              cwd,
              approvalPolicy: threadApprovalPolicy,
              approvalsReviewer: "user",
              sandbox: threadSandbox,
              ephemeral: false,
              experimentalRawEvents: false,
              persistExtendedHistory: false
            })
          ),
          resumed: false
        };
      }

      try {
        return {
          result: asRecord(
            await this.request(session, "thread/resume", {
              threadId: options.runtimeThreadId,
              model: selectedModel || null,
              cwd,
              approvalPolicy: threadApprovalPolicy,
              approvalsReviewer: "user",
              sandbox: threadSandbox,
              excludeTurns: true,
              persistExtendedHistory: false
            })
          ),
          resumed: true
        };
      } catch {
        return {
          result: asRecord(
            await this.request(session, "thread/start", {
              model: selectedModel || null,
              cwd,
              approvalPolicy: threadApprovalPolicy,
              approvalsReviewer: "user",
              sandbox: threadSandbox,
              ephemeral: false,
              experimentalRawEvents: false,
              persistExtendedHistory: false
            })
          ),
          resumed: false
        };
      }
    };
    const { result: threadResult, resumed } = await loadThread();
    const thread = asRecord(threadResult.thread);
    const threadId = asString(thread.id);
    if (!threadId) throw new Error("Codex app-server did not return a thread id.");
    const turnPrompt = resumed ? options.prompt : withFallbackConversationHistory(options.prompt, options.conversationHistory);

    const result = await new Promise<AgentSessionResult>(async (resolve, reject) => {
      const timer = setTimeout(() => {
        const run = this.activeRuns.get(threadId);
        if (run) run.completed = true;
        this.activeRuns.delete(threadId);
        reject(new Error("Codex app-server turn timed out."));
      }, 900000);

      const run: ActiveRun = {
        providerId: provider.id,
        threadId,
        cwd,
        roots: options.roots ?? [],
        onEvent: options.onEvent,
        resolve,
        reject,
        content: "",
        rawEvents: [],
        actionsByItemId: new Map(),
        outputsByToolId: new Map(),
        statusesByToolId: new Map(),
        fileChangeAuditsByToolId: new Map(),
        completed: false,
        timer
      };
      this.activeRuns.set(threadId, run);

      try {
        await this.request(
          session,
          "turn/start",
          {
            threadId,
            input: [{ type: "text", text: turnPrompt, text_elements: [] }],
            cwd,
            approvalPolicy: threadApprovalPolicy,
            approvalsReviewer: "user",
            sandboxPolicy:
              permissionMode === "full_access"
                ? { type: "dangerFullAccess" }
                : permissionMode === "default"
                  ? { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false }
                  : { type: "readOnly", networkAccess: false },
            model: selectedModel || null,
            summary: "auto"
          },
          60000
        );
      } catch (error) {
        clearTimeout(timer);
        this.activeRuns.delete(threadId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    return { ...result, runtimeThreadId: threadId };
  }

  private async ensureConnected(provider: AgentProvider) {
    const existing = this.sessions.get(provider.id);
    if (existing?.ready) return existing;
    const connection = await this.connect(provider);
    if (connection.status !== "connected") throw new Error(connection.message);
    const session = this.sessions.get(provider.id);
    if (!session) throw new Error("Codex app-server session was not created.");
    return session;
  }

  private async listModels(session: CodexClientSession): Promise<AgentModel[]> {
    const models: AgentModel[] = [];
    let cursor: string | null = null;

    do {
      const response = await this.request(session, "model/list", {
        limit: 100,
        includeHidden: false,
        ...(cursor ? { cursor } : {})
      });
      const payload = asRecord(response);
      models.push(...normalizeRuntimeModels(payload));
      cursor = asString(payload.nextCursor) || null;
    } while (cursor);

    return dedupeModels(models);
  }

  private request(session: CodexClientSession, method: string, params: unknown, timeoutMs = 30000) {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}.`));
      }, timeoutMs);
      session.pendingRequests.set(id, { resolve, reject, timer });
      this.write(session, { id, method, params });
    });
  }

  private write(session: CodexClientSession, message: JsonRpcMessage) {
    session.child.stdin.write(`${compactJson(message)}\n`);
  }

  private sendResponse(session: CodexClientSession, id: JsonRpcId, result: unknown) {
    this.write(session, { id, result });
  }

  private sendError(session: CodexClientSession, id: JsonRpcId, message: string) {
    this.write(session, { id, error: { code: -32000, message } });
  }

  private handleStdout(session: CodexClientSession, chunk: string) {
    session.stdoutBuffer += chunk;
    let newlineIndex = session.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = session.stdoutBuffer.slice(0, newlineIndex).trim();
      session.stdoutBuffer = session.stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        try {
          this.handleMessage(session, JSON.parse(line) as JsonRpcMessage);
        } catch (error) {
          this.lastErrors.set(session.provider.id, `Could not parse Codex app-server output. ${asErrorMessage(error)}`);
        }
      }
      newlineIndex = session.stdoutBuffer.indexOf("\n");
    }
  }

  private handleMessage(session: CodexClientSession, message: JsonRpcMessage) {
    if (message.method && message.id !== undefined) {
      this.handleServerRequest(session, message);
      return;
    }

    if (message.id !== undefined) {
      const pending = session.pendingRequests.get(message.id);
      if (!pending) return;
      session.pendingRequests.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if (message.method) this.handleNotification(session, message.method, message.params);
  }

  private handleNotification(session: CodexClientSession, method: string, paramsValue: unknown) {
    const params = asRecord(paramsValue);
    const threadId = asString(params.threadId) || asString(asRecord(params.thread).id);
    const run = threadId ? this.activeRuns.get(threadId) : undefined;
    if (!run) return;
    run.rawEvents.push({ method, params });
    if (run.rawEvents.length > 200) run.rawEvents.shift();

    if (method === "turn/started") {
      run.turnId = asString(asRecord(params.turn).id) || run.turnId;
      return;
    }

    if (method === "item/agentMessage/delta") {
      const delta = asString(params.delta);
      if (!delta) return;
      run.content += delta;
      run.onEvent({ type: "text_delta", content: delta, kind: "message", itemId: asString(params.itemId) });
      return;
    }

    if (method === "item/reasoning/summaryTextDelta") {
      const delta = asString(params.delta);
      if (delta) run.onEvent({ type: "thinking_delta", content: delta, kind: "reasoning", itemId: asString(params.itemId) });
      return;
    }

    if (method === "item/started") {
      this.startActionForItem(run, asRecord(params.item), asNumber(params.startedAtMs));
      return;
    }

    if (method === "item/completed") {
      this.completeActionForItem(run, asRecord(params.item), asNumber(params.completedAtMs));
      return;
    }

    if (method === "item/commandExecution/outputDelta" || method === "item/fileChange/outputDelta") {
      this.appendOutputDelta(run, asString(params.itemId), asString(params.delta));
      return;
    }

    if (method === "item/fileChange/patchUpdated") {
      const itemId = asString(params.itemId);
      const toolId = run.actionsByItemId.get(itemId) ?? this.ensureSyntheticAction(run, itemId, "file_change", "编辑文件", "file_change");
      const output = summarizePatchChanges(params.changes);
      if (output) {
        run.outputsByToolId.set(toolId, output);
        run.onEvent({ type: "tool_done", toolId, status: "pending", output });
      }
      return;
    }

    if (method === "item/mcpToolCall/progress") {
      this.appendOutputDelta(run, asString(params.itemId), `${asString(params.message)}\n`);
      return;
    }

    if (method === "turn/plan/updated") {
      const toolId = `plan-${asString(params.turnId) || run.threadId}`;
      if (!Array.from(run.actionsByItemId.values()).includes(toolId)) {
        run.actionsByItemId.set(toolId, toolId);
        run.onEvent({
          type: "tool_start",
          action: {
            tool: "plan",
            toolId,
            label: "更新计划",
            kind: "plan",
            status: "pending",
            output: summarizePlan(params)
          }
        });
      } else {
        run.onEvent({ type: "tool_done", toolId, status: "pending", output: summarizePlan(params) });
      }
      return;
    }

    if (method === "turn/completed") {
      this.completeRun(run, params);
      return;
    }

    if (method === "error") {
      const message = asString(params.message) || compactJson(params);
      run.onEvent({ type: "error", message });
      this.rejectRun(run, new Error(message));
    }
  }

  private handleServerRequest(session: CodexClientSession, message: JsonRpcMessage) {
    const method = message.method ?? "";
    const params = asRecord(message.params);
    if (message.id === undefined) return;

    if (
      method === "item/commandExecution/requestApproval"
      || method === "item/fileChange/requestApproval"
      || method === "item/permissions/requestApproval"
    ) {
      const threadId = asString(params.threadId);
      const run = this.activeRuns.get(threadId);
      if (!run) {
        this.sendError(session, message.id, "No active Informio run can handle this approval request.");
        return;
      }

      const approvalId = `${session.provider.id}:${String(message.id)}`;
      const itemId = asString(params.itemId) || approvalId;
      const approvalKind =
        method === "item/commandExecution/requestApproval"
          ? "command"
          : method === "item/fileChange/requestApproval"
            ? "file_change"
            : "permissions";
      const title =
        approvalKind === "command"
          ? "需要批准命令"
          : approvalKind === "file_change"
            ? "需要批准文件变更"
            : "需要批准权限请求";
      const command = asString(params.command);
      const cwd = asString(params.cwd);
      const action: AgentSessionAction = {
        tool: "approval",
        toolId: `approval-${approvalId}`,
        label: title,
        kind: "approval",
        status: "pending",
        input: toJson(params),
        approval: {
          id: approvalId,
          kind: approvalKind,
          title,
          message: asString(params.reason),
          command: command || undefined,
          cwd: cwd || undefined,
          availableDecisions: this.availableDecisions(params.availableDecisions)
        },
        startedAt: asNumber(params.startedAtMs)
      };
      this.pendingApprovals.set(approvalId, {
        providerId: session.provider.id,
        serverRequestId: message.id,
        method,
        params,
        toolId: action.toolId,
        onEvent: run.onEvent
      });
      run.onEvent({ type: "approval_request", action });
      return;
    }

    this.sendError(session, message.id, `Informio does not support Codex app-server request: ${method}.`);
  }

  private availableDecisions(value: unknown): AgentApprovalDecision[] {
    const candidates = Array.isArray(value) ? value.filter((item): item is AgentApprovalDecision => typeof item === "string") : [];
    const safe = candidates.filter((item) => ["accept", "acceptForSession", "decline", "cancel"].includes(item));
    return safe.length ? safe : ["accept", "decline"];
  }

  private approvalResult(method: string, params: Record<string, unknown>, decision: AgentApprovalDecision) {
    if (method === "item/permissions/requestApproval") {
      if (decision === "accept" || decision === "acceptForSession") {
        const requested = asRecord(params.permissions);
        return {
          permissions: {
            network: requested.network ?? undefined,
            fileSystem: requested.fileSystem ?? undefined
          },
          scope: decision === "acceptForSession" ? "session" : "turn"
        };
      }
      return { permissions: {}, scope: "turn" };
    }
    return { decision };
  }

  private startActionForItem(run: ActiveRun, item: Record<string, unknown>, startedAt?: number) {
    const itemId = asString(item.id);
    if (!itemId || run.actionsByItemId.has(itemId)) return;

    const action = this.actionFromThreadItem(item, startedAt);
    if (!action) return;
    run.actionsByItemId.set(itemId, action.toolId);
    run.statusesByToolId.set(action.toolId, action.status);
    if (action.output) run.outputsByToolId.set(action.toolId, action.output);
    if (action.kind === "file_change") {
      run.fileChangeAuditsByToolId.set(
        action.toolId,
        createFileChangeAudit(collectFileChangePaths(asRecord(item).changes), { cwd: run.cwd, roots: run.roots })
      );
    }
    run.onEvent({ type: "tool_start", action });
  }

  private completeActionForItem(run: ActiveRun, item: Record<string, unknown>, completedAt?: number) {
    const itemId = asString(item.id);
    const type = asString(item.type);
    if (type === "agentMessage" && !run.content) {
      const text = asString(item.text);
      if (text) {
        run.content = text;
        run.onEvent({ type: "text_delta", content: text, kind: "message", itemId });
      }
      return;
    }

    if (type === "reasoning") return;

    if (!run.actionsByItemId.has(itemId)) this.startActionForItem(run, item, undefined);
    const toolId = run.actionsByItemId.get(itemId) ?? "";
    if (!toolId) return;

    const output = this.outputFromThreadItem(item) || run.outputsByToolId.get(toolId);
    const status = statusFromCodex(item.status);
    const audit = run.fileChangeAuditsByToolId.get(toolId);
    const verification = audit ? verifyFileChangeAudit(audit) : null;
    const finalStatus = verification ? (verification.ok ? status : "error") : status;
    const finalOutput = mergeToolOutput([output, verification?.message]);
    run.statusesByToolId.set(toolId, finalStatus);
    if (finalOutput) run.outputsByToolId.set(toolId, finalOutput);
    run.onEvent({ type: "tool_done", toolId, status: finalStatus, output: finalOutput || undefined });
  }

  private actionFromThreadItem(item: Record<string, unknown>, startedAt?: number): AgentSessionAction | undefined {
    const id = asString(item.id);
    const type = asString(item.type);
    if (!id) return undefined;

    if (type === "commandExecution") {
      const kind = actionKindFromCommandActions(item.commandActions);
      const command = asString(item.command);
      return {
        tool: "command",
        toolId: id,
        label: kind === "search" ? "搜索文件" : kind === "read" ? "读取文件" : "运行命令",
        kind,
        status: statusFromCodex(item.status),
        input: toJson({
          command,
          cwd: item.cwd,
          actions: item.commandActions
        }),
        output: truncate(asString(item.aggregatedOutput)),
        path: firstPathFromCommandActions(item.commandActions),
        startedAt,
        durationMs: asNumber(item.durationMs),
        exitCode: typeof item.exitCode === "number" ? item.exitCode : null
      };
    }

    if (type === "fileChange") {
      return {
        tool: "file_change",
        toolId: id,
        label: "编辑文件",
        kind: "file_change",
        status: statusFromCodex(item.status),
        input: toJson(item.changes),
        output: summarizePatchChanges(item.changes),
        path: firstPathFromChanges(item.changes),
        startedAt
      };
    }

    if (type === "mcpToolCall") {
      const server = asString(item.server);
      const tool = asString(item.tool);
      return {
        tool: "mcp_tool",
        toolId: id,
        label: `${server ? `${server}.` : ""}${tool || "工具调用"}`,
        kind: "tool",
        status: statusFromCodex(item.status),
        input: toJson(item.arguments),
        output: this.outputFromThreadItem(item),
        startedAt,
        durationMs: asNumber(item.durationMs)
      };
    }

    if (type === "dynamicToolCall") {
      const namespace = asString(item.namespace);
      const tool = asString(item.tool);
      return {
        tool: "dynamic_tool",
        toolId: id,
        label: `${namespace ? `${namespace}.` : ""}${tool || "工具调用"}`,
        kind: "tool",
        status: statusFromCodex(item.status),
        input: toJson(item.arguments),
        output: this.outputFromThreadItem(item),
        startedAt,
        durationMs: asNumber(item.durationMs)
      };
    }

    if (type === "webSearch") {
      return {
        tool: "web_search",
        toolId: id,
        label: "网页搜索",
        kind: "search",
        status: "pending",
        input: toJson({ query: item.query, action: item.action }),
        startedAt
      };
    }

    if (type === "plan") {
      return {
        tool: "plan",
        toolId: id,
        label: "计划",
        kind: "plan",
        status: "pending",
        output: asString(item.text),
        startedAt
      };
    }

    return undefined;
  }

  private outputFromThreadItem(item: Record<string, unknown>) {
    const type = asString(item.type);
    if (type === "commandExecution") {
      const output = truncate(asString(item.aggregatedOutput));
      const exitCode = typeof item.exitCode === "number" ? `\nExit code: ${item.exitCode}` : "";
      const duration = typeof item.durationMs === "number" ? `\nDuration: ${item.durationMs}ms` : "";
      return [output, exitCode, duration].filter(Boolean).join("");
    }
    if (type === "fileChange") return summarizePatchChanges(item.changes);
    if (type === "mcpToolCall") {
      if (item.error) return toJson(item.error);
      if (item.result) return toJson(item.result);
    }
    if (type === "dynamicToolCall") {
      const contentItems = Array.isArray(item.contentItems) ? item.contentItems : [];
      return contentItems.length ? toJson(contentItems) : "";
    }
    if (type === "webSearch") return toJson({ query: item.query, action: item.action });
    if (type === "plan") return asString(item.text);
    return "";
  }

  private appendOutputDelta(run: ActiveRun, itemId: string, delta: string) {
    if (!itemId || !delta) return;
    const toolId = run.actionsByItemId.get(itemId) ?? this.ensureSyntheticAction(run, itemId, "command", "运行命令", "command");
    const next = `${run.outputsByToolId.get(toolId) ?? ""}${delta}`;
    run.outputsByToolId.set(toolId, next);
    run.onEvent({ type: "tool_delta", toolId, outputDelta: delta });
  }

  private ensureSyntheticAction(
    run: ActiveRun,
    itemId: string,
    tool: string,
    label: string,
    kind: AgentSessionTraceKind
  ) {
    const toolId = itemId || `${tool}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    run.actionsByItemId.set(itemId || toolId, toolId);
    run.statusesByToolId.set(toolId, "pending");
    run.onEvent({
      type: "tool_start",
      action: {
        tool,
        toolId,
        label,
        kind,
        status: "pending"
      }
    });
    return toolId;
  }

  private completeRun(run: ActiveRun, params: Record<string, unknown>) {
    if (run.completed) return;
    run.completed = true;
    clearTimeout(run.timer);
    this.activeRuns.delete(run.threadId);
    const turn = asRecord(params.turn);
    if (asString(turn.status) === "failed") {
      const error = new Error(extractTurnError(turn));
      run.onEvent({ type: "error", message: error.message });
      run.reject(error);
      return;
    }

    for (const toolId of run.actionsByItemId.values()) {
      run.onEvent({
        type: "tool_done",
        toolId,
        status: run.statusesByToolId.get(toolId) ?? "done",
        output: run.outputsByToolId.get(toolId)
      });
    }
    run.onEvent({ type: "done", content: run.content });
    run.resolve({ content: run.content, raw: { threadId: run.threadId, turn, events: run.rawEvents } });
  }

  private rejectRun(run: ActiveRun, error: Error) {
    if (run.completed) return;
    run.completed = true;
    clearTimeout(run.timer);
    this.activeRuns.delete(run.threadId);
    run.reject(error);
  }

  private failSession(providerId: string, error: Error) {
    const session = this.sessions.get(providerId);
    if (!session) return;
    this.sessions.delete(providerId);
    this.lastErrors.set(providerId, error.message);
    for (const pending of session.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    session.pendingRequests.clear();
    for (const run of this.activeRuns.values()) {
      if (run.providerId === providerId) {
        run.onEvent({ type: "error", message: error.message });
        this.rejectRun(run, error);
      }
    }
  }
}
