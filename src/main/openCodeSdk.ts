import { createOpencode, type OpencodeClient, type EventSubscribeResponse } from "@opencode-ai/sdk";
import { createServer } from "node:net";
import { basename } from "node:path";
import type {
  AgentApprovalDecision,
  AgentApprovalResponseInput,
  AgentConnection,
  AgentConversationMessage,
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
  asErrorMessage,
  buildFallbackConversationHistory,
  withFallbackConversationHistory
} from "./agentRuntimeShared.js";
import {
  collectFileChangePaths,
  createFileChangeAudit,
  mergeToolOutput,
  type FileChangeAudit,
  verifyFileChangeAudit
} from "./fileChangeVerification.js";
import { formatAgentLaunchError, isMissingCommandError } from "./runtimeEnvironment.js";

type OpenCodeSession = {
  provider: AgentProvider;
  client: OpencodeClient;
  server: {
    url: string;
    close(): void;
  };
  abortController?: AbortController;
  subscribedDirectory?: string;
  ready: boolean;
};

type ActiveRun = {
  providerId: string;
  sessionId: string;
  directory: string;
  roots: string[];
  onEvent: (event: AgentSessionEvent) => void;
  content: string;
  latestAssistantMessageId?: string;
  messageRoleById: Map<string, "user" | "assistant">;
  pendingPartUpdatesByMessageId: Map<string, Array<{ part: Record<string, unknown>; delta?: string }>>;
  pendingPartDeltasByMessageId: Map<string, Array<Record<string, unknown>>>;
  activeToolIds: Set<string>;
  actionByPartId: Map<string, AgentSessionAction>;
  fileChangeAuditsByPartId: Map<string, FileChangeAudit>;
  partKindById: Map<string, string>;
  partTextById: Map<string, string>;
  permissionById: Map<string, { toolId: string; sessionId: string; directory: string; kind: "permission" | "question"; answers?: string[][] }>;
  hydratedMessageIds: Set<string>;
  hydratingMessagesById: Map<string, Promise<void>>;
  idlePendingApproval: boolean;
  finalizing: boolean;
  completed: boolean;
  resolve: (result: AgentSessionResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type OpenCodePermissionAction = "allow" | "deny" | "ask";

type OpenCodePermissionRule = {
  permission: string;
  pattern: string;
  action: OpenCodePermissionAction;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asNumber = (value: unknown) => (typeof value === "number" ? value : undefined);
const compactJson = (value: unknown) => JSON.stringify(value, null, 2);
const truncate = (value: string, maxLength = 12000) => (value.length > maxLength ? `${value.slice(0, maxLength)}\n…` : value);
const jsonIfMeaningful = (value: unknown) => {
  const record = asRecord(value);
  if (!Object.keys(record).length) return "";
  return compactJson(record);
};
const normalizeError = (error: unknown, fallback: string) => {
  const message = asErrorMessage(error);
  if (message && message !== "[object Object]") return new Error(message);
  const details = jsonIfMeaningful(error);
  return new Error(details || fallback);
};
const partTextDelta = (previous: string, next: string, providedDelta?: string) => {
  if (providedDelta) return providedDelta;
  if (!next) return "";
  if (!previous) return next;
  if (next === previous) return "";
  if (next.startsWith(previous)) return next.slice(previous.length);
  return next;
};
const extractEventSessionId = (event: EventSubscribeResponse) => {
  const properties = asRecord((event as { properties?: unknown }).properties);
  const direct = asString(properties.sessionID);
  if (direct) return direct;
  const partSessionId = asString(asRecord(properties.part).sessionID);
  if (partSessionId) return partSessionId;
  return asString(asRecord(properties.info).sessionID);
};

const toolKind = (toolName: string): AgentSessionTraceKind => {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("command")) return "command";
  if (normalized.includes("edit") || normalized.includes("write") || normalized.includes("patch")) return "file_change";
  if (normalized.includes("grep") || normalized.includes("glob") || normalized.includes("search") || normalized.includes("find")) return "search";
  if (normalized.includes("read") || normalized === "ls" || normalized.includes("open")) return "read";
  return "tool";
};

const actionLabel = (tool: string, input: Record<string, unknown>, kind: AgentSessionTraceKind) => {
  const path = asString(input.file ?? input.path);
  const command = asString(input.command);
  const query = asString(input.query ?? input.pattern);
  if (kind === "command") return command ? `命令 ${command}` : "运行命令";
  if (kind === "file_change") return path ? `编辑 ${basename(path)}` : "编辑文件";
  if (kind === "read") return path ? `读取 ${basename(path)}` : "读文件";
  if (kind === "search") return query ? `搜索 ${query}` : "搜索";
  return tool;
};

const approvalPayloadRecords = (properties: Record<string, unknown>) => [
  properties,
  asRecord(properties.tool),
  asRecord(properties.input),
  asRecord(asRecord(properties.tool).input),
  asRecord(properties.metadata),
  asRecord(properties.patterns)
];

const firstPayloadString = (records: Record<string, unknown>[], keys: string[]) => {
  for (const record of records) {
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return "";
};

const approvalCommand = (records: Record<string, unknown>[]) =>
  firstPayloadString(records, ["command", "cmd", "script", "bash"]);

const approvalCwd = (records: Record<string, unknown>[]) =>
  firstPayloadString(records, ["cwd", "directory", "workdir"]);

const approvalMessage = (properties: Record<string, unknown>) => {
  const explicit = asString(properties.message) || asString(properties.description);
  if (explicit) return explicit;
  const pattern = asString(properties.pattern) || asString(properties.patterns);
  if (pattern) return `permission: ${asString(properties.permission) || "unknown"}\npattern: ${pattern}`;
  const metadata = jsonIfMeaningful(properties.metadata);
  if (metadata) return metadata;
  const patterns = jsonIfMeaningful(properties.patterns);
  if (patterns) return patterns;
  return "";
};

const summarizePatchFiles = (files: unknown) => {
  if (!Array.isArray(files) || !files.length) return "";
  return files.map((file) => `- ${String(file)}`).join("\n");
};

const parseModelRef = (value: string | undefined) => {
  if (!value?.trim()) return undefined;
  const [providerID, ...rest] = value.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
};

const extractProviderModels = (response: unknown) => {
  const record = asRecord(response);
  const providers = Array.isArray(record.providers) ? record.providers : [];
  return providers.flatMap((provider) => {
    const item = asRecord(provider);
    const providerID = asString(item.id);
    const models = asRecord(item.models);
    return Object.keys(models).map((modelID) => ({
      id: `${providerID}/${modelID}`,
      label: `${providerID}/${modelID}`
    }));
  });
};

const buildPermissionRules = (mode: AgentSessionInput["permissionMode"]): OpenCodePermissionRule[] => {
  if (mode === "full_access") {
    return [
      { permission: "read", pattern: "*", action: "allow" },
      { permission: "list", pattern: "*", action: "allow" },
      { permission: "glob", pattern: "*", action: "allow" },
      { permission: "grep", pattern: "*", action: "allow" },
      { permission: "edit", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "*", action: "allow" },
      { permission: "task", pattern: "*", action: "allow" },
      { permission: "external_directory", pattern: "*", action: "allow" },
      { permission: "repo_clone", pattern: "*", action: "allow" }
    ];
  }

  if (mode === "read_only") {
    return [
      { permission: "read", pattern: "*", action: "allow" },
      { permission: "list", pattern: "*", action: "allow" },
      { permission: "glob", pattern: "*", action: "allow" },
      { permission: "grep", pattern: "*", action: "allow" },
      { permission: "lsp", pattern: "*", action: "allow" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "task", pattern: "*", action: "deny" },
      { permission: "external_directory", pattern: "*", action: "deny" },
      { permission: "repo_clone", pattern: "*", action: "deny" }
    ];
  }

  return [
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "list", pattern: "*", action: "allow" },
    { permission: "glob", pattern: "*", action: "allow" },
    { permission: "grep", pattern: "*", action: "allow" },
    { permission: "lsp", pattern: "*", action: "allow" },
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "task", pattern: "*", action: "ask" },
    { permission: "external_directory", pattern: "*", action: "deny" },
    { permission: "repo_clone", pattern: "*", action: "ask" }
  ];
};

const reserveOpenCodePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve an OpenCode port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });

