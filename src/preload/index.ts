import { contextBridge, ipcRenderer, webUtils } from "electron";
import "electron-log/preload";
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
  AssetDataResult,
  FileSystemOperationInput,
  ImportExternalFilesInput,
  InformioDocument,
  MenuCommand,
  ListLocalFontsResult,
  SaveAttachmentInput,
  SaveAgentConversationsInput,
  SaveAttachmentResult,
  SaveResult,
  SendAgentMessageInput,
  SendAgentMessageResult,
  TranslateSelectionInput,
  TranslateSelectionResult
} from "../shared/types.js";

const api = {
  loadApp: () => ipcRenderer.invoke("app:load") as Promise<AppData>,
  openSettings: () => ipcRenderer.invoke("app:open-settings") as Promise<void>,
  newWindow: () => ipcRenderer.invoke("app:new-window") as Promise<void>,
  windowControl: (action: "minimize" | "toggleMaximize" | "close") =>
    ipcRenderer.invoke("app:window-control", action) as Promise<void>,
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
  importExternalFiles: (input: ImportExternalFilesInput) =>
    ipcRenderer.invoke("app:import-external-files", input) as Promise<AppData>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveAttachment: (input: SaveAttachmentInput) =>
    ipcRenderer.invoke("app:save-attachment", input) as Promise<SaveAttachmentResult>,
  loadAsset: (path: string) => ipcRenderer.invoke("app:load-asset", path) as Promise<AssetDataResult>,
  loadEmbedPdfWasm: () => ipcRenderer.invoke("app:load-embedpdf-wasm") as Promise<AssetDataResult>,
  savePdfFile: (path: string, data: ArrayBuffer) => ipcRenderer.invoke("app:save-pdf-file", path, data) as Promise<void>,
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("app:save-settings", settings) as Promise<AppSettings>,
  getAppInfo: () => ipcRenderer.invoke("app:get-info") as Promise<AppInfo>,
  saveDocuments: (documents: InformioDocument[], activeDocumentId: string) =>
    ipcRenderer.invoke("app:save-documents", documents, activeDocumentId) as Promise<AppData>,
  saveNow: (documents: InformioDocument[], activeDocumentId: string) =>
    ipcRenderer.invoke("app:save-now", documents, activeDocumentId) as Promise<SaveResult>,
  saveActiveDocumentAs: (documents: InformioDocument[], activeDocumentId: string) =>
    ipcRenderer.invoke("app:save-active-document-as", documents, activeDocumentId) as Promise<AppData | undefined>,
  exportActiveDocument: (documents: InformioDocument[], activeDocumentId: string, format: "markdown" | "html" | "pdf") =>
    ipcRenderer.invoke("app:export-active-document", documents, activeDocumentId, format) as Promise<void>,
  saveAgentConversations: (input: SaveAgentConversationsInput) =>
    ipcRenderer.invoke("app:save-agent-conversations", input) as Promise<AgentConversation[]>,
  chooseFolder: () => ipcRenderer.invoke("app:choose-folder") as Promise<string | null>,
  listLocalFonts: async (): Promise<ListLocalFontsResult> => {
    type QueryLocalFontsFn = () => Promise<Array<{ family: string; fullName?: string; style?: string }>>;
    const queryLocalFonts = (globalThis as typeof globalThis & { queryLocalFonts?: QueryLocalFontsFn }).queryLocalFonts;
    const mergeFontLists = (...fontLists: Array<Array<{ family: string; fullName?: string; style?: string }>>) => {
      const deduped = new Map<string, { family: string; fullName?: string; style?: string }>();
      fontLists.flat().forEach((font) => {
        const family = font.family?.trim();
        if (!family) return;
        const existing = deduped.get(family);
        deduped.set(family, {
          family,
          fullName: existing?.fullName || font.fullName?.trim() || undefined,
          style: existing?.style || font.style?.trim() || undefined
        });
      });
      return Array.from(deduped.values()).sort((left, right) => left.family.localeCompare(right.family, "zh-Hans-CN"));
    };
    const systemFonts = await ipcRenderer.invoke("app:list-local-fonts") as ListLocalFontsResult;
    try {
      if (typeof queryLocalFonts !== "function") {
        return systemFonts;
      }
      const browserFonts = await queryLocalFonts();
      const mergedFonts = mergeFontLists(browserFonts, systemFonts.fonts);
      if (mergedFonts.length) {
        return {
          fonts: mergedFonts,
          error: systemFonts.error && !systemFonts.fonts.length ? systemFonts.error : undefined
        };
      }
      return systemFonts.fonts.length ? systemFonts : { fonts: [], error: systemFonts.error || "没有读取到可用字体。" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (systemFonts.fonts.length) {
        return {
          fonts: systemFonts.fonts,
          error: `浏览器字体接口失败，已改用系统字体列表：${message || "未知错误"}`
        };
      }
      return { fonts: [], error: systemFonts.error || `无法读取本地字体列表：${message || "未知错误"}` };
    }
  },
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
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url) as Promise<void>,
  openPath: (path: string) => ipcRenderer.invoke("app:open-path", path) as Promise<void>,
  checkForUpdates: () => ipcRenderer.invoke("updater:check") as Promise<{ available: boolean; version?: string; releaseNotes?: string; error?: string }>,
  downloadUpdate: () => ipcRenderer.invoke("updater:download") as Promise<{ success: boolean; error?: string }>,
  installUpdate: () => { ipcRenderer.invoke("updater:install"); },
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on("updater:update-available", (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on("updater:update-downloaded", (_event, info) => callback(info));
  },
  onDownloadProgress: (callback: (info: { percent: number; transferred: number; total: number }) => void) => {
    ipcRenderer.on("updater:download-progress", (_event, info) => callback(info));
  },
  setLanguage: (lang: string) => { ipcRenderer.invoke("app:set-language", lang); },
  onLanguageChanged: (callback: (lang: string) => void) => {
    ipcRenderer.on("app:language-changed", (_event, lang) => callback(lang));
  }
};

contextBridge.exposeInMainWorld("informio", api);

export type InformioApi = typeof api;
