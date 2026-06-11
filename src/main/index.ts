import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, protocol, screen, shell } from "electron";
import log from "electron-log";
import { setupAutoUpdater } from "./auto-update.js";
import type { MenuItemConstructorOptions, NativeImage, OpenDialogOptions } from "electron";
import { execFile } from "node:child_process";
import { existsSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import type {
  ApiModelDetectionInput,
  AgentConversation,
  AppInfo,
  AppData,
  AppSettings,
  AssetDataResult,
  FileSystemOperationInput,
  ImportExternalFilesInput,
  InformioDocumentKind,
  InformioDocument,
  InformioFolder,
  InformioProject,
  ListLocalFontsResult,
  LocalFontOption,
  SaveAttachmentInput,
  SaveAttachmentResult,
  SaveAgentConversationsInput,
  SaveResult,
  AgentApprovalResponseInput,
  AgentSessionInput,
  SendAgentMessageInput,
  TranslateSelectionInput
} from "../shared/types.js";
import { asErrorMessage } from "./agentRuntimeShared.js";
import {
  createQuickDocument,
  loadAppData,
  normalizeAgentConversations,
  projectRecord,
  saveAppData,
  saveAppDataAndFiles
} from "./store.js";
import { AgentRuntimeManager } from "./agentRuntime.js";
import { prepareRuntimeEnvironment } from "./runtimeEnvironment.js";
import { detectApiModels, translateSelection } from "./translationApi.js";
import { APP_GITHUB_URL, APP_NAME } from "../shared/appMeta.js";
import { getShortcutAccelerator, shortcutRegistry } from "../shared/shortcuts.js";
import {
  markdownTitle,
  normalizeLinkTitle,
  replaceWikiLinkTargets,
  replaceLocalFileUrls,
  withUpdatedLocalFileUrls,
  saveMarkdownFile,
  uniquePath,
  markdownPathForFile,
  markdownLink,
  markdownImage,
  parseHtmlAttr,
  decodeHtmlEntities,
  stripHtml,
  escapeHtmlAttr,
  cleanAttachmentName,
  ensureAttachmentReference,
  backupMarkdownFile,
  cleanMarkdownStorage,
  localFilePathCandidates,
  normalizeLocalFileCandidate
} from "./markdown-utils.js";
import {
  documentKindFromPath,
  isExternalOpenablePath,
  isWritableTextDocument,
  normalizeDocumentKind,
  withDocumentKind,
  localFileResponse,
  loadAssetData,
  savePdfFile,
  generatedMarkdownForAssetPath,
  pdfMarkdown,
  normalizeAssetDocumentMarkdown,
  escapeHtml,
  exportFontStack,
  markdownToBasicHtml,
  exportHtmlToPdf
} from "./local-file-utils.js";

// Configure electron-log
log.transports.file.resolvePathFn = () => join(app.getPath("userData"), "logs", "main.log");
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.console.level = "debug";
log.transports.file.level = "info";
Object.assign(console, log.functions);

// Auto-remove quarantine attribute on macOS
if (process.platform === "darwin" && app.isPackaged) {
  const appPath = app.getAppPath();
  if (appPath.includes(".app/")) {
    const appBundle = appPath.split(".app/")[0] + ".app";
    import("node:child_process").then(({ execFile }) => {
      execFile("xattr", ["-cr", appBundle], (error) => {
        if (error) log.debug("Quarantine removal skipped:", error.message);
        else log.info("Removed quarantine attribute from app bundle");
      });
    });
  }
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let settingsWindowOpening = false;
let appData: AppData;
let appIcon: NativeImage | null = null;
const mainWindows = new Set<BrowserWindow>();
let workspaceWatchers: FSWatcher[] = [];
let workspaceRefreshTimer: NodeJS.Timeout | null = null;
let workspaceRefreshInFlight = false;
let appDataLoaded = false;
const pendingExternalOpenFiles = new Map<string, string>();
const documentReadCache = new Map<string, { size: number; mtimeMs: number; document: InformioDocument }>();

const agentRuntime = new AgentRuntimeManager();

// Crash recovery — save data and notify user before quitting
const emergencySave = () => {
  if (!appDataLoaded || !appData) return;
  try {
    const { join: joinPath } = require("node:path");
    const backupPath = joinPath(app.getPath("userData"), "emergency-backup.json");
    require("node:fs").writeFileSync(backupPath, JSON.stringify(appData, null, 2), "utf8");
    log.error("Emergency save completed:", backupPath);
  } catch (saveError) {
    log.error("Emergency save failed:", saveError);
  }
};

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception:", error);
  emergencySave();
  dialog.showErrorBox("应用异常", `发生了未预期的错误，已自动保存数据。\n\n${error.message}\n\n请重启应用。`);
  app.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection:", reason);
  // Don't exit for unhandled rejections, just log
});

const MAIN_WINDOW_SIZE = { width: 1180, height: 840 };
const QUICK_CAPTURE_WINDOW_SIZE = { width: 980, height: 700 };
const TRAFFIC_LIGHT_POSITION = { x: 14, y: 15 };
const DEFAULT_WORKSPACE_PATH = join(homedir(), "Documents", "Informio Quick Notes");
const ATTACHMENTS_DIR = "attachments";
const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";
const isDevelopmentRuntime = Boolean(process.env.ELECTRON_RENDERER_URL);
let localFontsCache: ListLocalFontsResult | null = null;

if (isDevelopmentRuntime) {
  app.setName(`${APP_NAME} Dev`);
  app.setPath("userData", join(app.getPath("appData"), "informio-dev"));
}

const getAppInfo = (): AppInfo => ({
  name: app.getName() || APP_NAME,
  version: app.getVersion(),
  platform: process.platform,
  githubUrl: APP_GITHUB_URL,
  iconDataUrl: appIcon?.isEmpty() ? undefined : appIcon?.toDataURL()
});

const windowChromeOptions = () => {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset" as const,
      trafficLightPosition: TRAFFIC_LIGHT_POSITION
    };
  }
  if (process.platform === "win32") {
    return { frame: false };
  }
  return {};
};

const listSystemLocalFonts = async (): Promise<ListLocalFontsResult> => {
  if (localFontsCache) return localFontsCache;
  if (process.platform !== "darwin") {
    localFontsCache = { fonts: [] };
    return localFontsCache;
  }
  try {
    const { stdout } = await execFileAsync("system_profiler", ["SPFontsDataType", "-json"], {
      maxBuffer: 64 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout) as {
      SPFontsDataType?: Array<{
        typefaces?: Array<{
          family?: string;
          fullname?: string;
          style?: string;
          enabled?: string;
          valid?: string;
        }>;
      }>;
    };
    const deduped = new Map<string, LocalFontOption>();
    (parsed.SPFontsDataType ?? []).forEach((fontFile) => {
      (fontFile.typefaces ?? []).forEach((typeface) => {
        const family = typeface.family?.trim();
        if (!family || family.startsWith(".")) return;
        if (typeface.enabled === "no" || typeface.valid === "no") return;
        if (!deduped.has(family)) {
          deduped.set(family, {
            family,
            fullName: typeface.fullname?.trim() || undefined,
            style: typeface.style?.trim() || undefined
          });
        }
      });
    });
    const fonts = Array.from(deduped.values()).sort((left, right) => left.family.localeCompare(right.family, "zh-Hans-CN"));
    localFontsCache = fonts.length
      ? { fonts }
      : { fonts: [], error: "系统没有返回可用字体列表。" };
    return localFontsCache;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fonts: [],
      error: `读取系统字体列表失败：${message || "未知错误"}`
    };
  }
};