export class OpenCodeSdkManager {
  private sessions = new Map<string, OpenCodeSession>();
  private activeRuns = new Map<string, ActiveRun>();
  private lastErrors = new Map<string, string>();

  getConnection(provider: AgentProvider): AgentConnection | undefined {
    const session = this.sessions.get(provider.id);
    if (session?.ready) {
      return {
        providerId: provider.id,
        status: "connected",
        message: "OpenCode runtime available.",
        tools: [{ name: "opencode_sdk", description: "OpenCode SDK runtime." }],
        models: provider.models
      };
    }
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
    if (existing?.ready) {
      return (
        this.getConnection(provider) ?? {
          providerId: provider.id,
          status: "connected",
          message: "OpenCode runtime available.",
          tools: [{ name: "opencode_sdk", description: "OpenCode SDK runtime." }],
          models: provider.models
        }
      );
    }

    await this.disconnect(provider.id);
    try {
      const port = await reserveOpenCodePort();
      const { client, server } = await createOpencode({ port, timeout: 10000 });
      const session: OpenCodeSession = {
        provider,
        client,
        server,
        ready: true
      };
      const detected = await this.runHealthCheck(session);
      this.sessions.set(provider.id, session);
      this.lastErrors.delete(provider.id);
      return detected;
    } catch (error) {
      const message = this.normalizeConnectError(error);
      this.lastErrors.set(provider.id, message);
      return {
        providerId: provider.id,
        status: "error",
        message,
        tools: [],
        models: provider.models
      };
    }
  }

