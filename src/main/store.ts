import { app } from "electron";
import log from "electron-log";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { homedir } from "node:os";
import type {
  AgentConversation,
  AgentConversationMessage,
  AgentProvider,
  AppData,
  AppSettings,
  InformioDocumentKind,
  InformioDocument,
  InformioFolder,
  InformioProject
} from "../shared/types.js";
import {
  DEFAULT_CUSTOM_THEME_COLOR,
  LEGACY_THEME_COLORS,
  migrateThemeName,
  normalizeThemeColor
} from "../shared/theme.js";
import { normalizeShortcutBindings } from "../shared/shortcuts.js";
import { buildWorkspaceScopeId } from "../shared/workspaceScope.js";

const now = () => new Date().toISOString();
const quickFolder = () => join(homedir(), "Documents", "Informio Quick Notes");
const defaultChineseFontFamily = process.platform === "win32" ? "Microsoft YaHei UI" : "PingFang SC";
const defaultEnglishFontFamily = process.platform === "win32" ? "Segoe UI" : "Helvetica Neue";
const defaultCodeFontFamily = process.platform === "win32" ? "Consolas" : "SF Mono";
const normalizeFontFamilySetting = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const textDocumentKinds = new Set<InformioDocumentKind>(["markdown", "text"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm"]);
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".ogg"]);
const pdfExtensions = new Set([".pdf"]);
const spreadsheetExtensions = new Set([".xlsx", ".xls", ".csv"]);
const wordExtensions = new Set([".docx", ".doc"]);

const documentKindFromPath = (path?: string): InformioDocumentKind => {
  if (!path) return "markdown";
  const extension = extname(path).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".txt") return "text";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  if (pdfExtensions.has(extension)) return "pdf";
  if (spreadsheetExtensions.has(extension)) return "spreadsheet";
  if (wordExtensions.has(extension)) return "word";
  return "unknown";
};

const normalizeDocumentKind = (document: InformioDocument): InformioDocumentKind =>
  document.kind ?? documentKindFromPath(document.filePath ?? document.title);

const normalizeDocuments = (documents: InformioDocument[]) =>
  documents.map((document) => ({
    ...document,
    kind: normalizeDocumentKind(document)
  }));
const normalizeAssetImportMode = (value: AppSettings["editor"]["assetImportMode"] | undefined): AppSettings["editor"]["assetImportMode"] =>
  value === "link-original-file" ? "link-original-file" : "copy-to-attachment";

export const defaultSettings: AppSettings = {
  agentRuntime: {
    enabled: true,
    autoStart: true,
    conversationRetentionLimit: 5,
    conversationRetentionDays: 30
  },
  api: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    models: []
  },
  appearance: {
    theme: "paper",
    customThemeColor: DEFAULT_CUSTOM_THEME_COLOR,
    chineseFontFamily: defaultChineseFontFamily,
    englishFontFamily: defaultEnglishFontFamily,
    codeFontFamily: defaultCodeFontFamily,
    showTitleInWindow: true,
    autoHideStatusBar: false,
    chatFontSize: 13,
    leftPanel: "expanded",
    rightPanel: "collapsed",
    leftPanelWidth: 248,
    rightPanelWidth: 330
  },
  editor: {
    fontSize: 15,
    lineHeight: 1.72,
    contentWidth: 888,
    spellcheck: true,
    typewriterMode: false,
    assetImportMode: "copy-to-attachment"
  },
  markdown: {
    autoSave: true,
    tabSize: 2,
    exportFormat: "markdown"
  },
  shortcuts: {
    quickFolder: quickFolder(),
    bindings: normalizeShortcutBindings()
  },
  language: "zh-CN",
  activeAgentId: "codex",
  toolbarAgentId: "codex",
  agents: [
    {
      id: "claude-code",
      name: "Claude Code",
      transport: "claude-agent-sdk",
      command: "claude",
      args: [],
      enabled: true,
      model: "",
      models: [],
      runtimeSupportsResume: true,
      runtimePermissionModes: ["read_only", "default", "full_access"],
      description: "适合代码库理解、修改建议和长上下文任务。"
    },
    {
      id: "codex",
      name: "Codex CLI",
      transport: "codex-app-server",
      command: "codex",
      args: ["app-server", "--listen", "stdio://"],
      enabled: true,
      model: "",
      models: [],
      runtimeSupportsResume: true,
      runtimePermissionModes: ["read_only", "default", "full_access"],
      description: "适合在当前工作区里分析、改写和执行开发任务。"
    },
    {
      id: "opencode",
      name: "Opencode",
      transport: "opencode-sdk",
      command: "opencode",
      args: [],
      enabled: true,
      model: "",
      models: [],
      runtimeSupportsResume: true,
      runtimePermissionModes: ["read_only", "default", "full_access"],
      description: "适合使用本机 OpenCode 配置处理代码任务。"
    }
  ]
};

