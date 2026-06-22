export type ThemeName = "paper" | "white" | "night" | "custom";

export type PanelMode = "collapsed" | "expanded";

export type MenuCommand = string;

export type AgentStatus = "idle" | "connecting" | "connected" | "error";

export type AgentTransport = "codex-app-server" | "claude-agent-sdk" | "opencode-sdk";

export type ApiProviderKind = "openai-compatible" | "anthropic";

export type InformioDocumentKind = "markdown" | "text" | "image" | "video" | "audio" | "pdf" | "spreadsheet" | "unknown";

export type InformioDocument = {
  id: string;
  title: string;
  markdown: string;
  kind?: InformioDocumentKind;
  collection: "writing" | "knowledge";
  updatedAt: string;
  filePath?: string;
  pinned?: boolean;
};

export type AssetDataResult = {
  data: ArrayBuffer;
  mimeType: string;
};

export type DocumentConflict = {
  documentId: string;
  filePath: string;
  baseMarkdown?: string;
  localMarkdown: string;
  externalMarkdown: string;
  detectedAt: string;
  externalUpdatedAt?: string;
};

export type InformioFolder = {
  id: string;
  title: string;
  path: string;
  updatedAt: string;
};

export type InformioProject = {
  id: string;
  path: string;
  title: string;
  addedAt: string;
  pinned?: boolean;
};

export type FileSystemAction = "rename" | "duplicate" | "delete" | "reveal" | "move";

export type FileSystemTargetType = "file" | "folder";

export type FileSystemOperationInput = {
  action: FileSystemAction;
  targetType: FileSystemTargetType;
  path: string;
  documentId?: string;
  name?: string;
  destinationFolderPath?: string;
};

export type ImportExternalFilesInput = {
  sourcePaths: string[];
  destinationFolderPath: string;
};

export type SaveAttachmentInput = {
  documentId: string;
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
};

export type SaveAttachmentResult = {
  path: string;
  fileName: string;
  markdownPath: string;
};

export type LocalFontOption = {
  family: string;
  fullName?: string;
  style?: string;
};

export type ListLocalFontsResult = {
  fonts: LocalFontOption[];
  error?: string;
};

export type AgentProvider = {
  id: string;
  name: string;
  transport: AgentTransport;
  command: string;
  args: string[];
  cwd?: string;
  enabled: boolean;
  model?: string;
  models?: AgentModel[];
  runtimeSupportsResume?: boolean;
  runtimePermissionModes?: AgentPermissionMode[];
  description: string;
};

export type AppInfo = {
  name: string;
  version: string;
  platform: string;
  githubUrl: string;
  iconDataUrl?: string;
};

export type AppSettings = {
  agentRuntime: {
    enabled: boolean;
    autoStart: boolean;
    conversationRetentionLimit: number;
    conversationRetentionDays: number;
  };
  api: {
    provider: ApiProviderKind;
    baseUrl: string;
    apiKey: string;
    model: string;
    models: AgentModel[];
  };
  appearance: {
    theme: ThemeName;
    customThemeColor: string;
    chineseFontFamily: string;
    englishFontFamily: string;
    codeFontFamily: string;
    showTitleInWindow: boolean;
    autoHideStatusBar: boolean;
    chatFontSize: number;
    leftPanel: PanelMode;
    rightPanel: PanelMode;
    leftPanelWidth: number;
    rightPanelWidth: number;
  };
  editor: {
    fontSize: number;
    lineHeight: number;
    contentWidth: number;
    spellcheck: boolean;
    typewriterMode: boolean;
    assetImportMode: "copy-to-attachment" | "link-original-file";
  };
  markdown: {
    autoSave: boolean;
    tabSize: number;
    exportFormat: "markdown" | "html";
  };
  shortcuts: {
    quickFolder: string;
    bindings: Record<string, string>;
  };
  language: "zh-CN" | "en-US";
  agents: AgentProvider[];
  activeAgentId: string;
  toolbarAgentId: string;
};

export type AppData = {
  projects: InformioProject[];
  folders: InformioFolder[];
  documents: InformioDocument[];
  agentConversations: AgentConversation[];
  settings: AppSettings;
  activeDocumentId: string;
  workspacePath?: string;
};

export type BrowserPaneBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserPaneState = {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
};

export type ToolSummary = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type AgentModel = {
  id: string;
  label?: string;
};

export type AgentConnection = {
  providerId: string;
  status: AgentStatus;
  message: string;
  tools: ToolSummary[];
  models?: AgentModel[];
};

export type AgentContext = {
  documentTitle: string;
  documentMarkdown: string;
  selectedText?: string;
};

export type AgentPermissionMode = "read_only" | "default" | "full_access";