const resolveAppIconPath = () => {
  const appPath = app.getAppPath();
  const candidates = [
    join(appPath, "src/renderer/public/icon.png"),
    join(appPath, "src/renderer/public/icon-512.png"),
    join(__dirname, "../renderer/icon.png"),
    join(__dirname, "../renderer/icon-512.png")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const loadAppIcon = () => {
  const iconPath = resolveAppIconPath();
  if (!iconPath) return null;

  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? null : icon;
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

const emitAppData = () => {
  mainWindows.forEach((window) => window.webContents.send("app:data-updated", appData));
  settingsWindow?.webContents.send("app:data-updated", appData);
};

const getFocusedMainWindow = () => {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && mainWindows.has(focused)) return focused;
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : Array.from(mainWindows)[0];
};

const sendMenuCommand = (command: string, payload?: unknown) => {
  getFocusedMainWindow()?.webContents.send("menu:command", command, payload);
};

const shortcutBinding = (id: string) => getShortcutAccelerator(appData?.settings.shortcuts.bindings, id) || undefined;

const registerGlobalShortcuts = () => {
  globalShortcut.unregisterAll();
  shortcutRegistry
    .filter((entry) => entry.scope === "global")
    .forEach((entry) => {
      const accelerator = shortcutBinding(entry.id);
      if (!accelerator) return;
      globalShortcut.register(accelerator, () => {
        if (entry.command === "app:quick-capture") {
          void triggerQuickCapture();
        } else {
          sendMenuCommand(entry.command);
        }
      });
    });
};

const triggerQuickCapture = async () => {
  appData = await createQuickDocument(appData);
  if (mainWindow) {
    mainWindow.setSize(QUICK_CAPTURE_WINDOW_SIZE.width, QUICK_CAPTURE_WINDOW_SIZE.height);
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
  }
  emitAppData();
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: MAIN_WINDOW_SIZE.width,
    height: MAIN_WINDOW_SIZE.height,
    minWidth: 560,
    minHeight: 420,
    title: "Informio",
    ...windowChromeOptions(),
    backgroundColor: "#f6f8f7",
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindows.add(window);
  mainWindow = window;
  window.on("closed", () => {
    mainWindows.delete(window);
    if (mainWindow === window) mainWindow = Array.from(mainWindows)[0] ?? null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
};

const loadRenderer = (window: BrowserWindow, hash = "") => {
  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"), hash ? { hash: hash.slice(1) } : undefined);
  }
};

const openSettingsWindow = () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  if (settingsWindowOpening) return;

  settingsWindowOpening = true;
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: "Informio Settings",
    ...windowChromeOptions(),
    backgroundColor: "#f7f7f2",
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow = window;

  window.once("ready-to-show", () => {
    settingsWindowOpening = false;
    window.show();
    window.focus();
  });

  window.on("closed", () => {
    settingsWindow = null;
    settingsWindowOpening = false;
  });

  loadRenderer(window, "#settings");
};

const activeDocument = () => appData.documents.find((doc) => doc.id === appData.activeDocumentId) ?? appData.documents[0];

const sanitizeUpdatedAt = (value: string) => (Number.isNaN(Date.parse(value)) ? new Date().toISOString() : value);

const normalizeForCompare = (path: string) => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return isWindows ? normalized.toLowerCase() : normalized;
};

const enqueueExternalOpenFiles = (paths: string[]) => {
  paths.forEach((path) => {
    if (!path || !isExternalOpenablePath(path)) return;
    pendingExternalOpenFiles.set(normalizeForCompare(path), path);
  });
};

const enqueueExternalOpenFileArgs = (argv: string[]) => {
  enqueueExternalOpenFiles(argv.filter((arg) => !arg.startsWith("-")));
};

const openExternalMarkdownFiles = async (paths: string[]) => {
  const nextPaths = Array.from(
    new Map(
      paths
        .filter((path) => path && isExternalOpenablePath(path))
        .map((path) => [normalizeForCompare(path), path])
    ).values()
  );
  if (!nextPaths.length) return;
  await openMarkdownFiles(nextPaths);
  const window = getFocusedMainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};

const flushPendingExternalOpenFiles = async () => {
  if (!appDataLoaded || !mainWindow || mainWindow.isDestroyed() || !pendingExternalOpenFiles.size) return;
  const paths = Array.from(pendingExternalOpenFiles.values());
  pendingExternalOpenFiles.clear();
  await openExternalMarkdownFiles(paths);
};

const cachedDocumentMatches = (cached: { size: number; mtimeMs: number } | undefined, fileStats: { size: number; mtimeMs: number }) =>
  Boolean(cached && cached.size === fileStats.size && cached.mtimeMs === fileStats.mtimeMs);

const pathContains = (folder: string, path: string) => {
  const normalizedFolder = normalizeForCompare(folder);
  const normalizedPath = normalizeForCompare(path);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
};

const createFolderRecord = (path: string, updatedAt = new Date().toISOString()): InformioFolder => ({
  id: `folder-${path}`,
  title: basename(path) || path,
  path,
  updatedAt
});

const dedupeFolders = (folders: InformioFolder[]) =>
  Array.from(new Map(folders.map((folder) => [normalizeForCompare(folder.path), { ...folder, title: basename(folder.path) || folder.title }])).values());

const withTrackedFolders = (folders: InformioFolder[], paths: string[]) =>
  dedupeFolders([...folders, ...paths.map((path) => createFolderRecord(path))]);

const mergeRendererDocuments = (documents: InformioDocument[]) => {
  const knownDocuments = new Map(appData.documents.map((doc) => [doc.id, doc]));
  const rendererDocuments = new Map(documents.map((doc) => [doc.id, doc]));
  const merged = appData.documents.map((known) => {
    const doc = rendererDocuments.get(known.id);
    if (!doc) return known;
    if (!isWritableTextDocument(known)) {
      return {
        ...withDocumentKind(known),
        updatedAt: known.updatedAt
      };
    }
    return {
      ...known,
      kind: normalizeDocumentKind(known),
      markdown: doc.markdown,
      updatedAt: sanitizeUpdatedAt(doc.updatedAt)
    };
  });

  documents.forEach((doc) => {
    const known = knownDocuments.get(doc.id);
    if (!known) {
      merged.push({
        id: doc.id,
        title: basename(doc.title),
        filePath: doc.filePath,
        kind: normalizeDocumentKind(doc),
        markdown: doc.markdown,
        collection: doc.collection === "knowledge" ? "knowledge" : "writing",
        updatedAt: sanitizeUpdatedAt(doc.updatedAt),
        pinned: doc.pinned
      });
    }
  });

  return merged;
};

const normalizeActiveDocumentId = (
  documents: InformioDocument[],
  activeDocumentId: string
) => {
  if (!activeDocumentId) return "";
  if (documents.some((doc) => doc.id === activeDocumentId)) return activeDocumentId;
  return documents[0]?.id ?? "";
};

const saveAgentConversations = async (input: SaveAgentConversationsInput): Promise<AgentConversation[]> => {
  const agentConversations = normalizeAgentConversations(
    input.conversations,
    appData.workspacePath,
    appData.projects ?? [],
    appData.settings.agentRuntime.conversationRetentionLimit,
    appData.settings.agentRuntime.conversationRetentionDays
  );
  appData = await saveAppData({
    ...appData,
    agentConversations
  });
  emitAppData();
  return appData.agentConversations;
};

const cleanDocumentMarkdown = async (document: InformioDocument, options: { writeFile?: boolean } = {}) => {
  if (!isWritableTextDocument(document)) return document;
  const documentFolder = document.filePath ? dirname(document.filePath) : appData?.workspacePath || appData?.settings?.shortcuts.quickFolder;
  const markdown = await cleanMarkdownStorage(document.markdown, documentFolder);
  if (markdown === document.markdown) return document;
  if (options.writeFile && document.filePath) {
    await backupMarkdownFile(document.filePath);
    await saveMarkdownFile(document.filePath, markdown);
  }
  return { ...document, markdown, updatedAt: new Date().toISOString() };
};

const cleanDocumentsMarkdown = async (documents: InformioDocument[], options: { writeFiles?: boolean } = {}) =>
  Promise.all(documents.map((document) => cleanDocumentMarkdown(document, { writeFile: options.writeFiles })));

const localDateStamp = () => {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const uniqueDefaultMarkdownPath = async (folder: string) => {
  const stamp = localDateStamp();
  for (let index = 1; index < 1000; index += 1) {
    const path = join(folder, `${stamp}-${String(index).padStart(2, "0")}.md`);
    try {
      await stat(path);
    } catch {
      return path;
    }
  }
  return join(folder, `${stamp}-${Date.now()}.md`);
};

const collectWorkspaceEntries = async (
  folder: string,
  options: { ensure?: boolean } = {}
): Promise<{ filePaths: string[]; folderPaths: string[] }> => {
  if (options.ensure !== false) await mkdir(folder, { recursive: true });
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return { filePaths: [], folderPaths: [] };
  }
  const paths = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map(async (entry) => {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          const childEntries = await collectWorkspaceEntries(path, { ensure: false });
          return { filePaths: childEntries.filePaths, folderPaths: [path, ...childEntries.folderPaths] };
        }
        if (entry.isFile()) return { filePaths: [path], folderPaths: [] };
        return { filePaths: [], folderPaths: [] };
      })
  );
  return {
    filePaths: paths.flatMap((path) => path.filePaths),
    folderPaths: paths.flatMap((path) => path.folderPaths)
  };
};

const scanWorkspaceEntries = async (
  folder: string,
  options: { ensure?: boolean } = {}
): Promise<{ filePaths: string[]; folderPaths: string[] }> => {
  const paths = await collectWorkspaceEntries(folder, options);
  return {
    filePaths: paths.filePaths.sort((left, right) => left.localeCompare(right)),
    folderPaths: paths.folderPaths.sort((left, right) => left.localeCompare(right))
  };
};

const scanWorkspaceFiles = async (folder: string): Promise<string[]> => (await scanWorkspaceEntries(folder)).filePaths;

