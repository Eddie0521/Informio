import { contextBridge, ipcRenderer } from "electron";
import type {
  AppInfo,
  ApiModelDetectionInput,
  ApiModelDetectionResult,
  AgentApprovalResponseInput,
  AgentConversation,
  AgentConnection,
  AgentSessionEvent,
  AgentSessionInput,
  AgentSessionResult,
  AgentStreamEvent,
  AppData,
  AppSettings,
  DeletePdfAnnotationInput,
  DeletePdfAnnotationResult,
  FileSystemOperationInput,
  InformioDocument,
  MenuCommand,
  LoadPdfAnnotationsInput,
  PdfAnnotation,
  SaveAttachmentInput,
  SavePdfAnnotationInput,
  SavePdfAnnotationResult,
  SaveAgentConversationsInput,
  SaveAttachmentResult,
  SaveResult,
  SendAgentMessageInput,
  SendAgentMessageResult,
  TranslateSelectionInput,
  TranslateSelectionResult,
  UpdaterState
} from "../shared/types.js";

const api = {
  loadApp: () => ipcRenderer.invoke("app:load") as Promise<AppData>,
  openSettings: () => ipcRenderer.invoke("app:open-settings") as Promise<void>,
  openFiles: () => ipcRenderer.invoke("app:open-files") as Promise<AppData | null>,
  openWorkspace: () => ipcRenderer.invoke("app:open-workspace") as Promise<AppData | null>,
  addProject: () => ipcRenderer.invoke("app:add-project") as Promise<AppData | null>,
  removeProject: (path: string) => ipcRenderer.invoke("app:remove-project", path) as Promise<AppData>,
  renameProject: (path: string, title: string) => ipcRenderer.invoke("app:rename-project", path, title) as Promise<AppData>,
  toggleProjectPinned: (path: string) => ipcRenderer.invoke("app:toggle-project-pinned", path) as Promise<AppData>,
  createDocument: () => ipcRenderer.invoke("app:create-document") as Promise<AppData>,
  createDocumentInFolder: (folderPath: string) => ipcRenderer.invoke("app:create-document", folderPath) as Promise<AppData>,
  createDefaultMarkdownDocument: () => ipcRenderer.invoke("app:create-default-markdown-document") as Promise<AppData>,
  createLinkedDocument: (title: string) => ipcRenderer.invoke("app:create-linked-document", title) as Promise<AppData>,
  createFolder: () => ipcRenderer.invoke("app:create-folder") as Promise<AppData>,
  createFolderInFolder: (folderPath: string) => ipcRenderer.invoke("app:create-folder", folderPath) as Promise<AppData>,
  insertAsset: (kind: "image" | "video" | "audio" | "pdf") =>
    ipcRenderer.invoke("app:insert-asset", kind) as Promise<void>,
  runFileSystemAction: (input: FileSystemOperationInput) =>
    ipcRenderer.invoke("app:filesystem-action", input) as Promise<AppData>,
  saveAttachment: (input: SaveAttachmentInput) =>
    ipcRenderer.invoke("app:save-attachment", input) as Promise<SaveAttachmentResult>,
  loadPdfAnnotations: (input: LoadPdfAnnotationsInput) =>
    ipcRenderer.invoke("pdf:load-annotations", input) as Promise<PdfAnnotation[]>,
  savePdfAnnotation: (input: SavePdfAnnotationInput) =>
    ipcRenderer.invoke("pdf:save-annotation", input) as Promise<SavePdfAnnotationResult>,
  deletePdfAnnotation: (input: DeletePdfAnnotationInput) =>
    ipcRenderer.invoke("pdf:delete-annotation", input) as Promise<DeletePdfAnnotationResult>,
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("app:save-settings", settings) as Promise<AppSettings>,
  getAppInfo: () => ipcRenderer.invoke("app:get-info") as Promise<AppInfo>,
  getUpdaterState: () => ipcRenderer.invoke("app:get-updater-state") as Promise<UpdaterState>,
  saveDocuments: (documents: InformioDocument[], activeDocumentId: string) =>
    ipcRenderer.invoke("app:save-documents", documents, activeDocumentId) as Promise<AppData>,
  saveNow: (documents: InformioDocument[], activeDocumentId: string) =>
    ipcRenderer.invoke("app:save-now", documents, activeDocumentId) as Promise<SaveResult>,
  saveAgentConversations: (input: SaveAgentConversationsInput) =>
    ipcRenderer.invoke("app:save-agent-conversations", input) as Promise<AgentConversation[]>,
  chooseFolder: () => ipcRenderer.invoke("app:choose-folder") as Promise<string | null>,
  onAppDataUpdated: (callback: (data: AppData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppData) => callback(data);
    ipcRenderer.on("app:data-updated", listener);
    return () => {
      ipcRenderer.removeListener("app:data-updated", listener);
    };
  },
  onMenuCommand: (callback: (command: MenuCommand, payload?: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand, payload?: unknown) => callback(command, payload);
    ipcRenderer.on("menu:command", listener);
    return () => {
      ipcRenderer.removeListener("menu:command", listener);
    };
  },
  listAgentRuntimeConnections: () => ipcRenderer.invoke("agent-runtime:list") as Promise<AgentConnection[]>,
  connectAgentRuntime: (providerId: string) => ipcRenderer.invoke("agent-runtime:connect", providerId) as Promise<AgentConnection>,
  disconnectAgentRuntime: (providerId: string) => ipcRenderer.invoke("agent-runtime:disconnect", providerId) as Promise<AgentConnection>,
  detectApiModels: (input: ApiModelDetectionInput) =>
    ipcRenderer.invoke("api:detect-models", input) as Promise<ApiModelDetectionResult>,
  translateSelection: (input: TranslateSelectionInput) =>
    ipcRenderer.invoke("api:translate-selection", input) as Promise<TranslateSelectionResult>,
  sendAgentMessage: (input: SendAgentMessageInput) =>
    ipcRenderer.invoke("agent-runtime:send", input) as Promise<SendAgentMessageResult>,
  sendAgentMessageStream: (input: SendAgentMessageInput, onEvent: (event: AgentStreamEvent) => void) => {
    const requestId = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const listener = (_event: Electron.IpcRendererEvent, eventId: string, chunk: AgentStreamEvent) => {
      if (eventId === requestId) onEvent(chunk);
    };
    ipcRenderer.on("agent-runtime:stream", listener);
    return (ipcRenderer.invoke("agent-runtime:send-stream", requestId, input) as Promise<SendAgentMessageResult>).finally(() => {
      ipcRenderer.removeListener("agent-runtime:stream", listener);
    });
  },
  runAgentSessionStream: (input: AgentSessionInput, onEvent: (event: AgentSessionEvent) => void) => {
    const requestId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const listener = (_event: Electron.IpcRendererEvent, eventId: string, chunk: AgentSessionEvent) => {
      if (eventId === requestId) onEvent(chunk);
    };
    ipcRenderer.on("agent:session-event", listener);
    return (ipcRenderer.invoke("agent:session-stream", requestId, input) as Promise<AgentSessionResult>).finally(() => {
      ipcRenderer.removeListener("agent:session-event", listener);
    });
  },
  respondAgentApproval: (input: AgentApprovalResponseInput) =>
    ipcRenderer.invoke("agent:approval-response", input) as Promise<{ ok: boolean }>,
  cancelAgentRun: (providerId: string) =>
    ipcRenderer.invoke("agent:cancel-run", providerId) as Promise<{ ok: boolean }>,
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates") as Promise<UpdaterState>,
  restartToInstallUpdate: () => ipcRenderer.invoke("app:restart-to-install-update") as Promise<void>,
  onUpdaterStateChanged: (callback: (state: UpdaterState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdaterState) => callback(state);
    ipcRenderer.on("app:updater-state", listener);
    return () => {
      ipcRenderer.removeListener("app:updater-state", listener);
    };
  },
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url) as Promise<void>,
  openPath: (path: string) => ipcRenderer.invoke("app:open-path", path) as Promise<void>
};

contextBridge.exposeInMainWorld("informio", api);

export type InformioApi = typeof api;