export type AgentConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  permissionMode: AgentPermissionMode;
  status?: "done" | "error";
  errorMessage?: string;
  reasoning?: string;
  actions?: AgentSessionAction[];
};

export type AgentConversation = {
  id: string;
  workspaceScopeId: string;
  workspaceLabel: string;
  providerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  runtimeThreadId?: string;
  messages: AgentConversationMessage[];
};

export type AgentSessionStatus = "idle" | "thinking" | "tool-executing" | "done" | "error";

export type AgentSessionActionStatus = "pending" | "done" | "error";

export type AgentSessionTraceKind =
  | "system"
  | "command"
  | "file_change"
  | "tool"
  | "search"
  | "read"
  | "plan"
  | "reasoning"
  | "message"
  | "approval"
  | "other";

export type AgentApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type AgentApprovalRequest = {
  id: string;
  kind: "command" | "file_change" | "permissions" | "tool" | "other";
  title: string;
  message?: string;
  command?: string;
  cwd?: string;
  path?: string;
  availableDecisions: AgentApprovalDecision[];
};

export type AgentSessionAction = {
  tool: string;
  toolId: string;
  label: string;
  kind?: AgentSessionTraceKind;
  status: AgentSessionActionStatus;
  input?: string;
  output?: string;
  path?: string;
  approval?: AgentApprovalRequest;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  exitCode?: number | null;
};

export type AgentSessionContext = {
  workspacePath?: string;
  projectRoots?: string[];
  currentDocument?: {
    id: string;
    title: string;
    filePath?: string;
    markdown: string;
  };
  selection?: AgentContextSelection;
  openTabs: Array<{
    id: string;
    title: string;
    filePath?: string;
  }>;
  noteList: Array<{
    id: string;
    title: string;
    filePath?: string;
    updatedAt: string;
  }>;
  references: Array<{
    title: string;
    documentId?: string;
    filePath?: string;
    markdown?: string;
  }>;
  attachments?: AgentMessageAttachment[];
};

export type AgentMessageAttachmentKind = "image" | "file";

export type AgentMessageAttachment = {
  id: string;
  name: string;
  path: string;
  kind: AgentMessageAttachmentKind;
  mimeType?: string;
  size?: number;
};

export type PdfSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AgentContextSelection =
  | {
      kind: "markdown";
      documentId: string;
      from: number;
      to: number;
      text: string;
    }
  | {
      kind: "pdf";
      documentId: string;
      title: string;
      filePath?: string;
      page: number;
      text: string;
      rects: PdfSelectionRect[];
    };

export type AgentSessionInput = {
  providerId: string;
  model?: string;
  message: string;
  permissionMode: AgentPermissionMode;
  conversationId?: string;
  runtimeThreadId?: string;
  workspaceScopeId: string;
  conversationHistory?: AgentConversationMessage[];
  context: AgentSessionContext;
};

export type AgentSessionResult = {
  content: string;
  runtimeThreadId?: string;
  raw?: unknown;
};

export type AgentSessionEvent =
  | { type: "thinking_delta"; content: string; kind?: AgentSessionTraceKind; itemId?: string }
  | { type: "text_delta"; content: string; kind?: AgentSessionTraceKind; itemId?: string }
  | { type: "tool_start"; action: AgentSessionAction }
  | { type: "tool_delta"; toolId: string; outputDelta: string }
  | { type: "tool_done"; toolId: string; output?: string; status?: AgentSessionActionStatus }
  | { type: "approval_request"; action: AgentSessionAction }
  | { type: "approval_resolved"; toolId: string; status: AgentSessionActionStatus; output?: string }
  | { type: "done"; content: string }
  | { type: "error"; message: string };

export type AgentApprovalResponseInput = {
  providerId: string;
  approvalId: string;
  decision: AgentApprovalDecision;
};

export type SaveAgentConversationsInput = {
  conversations: AgentConversation[];
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  providerId?: string;
  status?: "sent" | "streaming" | "failed";
};

export type SendAgentMessageInput = {
  providerId: string;
  message: string;
  model?: string;
  context: AgentContext;
};

export type SendAgentMessageResult = {
  content: string;
  raw?: unknown;
};

export type ApiModelDetectionInput = {
  provider: ApiProviderKind;
  baseUrl: string;
  apiKey: string;
};

export type ApiModelDetectionResult = {
  models: AgentModel[];
};

export type TranslateSelectionInput = {
  provider: ApiProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  targetLanguage: "zh-CN" | "en";
  text: string;
};

export type TranslateSelectionResult = {
  content: string;
  raw?: unknown;
};

export type AgentStreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; content: string }
  | { type: "error"; message: string };

export type SaveResult = {
  data: AppData;
  savedAt: string;
};