const readDocumentsFromPaths = async (paths: string[]) => {
  const existingByPath = new Map(
    appData.documents
      .filter((document) => document.filePath)
      .map((document) => [normalizeForCompare(document.filePath!), document] as const)
  );
  return (
    await Promise.all(
      paths.map(async (path) => {
        try {
          const existing = existingByPath.get(normalizeForCompare(path));
          const fileStats = await stat(path);
          if (!fileStats.isFile()) return null;
          const cached = documentReadCache.get(path);
          const kind = documentKindFromPath(path);
          if (cachedDocumentMatches(cached, fileStats)) {
            return existing
              ? { ...cached!.document, id: existing.id, kind, updatedAt: existing.updatedAt }
              : { ...cached!.document, kind };
          }
          let markdown: string;
          let sourceMarkdown: string | null = null;
          if (kind === "unknown") {
            markdown = "";
          } else if (kind === "image") {
            markdown = generatedMarkdownForAssetPath(path) ?? "";
          } else if (kind === "video") {
            markdown = generatedMarkdownForAssetPath(path) ?? "";
          } else if (kind === "audio") {
            markdown = generatedMarkdownForAssetPath(path) ?? "";
          } else if (kind === "pdf") {
            markdown = pdfMarkdown(path);
          } else {
            markdown = await readFile(path, "utf8");
            sourceMarkdown = markdown;
          }
          markdown = await cleanMarkdownStorage(markdown, dirname(path));
          if (sourceMarkdown !== null && markdown !== sourceMarkdown) {
            await backupMarkdownFile(path);
            await saveMarkdownFile(path, markdown);
          }
          const document = {
            id: existing?.id ?? `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: basename(path),
            filePath: path,
            kind,
            collection: "writing" as const,
            updatedAt: new Date().toISOString(),
            markdown
          };
          documentReadCache.set(path, { size: fileStats.size, mtimeMs: fileStats.mtimeMs, document });
          return document;
        } catch (error) {
          log.warn("Failed to read document:", path, error);
          documentReadCache.delete(path);
          return null;
        }
      })
    )
  ).filter(
    (
      document
    ): document is {
      id: string;
      title: string;
      filePath: string;
      kind: InformioDocumentKind;
      collection: "writing";
      updatedAt: string;
      markdown: string;
    } => Boolean(document)
  );
};

const openMarkdownFiles = async (paths: string[], workspacePath = appData.workspacePath) => {
  const documents = await readDocumentsFromPaths(paths);
  if (!documents.length) return;
  const openedPaths = new Set(documents.map((doc) => doc.filePath));
  const importedFolders = Array.from(new Set(documents.map((doc) => dirname(doc.filePath))));
  appData = await saveAppData({
    ...appData,
    workspacePath,
    folders: withTrackedFolders(appData.folders, importedFolders),
    documents: [
      ...documents,
      ...appData.documents.filter((doc) => !doc.filePath || !openedPaths.has(doc.filePath))
    ],
    activeDocumentId: documents[0].id,
    settings: {
      ...appData.settings,
      appearance: { ...appData.settings.appearance }
    }
  });
  updateApplicationMenu();
  emitAppData();
};

const syncWorkspaceFoldersFromDisk = async () => {
  const projectPaths = appData.projects?.length
    ? appData.projects.map((p) => p.path)
    : appData.workspacePath
      ? [appData.workspacePath]
      : [];
  if (!projectPaths.length) return appData;
  const allFolderPaths: string[] = [];
  for (const projectPath of projectPaths) {
    const { folderPaths } = await scanWorkspaceEntries(projectPath);
    allFolderPaths.push(projectPath, ...folderPaths);
  }
  appData = await saveAppData({
    ...appData,
    folders: withTrackedFolders(appData.folders, allFolderPaths)
  });
  return appData;
};

const refreshWorkspaceFromDisk = async (options: { emit?: boolean } = {}) => {
  const projectPaths = appData.projects?.length
    ? appData.projects.map((project) => project.path)
    : appData.workspacePath
      ? [appData.workspacePath]
      : [];
  if (!projectPaths.length) return appData;

  const allFilePaths: string[] = [];
  const allFolderPaths: string[] = [];

  for (const projectPath of projectPaths) {
    try {
      const info = await stat(projectPath);
      if (!info.isDirectory()) continue;
    } catch (error) {
      log.warn("Could not stat project path:", projectPath, error);
      allFolderPaths.push(projectPath);
      continue;
    }

    const { filePaths, folderPaths } = await scanWorkspaceEntries(projectPath, { ensure: false });
    allFilePaths.push(...filePaths);
    allFolderPaths.push(projectPath, ...folderPaths);
  }

  const filePathSet = new Set(allFilePaths);
  Array.from(documentReadCache.keys()).forEach((path) => {
    if (!filePathSet.has(path)) documentReadCache.delete(path);
  });
  const refreshedDocuments = await readDocumentsFromPaths(allFilePaths);
  const isInsideTrackedProject = (path: string) => projectPaths.some((projectPath) => pathContains(projectPath, path));
  const nextDocuments = [
    ...refreshedDocuments,
    ...appData.documents
      .filter((document) => !document.filePath || !isInsideTrackedProject(document.filePath))
      .map((document) => (document.filePath ? { ...document, title: basename(document.filePath) } : document))
  ];
  const projectPathSet = new Set(projectPaths.map(normalizeForCompare));
  const outsideProjectFolders = appData.folders.filter(
    (folder) => !Array.from(projectPathSet).some((projectPath) => pathContains(projectPath, folder.path))
  );

  appData = await saveAppData({
    ...appData,
    folders: dedupeFolders([...outsideProjectFolders, ...allFolderPaths.map((path) => createFolderRecord(path))]),
    documents: nextDocuments,
    activeDocumentId: normalizeActiveDocumentId(nextDocuments, appData.activeDocumentId)
  });
  updateApplicationMenu();
  if (options.emit !== false) emitAppData();
  return appData;
};

const scheduleWorkspaceRefresh = () => {
  if (workspaceRefreshTimer) clearTimeout(workspaceRefreshTimer);
  workspaceRefreshTimer = setTimeout(async () => {
    workspaceRefreshTimer = null;
    if (workspaceRefreshInFlight) {
      scheduleWorkspaceRefresh();
      return;
    }
    workspaceRefreshInFlight = true;
    try {
      await refreshWorkspaceFromDisk();
    } catch (error) {
      console.error("Could not refresh workspace from disk.", error);
    } finally {
      workspaceRefreshInFlight = false;
    }
  }, 450);
};

const stopWorkspaceWatchers = () => {
  workspaceWatchers.forEach((watcher) => watcher.close());
  workspaceWatchers = [];
};

const startWorkspaceWatchers = async () => {
  stopWorkspaceWatchers();
  const projectPaths = Array.from(new Set((appData.projects ?? []).map((project) => project.path).filter(Boolean)));
  for (const projectPath of projectPaths) {
    try {
      const info = await stat(projectPath);
      if (!info.isDirectory()) continue;
      const watcher = watch(projectPath, { recursive: true }, scheduleWorkspaceRefresh);
      watcher.on("error", (error) => console.error(`Workspace watcher failed for ${projectPath}.`, error));
      workspaceWatchers.push(watcher);
    } catch (error) {
      console.error(`Could not watch workspace ${projectPath}.`, error);
    }
  }
};

const loadWorkspace = async (folder: string) => {
  const { filePaths, folderPaths } = await scanWorkspaceEntries(folder);
  const workspaceFolders = [folder, ...folderPaths].map((path) => createFolderRecord(path));
  if (!filePaths.length) {
    appData = await saveAppData({ ...appData, workspacePath: folder, folders: workspaceFolders, documents: [], activeDocumentId: "" });
    const next = await createFilesystemDocument();
    await startWorkspaceWatchers();
    return next;
  }
  const documents = await readDocumentsFromPaths(filePaths);
  appData = await saveAppData({
    ...appData,
    workspacePath: folder,
    folders: workspaceFolders,
    documents,
    activeDocumentId: documents[0].id,
    settings: {
      ...appData.settings,
      shortcuts: { ...appData.settings.shortcuts, quickFolder: folder },
      appearance: { ...appData.settings.appearance }
    }
  });
  updateApplicationMenu();
  emitAppData();
  await startWorkspaceWatchers();
  return appData;
};

const loadKnownWorkspaces = async (fallbackFolder: string) => {
  const projectPaths = appData.projects?.length ? appData.projects.map((project) => project.path) : [fallbackFolder];
  const allFilePaths: string[] = [];
  const allFolderPaths: string[] = [];

  for (const projectPath of projectPaths) {
    const { filePaths, folderPaths } = await scanWorkspaceEntries(projectPath);
    allFilePaths.push(...filePaths);
    allFolderPaths.push(projectPath, ...folderPaths);
  }

  const documents = await readDocumentsFromPaths(Array.from(new Set(allFilePaths)));
  const folders = Array.from(new Set(allFolderPaths)).map((path) => createFolderRecord(path));
  appData = await saveAppData({
    ...appData,
    workspacePath: appData.workspacePath || fallbackFolder,
    folders,
    documents,
    activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId),
    settings: {
      ...appData.settings,
      shortcuts: { ...appData.settings.shortcuts, quickFolder: appData.settings.shortcuts.quickFolder || fallbackFolder },
      appearance: { ...appData.settings.appearance }
    }
  });
  updateApplicationMenu();
  emitAppData();
  await startWorkspaceWatchers();
  return appData;
};

const openFileDialog = async (): Promise<AppData | null> => {
  const window = getFocusedMainWindow();
  if (!window) return null;
  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Informio files", extensions: ["md", "markdown", "txt", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "mov", "webm", "mp3", "wav", "m4a", "ogg", "pdf"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled) return null;
  await openMarkdownFiles(result.filePaths);
  return appData;
};

const dedupeProjects = (projects: InformioProject[]) =>
  Array.from(new Map(projects.map((p) => [p.path, p])).values());

const addProject = async (folder: string): Promise<AppData> => {
  const { filePaths, folderPaths } = await scanWorkspaceEntries(folder);
  const newProject = projectRecord(folder);
  const existingPaths = new Set(appData.documents.map((d) => d.filePath).filter(Boolean));
  const newFilePaths = filePaths.filter((p) => !existingPaths.has(p));
  const newDocuments = await readDocumentsFromPaths(newFilePaths);
  appData = await saveAppData({
    ...appData,
    projects: dedupeProjects([...(appData.projects ?? []), newProject]),
    workspacePath: appData.workspacePath ?? folder,
    folders: withTrackedFolders(appData.folders, [folder, ...folderPaths]),
    documents: [...newDocuments, ...appData.documents],
    activeDocumentId: newDocuments[0]?.id ?? appData.activeDocumentId
  });
  updateApplicationMenu();
  emitAppData();
  await startWorkspaceWatchers();
  return appData;
};

const removeProject = async (projectPath: string): Promise<AppData> => {
  const projects = (appData.projects ?? []).filter((p) => p.path !== projectPath);
  const folders = appData.folders.filter((f) => !pathContains(projectPath, f.path));
  const documents = appData.documents.filter((d) => !d.filePath || !pathContains(projectPath, d.filePath));
  const activeDocumentId = documents.some((d) => d.id === appData.activeDocumentId)
    ? appData.activeDocumentId
    : (documents[0]?.id ?? "");
  const workspacePath = appData.workspacePath && pathContains(projectPath, appData.workspacePath)
    ? (projects[0]?.path ?? "")
    : appData.workspacePath;
  appData = await saveAppData({ ...appData, projects, folders, documents, activeDocumentId, workspacePath });
  updateApplicationMenu();
  emitAppData();
  await startWorkspaceWatchers();
  return appData;
};

const renameProject = async (projectPath: string, title: string): Promise<AppData> => {
  const cleanTitle = sanitizeFilesystemName(title.trim());
  if (!cleanTitle) throw new Error("A new project name is required.");

  const nextPath = join(dirname(projectPath), cleanTitle);
  if (normalizeForCompare(nextPath) === normalizeForCompare(projectPath)) return appData;

  try {
    const [currentStat, nextStat] = await Promise.all([stat(projectPath), stat(nextPath)]);
    if (currentStat.dev !== nextStat.dev || currentStat.ino !== nextStat.ino) {
      throw new Error(`A folder named "${basename(nextPath)}" already exists.`);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  await rename(projectPath, nextPath);

  const documents = appData.documents.map((doc) => {
    const relinked = withUpdatedLocalFileUrls(doc, (currentPath) =>
      pathContains(projectPath, currentPath) ? replacePathRoot(currentPath, projectPath, nextPath) : null
    );
    return doc.filePath && pathContains(projectPath, doc.filePath)
      ? {
          ...relinked,
          filePath: replacePathRoot(doc.filePath, projectPath, nextPath),
          updatedAt: new Date().toISOString()
        }
      : relinked;
  });

  const folders = withTrackedFolders(
    appData.folders
      .filter((folder) => folder.path !== projectPath)
      .map((folder) =>
        pathContains(projectPath, folder.path)
          ? createFolderRecord(replacePathRoot(folder.path, projectPath, nextPath))
          : folder
      ),
    [nextPath]
  );

  const projects = (appData.projects ?? []).map((project) => {
    if (project.path === projectPath) {
      return {
        ...project,
        id: projectRecord(nextPath).id,
        path: nextPath,
        title: basename(nextPath) || cleanTitle
      };
    }
    return pathContains(projectPath, project.path)
      ? { ...project, path: replacePathRoot(project.path, projectPath, nextPath) }
      : project;
  });

  const workspacePath = appData.workspacePath && pathContains(projectPath, appData.workspacePath)
    ? replacePathRoot(appData.workspacePath, projectPath, nextPath)
    : appData.workspacePath;

  appData = await saveAppData({
    ...appData,
    projects,
    workspacePath,
    folders: dedupeFolders(folders),
    documents,
    activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId)
  });
  emitAppData();
  updateApplicationMenu();
  await startWorkspaceWatchers();
  return appData;
};

const toggleProjectPinned = async (projectPath: string): Promise<AppData> => {
  appData = await saveAppData({
    ...appData,
    projects: (appData.projects ?? []).map((project) =>
      project.path === projectPath ? { ...project, pinned: !project.pinned } : project
    )
  });
  emitAppData();
  return appData;
};

const addProjectDialog = async (): Promise<AppData | null> => {
  const window = getFocusedMainWindow();
  if (!window) return null;
  const result = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] });
  if (result.canceled) return null;
  return addProject(result.filePaths[0]);
};

const openWorkspaceDialog = async (): Promise<AppData | null> => addProjectDialog();

const createFilesystemDocument = async (folderOverride?: string) => {
  const activeDoc = activeDocument();
  const activeProjectPath = activeDoc?.filePath
    ? (appData.projects ?? []).find((p) => pathContains(p.path, activeDoc.filePath!))?.path
    : undefined;
  const folder = folderOverride || activeProjectPath || appData.projects?.[0]?.path || appData.workspacePath || appData.settings.shortcuts.quickFolder;
  await mkdir(folder, { recursive: true });
  const path = await uniquePath(folder, "Untitled");
  const markdown = "# Untitled\n\n";
  await saveMarkdownFile(path, markdown);
  const document: InformioDocument = {
    id: `file-${Date.now()}`,
    title: basename(path),
    filePath: path,
    kind: "markdown",
    collection: "writing",
    updatedAt: new Date().toISOString(),
    markdown
  };
  appData = await saveAppData({
    ...appData,
    workspacePath: appData.workspacePath ?? folder,
    folders: withTrackedFolders(appData.folders, [folder]),
    documents: [document, ...appData.documents],
    activeDocumentId: document.id,
    settings: {
      ...appData.settings,
      shortcuts: { ...appData.settings.shortcuts, quickFolder: folder },
      appearance: { ...appData.settings.appearance }
    }
  });
  updateApplicationMenu();
  emitAppData();
  return appData;
};

const createDefaultMarkdownDocument = async () => {
  const folder = appData.settings.shortcuts.quickFolder || DEFAULT_WORKSPACE_PATH;
  await mkdir(folder, { recursive: true });
  const path = await uniqueDefaultMarkdownPath(folder);
  const document: InformioDocument = {
    id: `file-${Date.now()}`,
    title: basename(path),
    filePath: path,
    kind: "markdown",
    collection: "writing",
    updatedAt: new Date().toISOString(),
    markdown: ""
  };
  appData = await saveAppDataAndFiles({
    ...appData,
    workspacePath: appData.workspacePath ?? folder,
    folders: withTrackedFolders(appData.folders, [folder]),
    documents: [document, ...appData.documents],
    activeDocumentId: document.id
  });
  updateApplicationMenu();
  emitAppData();
  return appData;
};

const createLinkedDocument = async (title: string) => {
  const folder = appData.settings.shortcuts.quickFolder || DEFAULT_WORKSPACE_PATH;
  await mkdir(folder, { recursive: true });
  const cleanTitle = sanitizeFilesystemName(markdownTitle(title)) || "Untitled";
  const path = await uniquePath(folder, cleanTitle, ".md");
  const markdown = `# ${cleanTitle}\n\n`;
  await saveMarkdownFile(path, markdown);
  const document: InformioDocument = {
    id: `file-${Date.now()}`,
    title: basename(path),
    filePath: path,
    kind: "markdown",
    collection: "knowledge",
    updatedAt: new Date().toISOString(),
    markdown
  };
  appData = await saveAppData({
    ...appData,
    workspacePath: appData.workspacePath ?? folder,
    folders: withTrackedFolders(appData.folders, [folder]),
    documents: [document, ...appData.documents],
    activeDocumentId: document.id,
    settings: {
      ...appData.settings,
      shortcuts: { ...appData.settings.shortcuts, quickFolder: folder }
    }
  });
  updateApplicationMenu();
  emitAppData();
  return appData;
};

const createFilesystemFolder = async (folderOverride?: string) => {
  const activeDoc = activeDocument();
  const activeProjectPath = activeDoc?.filePath
    ? (appData.projects ?? []).find((p) => pathContains(p.path, activeDoc.filePath!))?.path
    : undefined;
  const folder = folderOverride || activeProjectPath || appData.projects?.[0]?.path || appData.workspacePath || appData.settings.shortcuts.quickFolder;
  await mkdir(folder, { recursive: true });
  const path = await uniquePath(folder, "New Folder", "");
  await mkdir(path, { recursive: true });
  appData = await saveAppData({
    ...appData,
    workspacePath: appData.workspacePath ?? folder,
    folders: withTrackedFolders(appData.folders, [path])
  });
  emitAppData();
  return appData;
};

const sanitizeFilesystemName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .replace(/^_+|_+$/g, "");

const extensionFromMimeType = (mimeType: string) => {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "application/pdf") return ".pdf";
  return ".png";
};

const saveAttachment = async (input: SaveAttachmentInput): Promise<SaveAttachmentResult> => {
  const doc = appData.documents.find((item) => item.id === input.documentId);
  const documentFolder = doc?.filePath ? dirname(doc.filePath) : (appData.workspacePath || appData.settings.shortcuts.quickFolder);
  if (!documentFolder) throw new Error("No folder is available for this document.");

  const attachmentFolder = join(documentFolder, ATTACHMENTS_DIR);
  await mkdir(attachmentFolder, { recursive: true });

  const requestedExtension = extname(input.fileName);
  const extension = requestedExtension || extensionFromMimeType(input.mimeType);
  const baseName = sanitizeFilesystemName(basename(input.fileName, requestedExtension) || `pasted-image-${Date.now()}`);
  const path = await uniquePath(attachmentFolder, baseName, extension);
  await writeFile(path, Buffer.from(input.data));

  appData = await saveAppData({
    ...appData,
    folders: withTrackedFolders(appData.folders, [documentFolder, attachmentFolder])
  });
  emitAppData();

  return { path, fileName: basename(path), markdownPath: markdownPathForFile(documentFolder, path) };
};

const copyAttachmentFromPath = async (sourcePath: string): Promise<SaveAttachmentResult> => {
  const doc = activeDocument();
  const documentFolder = doc?.filePath ? dirname(doc.filePath) : (appData.workspacePath || appData.settings.shortcuts.quickFolder);
  if (!documentFolder) throw new Error("No folder is available for this document.");

  const attachmentFolder = join(documentFolder, ATTACHMENTS_DIR);
  await mkdir(attachmentFolder, { recursive: true });

  const extension = extname(sourcePath) || ".png";
  const baseName = sanitizeFilesystemName(basename(sourcePath, extension) || `image-${Date.now()}`);
  const path = await uniquePath(attachmentFolder, baseName, extension);
  await cp(sourcePath, path);

  appData = await saveAppData({
    ...appData,
    folders: withTrackedFolders(appData.folders, [documentFolder, attachmentFolder])
  });
  emitAppData();

  return { path, fileName: basename(path), markdownPath: markdownPathForFile(documentFolder, path) };
};

const resolveInsertedAssetFromPath = async (
  sourcePath: string,
  mode: AppSettings["editor"]["assetImportMode"]
): Promise<SaveAttachmentResult> => {
  if (mode === "link-original-file") {
    const doc = activeDocument();
    const documentFolder = doc?.filePath ? dirname(doc.filePath) : (appData.workspacePath || appData.settings.shortcuts.quickFolder);
    if (!documentFolder) throw new Error("No folder is available for this document.");
    return {
      path: sourcePath,
      fileName: basename(sourcePath),
      markdownPath: markdownPathForFile(documentFolder, sourcePath)
    };
  }
  return copyAttachmentFromPath(sourcePath);
};

const uniqueImportPath = async (sourcePath: string, destinationFolderPath: string) => {
  const extension = extname(sourcePath);
  const base = sanitizeFilesystemName(basename(sourcePath, extension)) || "Imported File";
  const fileStats = await stat(sourcePath);
  return uniquePath(destinationFolderPath, base, fileStats.isDirectory() ? "" : extension);
};

const importExternalFiles = async (input: ImportExternalFilesInput): Promise<AppData> => {
  if (!input.destinationFolderPath) throw new Error("A destination folder path is required.");
  const sourcePaths = Array.from(new Set(input.sourcePaths.filter(Boolean)));
  if (!sourcePaths.length) return appData;

  await mkdir(input.destinationFolderPath, { recursive: true });
  const importedFilePaths: string[] = [];
  const importedFolderPaths: string[] = [input.destinationFolderPath];

  for (const sourcePath of sourcePaths) {
    const fileStats = await stat(sourcePath);
    const destinationPath = await uniqueImportPath(sourcePath, input.destinationFolderPath);
    await cp(sourcePath, destinationPath, { recursive: fileStats.isDirectory() });

    if (fileStats.isDirectory()) {
      const { filePaths, folderPaths } = await scanWorkspaceEntries(destinationPath, { ensure: false });
      importedFilePaths.push(...filePaths);
      importedFolderPaths.push(destinationPath, ...folderPaths);
      continue;
    }

    if (fileStats.isFile()) importedFilePaths.push(destinationPath);
  }

  const importedDocuments = await readDocumentsFromPaths(importedFilePaths);
  const existingPaths = new Set(appData.documents.filter((doc) => doc.filePath).map((doc) => normalizeForCompare(doc.filePath!)));
  const newDocuments = importedDocuments.filter((doc) => doc.filePath && !existingPaths.has(normalizeForCompare(doc.filePath)));
  appData = await saveAppData({
    ...appData,
    folders: withTrackedFolders(appData.folders, importedFolderPaths),
    documents: [...newDocuments, ...appData.documents],
    activeDocumentId: newDocuments[0]?.id ?? appData.activeDocumentId
  });
  updateApplicationMenu();
  emitAppData();
  return appData;
};

const duplicatePath = async (sourcePath: string, targetType: "file" | "folder") => {
  const folder = dirname(sourcePath);
  const extension = targetType === "file" ? extname(sourcePath) : "";
  const base = basename(sourcePath, extension);
  for (let index = 0; index < 999; index += 1) {
    const suffix = index === 0 ? " Copy" : ` Copy ${index + 1}`;
    const path = join(folder, `${base}${suffix}${extension}`);
    try {
      await stat(path);
    } catch (error) {
      log.warn("Failed to check duplicate candidate path:", path, error);
      return path;
    }
  }
  return join(folder, `${base} Copy ${Date.now()}${extension}`);
};

const replacePathRoot = (path: string, oldRoot: string, newRoot: string) =>
  pathContains(oldRoot, path) ? `${newRoot}${path.slice(oldRoot.length)}` : path;

const runFileSystemAction = async (input: FileSystemOperationInput): Promise<AppData> => {
  if (!input.path) throw new Error("A file system path is required.");

  if (input.action === "reveal") {
    shell.showItemInFolder(input.path);
    return appData;
  }

  if (input.action === "rename") {
    const cleanName = sanitizeFilesystemName(input.name ?? "");
    if (!cleanName) throw new Error("A new name is required.");
    const extension = input.targetType === "file" ? extname(input.path) : "";
    const nextName = input.targetType === "file" && extension && !extname(cleanName) ? `${cleanName}${extension}` : cleanName;
    const nextPath = join(dirname(input.path), nextName);
    if (normalizeForCompare(nextPath) === normalizeForCompare(input.path)) return appData;
    try {
      const [currentStat, nextStat] = await Promise.all([stat(input.path), stat(nextPath)]);
      if (currentStat.dev !== nextStat.dev || currentStat.ino !== nextStat.ino) {
        throw new Error(`A ${input.targetType} named "${basename(nextPath)}" already exists.`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    const oldLinkTitle = markdownTitle(basename(input.path));
    const newLinkTitle = markdownTitle(basename(nextPath));
    await rename(input.path, nextPath);

    if (input.targetType === "file") {
      const documents = appData.documents.map((doc) => {
        const renamed = doc.filePath === input.path || doc.id === input.documentId;
        const relinked = withUpdatedLocalFileUrls(
          { ...doc, markdown: replaceWikiLinkTargets(doc.markdown, oldLinkTitle, newLinkTitle) },
          (path) => (normalizeForCompare(path) === normalizeForCompare(input.path) ? nextPath : null)
        );
        const markdown = renamed ? generatedMarkdownForAssetPath(nextPath) ?? relinked.markdown : relinked.markdown;
        const changed = renamed || markdown !== doc.markdown;
        return {
          ...doc,
          ...(renamed ? { title: basename(nextPath), filePath: nextPath } : {}),
          markdown,
          updatedAt: changed ? new Date().toISOString() : doc.updatedAt
        };
      });
      appData = await saveAppDataAndFiles({
        ...appData,
        folders: withTrackedFolders(appData.folders, [dirname(nextPath)]),
        documents,
        activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId)
      });
    } else {
      const documents = appData.documents.map((doc) => {
        const relinked = withUpdatedLocalFileUrls(doc, (path) =>
          pathContains(input.path, path) ? replacePathRoot(path, input.path, nextPath) : null
        );
        return doc.filePath && pathContains(input.path, doc.filePath)
          ? {
              ...relinked,
              filePath: replacePathRoot(doc.filePath, input.path, nextPath),
              updatedAt: new Date().toISOString()
            }
          : relinked;
      });
      const folders = appData.folders.map((folder) =>
        pathContains(input.path, folder.path)
          ? { ...folder, title: basename(replacePathRoot(folder.path, input.path, nextPath)) || folder.title, path: replacePathRoot(folder.path, input.path, nextPath) }
          : folder
      );
      appData = await saveAppData({
        ...appData,
        workspacePath:
          appData.workspacePath && pathContains(input.path, appData.workspacePath)
            ? replacePathRoot(appData.workspacePath, input.path, nextPath)
            : appData.workspacePath,
        folders: dedupeFolders(folders),
        documents,
        activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId)
      });
    }
    updateApplicationMenu();
    emitAppData();
    return appData;
  }

  if (input.action === "move") {
    const destinationFolderPath = input.destinationFolderPath;
    if (!destinationFolderPath) throw new Error("A destination folder path is required.");
    if (input.targetType === "folder" && pathContains(input.path, destinationFolderPath)) {
      throw new Error("A folder cannot be moved into itself.");
    }

    const nextPath = join(destinationFolderPath, basename(input.path));
    if (normalizeForCompare(nextPath) === normalizeForCompare(input.path)) return appData;

    try {
      await stat(nextPath);
      throw new Error(`A ${input.targetType} named "${basename(nextPath)}" already exists.`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    await rename(input.path, nextPath);

    if (input.targetType === "file") {
      const documents = appData.documents.map((doc) => {
        const relinked = withUpdatedLocalFileUrls(doc, (path) =>
          normalizeForCompare(path) === normalizeForCompare(input.path) ? nextPath : null
        );
        return doc.filePath === input.path || doc.id === input.documentId
          ? {
              ...relinked,
              title: basename(nextPath),
              filePath: nextPath,
              markdown: generatedMarkdownForAssetPath(nextPath) ?? relinked.markdown,
              updatedAt: new Date().toISOString()
            }
          : relinked;
      });
      appData = await saveAppData({
        ...appData,
        folders: withTrackedFolders(appData.folders, [dirname(nextPath)]),
        documents,
        activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId)
      });
    } else {
      const documents = appData.documents.map((doc) => {
        const relinked = withUpdatedLocalFileUrls(doc, (path) =>
          pathContains(input.path, path) ? replacePathRoot(path, input.path, nextPath) : null
        );
        return doc.filePath && pathContains(input.path, doc.filePath)
          ? {
              ...relinked,
              filePath: replacePathRoot(doc.filePath, input.path, nextPath),
              updatedAt: new Date().toISOString()
            }
          : relinked;
      });
      const folders = withTrackedFolders(
        appData.folders
          .filter((folder) => folder.path !== input.path)
          .map((folder) =>
            pathContains(input.path, folder.path)
              ? createFolderRecord(replacePathRoot(folder.path, input.path, nextPath))
              : folder
          ),
        [nextPath]
      );
      const projects = (appData.projects ?? []).map((project) =>
        project.path === input.path
          ? { ...project, path: nextPath }
          : pathContains(input.path, project.path)
            ? { ...project, path: replacePathRoot(project.path, input.path, nextPath) }
            : project
      );
      const workspacePath = appData.workspacePath && pathContains(input.path, appData.workspacePath)
        ? replacePathRoot(appData.workspacePath, input.path, nextPath)
        : appData.workspacePath;
      appData = await saveAppData({
        ...appData,
        projects,
        workspacePath,
        folders: dedupeFolders(folders),
        documents,
        activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId)
      });
      await startWorkspaceWatchers();
    }

    updateApplicationMenu();
    emitAppData();
    return appData;
  }

  if (input.action === "duplicate") {
    const nextPath = await duplicatePath(input.path, input.targetType);
    await cp(input.path, nextPath, { recursive: input.targetType === "folder" });

    if (input.targetType === "file") {
      const documents = await readDocumentsFromPaths([nextPath]);
      appData = await saveAppData({
        ...appData,
        folders: withTrackedFolders(appData.folders, [dirname(nextPath)]),
        documents: [...documents, ...appData.documents],
        activeDocumentId: documents[0]?.id ?? appData.activeDocumentId
      });
    } else {
      const { filePaths, folderPaths } = await scanWorkspaceEntries(nextPath);
      const documents = await readDocumentsFromPaths(filePaths);
      appData = await saveAppData({
        ...appData,
        folders: withTrackedFolders(appData.folders, [nextPath, ...folderPaths]),
        documents: [...documents, ...appData.documents],
        activeDocumentId: documents[0]?.id ?? appData.activeDocumentId
      });
    }
    updateApplicationMenu();
    emitAppData();
    return appData;
  }

  if (input.action === "delete") {
    await rm(input.path, { recursive: input.targetType === "folder", force: false });
    const documents =
      input.targetType === "file"
        ? appData.documents.filter((doc) => doc.filePath !== input.path && doc.id !== input.documentId)
        : appData.documents.filter((doc) => !doc.filePath || !pathContains(input.path, doc.filePath));
    const folders =
      input.targetType === "file" ? appData.folders : appData.folders.filter((folder) => !pathContains(input.path, folder.path));
    const workspacePath =
      input.targetType === "folder" && appData.workspacePath && pathContains(input.path, appData.workspacePath)
        ? appData.settings.shortcuts.quickFolder || DEFAULT_WORKSPACE_PATH
        : appData.workspacePath;

    appData = await saveAppData({
      ...appData,
      workspacePath,
      folders: dedupeFolders(folders),
      documents,
      activeDocumentId: normalizeActiveDocumentId(documents, appData.activeDocumentId)
    });
    if (!appData.documents.length) return createFilesystemDocument();
    updateApplicationMenu();
    emitAppData();
    return appData;
  }

  return appData;
};

const syncRendererDocuments = async (documents?: InformioDocument[], activeDocumentId?: string) => {
  if (!documents) return;
  const mergedDocuments = await cleanDocumentsMarkdown(mergeRendererDocuments(documents));
  appData = await saveAppData({
    ...appData,
    documents: mergedDocuments,
    activeDocumentId: normalizeActiveDocumentId(mergedDocuments, activeDocumentId ?? appData.activeDocumentId)
  });
};

const saveActiveDocumentAs = async (documents?: InformioDocument[], activeDocumentId?: string) => {
  await syncRendererDocuments(documents, activeDocumentId);
  const window = getFocusedMainWindow();
  const doc = activeDocument();
  if (!window || !doc || !isWritableTextDocument(doc)) return;
  const result = await dialog.showSaveDialog(window, {
    defaultPath: doc.filePath ?? doc.title,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });
  if (result.canceled || !result.filePath) return;
  await saveMarkdownFile(result.filePath, doc.markdown);
  appData = await saveAppData({
    ...appData,
    folders: withTrackedFolders(appData.folders, [dirname(result.filePath)]),
    documents: appData.documents.map((item) =>
      item.id === doc.id ? { ...item, title: basename(result.filePath!), filePath: result.filePath, updatedAt: new Date().toISOString() } : item
    )
  });
  updateApplicationMenu();
  emitAppData();
  return appData;
};

const moveActiveDocumentTo = async () => {
  const window = getFocusedMainWindow();
  const doc = activeDocument();
  if (!window || !doc || !isWritableTextDocument(doc)) return;
  const result = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] });
  if (result.canceled) return;
  const path = join(result.filePaths[0], doc.title);
  await saveMarkdownFile(path, doc.markdown);
  appData = await saveAppData({
    ...appData,
    folders: withTrackedFolders(appData.folders, [dirname(path)]),
    documents: appData.documents.map((item) => (item.id === doc.id ? { ...item, filePath: path, updatedAt: new Date().toISOString() } : item))
  });
  emitAppData();
};

const exportActiveDocument = async (
  format: "markdown" | "html" | "pdf",
  documents = appData.documents,
  activeDocumentId = appData.activeDocumentId
) => {
  const window = getFocusedMainWindow();
  const mergedDocuments = documents === appData.documents ? appData.documents : mergeRendererDocuments(documents);
  const doc = mergedDocuments.find((item) => item.id === normalizeActiveDocumentId(mergedDocuments, activeDocumentId));
  if (!window || !doc || !isWritableTextDocument(doc)) return;
  const extension = format === "pdf" ? "pdf" : format === "html" ? "html" : "md";
  const fontStack = exportFontStack(appData.settings.appearance);
  const html = markdownToBasicHtml(doc.markdown, fontStack, markdownTitle(doc.title));
  const result = await dialog.showSaveDialog(window, {
    defaultPath: `${doc.title.replace(/\.[^.]+$/, "")}.${extension}`,
    filters: [
      {
        name: format === "pdf" ? "PDF" : format === "html" ? "HTML" : "Markdown",
        extensions: [extension]
      }
    ]
  });
  if (result.canceled || !result.filePath) return;
  if (format === "pdf") {
    await exportHtmlToPdf(result.filePath, html);
    return;
  }
  await saveMarkdownFile(result.filePath, format === "html" ? html : doc.markdown);
};

const insertAsset = async (kind: "image" | "video" | "audio" | "pdf") => {
  const window = getFocusedMainWindow();
  const doc = activeDocument();
  if (!window || !doc || !isWritableTextDocument(doc)) return;
  const extensions = {
    image: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
    video: ["mp4", "mov", "webm"],
    audio: ["mp3", "wav", "m4a", "ogg"],
    pdf: ["pdf"]
  }[kind];
  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
    filters: [{ name: `${kind} files`, extensions }]
  });
  if (result.canceled) return;
  const attachment = await resolveInsertedAssetFromPath(result.filePaths[0], appData.settings.editor.assetImportMode);
  sendMenuCommand("insert:asset", { kind, path: attachment.markdownPath, name: attachment.fileName });
};

const handleWindowAction = (action: "fill" | "center" | "move-left" | "move-right" | "move-top" | "move-bottom" | "tile-left" | "tile-right") => {
  const window = getFocusedMainWindow();
  if (!window) return;
  const { workArea } = screen.getDisplayMatching(window.getBounds());
  if (action === "center") return window.center();
  if (action === "fill") return window.setBounds(workArea);
  if (action === "move-left") return window.setBounds({ ...workArea, width: Math.round(workArea.width / 2) });
  if (action === "move-right") return window.setBounds({ ...workArea, x: workArea.x + Math.round(workArea.width / 2), width: Math.round(workArea.width / 2) });
  if (action === "move-top") return window.setBounds({ ...workArea, height: Math.round(workArea.height / 2) });
  if (action === "move-bottom") return window.setBounds({ ...workArea, y: workArea.y + Math.round(workArea.height / 2), height: Math.round(workArea.height / 2) });
  if (action === "tile-left") return window.setBounds({ ...workArea, width: Math.round(workArea.width / 2) });
  window.setBounds({ ...workArea, x: workArea.x + Math.round(workArea.width / 2), width: Math.round(workArea.width / 2) });
};

const updateApplicationMenu = () => {
  const recentFiles = appData?.documents.filter((doc) => doc.filePath).slice(0, 8) ?? [];
  const hasOpenTab = Boolean(getFocusedMainWindow()) && Boolean(appData.documents.length);
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: `关于 ${app.name}` },
        { type: "separator" },
        { label: "设置...", accelerator: shortcutBinding("settings.open"), click: () => sendMenuCommand("settings:open") },
        { type: "separator" },
        { role: "hide", label: "隐藏 Informio" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: "退出 Informio" }
      ]
    },
    {
      label: "文件",
      submenu: [
        { label: "新建", accelerator: shortcutBinding("file.new"), click: () => sendMenuCommand("file:new") },
        { label: "命令面板", accelerator: shortcutBinding("commandPalette.open"), click: () => sendMenuCommand("command:open-palette") },
        { label: "新建窗口", accelerator: shortcutBinding("window.new"), click: () => sendMenuCommand("window:new") },
        { type: "separator" },
        { label: "快速打开", accelerator: shortcutBinding("file.open"), click: () => sendMenuCommand("file:open") },
        { label: "打开文件...", click: openFileDialog },
        { label: "打开项目...", accelerator: shortcutBinding("workspace.open"), click: () => sendMenuCommand("workspace:open") },
        {
          label: "打开最近文件",
          submenu: recentFiles.length
            ? recentFiles.map((doc) => ({ label: doc.title, click: () => openMarkdownFiles([doc.filePath!]) }))
            : [{ label: "无最近文件", enabled: false }]
        },
        {
          label: "打开最近项目",
          submenu: appData?.settings.shortcuts.quickFolder
            ? [{ label: appData.settings.shortcuts.quickFolder, click: () => loadWorkspace(appData.settings.shortcuts.quickFolder) }]
            : [{ label: "无最近项目", enabled: false }]
        },
        { type: "separator" },
        { label: "关闭标签", accelerator: shortcutBinding("file.closeTab"), enabled: hasOpenTab, click: () => sendMenuCommand("file:close-tab") },
        { label: "关闭窗口", accelerator: shortcutBinding("window.close"), click: () => sendMenuCommand("window:close") },
        { label: "关闭项目", click: () => sendMenuCommand("file:close-workspace") },
        { type: "separator" },
        { label: "保存", accelerator: shortcutBinding("file.save"), click: () => sendMenuCommand("file:save") },
        { label: "另存为...", accelerator: shortcutBinding("file.saveAs"), click: () => sendMenuCommand("file:save-as") },
        { label: "移动到...", click: moveActiveDocumentTo },
        {
          label: "导出",
          submenu: [
            { label: "Markdown...", click: () => exportActiveDocument("markdown") },
            { label: "HTML...", click: () => exportActiveDocument("html") },
            { label: "PDF...", click: () => exportActiveDocument("pdf") }
          ]
        },
        { label: "打印...", click: () => getFocusedMainWindow()?.webContents.print() }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { label: "Copy", accelerator: "CommandOrControl+C", click: () => sendMenuCommand("edit:copy") },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" },
        { type: "separator" },
        {
          label: "查找",
          submenu: [
            { label: "查找与替换", accelerator: shortcutBinding("edit.find"), click: () => sendMenuCommand("edit:find") },
            { label: "查找下一个", accelerator: shortcutBinding("edit.findNext"), click: () => sendMenuCommand("edit:find-next") }
          ]
        },
        {
          label: "选择",
          submenu: [
            { label: "选择当前段落", click: () => sendMenuCommand("edit:select-block") },
            { role: "selectAll", label: "选择全部" }
          ]
        },
        {
          label: "行",
          submenu: [
            { label: "复制当前行", click: () => sendMenuCommand("edit:duplicate-line") },
            { label: "删除当前行", click: () => sendMenuCommand("edit:delete-line") }
          ]
        },
        {
          label: "行尾符",
          submenu: [
            { label: "插入换行", click: () => sendMenuCommand("edit:hard-break") },
            { label: "插入分段", click: () => sendMenuCommand("insert:paragraph") }
          ]
        },
        {
          label: "AutoFill",
          submenu: [
            { label: "插入当前日期", click: () => sendMenuCommand("autofill:date") },
            { label: "插入文档标题", click: () => sendMenuCommand("autofill:title") },
            { label: "重复上一段", click: () => sendMenuCommand("autofill:previous-block") }
          ]
        }
      ]
    },
    {
      label: "格式",
      submenu: [
        {
          label: "标题",
          submenu: [
            { label: "正文", click: () => sendMenuCommand("format:paragraph") },
            { label: "标题 1", click: () => sendMenuCommand("format:heading", 1) },
            { label: "标题 2", click: () => sendMenuCommand("format:heading", 2) },
            { label: "标题 3", click: () => sendMenuCommand("format:heading", 3) }
          ]
        },
        { type: "separator" },
        { label: "加粗", accelerator: shortcutBinding("format.bold"), click: () => sendMenuCommand("format:bold") },
        { label: "倾斜", accelerator: shortcutBinding("format.italic"), click: () => sendMenuCommand("format:italic") },
        { label: "下划线", accelerator: shortcutBinding("format.underline"), click: () => sendMenuCommand("format:underline") },
        { label: "删除线", accelerator: shortcutBinding("format.strike"), click: () => sendMenuCommand("format:strike") },
        { label: "链接", click: () => sendMenuCommand("insert:link") },
        { label: "行内代码", click: () => sendMenuCommand("format:inline-code") },
        { label: "高亮", accelerator: shortcutBinding("format.highlight"), click: () => sendMenuCommand("format:highlight") },
        { label: "加密文本", click: () => sendMenuCommand("format:encrypt-text") },
        { type: "separator" },
        { label: "下标", click: () => sendMenuCommand("format:subscript") },
        { label: "上标", click: () => sendMenuCommand("format:superscript") },
      ]
    },
    {
      label: "插入",
      submenu: [
        { label: "图片...", click: () => insertAsset("image") },
        { label: "视频...", click: () => insertAsset("video") },
        { label: "音频...", click: () => insertAsset("audio") },
        { label: "PDF...", click: () => insertAsset("pdf") },
        { type: "separator" },
        { label: "表格", click: () => sendMenuCommand("insert:table") },
        {
          label: "列表",
          submenu: [
            { label: "项目符号列表", click: () => sendMenuCommand("format:bullet-list") },
            { label: "编号列表", click: () => sendMenuCommand("format:ordered-list") },
            { label: "任务列表", click: () => sendMenuCommand("format:task-list") }
          ]
        },
        { label: "Note", click: () => sendMenuCommand("format:blockquote") },
        { label: "代码块", click: () => sendMenuCommand("format:code-block") },
        { label: "数学公式块", click: () => sendMenuCommand("insert:math") },
        { label: "图表", click: () => sendMenuCommand("insert:chart") },
        { label: "水平分隔线", click: () => sendMenuCommand("insert:horizontal-rule") },
        { type: "separator" },
        { label: "脚注", click: () => sendMenuCommand("insert:footnote") },
        { label: "Callout", click: () => sendMenuCommand("insert:callout") }
      ]
    },
    {
      label: "视图",
      submenu: [
        { label: "切换左栏", click: () => sendMenuCommand("view:toggle-left-panel") },
        { label: "切换 Assistant", click: () => sendMenuCommand("view:toggle-right-panel") },
        { type: "separator" },
        { label: "设置", click: () => sendMenuCommand("settings:open") }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "Minimize" },
        { role: "zoom", label: "Zoom" },
        { label: "Fill", click: () => handleWindowAction("fill") },
        { label: "Center", click: () => handleWindowAction("center") },
        { type: "separator" },
        {
          label: "Move & Resize",
          submenu: [
            { label: "Left", click: () => handleWindowAction("move-left") },
            { label: "Right", click: () => handleWindowAction("move-right") },
            { label: "Top", click: () => handleWindowAction("move-top") },
            { label: "Bottom", click: () => handleWindowAction("move-bottom") }
          ]
        },
        {
          label: "Full Screen Tile",
          submenu: [
            { label: "Tile Left", click: () => handleWindowAction("tile-left") },
            { label: "Tile Right", click: () => handleWindowAction("tile-right") },
            { label: "Enter Full Screen", role: "togglefullscreen" }
          ]
        },
        { type: "separator" },
        { role: "front", label: "将全部窗口置于前方" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "Informio 帮助",
          click: () =>
            dialog.showMessageBox(getFocusedMainWindow() ?? undefined, {
              type: "info",
              message: "Informio",
              detail: "使用文件菜单管理文档，使用编辑/格式/插入菜单处理当前正文，使用窗口菜单调整窗口。"
            })
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const hasSingleInstanceLock = isDevelopmentRuntime || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

enqueueExternalOpenFileArgs(process.argv);

app.on("second-instance", (_event, argv) => {
  enqueueExternalOpenFileArgs(argv);
  const window = getFocusedMainWindow();
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
  if (app.isReady()) void flushPendingExternalOpenFiles();
});

app.whenReady().then(async () => {
  await prepareRuntimeEnvironment();
  appIcon = loadAppIcon();
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    ...(APP_GITHUB_URL ? { website: APP_GITHUB_URL } : {})
  });
  if (process.platform === "darwin" && appIcon) {
    app.dock?.setIcon(appIcon);
  }

  protocol.handle("local-file", async (request) => {
    for (const pathname of localFilePathCandidates(request.url)) {
      try {
        const response = await localFileResponse(pathname, request);
        if (response) return response;
      } catch (error) {
        log.warn("Failed to serve local file:", pathname, error);
      }
    }
    return new Response(null, { status: 404 });
  });

  appData = await loadAppData();
  appData = await saveAppData({
    ...appData,
    documents: await cleanDocumentsMarkdown(appData.documents.map(normalizeAssetDocumentMarkdown), { writeFiles: true })
  });
  appDataLoaded = true;
  const startupFolder = appData.settings.shortcuts.quickFolder || appData.workspacePath || DEFAULT_WORKSPACE_PATH;
  appData = await saveAppData({
    ...appData,
    workspacePath: appData.workspacePath || startupFolder,
    settings: {
      ...appData.settings,
      shortcuts: {
        ...appData.settings.shortcuts,
        quickFolder: startupFolder
      }
    }
  });
  try {
    await loadKnownWorkspaces(startupFolder);
  } catch (error) {
    console.error("Could not load known workspaces.", error);
  }
  updateApplicationMenu();
  createWindow();
  setupAutoUpdater(() => mainWindow);
  registerGlobalShortcuts();
  await flushPendingExternalOpenFiles();
});