  async disconnect(providerId: string): Promise<AgentConnection> {
    const run = this.activeRuns.get(providerId);
    if (run) {
      clearTimeout(run.timer);
      run.reject(new Error("OpenCode runtime disconnected."));
      this.activeRuns.delete(providerId);
    }
    const session = this.sessions.get(providerId);
    this.sessions.delete(providerId);
    if (session) {
      session.abortController?.abort();
      session.server.close();
    }
    this.lastErrors.delete(providerId);
    return { providerId, status: "idle", message: "Disconnected.", tools: [] };
  }

  cancelRun(providerId: string): boolean {
    const run = this.activeRuns.get(providerId);
    if (!run) return false;
    const session = this.sessions.get(providerId);
    if (session) {
      void session.client.session.abort({
        path: { id: run.sessionId },
        query: { directory: run.directory }
      }).catch(() => undefined);
    }
    this.finishRun(run, new Error("已取消当前运行。"));
    return true;
  }

  async runPromptStream(provider: AgentProvider, prompt: string, options: { model?: string; cwd?: string; onEvent: (event: AgentStreamEvent) => void }) {
    const result = await this.runSessionStream(
      {
        providerId: provider.id,
        model: options.model,
        message: prompt,
        permissionMode: "read_only",
        workspaceScopeId: options.cwd || provider.cwd || process.cwd(),
        context: {
          workspacePath: options.cwd || provider.cwd,
          openTabs: [],
          noteList: [],
          references: []
        }
      },
      provider,
      prompt,
      (event) => {
        if (event.type === "text_delta") options.onEvent({ type: "delta", content: event.content });
        if (event.type === "error") options.onEvent({ type: "error", message: event.message });
      }
    );
    options.onEvent({ type: "done", content: result.content });
    return result;
  }

  async runSessionStream(
    input: AgentSessionInput,
    provider: AgentProvider,
    prompt: string,
    onEvent: (event: AgentSessionEvent) => void
  ): Promise<AgentSessionResult> {
    const directory = input.context.workspacePath || provider.cwd || process.cwd();
    const roots = [input.context.workspacePath, ...(input.context.projectRoots ?? [])].filter((value): value is string => Boolean(value?.trim()));
    const session = await this.ensureConnected(provider, directory);
    const sessionId = await this.ensureSession(session, input, directory);
    const run = await new Promise<AgentSessionResult>(async (resolve, reject) => {
      const timer = setTimeout(() => {
        const active = this.activeRuns.get(provider.id);
        if (active) {
          active.completed = true;
          this.activeRuns.delete(provider.id);
        }
        reject(new Error("OpenCode session timed out."));
      }, 900000);

      this.activeRuns.set(provider.id, {
        providerId: provider.id,
        sessionId,
        directory,
        roots,
        onEvent,
        content: "",
        latestAssistantMessageId: undefined,
        messageRoleById: new Map(),
        pendingPartUpdatesByMessageId: new Map(),
        pendingPartDeltasByMessageId: new Map(),
        activeToolIds: new Set(),
        actionByPartId: new Map(),
        fileChangeAuditsByPartId: new Map(),
        partKindById: new Map(),
        partTextById: new Map(),
        permissionById: new Map(),
        hydratedMessageIds: new Set(),
        hydratingMessagesById: new Map(),
        idlePendingApproval: false,
        finalizing: false,
        completed: false,
        resolve,
        reject,
        timer
      });

      try {
        const selectedModel = parseModelRef(input.model || provider.model);
        await session.client.session.prompt({
          body: {
            parts: [{
              type: "text",
              text: [
                input.permissionMode === "read_only"
                  ? "Stay read-only. Do not run shell commands or edit files."
                  : input.permissionMode === "default"
                    ? "Stay within the current workspace. Ask for approval before commands or file edits that need it."
                    : "You may use full local access when needed, but avoid destructive commands unless explicitly requested.",
                "",
                input.runtimeThreadId ? prompt : withFallbackConversationHistory(prompt, input.conversationHistory)
              ].join("\n")
            }],
            ...(selectedModel ? { model: selectedModel } : {}),
          },
          path: { id: sessionId },
          query: { directory }
        });
      } catch (error) {
        clearTimeout(timer);
        this.activeRuns.delete(provider.id);
        reject(normalizeError(error, "OpenCode session prompt failed."));
      }
    });

    return { ...run, runtimeThreadId: sessionId };
  }

