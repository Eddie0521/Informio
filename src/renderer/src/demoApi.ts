import type {
  ApiModelDetectionInput,
  AgentConversation,
  AgentSessionInput,
  AppData,
  AppSettings,
  DeletePdfAnnotationInput,
  FindPdfAnnotationInput,
  InformioDocument,
  LoadPdfAnnotationsInput,
  SaveAgentConversationsInput,
  SavePdfAnnotationInput,
  SendAgentMessageInput
} from "../../shared/types";
import type { InformioApi } from "../../preload";

const now = () => new Date().toISOString();
const normalizeDemoPath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
const demoPathContains = (root: string, path: string) => {
  const normalizedRoot = normalizeDemoPath(root);
  const normalizedPath = normalizeDemoPath(path);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};
const replaceDemoPathRoot = (path: string, oldRoot: string, newRoot: string) =>
  demoPathContains(oldRoot, path) ? `${normalizeDemoPath(newRoot)}${normalizeDemoPath(path).slice(normalizeDemoPath(oldRoot).length)}` : path;
const demoDirname = (path: string) => {
  const normalized = normalizeDemoPath(path);
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "/";
};
const demoBasename = (path: string) => {
  const normalized = normalizeDemoPath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
};

const localDateStamp = () => {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const demoData: AppData = {
  activeDocumentId: "attention-budget",
  workspacePath: "/Users/acumen7/Documents/Informio Quick Notes",
  agentConversations: [],
  projects: [
    {
      id: "project-/Users/acumen7/Documents/Informio Quick Notes",
      path: "/Users/acumen7/Documents/Informio Quick Notes",
      title: "Informio Quick Notes",
      addedAt: now()
    }
  ],
  folders: [
    {
      id: "demo-folder",
      title: "Informio Quick Notes",
      path: "/Users/acumen7/Documents/Informio Quick Notes",
      updatedAt: now()
    }
  ],
  settings: {
    agentRuntime: {
      enabled: true,
      autoStart: false,
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
      customThemeColor: "#159447",
      chineseFontFamily: "PingFang SC",
      englishFontFamily: "Helvetica Neue",
      codeFontFamily: "SF Mono",
      showTitleInWindow: true,
      autoHideStatusBar: false,
      chatFontSize: 13,
      leftPanel: "expanded",
      rightPanel: "expanded",
      leftPanelWidth: 248,
      rightPanelWidth: 330
    },
    editor: {
      fontSize: 15,
      lineHeight: 1.62,
      contentWidth: 820,
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
      quickFolder: "/Users/acumen7/Documents/Informio Quick Notes",
      bindings: {
        "app.quickCapture": "Control+Space",
        "file.new": "CommandOrControl+N",
        "window.new": "Shift+CommandOrControl+N",
        "commandPalette.open": "CommandOrControl+P",
        "file.open": "CommandOrControl+O",
        "workspace.open": "Shift+CommandOrControl+O",
        "file.closeTab": "CommandOrControl+W",
        "window.close": "Shift+CommandOrControl+W",
        "file.save": "CommandOrControl+S",
        "file.saveAs": "Shift+CommandOrControl+S",
        "settings.open": "CommandOrControl+,",
        "edit.find": "CommandOrControl+F",
        "edit.findNext": "CommandOrControl+G",
        "format.bold": "CommandOrControl+B",
        "format.italic": "CommandOrControl+I",
        "format.underline": "CommandOrControl+U",
        "format.strike": "Shift+CommandOrControl+X",
        "format.highlight": "Shift+CommandOrControl+M"
      }
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
        model: "gpt-5.3-codex",
        models: [
          { id: "gpt-5.5", label: "GPT-5.5" },
          { id: "gpt-5.4", label: "GPT-5.4" },
          { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
          { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
          { id: "gpt-5.2", label: "GPT-5.2" }
        ],
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
  },
  documents: [
    {
      id: "attention-budget",
      title: "注意力预算.md",
      filePath: "/Users/acumen7/Documents/Informio Quick Notes/注意力预算.md",
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
      filePath: "/Users/acumen7/Documents/Informio Quick Notes/读书摘录.md",
      collection: "knowledge",
      pinned: true,
      updatedAt: now(),
      markdown: "## Building a Second Brain\n\n- Capture lightly.\n- Organize only when retrieval improves.\n- Express from connected notes."
    },
    {
      id: "inbox",
      title: "Inbox.md",
      filePath: "/Users/acumen7/Documents/Informio Quick Notes/Inbox.md",
      collection: "writing",
      updatedAt: now(),
      markdown: ""
    }
  ]
};

const demoModelsByProvider: Record<ApiModelDetectionInput["provider"], { id: string; label: string }[]> = {
  "openai-compatible": [
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" }
  ],
  anthropic: [
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }
  ]
};

export function installDemoApi() {
  if (window.informio) return;

  let state = demoData;
  const api: InformioApi = {
    loadApp: async () => state,
    openSettings: async () => {
      window.open(`${window.location.origin}${window.location.pathname}#settings`, "_blank");
    },
    newWindow: async () => {
      window.open(window.location.href.replace(/#settings$/, ""), "_blank");
    },
    openFiles: async () => state,
    openWorkspace: async () => state,
    createDocument: async () => {
      const folder = state.settings.shortcuts.quickFolder;
      const document: InformioDocument = {
        id: `doc-${Date.now()}`,
        title: "Untitled.md",
        filePath: `${folder}/Untitled.md`,
        collection: "writing",
        updatedAt: new Date().toISOString(),
        markdown: "# Untitled\n\n"
      };
      state = { ...state, documents: [document, ...state.documents], activeDocumentId: document.id };
      return state;
    },
    createDocumentInFolder: async (folderPath: string) => {
      const document: InformioDocument = {
        id: `doc-${Date.now()}`,
        title: "Untitled.md",
        filePath: `${folderPath}/Untitled.md`,
        collection: "writing",
        updatedAt: new Date().toISOString(),
        markdown: "# Untitled\n\n"
      };
      state = { ...state, documents: [document, ...state.documents], activeDocumentId: document.id };
      return state;
    },
    createDefaultMarkdownDocument: async () => {
      const stamp = localDateStamp();
      const existingTitles = new Set(state.documents.map((document) => document.title));
      let title = `${stamp}-01.md`;
      for (let index = 1; index < 1000 && existingTitles.has(title); index += 1) {
        title = `${stamp}-${String(index + 1).padStart(2, "0")}.md`;
      }
      const folder = state.settings.shortcuts.quickFolder;
      const document: InformioDocument = {
        id: `default-${Date.now()}`,
        title,
        filePath: `${folder}/${title}`,
        collection: "writing",
        updatedAt: new Date().toISOString(),
        markdown: ""
      };
      state = { ...state, documents: [document, ...state.documents], activeDocumentId: document.id };
      return state;
    },
    createLinkedDocument: async (title: string) => {
      const cleanTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";
      const fileTitle = /\.md$/i.test(cleanTitle) ? cleanTitle : `${cleanTitle}.md`;
      const folder = state.settings.shortcuts.quickFolder;
      const document: InformioDocument = {
        id: `linked-${Date.now()}`,
        title: fileTitle,
        filePath: `${folder}/${fileTitle}`,
        collection: "knowledge",
        updatedAt: new Date().toISOString(),
        markdown: `# ${cleanTitle.replace(/\.md$/i, "")}\n\n`
      };
      state = { ...state, documents: [document, ...state.documents], activeDocumentId: document.id };
      return state;
    },
    createFolder: async () => state,
    createFolderInFolder: async (folderPath: string) => {
      const folder = {
        id: `folder-${folderPath}/New Folder`,
        title: "New Folder",
        path: `${folderPath}/New Folder`,
        updatedAt: new Date().toISOString()
      };
      state = { ...state, folders: [folder, ...state.folders] };
      return state;
    },
    insertAsset: async () => undefined,
    runFileSystemAction: async () => state,
    saveAttachment: async (input) => ({
      path: `/Users/acumen7/Documents/Informio Quick Notes/attachment/${input.fileName}`,
      fileName: input.fileName
    }),
    loadPdfAnnotations: async (_input: LoadPdfAnnotationsInput) => [],
    findPdfAnnotation: async (_input: FindPdfAnnotationInput) => null,
    savePdfAnnotation: async (input: SavePdfAnnotationInput) => ({
      annotation: {
        ...input.annotation,
        sourceWrite:
          input.annotation.sourceWrite ??
          (input.writeToSource
            ? { attempted: true, ok: false, pending: true, message: "浏览器预览不会修改本地 PDF；Electron 中会在后台写回源文件。" }
            : undefined)
      },
      sourceWrite:
        input.annotation.sourceWrite ??
        (input.writeToSource
          ? { attempted: true, ok: false, pending: true, message: "浏览器预览不会修改本地 PDF；Electron 中会在后台写回源文件。" }
          : undefined)
    }),
    deletePdfAnnotation: async (input: DeletePdfAnnotationInput) => ({
      annotationId: input.annotationId,
      sourceWrite: { attempted: false, ok: true }
    }),
    writePdfDocumentBytes: async () => ({ ok: false }),
    writePdfAnnotationSource: async () => ({
      sourceWrite: {
        attempted: true,
        ok: false,
        message: "浏览器预览不会修改本地 PDF；Electron 中会在后台写回源文件。"
      }
    }),
    saveSettings: async (settings: AppSettings) => {
      state = { ...state, settings };
      return state.settings;
    },
    getAppInfo: async () => ({
      name: "Informio",
      version: "0.1.1",
      githubUrl: ""
    }),
    saveDocuments: async (documents: InformioDocument[], activeDocumentId: string) => {
      state = { ...state, documents, activeDocumentId };
      return state;
    },
    saveNow: async (documents: InformioDocument[], activeDocumentId: string) => {
      state = { ...state, documents, activeDocumentId };
      return { data: state, savedAt: new Date().toISOString() };
    },
    saveActiveDocumentAs: async (documents: InformioDocument[], activeDocumentId: string) => {
      state = { ...state, documents, activeDocumentId };
      const active = state.documents.find((document) => document.id === activeDocumentId);
      if (!active) return state;
      const nextTitle = active.title.endsWith(".md") ? active.title : `${active.title}.md`;
      const nextPath = `${state.settings.shortcuts.quickFolder}/${nextTitle}`;
      state = {
        ...state,
        documents: state.documents.map((document) =>
          document.id === active.id
            ? { ...document, title: nextTitle, filePath: nextPath, updatedAt: new Date().toISOString() }
            : document
        )
      };
      return state;
    },
    exportActiveDocument: async (_documents, _activeDocumentId, _format) => undefined,
    saveAgentConversations: async (input: SaveAgentConversationsInput) => {
      state = { ...state, agentConversations: input.conversations as AgentConversation[] };
      return state.agentConversations;
    },
    listLocalFonts: async () => ({
      fonts: [
        { family: "PingFang SC" },
        { family: "Hiragino Sans GB" },
        { family: "Helvetica Neue" },
        { family: "Arial" },
        { family: "SF Mono" },
        { family: "Cascadia Mono" }
      ]
    }),
    chooseFolder: async () => "/Users/acumen7/Documents/Informio Quick Notes",
    onAppDataUpdated: () => () => undefined,
    onMenuCommand: () => () => undefined,
    listAgentRuntimeConnections: async () => [
      {
        providerId: "codex",
        status: "idle",
        message: "Browser preview cannot read /Users/acumen7/Documents/Informio Quick Notes. Open the Electron window for real files.",
        tools: [],
        models: state.settings.agents.find((agent) => agent.id === "codex")?.models
      }
    ],
    connectAgentRuntime: async (providerId: string) => ({
      providerId,
      status: "connected",
      message: "Demo connection ready. Start Electron for real Agent runtime.",
      tools: [{ name: "demo_chat", description: "Preview responder" }],
      models: state.settings.agents.find((agent) => agent.id === providerId)?.models
    }),
    disconnectAgentRuntime: async (providerId: string) => ({ providerId, status: "idle", message: "Disconnected.", tools: [] }),
    detectApiModels: async (input: ApiModelDetectionInput) => ({
      models: demoModelsByProvider[input.provider]
    }),
    translateSelection: async ({ provider, model, targetLanguage, text }) => ({
      content: `[${provider}/${model || "未选模型"}/${targetLanguage}] ${text.slice(0, 120)}`
    }),
    sendAgentMessage: async (input: SendAgentMessageInput) => ({
      content: input.context.selectedText
        ? `${input.model ?? "默认"}：这段可以再收紧：${input.context.selectedText.slice(0, 56)}...`
        : `${input.model ?? "默认"}：浏览器预览是 demo；Electron 中会调用真实 Agent。`
    }),
    sendAgentMessageStream: async (input: SendAgentMessageInput, onEvent) => {
      const content = input.context.selectedText
        ? `${input.model ?? "默认"}：这段可以再收紧：${input.context.selectedText.slice(0, 56)}...`
        : `${input.model ?? "默认"}：浏览器预览是 demo；Electron 中会调用真实 Agent。`;
      onEvent({ type: "delta", content });
      onEvent({ type: "done", content });
      return { content };
    },
    runAgentSessionStream: async (input: AgentSessionInput, onEvent) => {
      const contextToolId = `demo-context-${Date.now()}`;
      onEvent({ type: "thinking_delta", content: "正在读取 demo 上下文。" });
      onEvent({
        type: "tool_start",
        action: {
          tool: "get_workspace_context",
          toolId: contextToolId,
          label: "读取工作区上下文",
          status: "pending",
          input: JSON.stringify(
            {
              openTabs: input.context.openTabs.length,
              noteList: input.context.noteList.length,
              permissionMode: input.permissionMode
            },
            null,
            2
          )
        }
      });
      onEvent({ type: "tool_done", toolId: contextToolId, status: "done", output: "Demo context ready." });
      const agentToolId = `demo-agent-${Date.now()}`;
      onEvent({
        type: "tool_start",
        action: {
          tool: "demo_agent",
          toolId: agentToolId,
          label: "Demo Agent 执行",
          status: "pending"
        }
      });
      const content = `${input.model ?? "默认"}：这是浏览器预览里的 Agent Session。Electron 中会调用真实 Agent，并可视化工具调用。`;
      onEvent({ type: "text_delta", content });
      onEvent({ type: "tool_done", toolId: agentToolId, status: "done", output: "Demo response completed." });
      onEvent({ type: "done", content });
      return { content };
    },
    respondAgentApproval: async () => ({ ok: true }),
    cancelAgentRun: async () => ({ ok: true }),
    openExternal: async (url: string) => {
      window.open(url, "_blank");
    },
    openPath: async () => undefined,
    addProject: async () => state,
    removeProject: async (_path: string) => state,
    renameProject: async (path: string, title: string) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return state;
      const nextPath = `${demoDirname(path)}/${cleanTitle}`;
      state = {
        ...state,
        workspacePath: state.workspacePath && demoPathContains(path, state.workspacePath) ? replaceDemoPathRoot(state.workspacePath, path, nextPath) : state.workspacePath,
        projects: state.projects.map((project) =>
          project.path === path
            ? { ...project, id: `project-${nextPath}`, path: nextPath, title: demoBasename(nextPath) || cleanTitle }
            : demoPathContains(path, project.path)
              ? { ...project, path: replaceDemoPathRoot(project.path, path, nextPath) }
              : project
        ),
        folders: state.folders.map((folder) =>
          demoPathContains(path, folder.path)
            ? { ...folder, id: `folder-${replaceDemoPathRoot(folder.path, path, nextPath)}`, path: replaceDemoPathRoot(folder.path, path, nextPath), title: demoBasename(replaceDemoPathRoot(folder.path, path, nextPath)) || folder.title }
            : folder
        ),
        documents: state.documents.map((document) =>
          document.filePath && demoPathContains(path, document.filePath)
            ? { ...document, filePath: replaceDemoPathRoot(document.filePath, path, nextPath), updatedAt: now() }
            : document
        )
      };
      return state;
    },
    toggleProjectPinned: async (path: string) => {
      state = {
        ...state,
        projects: state.projects.map((project) => (project.path === path ? { ...project, pinned: !project.pinned } : project))
      };
      return state;
    }
  };

  window.informio = api;
}