app.on("open-file", (event, path) => {
  event.preventDefault();
  enqueueExternalOpenFiles([path]);
  if (app.isReady()) void flushPendingExternalOpenFiles();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  if (app.isReady()) void flushPendingExternalOpenFiles();
});

app.on("before-quit", async () => {
  if (workspaceRefreshTimer) clearTimeout(workspaceRefreshTimer);
  stopWorkspaceWatchers();
  globalShortcut.unregisterAll();
  await Promise.all(appData.settings.agents.map((agent) => agentRuntime.disconnect(agent.id, appData.settings.agents)));
});

ipcMain.handle("app:load", async () => {
  try {
    return await refreshWorkspaceFromDisk({ emit: false });
  } catch (error) {
    console.error("app:load failed", error);
    throw error;
  }
});

ipcMain.handle("app:open-settings", async () => {
  openSettingsWindow();
});

ipcMain.handle("app:new-window", async () => {
  createWindow();
});

ipcMain.handle("app:window-control", (event, action: "minimize" | "toggleMaximize" | "close") => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (action === "minimize") {
    window.minimize();
    return;
  }
  if (action === "toggleMaximize") {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return;
  }
  if (action === "close") {
    window.close();
  }
});

ipcMain.handle("app:open-files", async () => openFileDialog());