  respondApproval(input: AgentApprovalResponseInput): boolean {
    const run = this.activeRuns.get(input.providerId);
    if (!run) return false;
    const approval = run.permissionById.get(input.approvalId);
    if (!approval) return false;
    const session = this.sessions.get(input.providerId);
    if (!session) return false;
    if (approval.kind === "question") {
      if (input.decision === "decline" || input.decision === "cancel") {
        run.permissionById.delete(input.approvalId);
        void fetch(`${session.server.url}/question/${encodeURIComponent(input.approvalId)}/reject?directory=${encodeURIComponent(approval.directory)}`, {
          method: "POST"
        }).catch(() => undefined);
      run.onEvent({
          type: "approval_resolved",
          toolId: approval.toolId,
          status: "error",
          output: "已拒绝，相关操作不会执行。"
        });
        if (run.idlePendingApproval && !run.permissionById.size) void this.finalizeRun(session, run);
        return true;
      }
      run.permissionById.delete(input.approvalId);
      void fetch(`${session.server.url}/question/${encodeURIComponent(input.approvalId)}/reply?directory=${encodeURIComponent(approval.directory)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: approval.answers ?? [] })
      }).catch(() => undefined);
      run.onEvent({
        type: "approval_resolved",
        toolId: approval.toolId,
        status: "done",
        output: "已批准，继续执行。"
      });
      return true;
    }
    run.permissionById.delete(input.approvalId);
    const reply = this.mapDecision(input.decision);
    void session.client.postSessionIdPermissionsPermissionId({
      body: { response: reply },
      path: { id: approval.sessionId, permissionID: input.approvalId },
      query: {
        directory: approval.directory
      }
    }).catch(() => undefined);
    run.onEvent({
      type: "approval_resolved",
      toolId: approval.toolId,
      status: reply === "reject" ? "error" : "done",
      output: reply === "reject" ? "已拒绝，相关操作不会执行。" : "已批准，继续执行。"
    });
    if (reply === "reject" && run.idlePendingApproval && !run.permissionById.size) void this.finalizeRun(session, run);
    return true;
  }

  private async ensureConnected(provider: AgentProvider, directory: string) {
    const current = this.sessions.get(provider.id);
    if (current?.ready) {
      await this.ensureSubscribedDirectory(current, directory);
      return current;
    }
    const connection = await this.connect(provider);
    if (connection.status !== "connected") throw new Error(connection.message);
    const session = this.sessions.get(provider.id);
    if (!session) throw new Error("OpenCode session was not created.");
    await this.ensureSubscribedDirectory(session, directory);
    return session;
  }

  private async ensureSession(session: OpenCodeSession, input: AgentSessionInput, directory: string) {
    const permission = buildPermissionRules(input.permissionMode);
    if (input.runtimeThreadId) {
      try {
        await session.client.session.get({
          path: { id: input.runtimeThreadId },
          query: { directory }
        });
        await this.syncSessionPermissions(session, input.runtimeThreadId, directory, permission);
        return input.runtimeThreadId;
      } catch {
        // fall through
      }
    }
    const created = await session.client.session.create({
      body: {
        title: input.message.slice(0, 80)
      },
      query: { directory }
    });
    const sessionId = asString(asRecord(created.data).id);
    if (!sessionId) throw new Error("OpenCode did not return a session id.");
    await this.syncSessionPermissions(session, sessionId, directory, permission);
    return sessionId;
  }

  private async syncSessionPermissions(
    session: OpenCodeSession,
    sessionId: string,
    directory: string,
    permission: OpenCodePermissionRule[]
  ) {
    const response = await fetch(
      `${session.server.url}/session/${encodeURIComponent(sessionId)}?directory=${encodeURIComponent(directory)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permission })
      }
    );
    if (response.ok) return;
    const errorText = truncate(await response.text().catch(() => ""));
    throw new Error(errorText || `OpenCode session permission sync failed with status ${response.status}.`);
  }

  private subscribeEvents(session: OpenCodeSession, directory: string) {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await session.client.event.subscribe({
          query: { directory },
          signal: controller.signal
        });
        for await (const payload of result.stream) {
          if (controller.signal.aborted) break;
          this.handleEvent(session, payload as EventSubscribeResponse);
        }
      } catch {
        // Ignore stream shutdown and transient event errors.
      }
    })();
    session.subscribedDirectory = directory;
    return controller;
  }

  private async ensureSubscribedDirectory(session: OpenCodeSession, directory: string) {
    if (session.subscribedDirectory === directory && session.abortController) return;
    session.abortController?.abort();
    session.abortController = this.subscribeEvents(session, directory);
  }

  private handleEvent(session: OpenCodeSession, event: EventSubscribeResponse) {
    const type = (event as { type?: string }).type;
    const properties = asRecord((event as { properties?: unknown }).properties);
    const sessionId = extractEventSessionId(event);
    const run = Array.from(this.activeRuns.values()).find((item) => item.providerId === session.provider.id && item.sessionId === sessionId);
    if (!run) return;

    if (type === "message.part.updated") {
      this.handlePartUpdateEvent(run, asRecord(properties.part), asString(properties.delta) || undefined);
      return;
    }

    if (type === "message.part.delta") {
      this.handlePartDeltaEvent(run, properties);
      return;
    }

    if (type === "message.updated") {
      const info = asRecord(properties.info);
      const role = asString(info.role);
      const messageId = asString(info.id);
      if (messageId && (role === "assistant" || role === "user")) {
        run.messageRoleById.set(messageId, role);
        if (role === "assistant") {
          run.latestAssistantMessageId = messageId || run.latestAssistantMessageId;
          this.flushPendingAssistantParts(run, messageId);
        } else {
          run.pendingPartUpdatesByMessageId.delete(messageId);
          run.pendingPartDeltasByMessageId.delete(messageId);
        }
      }
      if (role !== "assistant") return;
      const error = info.error;
      if (error) {
        this.finishRun(run, normalizeError(error, "OpenCode assistant message failed."));
        return;
      }
      const completedAt = asNumber(asRecord(info.time).completed);
      if (completedAt && run.latestAssistantMessageId) {
        void this.hydrateMessageSnapshot(session, run, run.latestAssistantMessageId);
      }
      return;
    }

    if (type === "permission.updated" || type === "permission.asked") {
      this.handlePermissionRequest(run, sessionId, properties);
      return;
    }

    if (type === "question.asked") {
      this.handleQuestionRequest(run, sessionId, properties);
      return;
    }

    if (type === "session.next.shell.started") {
      this.handleShellStarted(run, properties);
      return;
    }

    if (type === "session.next.shell.ended") {
      this.handleShellEnded(run, properties);
      return;
    }

    if (type === "session.next.tool.called") {
      this.handleNextToolCalled(run, properties);
      return;
    }

    if (type === "session.error") {
      this.finishRun(run, normalizeError(properties.error || properties, "OpenCode session failed."));
      return;
    }

    if (type === "session.status") {
      const status = asString(asRecord(properties.status).type);
      if (status === "idle") {
        if (run.permissionById.size) {
          run.idlePendingApproval = true;
        } else {
          void this.finalizeRun(session, run);
        }
      }
      return;
    }

    if (type === "session.idle") {
      if (run.permissionById.size) {
        run.idlePendingApproval = true;
      } else {
        void this.finalizeRun(session, run);
      }
    }
  }

  private handlePartUpdateEvent(run: ActiveRun, part: Record<string, unknown>, providedDelta?: string) {
    const messageId = asString(part.messageID);
    if (!messageId) return;
    const role = run.messageRoleById.get(messageId);
    if (role === "assistant") {
      this.applyPartUpdate(run, part, providedDelta);
      return;
    }
    if (role === "user") return;
    const queue = run.pendingPartUpdatesByMessageId.get(messageId) ?? [];
    queue.push({ part, delta: providedDelta });
    run.pendingPartUpdatesByMessageId.set(messageId, queue);
  }

  private handlePartDeltaEvent(run: ActiveRun, properties: Record<string, unknown>) {
    const messageId = asString(properties.messageID);
    if (!messageId) return;
    const role = run.messageRoleById.get(messageId);
    if (role === "assistant") {
      this.applyPartDelta(run, properties);
      return;
    }
    if (role === "user") return;
    const queue = run.pendingPartDeltasByMessageId.get(messageId) ?? [];
    queue.push(properties);
    run.pendingPartDeltasByMessageId.set(messageId, queue);
  }

  private flushPendingAssistantParts(run: ActiveRun, messageId: string) {
    const updates = run.pendingPartUpdatesByMessageId.get(messageId) ?? [];
    for (const item of updates) this.applyPartUpdate(run, item.part, item.delta);
    run.pendingPartUpdatesByMessageId.delete(messageId);

    const deltas = run.pendingPartDeltasByMessageId.get(messageId) ?? [];
    for (const item of deltas) this.applyPartDelta(run, item);
    run.pendingPartDeltasByMessageId.delete(messageId);
  }

  private handleShellStarted(run: ActiveRun, properties: Record<string, unknown>) {
    if (run.completed) return;
    const callId = asString(properties.callID);
    const command = asString(properties.command);
    if (!callId || !command) return;
    run.onEvent({
      type: "tool_start",
      action: {
        tool: "bash",
        toolId: callId,
        label: `命令 ${command}`,
        kind: "command",
        status: "pending",
        input: command
      }
    });
  }

  private handleShellEnded(run: ActiveRun, properties: Record<string, unknown>) {
    if (run.completed) return;
    const callId = asString(properties.callID);
    if (!callId) return;
    const output = asString(properties.output);
    run.onEvent({
      type: "tool_done",
      toolId: callId,
      status: "done",
      output: output || undefined
    });
  }

  private handleNextToolCalled(run: ActiveRun, properties: Record<string, unknown>) {
    if (run.completed) return;
    const callId = asString(properties.callID);
    const tool = asString(properties.tool) || "tool";
    if (!callId) return;
    const inputRecord = asRecord(properties.input);
    const kind = toolKind(tool);
    run.onEvent({
      type: "tool_start",
      action: {
        tool,
        toolId: callId,
        label: actionLabel(tool, inputRecord, kind),
        kind,
        status: "pending",
        input: Object.keys(inputRecord).length ? compactJson(inputRecord) : undefined,
        path: asString(inputRecord.path ?? inputRecord.file)
      }
    });
  }

  private applyPartUpdate(run: ActiveRun, part: Record<string, unknown>, providedDelta?: string) {
    if (run.completed) return;
    const partType = asString(part.type);
    const partId = asString(part.id);
    if (!partId || !partType) return;
    run.partKindById.set(partId, partType);

    if (partType === "reasoning" || partType === "text") {
      const nextText = asString(part.text);
      const previousText = run.partTextById.get(partId) ?? "";
      const delta = partTextDelta(previousText, nextText, providedDelta);
      const snapshot = nextText || `${previousText}${delta}`;
      run.partTextById.set(partId, snapshot);
      if (!delta) return;
      if (partType === "reasoning") {
        run.onEvent({ type: "thinking_delta", content: delta, kind: "reasoning", itemId: partId });
        return;
      }
      run.content += delta;
      run.onEvent({ type: "text_delta", content: delta, kind: "message", itemId: partId });
      return;
    }

    if (partType === "tool") {
      const state = asRecord(part.state);
      const status = asString(state.status);
      const input = asRecord(state.input);
      const tool = asString(part.tool) || "tool";
      const toolId = asString(part.callID) || partId;
      const kind = toolKind(tool);
      if (!run.actionByPartId.has(partId)) {
        const action: AgentSessionAction = {
          tool,
          toolId,
          label: actionLabel(tool, input, kind),
          kind,
          status: "pending",
          input: compactJson(input),
          startedAt: asNumber(asRecord(state.time).start),
          path: asString(input.path ?? input.file)
        };
        run.actionByPartId.set(partId, action);
        if (kind === "file_change") {
          run.fileChangeAuditsByPartId.set(partId, createFileChangeAudit(collectFileChangePaths(input), { cwd: run.directory, roots: run.roots }));
        }
        run.activeToolIds.add(partId);
        run.onEvent({ type: "tool_start", action });
      }
      if (status === "completed" || status === "error") {
        const action = run.actionByPartId.get(partId);
        const output = status === "completed" ? asString(state.output) : asString(state.error);
        const verification = status === "completed" && action?.kind === "file_change"
          ? verifyFileChangeAudit(
            run.fileChangeAuditsByPartId.get(partId)
            ?? createFileChangeAudit(collectFileChangePaths(input), { cwd: run.directory, roots: run.roots })
          )
          : null;
        const finalStatus = verification ? (verification.ok ? "done" : "error") : (status === "completed" ? "done" : "error");
        const finalOutput = mergeToolOutput([output, verification?.message]);
        run.onEvent({
          type: "tool_done",
          toolId: action?.toolId ?? toolId,
          status: finalStatus,
          output: finalOutput || undefined
        });
        if (action) {
          action.status = finalStatus;
          action.output = finalOutput || undefined;
        }
        run.activeToolIds.delete(partId);
      }
      return;
    }

    if (partType === "patch") {
      if (!run.actionByPartId.has(partId)) {
        const files = Array.isArray(part.files) ? part.files.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
        const action: AgentSessionAction = {
          tool: "patch",
          toolId: partId,
          label: "编辑文件",
          kind: "file_change",
          status: "pending",
          output: summarizePatchFiles(part.files),
          path: files[0]
        };
        run.actionByPartId.set(partId, action);
        run.fileChangeAuditsByPartId.set(partId, createFileChangeAudit(files, { cwd: run.directory, roots: run.roots }));
        run.onEvent({ type: "tool_start", action });
      }
      const verification = verifyFileChangeAudit(
        run.fileChangeAuditsByPartId.get(partId)
          ?? createFileChangeAudit(
          Array.isArray(part.files) ? part.files.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
          { cwd: run.directory, roots: run.roots }
        )
      );
      const finalOutput = mergeToolOutput([summarizePatchFiles(part.files), verification.message]);
      const action = run.actionByPartId.get(partId);
      if (action) {
        action.status = verification.ok ? "done" : "error";
        action.output = finalOutput || undefined;
      }
      run.onEvent({
        type: "tool_done",
        toolId: partId,
        status: verification.ok ? "done" : "error",
        output: finalOutput || undefined
      });
      return;
    }

    if (partType === "step-start" || partType === "step-finish") {
      if (!run.actionByPartId.has(partId)) {
        const action: AgentSessionAction = {
          tool: "step",
          toolId: partId,
          label: "执行步骤",
          kind: "plan",
          status: "pending"
        };
        run.actionByPartId.set(partId, action);
        run.onEvent({ type: "tool_start", action });
      }
      if (partType === "step-finish") {
        run.onEvent({
          type: "tool_done",
          toolId: partId,
          status: "done",
          output: asString(part.reason) || undefined
        });
      }
    }
  }

  private applyPartDelta(run: ActiveRun, properties: Record<string, unknown>) {
    if (run.completed) return;
    const partId = asString(properties.partID);
    const field = asString(properties.field);
    const delta = asString(properties.delta);
    const partType = run.partKindById.get(partId);
    if (!partId || field !== "text" || !delta || !partType) return;

    const previousText = run.partTextById.get(partId) ?? "";
    run.partTextById.set(partId, `${previousText}${delta}`);
    if (partType === "reasoning") {
      run.onEvent({ type: "thinking_delta", content: delta, kind: "reasoning", itemId: partId });
      return;
    }
    if (partType === "text") {
      run.content += delta;
      run.onEvent({ type: "text_delta", content: delta, kind: "message", itemId: partId });
    }
  }

  private handlePermissionRequest(run: ActiveRun, sessionId: string, properties: Record<string, unknown>) {
    const approvalId = asString(properties.id);
    if (!approvalId) return;
    const toolInfo = asRecord(properties.tool);
    const callId = asString(properties.callID) || asString(toolInfo.callID) || approvalId;
    const title = asString(properties.title) || asString(properties.permission) || "权限请求";
    const payloadRecords = approvalPayloadRecords(properties);
    const command = approvalCommand(payloadRecords);
    const cwd = approvalCwd(payloadRecords) || run.directory;
    const message = approvalMessage(properties);
    run.permissionById.set(approvalId, { toolId: callId, sessionId, directory: run.directory, kind: "permission" });
    run.onEvent({
      type: "approval_request",
      action: {
        tool: command ? "bash" : "permission",
        toolId: callId,
        label: command ? `命令 ${command}` : title,
        kind: "approval",
        status: "pending",
        input: command || undefined,
        approval: {
          id: approvalId,
          kind: command ? "command" : "tool",
          title,
          message: message || undefined,
          command: command || undefined,
          cwd: cwd || undefined,
          availableDecisions: ["accept", "decline"]
        }
      }
    });
  }

  private handleQuestionRequest(run: ActiveRun, sessionId: string, properties: Record<string, unknown>) {
    const requestId = asString(properties.id);
    if (!requestId) return;
    const toolInfo = asRecord(properties.tool);
    const callId = asString(toolInfo.callID) || requestId;
    const questions = Array.isArray(properties.questions) ? properties.questions.map((item) => asRecord(item)) : [];
    const lines = questions.flatMap((item, index) => {
      const prompt = asString(item.question) || `问题 ${index + 1}`;
      const options = Array.isArray(item.options) ? item.options.map((option) => asRecord(option)) : [];
      const optionLines = options.map((option) => {
        const label = asString(option.label);
        const description = asString(option.description);
        return description ? `- ${label}: ${description}` : `- ${label}`;
      });
      return optionLines.length ? [prompt, ...optionLines] : [prompt];
    });
    const answers = questions.map((item) => {
      const options = Array.isArray(item.options) ? item.options.map((option) => asRecord(option)) : [];
      const firstLabel = asString(options[0]?.label);
      return firstLabel ? [firstLabel] : [];
    });
    run.permissionById.set(requestId, {
      toolId: callId,
      sessionId,
      directory: run.directory,
      kind: "question",
      answers
    });
    run.onEvent({
      type: "approval_request",
      action: {
        tool: "question",
        toolId: callId,
        label: asString(questions[0]?.header) || "需要确认",
        kind: "approval",
        status: "pending",
        approval: {
          id: requestId,
          kind: "tool",
          title: asString(questions[0]?.header) || "需要确认",
          message: lines.join("\n"),
          availableDecisions: ["accept", "decline"]
        }
      }
    });
  }

  private async hydrateMessageSnapshot(session: OpenCodeSession, run: ActiveRun, messageId: string) {
    if (run.completed || run.hydratedMessageIds.has(messageId)) return;
    const existing = run.hydratingMessagesById.get(messageId);
    if (existing) return existing;

    const hydration = (async () => {
      try {
        const response = await session.client.session.message({
          path: { id: run.sessionId, messageID: messageId },
          query: { directory: session.provider.cwd || process.cwd() }
        });
        const data = asRecord(response.data);
        const parts = Array.isArray(data.parts) ? data.parts : [];
        for (const part of parts) {
          this.applyPartUpdate(run, asRecord(part));
        }
        if (!run.completed) run.hydratedMessageIds.add(messageId);
      } finally {
        run.hydratingMessagesById.delete(messageId);
      }
    })();

    run.hydratingMessagesById.set(messageId, hydration);
    return hydration;
  }

  private async finalizeRun(session: OpenCodeSession, run: ActiveRun) {
    if (run.completed || run.finalizing || run.permissionById.size) return;
    run.finalizing = true;
    try {
      if (run.latestAssistantMessageId) {
        await this.hydrateMessageSnapshot(session, run, run.latestAssistantMessageId);
      }
      this.finishRun(run, null);
    } finally {
      run.finalizing = false;
    }
  }

  private finishRun(run: ActiveRun, error: Error | null) {
    if (run.completed) return;
    run.completed = true;
    clearTimeout(run.timer);
    run.permissionById.clear();
    this.activeRuns.delete(run.providerId);
    if (error) {
      run.onEvent({ type: "error", message: error.message });
      run.reject(error);
      return;
    }
    const content = run.content.trim();
    run.onEvent({ type: "done", content });
    run.resolve({ content });
  }

  private async runHealthCheck(session: OpenCodeSession): Promise<AgentConnection> {
    const directory = session.provider.cwd || process.cwd();
    const [auth, providers] = await Promise.all([
      session.client.provider.auth({ query: { directory } }),
      session.client.config.providers({ query: { directory } })
    ]);
    if (auth.error) throw new Error("OpenCode provider 鉴权不可用。");
    return {
      providerId: session.provider.id,
      status: "connected",
      message: "OpenCode runtime ready.",
      tools: [{ name: "opencode_sdk", description: "OpenCode SDK runtime." }],
      models: extractProviderModels(providers.data)
    };
  }

  private normalizeConnectError(error: unknown) {
    if (isMissingCommandError(error)) return formatAgentLaunchError("OpenCode", "opencode", error);
    const message = asErrorMessage(error);
    if (/ProviderAuthError|provider.*auth|oauth/i.test(message)) return "OpenCode 需要登录或 provider 鉴权未完成。";
    if (/wal_checkpoint|database|sqlite/i.test(message)) return "OpenCode 本地会话数据库当前被占用或异常，请关闭冲突进程后重试。";
    if (/model/i.test(message)) return "OpenCode 当前模型不可用，请切换 provider 或模型后重试。";
    return `OpenCode 启动失败：${message}`;
  }

  private mapDecision(decision: AgentApprovalDecision) {
    if (decision === "acceptForSession") return "always";
    if (decision === "decline" || decision === "cancel") return "reject";
    return "once";
  }
}