const folderRecord = (path: string): InformioFolder => ({
  id: `folder-${path}`,
  title: basename(path) || path,
  path,
  updatedAt: now()
});

export const projectRecord = (path: string): InformioProject => ({
  id: `project-${path}`,
  path,
  title: basename(path) || path,
  addedAt: now()
});

const buildWorkspaceLabel = (workspacePath: string | undefined, projects: InformioProject[]) => {
  const titles = projects
    .map((project) => project.title?.trim() || basename(project.path) || project.path)
    .filter(Boolean);
  if (titles.length) return titles.join(" · ");
  if (workspacePath) return basename(workspacePath) || workspacePath;
  return "未命名工作区";
};

const normalizeConversationMessage = (value: Partial<AgentConversationMessage>): AgentConversationMessage | null => {
  const role = value.role === "assistant" ? "assistant" : value.role === "user" ? "user" : null;
  if (!role) return null;
  const content = typeof value.content === "string" ? value.content : "";
  if (!content && role === "assistant" && !value.errorMessage) return null;
  return {
    id: value.id || `agent-message-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: value.createdAt || now(),
    permissionMode: value.permissionMode === "read_only" || value.permissionMode === "full_access" ? value.permissionMode : "default",
    status: value.status === "error" ? "error" : value.status === "done" ? "done" : undefined,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : undefined,
    reasoning: typeof value.reasoning === "string" ? value.reasoning : undefined,
    actions: Array.isArray(value.actions) ? value.actions : undefined
  };
};

const normalizeConversationRetentionLimit = (limit: number | undefined) =>
  Math.max(1, Math.min(200, Math.floor(limit || defaultSettings.agentRuntime.conversationRetentionLimit)));

const normalizeConversationRetentionDays = (days: number | undefined) =>
  Math.max(1, Math.min(3650, Math.floor(days || defaultSettings.agentRuntime.conversationRetentionDays)));

export const pruneAgentConversations = (
  conversations: AgentConversation[],
  limit = defaultSettings.agentRuntime.conversationRetentionLimit,
  retentionDays = defaultSettings.agentRuntime.conversationRetentionDays
) => {
  const normalizedLimit = Math.max(1, Math.min(200, Math.floor(limit || defaultSettings.agentRuntime.conversationRetentionLimit)));
  const normalizedDays = normalizeConversationRetentionDays(retentionDays);
  const cutoffTime = Date.now() - normalizedDays * 24 * 60 * 60 * 1000;
  const grouped = new Map<string, AgentConversation[]>();
  conversations.forEach((conversation) => {
    const updatedAtTime = Date.parse(conversation.updatedAt);
    if (!Number.isFinite(updatedAtTime) || updatedAtTime < cutoffTime) return;
    const key = conversation.providerId;
    const items = grouped.get(key) ?? [];
    items.push(conversation);
    grouped.set(key, items);
  });

  return Array.from(grouped.values()).flatMap((items) =>
    items
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, normalizedLimit)
  );
};

export const normalizeAgentConversations = (
  conversations: Partial<AgentConversation>[] | undefined,
  workspacePath: string | undefined,
  projects: InformioProject[],
  limit = defaultSettings.agentRuntime.conversationRetentionLimit,
  retentionDays = defaultSettings.agentRuntime.conversationRetentionDays
) => {
  const workspaceLabel = buildWorkspaceLabel(workspacePath, projects);
  const workspaceScopeId = buildWorkspaceScopeId({ workspacePath, projects });
  const normalized: AgentConversation[] = [];
  (conversations ?? []).forEach((conversation) => {
    if (!conversation?.id || !conversation.providerId) return;
    const messages = (conversation.messages ?? [])
      .map((message) => normalizeConversationMessage(message))
      .filter((message): message is AgentConversationMessage => Boolean(message));
    const createdAt = conversation.createdAt || messages[0]?.createdAt || now();
    const updatedAt = conversation.updatedAt || messages.at(-1)?.createdAt || createdAt;
    normalized.push({
      id: conversation.id,
      workspaceScopeId: conversation.workspaceScopeId || workspaceScopeId,
      workspaceLabel: conversation.workspaceLabel || workspaceLabel,
      providerId: conversation.providerId,
      title: conversation.title?.trim() || "新会话",
      createdAt,
      updatedAt,
      runtimeThreadId: conversation.runtimeThreadId,
      messages
    });
  });
  return pruneAgentConversations(normalized, limit, retentionDays);
};

export const defaultData: AppData = {
  settings: defaultSettings,
  workspacePath: quickFolder(),
  projects: [projectRecord(quickFolder())],
  agentConversations: [],
  folders: [
    {
      id: "quick-notes",
      title: basename(quickFolder()),
      path: quickFolder(),
      updatedAt: now()
    }
  ],
  activeDocumentId: "attention-budget",
  documents: [
    {
      id: "attention-budget",
      title: "注意力预算.md",
      kind: "markdown",
      collection: "writing",
      updatedAt: now(),
      markdown: `# 注意力预算：写作者的最小系统

> 我不是缺少灵感，而是经常把灵感消耗在整理入口上。

每天早上打开电脑时，真正需要的是一个足够安静的地方：左边是材料，中间是正文，右边只在我需要时出现。AI 不应该替我写完一切，它应该像一个坐在旁边的编辑，只处理我圈出来的段落。

## 当前问题

- 想法分散在备忘录、网页剪藏和聊天记录里
- Markdown 写作足够轻，但缺少上下文提醒
- AI 工具很强，却常常把注意力从正文里拉走

## 需要的体验

1. 新建文档不超过一步。
2. 文档库必须能看出最近编辑、字数和关联笔记。
3. AI 默认收起，只在选中文本、改写、总结、继续写时打开。
4. 输入区天然就是最终阅读态，不需要单独切换界面。
`
    },
    {
      id: "reading-notes",
      title: "读书摘录.md",
      kind: "markdown",
      collection: "knowledge",
      pinned: true,
      updatedAt: now(),
      markdown: "## Building a Second Brain\n\n- Capture lightly.\n- Organize only when retrieval improves.\n- Express from connected notes."
    },
    {
      id: "inbox",
      title: "Inbox.md",
      kind: "markdown",
      collection: "writing",
      updatedAt: now(),
      markdown: ""
    }
  ]
};

const dataPath = () => join(app.getPath("userData"), "informio-data.json");

const uniqueMarkdownPath = async (folder: string, title: string) => {
  for (let index = 0; index < 999; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const path = join(folder, title.replace(/\.md$/i, `${suffix}.md`));
    try {
      await stat(path);
    } catch {
      return path;
    }
  }
  return join(folder, title.replace(/\.md$/i, `-${Date.now()}.md`));
};

const defaultAgentById = new Map(defaultSettings.agents.map((agent) => [agent.id, agent]));

const dedupeFolders = (folders: InformioFolder[]) =>
  Array.from(new Map(folders.map((folder) => [folder.path, { ...folder, title: folder.title || basename(folder.path) || folder.path }])).values());

const isUnsupportedAgent = (agent: Partial<AgentProvider>) => {
  const id = (agent.id ?? "").trim().toLowerCase();
  const name = (agent.name ?? "").trim().toLowerCase();
  const command = (agent.command ?? "").trim().toLowerCase();
  return (
    id === "droid"
    || id === "pi"
    || id.includes("gemini")
    || name === "pi"
    || name.includes("gemini")
    || command === "pi"
    || command === "gemini"
    || command === "gemini-cli"
  );
};

const mergeAgent = (agent: Partial<AgentProvider>): AgentProvider => {
  const base = (agent.id && defaultAgentById.get(agent.id)) || defaultSettings.agents[0];
  const legacyClaudeModelAliases = new Set(["default", "sonnet", "opus", "haiku"]);
  const legacyCodexModelIds = new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"]);
  const legacyCodexMcpPreset =
    agent.id === "codex"
    && (agent.transport as string | undefined) === "mcp"
    && (agent.command ?? base.command) === "codex"
    && (agent.args ?? []).join(" ") === "mcp-server";
  const legacyClaudeMcpPreset =
    agent.id === "claude-code"
    && (agent.transport as string | undefined) === "mcp"
    && (agent.command ?? base.command) === "claude"
    && (agent.args ?? []).join(" ") === "mcp serve";
  const legacyOpencodeCliPreset =
    agent.id === "opencode"
    && (agent.transport as string | undefined) === "cli";
  const legacyPreset = !agent.transport;
  const defaultPreset = Boolean(agent.id && defaultAgentById.has(agent.id));
  const normalizedCodexModels =
    agent.id === "codex"
    && Array.isArray(agent.models)
    && agent.models.length > 0
    && agent.models.every((model) => legacyCodexModelIds.has(model.id))
      ? base.models
      : agent.models;
  const normalizedClaudeModel =
    agent.id === "claude-code" && agent.model && legacyClaudeModelAliases.has(agent.model)
      ? base.model
      : (agent.model ?? base.model);
  const normalizedCodexModel =
    agent.id === "codex" && agent.model && legacyCodexModelIds.has(agent.model)
      ? base.model
      : (agent.model ?? base.model);
  const normalizedModels =
    agent.id === "claude-code"
      ? (
          Array.isArray(agent.models)
          && agent.models.length > 0
          && agent.models.every((model) => legacyClaudeModelAliases.has(model.id))
            ? base.models
            : (agent.models ?? base.models)
        )
      : agent.id === "codex"
        ? (normalizedCodexModels ?? base.models)
        : (agent.models ?? base.models);
  return {
    ...base,
    ...agent,
    transport: legacyPreset || legacyCodexMcpPreset || legacyClaudeMcpPreset || legacyOpencodeCliPreset ? base.transport : (agent.transport ?? base.transport),
    command: legacyPreset || legacyCodexMcpPreset || legacyClaudeMcpPreset || legacyOpencodeCliPreset ? base.command : (agent.command ?? base.command),
    args: legacyPreset || legacyCodexMcpPreset || legacyClaudeMcpPreset || legacyOpencodeCliPreset ? base.args : (agent.args ?? base.args),
    model: agent.id === "codex" ? normalizedCodexModel : normalizedClaudeModel,
    models: normalizedModels,
    runtimeSupportsResume: agent.runtimeSupportsResume ?? base.runtimeSupportsResume,
    runtimePermissionModes: agent.runtimePermissionModes ?? base.runtimePermissionModes,
    description: defaultPreset || legacyPreset || legacyCodexMcpPreset || legacyClaudeMcpPreset || legacyOpencodeCliPreset ? base.description : (agent.description ?? base.description)
  };
};

const mergeAgents = (agents?: Partial<AgentProvider>[]) => {
  const supportedAgents = (agents ?? []).filter((agent) => !isUnsupportedAgent(agent));
  const providedById = new Map(supportedAgents.filter((agent) => agent.id).map((agent) => [agent.id!, agent]));
  const defaults = defaultSettings.agents.map((agent) => mergeAgent({ ...agent, ...providedById.get(agent.id) }));
  const custom = supportedAgents.filter((agent) => agent.id && !defaultAgentById.has(agent.id)).map(mergeAgent);
  return [...defaults, ...custom];
};

const mergeData = (value: Partial<AppData>): AppData => {
  const persistedShortcuts = value.settings?.shortcuts as
    | (AppSettings["shortcuts"] & { quickSave?: string; quickCapture?: string })
    | undefined;
  const resolvedWorkspacePath = value.workspacePath ?? persistedShortcuts?.quickFolder ?? quickFolder();
  const projects: InformioProject[] = value.projects?.length
    ? value.projects
    : [projectRecord(resolvedWorkspacePath)];
  const persistedAgentRuntime =
    ((value.settings as (AppSettings & { mcp?: AppSettings["agentRuntime"] }) | undefined)?.agentRuntime
      ?? (value.settings as (AppSettings & { mcp?: AppSettings["agentRuntime"] }) | undefined)?.mcp);
  const conversationRetentionLimit = normalizeConversationRetentionLimit(persistedAgentRuntime?.conversationRetentionLimit);
  const conversationRetentionDays = normalizeConversationRetentionDays(persistedAgentRuntime?.conversationRetentionDays);
  const agents = mergeAgents(value.settings?.agents);
  const activeAgentId = agents.some((agent) => agent.id === value.settings?.activeAgentId)
    ? value.settings!.activeAgentId
    : defaultSettings.activeAgentId;
  const toolbarAgentId = agents.some((agent) => agent.id === value.settings?.toolbarAgentId)
    ? value.settings!.toolbarAgentId
    : activeAgentId;
  const persistedTheme = value.settings?.appearance?.theme as string | undefined;
  const theme = migrateThemeName(persistedTheme);
  const customThemeColor = normalizeThemeColor(
    persistedTheme === "mint"
      ? LEGACY_THEME_COLORS.mint
      : persistedTheme === "sepia"
        ? LEGACY_THEME_COLORS.sepia
        : value.settings?.appearance?.customThemeColor,
    DEFAULT_CUSTOM_THEME_COLOR
  );
  const legacyAppearance = value.settings?.appearance as
    | (Partial<AppSettings["appearance"]> & { bodyFontFamily?: string })
    | undefined;
  return {
    ...defaultData,
    ...value,
    documents: value.documents?.length ? normalizeDocuments(value.documents) : defaultData.documents,
    projects,
    agentConversations: normalizeAgentConversations(
      value.agentConversations,
      resolvedWorkspacePath,
      projects,
      conversationRetentionLimit,
      conversationRetentionDays
    ),
    workspacePath: resolvedWorkspacePath,
    folders: dedupeFolders(
      value.folders?.length
        ? value.folders
        : [
            folderRecord(resolvedWorkspacePath),
            ...(value.documents ?? []).filter((doc) => doc.filePath).map((doc) => folderRecord(dirname(doc.filePath!)))
          ]
    ),
    settings: {
      ...defaultSettings,
      ...value.settings,
      agentRuntime: {
        ...defaultSettings.agentRuntime,
        ...persistedAgentRuntime,
        conversationRetentionLimit,
        conversationRetentionDays
      },
      api: { ...defaultSettings.api, ...value.settings?.api, models: value.settings?.api?.models ?? defaultSettings.api.models },
      appearance: {
        ...defaultSettings.appearance,
        ...value.settings?.appearance,
        theme,
        customThemeColor,
        chineseFontFamily: normalizeFontFamilySetting(
          value.settings?.appearance?.chineseFontFamily ?? legacyAppearance?.bodyFontFamily,
          defaultSettings.appearance.chineseFontFamily
        ),
        englishFontFamily: normalizeFontFamilySetting(
          value.settings?.appearance?.englishFontFamily ?? legacyAppearance?.bodyFontFamily,
          defaultSettings.appearance.englishFontFamily
        ),
        codeFontFamily: normalizeFontFamilySetting(
          value.settings?.appearance?.codeFontFamily,
          defaultSettings.appearance.codeFontFamily
        ),
        chatFontSize: Math.max(10, Math.min(18, value.settings?.appearance?.chatFontSize ?? defaultSettings.appearance.chatFontSize))
      },
      editor: {
        ...defaultSettings.editor,
        ...value.settings?.editor,
        fontSize: [17, 19].includes(value.settings?.editor?.fontSize ?? 0)
          ? defaultSettings.editor.fontSize
          : (value.settings?.editor?.fontSize ?? defaultSettings.editor.fontSize),
        lineHeight:
          [1.66, 1.78].includes(value.settings?.editor?.lineHeight ?? 0)
            ? defaultSettings.editor.lineHeight
            : (value.settings?.editor?.lineHeight ?? defaultSettings.editor.lineHeight),
        assetImportMode: normalizeAssetImportMode(value.settings?.editor?.assetImportMode)
      },
      markdown: { ...defaultSettings.markdown, ...value.settings?.markdown },
      shortcuts: {
        quickFolder: persistedShortcuts?.quickFolder || defaultSettings.shortcuts.quickFolder,
        bindings: normalizeShortcutBindings(persistedShortcuts?.bindings, persistedShortcuts)
      },
      agents,
      activeAgentId,
      toolbarAgentId
    }
  };
};

async function saveDocumentFiles(documents: InformioDocument[]) {
  await Promise.all(
    documents
      .filter((doc) => {
        if (!doc.filePath) return false;
        return textDocumentKinds.has(normalizeDocumentKind(doc));
      })
      .map(async (doc) => {
        const path = doc.filePath!;
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, doc.markdown, "utf8");
      })
  );
}

export async function loadAppData(): Promise<AppData> {
  try {
    const raw = await readFile(dataPath(), "utf8");
    return mergeData(JSON.parse(raw) as Partial<AppData>);
  } catch (error) {
    log.warn("Failed to load app data, using defaults:", error);
    await saveAppData(defaultData);
    return defaultData;
  }
}

export async function saveAppData(data: AppData): Promise<AppData> {
  const path = dataPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
  return data;
}

export async function saveAppDataAndFiles(data: AppData): Promise<AppData> {
  await saveDocumentFiles(data.documents);
  return saveAppData(data);
}

export async function createQuickDocument(data: AppData): Promise<AppData> {
  const date = new Date();
  const stamp = date
    .toISOString()
    .replace(/T/, "-")
    .replace(/:/g, "")
    .replace(/\..+/, "");
  const title = `Quick-${stamp}.md`;
  const filePath = await uniqueMarkdownPath(data.settings.shortcuts.quickFolder || quickFolder(), title);
  const document: InformioDocument = {
    id: `quick-${Date.now()}`,
    title: basename(filePath),
    filePath,
    kind: "markdown",
    collection: "writing",
    updatedAt: now(),
    markdown: ""
  };

  const next: AppData = {
    ...data,
    activeDocumentId: document.id,
    documents: [document, ...data.documents],
    settings: {
      ...data.settings,
      appearance: {
        ...data.settings.appearance,
        leftPanel: "collapsed",
        rightPanel: "collapsed"
      }
    }
  };

  return saveAppDataAndFiles(next);
}