ipcMain.handle("app:open-workspace", async () => openWorkspaceDialog());

ipcMain.handle("app:add-project", async () => addProjectDialog());

ipcMain.handle("app:remove-project", async (_event, path: string) => {
  if (typeof path !== "string" || path.includes("..")) {
    log.warn("Invalid path in app:remove-project");
    return appData;
  }
  return removeProject(path);
});

ipcMain.handle("app:rename-project", async (_event, path: string, title: string) => {
  if (typeof path !== "string" || typeof title !== "string" || path.includes("..")) {
    log.warn("Invalid args in app:rename-project");
    return appData;
  }
  return renameProject(path, title);
});

ipcMain.handle("app:toggle-project-pinned", async (_event, path: string) => {
  if (typeof path !== "string" || path.includes("..")) {
    log.warn("Invalid path in app:toggle-project-pinned");
    return appData;
  }
  return toggleProjectPinned(path);
});

ipcMain.handle("app:create-document", async (_event, folderPath?: string) => {
  if (folderPath !== undefined && (typeof folderPath !== "string" || folderPath.includes(".."))) {
    log.warn("Invalid folderPath in app:create-document");
    return appData;
  }
  return createFilesystemDocument(folderPath);
});

ipcMain.handle("app:create-default-markdown-document", async () => createDefaultMarkdownDocument());

ipcMain.handle("app:create-linked-document", async (_event, title: string) => createLinkedDocument(title));

ipcMain.handle("app:create-folder", async (_event, folderPath?: string) => {
  if (folderPath !== undefined && (typeof folderPath !== "string" || folderPath.includes(".."))) {
    log.warn("Invalid folderPath in app:create-folder");
    return appData;
  }
  return createFilesystemFolder(folderPath);
});

ipcMain.handle("app:insert-asset", async (_event, kind: "image" | "video" | "audio" | "pdf") => insertAsset(kind));

ipcMain.handle("app:filesystem-action", async (_event, input: FileSystemOperationInput) => {
  if (!input || typeof input !== "object" || typeof input.path !== "string" || typeof input.action !== "string") {
    log.warn("Invalid args in app:filesystem-action");
    return appData;
  }
  if (input.path.includes("..") || (input.destinationFolderPath && typeof input.destinationFolderPath === "string" && input.destinationFolderPath.includes(".."))) {
    log.warn("Path traversal detected in app:filesystem-action:", input.path);
    return appData;
  }
  return runFileSystemAction(input);
});

ipcMain.handle("app:import-external-files", async (_event, input: ImportExternalFilesInput) => {
  if (!input || typeof input !== "object" || !Array.isArray(input.sourcePaths) || typeof input.destinationFolderPath !== "string") {
    log.warn("Invalid args in app:import-external-files");
    return appData;
  }
  if (input.destinationFolderPath.includes("..") || input.sourcePaths.some((p: string) => typeof p !== "string" || p.includes(".."))) {
    log.warn("Path traversal detected in app:import-external-files");
    return appData;
  }
  return importExternalFiles(input);
});

ipcMain.handle("app:save-attachment", async (_event, input: SaveAttachmentInput) => {
  if (!input || typeof input !== "object" || typeof input.documentId !== "string" || typeof input.fileName !== "string") {
    log.warn("Invalid args in app:save-attachment");
    return { path: "", fileName: "", markdownPath: "" };
  }
  return saveAttachment(input);
});

ipcMain.handle("app:load-asset", async (_event, path: string): Promise<AssetDataResult> => {
  if (typeof path !== "string" || path.includes("..")) {
    log.warn("Invalid path in app:load-asset:", path);
    return { data: new ArrayBuffer(0), mimeType: "application/octet-stream" };
  }
  return loadAssetData(path);
});

ipcMain.handle("app:save-pdf-file", async (_event, path: string, data: ArrayBuffer): Promise<void> => {
  if (typeof path !== "string" || path.includes("..")) {
    log.warn("Invalid path in app:save-pdf-file:", path);
    return;
  }
  if (!data || !(data instanceof ArrayBuffer)) {
    log.warn("Invalid data in app:save-pdf-file");
    return;
  }
  return savePdfFile(path, data);
});

ipcMain.handle("app:save-settings", async (_event, settings: AppSettings) => {
  if (!settings || typeof settings !== "object") {
    log.warn("Invalid settings in app:save-settings");
    return appData.settings;
  }
  const agentConversations = normalizeAgentConversations(
    appData.agentConversations,
    appData.workspacePath,
    appData.projects ?? [],
    settings.agentRuntime.conversationRetentionLimit,
    settings.agentRuntime.conversationRetentionDays
  );
  appData = await saveAppData({ ...appData, settings });
  if (agentConversations.length !== appData.agentConversations.length) {
    appData = await saveAppData({ ...appData, agentConversations });
  }
  registerGlobalShortcuts();
  updateApplicationMenu();
  emitAppData();
  return appData.settings;
});

ipcMain.handle("app:get-info", async () => getAppInfo());

ipcMain.handle("app:save-documents", async (_event, _documents: InformioDocument[], activeDocumentId: string) => {
  if (!Array.isArray(_documents) || typeof activeDocumentId !== "string") {
    log.warn("Invalid IPC args for app:save-documents");
    return appData;
  }
  const knownActiveDocumentId = normalizeActiveDocumentId(appData.documents, activeDocumentId);
  appData = await saveAppData({
    ...appData,
    activeDocumentId: knownActiveDocumentId
  });
  return appData;
});

ipcMain.handle("app:save-now", async (_event, documents: InformioDocument[], activeDocumentId: string): Promise<SaveResult> => {
  if (!Array.isArray(documents) || typeof activeDocumentId !== "string") {
    log.warn("Invalid IPC args for app:save-now");
    return { data: appData, savedAt: new Date().toISOString() };
  }
  const mergedDocuments = await cleanDocumentsMarkdown(mergeRendererDocuments(documents));
  appData = await saveAppDataAndFiles({
    ...appData,
    documents: mergedDocuments,
    activeDocumentId: normalizeActiveDocumentId(mergedDocuments, activeDocumentId)
  });
  return { data: appData, savedAt: new Date().toISOString() };
});

ipcMain.handle("app:save-active-document-as", async (_event, documents: InformioDocument[], activeDocumentId: string) => {
  if (!Array.isArray(documents) || typeof activeDocumentId !== "string") {
    log.warn("Invalid IPC args for app:save-active-document-as");
    return;
  }
  return saveActiveDocumentAs(documents, activeDocumentId);
});

ipcMain.handle(
  "app:export-active-document",
  async (_event, documents: InformioDocument[], activeDocumentId: string, format: "markdown" | "html" | "pdf") =>
    exportActiveDocument(format, documents, activeDocumentId)
);

ipcMain.handle("app:save-agent-conversations", async (_event, input: SaveAgentConversationsInput) => saveAgentConversations(input));

ipcMain.handle("app:choose-folder", async () => {
  const parent = getFocusedMainWindow() ?? settingsWindow ?? mainWindow ?? undefined;
  const options: OpenDialogOptions = {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: appData.settings.shortcuts.quickFolder
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("app:list-local-fonts", async () => listSystemLocalFonts());

ipcMain.handle("agent-runtime:list", async () => agentRuntime.listConnections(appData.settings.agents));

ipcMain.handle("agent-runtime:connect", async (_event, providerId: string) => {
  const provider = appData.settings.agents.find((agent) => agent.id === providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  return agentRuntime.connect(provider);
});

ipcMain.handle("agent-runtime:disconnect", async (_event, providerId: string) =>
  agentRuntime.disconnect(providerId, appData.settings.agents)
);

ipcMain.handle("api:detect-models", async (_event, input: ApiModelDetectionInput) => detectApiModels(input));

ipcMain.handle("api:translate-selection", async (_event, input: TranslateSelectionInput) => translateSelection(input));

ipcMain.handle("agent-runtime:send", async (_event, input: SendAgentMessageInput) => {
  if (!input || typeof input !== "object" || typeof input.providerId !== "string") {
    log.warn("Invalid args in agent-runtime:send");
    return { error: "Invalid input" };
  }
  const provider = appData.settings.agents.find((agent) => agent.id === input.providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  return agentRuntime.send(input, provider);
});

ipcMain.handle("agent-runtime:send-stream", async (event, requestId: string, input: SendAgentMessageInput) => {
  if (typeof requestId !== "string" || !input || typeof input !== "object" || typeof input.providerId !== "string") {
    log.warn("Invalid args in agent-runtime:send-stream");
    return { error: "Invalid input" };
  }
  const provider = appData.settings.agents.find((agent) => agent.id === input.providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  return agentRuntime.sendStream(input, provider, (chunk) => {
    event.sender.send("agent-runtime:stream", requestId, chunk);
  });
});

ipcMain.handle("agent:session-stream", async (event, requestId: string, input: AgentSessionInput) => {
  if (typeof requestId !== "string" || !input || typeof input !== "object" || typeof input.providerId !== "string") {
    log.warn("Invalid args in agent:session-stream");
    throw new Error("Invalid input");
  }
  const provider = appData.settings.agents.find((agent) => agent.id === input.providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  try {
    return await agentRuntime.runSessionStream(input, provider, (chunk) => {
      event.sender.send("agent:session-event", requestId, chunk);
    });
  } catch (error) {
    const message = asErrorMessage(error);
    event.sender.send("agent:session-event", requestId, { type: "error", message });
    throw new Error(message);
  }
});

ipcMain.handle("agent:approval-response", async (_event, input: AgentApprovalResponseInput) => {
  if (!input || typeof input !== "object") {
    log.warn("Invalid args in agent:approval-response");
    return { ok: false };
  }
  const handled = agentRuntime.respondApproval(input, appData.settings.agents);
  if (!handled) throw new Error("Approval request is no longer active.");
  return { ok: true };
});

ipcMain.handle("agent:cancel-run", async (_event, providerId: string) => {
  if (typeof providerId !== "string") {
    log.warn("Invalid providerId in agent:cancel-run");
    return { ok: false };
  }
  const cancelled = agentRuntime.cancelRun(providerId, appData.settings.agents);
  return { ok: cancelled };
});

ipcMain.handle("app:open-external", async (_event, url: string) => {
  if (typeof url !== "string" || (!url.startsWith("https://") && !url.startsWith("http://"))) {
    log.warn("Blocked non-HTTP URL:", url);
    return;
  }
  await shell.openExternal(url);
});

ipcMain.handle("app:open-path", async (_event, path: string) => {
  if (typeof path !== "string") {
    log.warn("Invalid path in app:open-path");
    return;
  }
  const error = await shell.openPath(path);
  if (error) throw new Error(error);
});

ipcMain.handle("app:set-language", (_event, lang: string) => {
  if (typeof lang !== "string") return;
  mainWindows.forEach((window) => window.webContents.send("app:language-changed", lang));
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("app:language-changed", lang);
  }
});
