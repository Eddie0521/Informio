import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, shell } from "electron";
import type { MenuItemConstructorOptions, NativeImage, OpenDialogOptions } from "electron";
import { existsSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
import type {
  ApiModelDetectionInput,
  AgentConversation,
  AppData,
  AppSettings,
  DeletePdfAnnotationInput,
  DeletePdfAnnotationResult,
  FileSystemOperationInput,
  InformioDocument,
  InformioFolder,
  InformioProject,
  LoadPdfAnnotationsInput,
  PdfAnnotation,
  SaveAttachmentInput,
  SaveAttachmentResult,
  SaveAgentConversationsInput,
  SavePdfAnnotationInput,
  SavePdfAnnotationResult,
  SaveResult,
  AgentApprovalResponseInput,
  AgentSessionInput,
  SendAgentMessageInput,
  TranslateSelectionInput
} from "../shared/types.js";
import {
  createQuickDocument,
  loadAppData,
  normalizeAgentConversations,
  projectRecord,
  saveAppData,
  saveAppDataAndFiles
} from "./store.js";
import { AgentRuntimeManager } from "./agentRuntime.js";
import { detectApiModels, translateSelection } from "./translationApi.js";
import { checkForUpdates, getAppInfo, getUpdaterState, initializeUpdater, restartToInstallUpdate } from "./updater.js";
import { APP_GITHUB_URL, APP_NAME } from "../shared/appMeta.js";

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let settingsWindowOpening = false;
let appData: AppData;
let appIcon: NativeImage | null = null;
const mainWindows = new Set<BrowserWindow>();
let workspaceWatchers: FSWatcher[] = [];
let workspaceRefreshTimer: NodeJS.Timeout | null = null;
let workspaceRefreshInFlight = false;

const agentRuntime = new AgentRuntimeManager();

const MAIN_WINDOW_SIZE = { width: 1180, height: 840 };
const QUICK_CAPTURE_WINDOW_SIZE = { width: 980, height: 700 };
const TRAFFIC_LIGHT_POSITION = { x: 14, y: 15 };
const OPENABLE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".ogg", ".pdf"]);
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const DEFAULT_WORKSPACE_PATH = join(homedir(), "Documents", "Informio Quick Notes");

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
    titleBarStyle: "hiddenInset",
    trafficLightPosition: TRAFFIC_LIGHT_POSITION,
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
    titleBarStyle: "hiddenInset",
    trafficLightPosition: TRAFFIC_LIGHT_POSITION,
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

const normalizeForCompare = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

const isWritableTextDocument = (document: InformioDocument) => {
  if (!document.filePath) return true;
  return TEXT_EXTENSIONS.has(extname(document.filePath).toLowerCase());
};

const pathContains = (folder: string, path: string) => {
  const normalizedFolder = normalizeForCompare(folder);
  const normalizedPath = normalizeForCompare(path);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
};

type PdfAnnotationStore = {
  version: 1;
  annotations: PdfAnnotation[];
};

const normalizePdfAnnotationPath = (value: string) => {
  if (!value.startsWith("local-file://")) return normalizeForCompare(value);
  return normalizeForCompare(localFilePathCandidates(value)[0] ?? value);
};

const pdfAnnotationStorePath = (pdfPath: string) => {
  const normalized = normalizePdfAnnotationPath(pdfPath);
  const project = appData.projects?.find((item) => pathContains(item.path, normalized));
  const root = project?.path || dirname(normalized);
  return join(root, ".informio", "pdf-annotations.json");
};

const readPdfAnnotationStore = async (pdfPath: string): Promise<PdfAnnotationStore> => {
  try {
    const raw = await readFile(pdfAnnotationStorePath(pdfPath), "utf8");
    const parsed = JSON.parse(raw) as Partial<PdfAnnotationStore>;
    return {
      version: 1,
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : []
    };
  } catch {
    return { version: 1, annotations: [] };
  }
};

const writePdfAnnotationStore = async (pdfPath: string, store: PdfAnnotationStore) => {
  const path = pdfAnnotationStorePath(pdfPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), "utf8");
};

const colorFromHex = (value: string) => {
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  const hex = match?.[1] ?? "fde047";
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  );
};

const bestEffortWritePdfAnnotationToSource = async (annotation: PdfAnnotation) => {
  if (annotation.type === "link") {
    return { attempted: false, ok: true, message: "PDF 与 Markdown 跳转是 Informio 专属数据，已保存在本地标注数据中。" };
  }
  if (!PDF_EXTENSIONS.has(extname(annotation.pdfPath).toLowerCase())) {
    return { attempted: true, ok: false, message: "目标文件不是 PDF，已仅保存到本地标注数据。" };
  }
  try {
    await stat(annotation.pdfPath);
  } catch {
    return { attempted: true, ok: false, message: "找不到源 PDF，已仅保存到本地标注数据。" };
  }
  try {
    const bytes = await readFile(annotation.pdfPath);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const page = pdf.getPage(annotation.page - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const color = colorFromHex(annotation.color);
    annotation.rects.forEach((rect) => {
      const x = rect.x * pageWidth;
      const y = pageHeight - (rect.y + rect.height) * pageHeight;
      const width = rect.width * pageWidth;
      const height = rect.height * pageHeight;
      if (annotation.type === "highlight") {
        page.drawRectangle({ x, y, width, height, color, opacity: 0.32, borderOpacity: 0 });
      }
      if (annotation.type === "underline") {
        page.drawLine({
          start: { x, y: y + Math.max(1, height * 0.08) },
          end: { x: x + width, y: y + Math.max(1, height * 0.08) },
          thickness: Math.max(1, height * 0.08),
          color,
          opacity: 0.9
        });
      }
      if (annotation.type === "comment") {
        page.drawRectangle({
          x,
          y,
          width,
          height,
          color,
          opacity: 0.18,
          borderColor: color,
          borderOpacity: 0.9,
          borderWidth: 1
        });
        page.drawRectangle({
          x: Math.min(pageWidth - 8, x + width + 2),
          y: Math.min(pageHeight - 8, y + height - 6),
          width: 6,
          height: 6,
          color,
          opacity: 0.95
        });
      }
    });
    await writeFile(annotation.pdfPath, await pdf.save());
    return {
      attempted: true,
      ok: true,
      message:
        annotation.type === "comment"
          ? "批注位置已写回 PDF；批注正文和跳转信息仍保存在 Informio 标注数据中。"
          : "标注已写回 PDF，并同步保存在 Informio 标注数据中。"
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: `源 PDF 写回失败，已保存在本地标注数据中：${error instanceof Error ? error.message : String(error)}`
    };
  }
};

const loadPdfAnnotations = async (input: LoadPdfAnnotationsInput) => {
  const pdfPath = normalizePdfAnnotationPath(input.pdfPath);
  const store = await readPdfAnnotationStore(pdfPath);
  return store.annotations.filter((annotation) => {
    if (normalizePdfAnnotationPath(annotation.pdfPath) !== pdfPath) return false;
    return !input.fingerprint || annotation.fingerprint === input.fingerprint;
  });
};

const savePdfAnnotation = async (input: SavePdfAnnotationInput): Promise<SavePdfAnnotationResult> => {
  const pdfPath = normalizePdfAnnotationPath(input.annotation.pdfPath);
  const now = new Date().toISOString();
  const sourceWrite = input.writeToSource
    ? await bestEffortWritePdfAnnotationToSource({ ...input.annotation, pdfPath })
    : { attempted: false, ok: true };
  const annotation: PdfAnnotation = {
    ...input.annotation,
    pdfPath,
    updatedAt: now,
    createdAt: input.annotation.createdAt || now,
    sourceWrite
  };
  const store = await readPdfAnnotationStore(pdfPath);
  const nextAnnotations = store.annotations.some((item) => item.id === annotation.id)
    ? store.annotations.map((item) => (item.id === annotation.id ? annotation : item))
    : [...store.annotations, annotation];
  await writePdfAnnotationStore(pdfPath, { version: 1, annotations: nextAnnotations });
  return { annotation, sourceWrite };
};

const deletePdfAnnotation = async (input: DeletePdfAnnotationInput): Promise<DeletePdfAnnotationResult> => {
  const pdfPath = normalizePdfAnnotationPath(input.pdfPath);
  const store = await readPdfAnnotationStore(pdfPath);
  const annotation = store.annotations.find((item) => item.id === input.annotationId);
  const nextAnnotations = store.annotations.filter((item) => {
    if (item.id !== input.annotationId) return true;
    if (input.fingerprint && item.fingerprint !== input.fingerprint) return true;
    return false;
  });
  await writePdfAnnotationStore(pdfPath, { version: 1, annotations: nextAnnotations });
  const sourceWrite =
    annotation?.sourceWrite?.attempted && annotation.sourceWrite.ok
      ? {
          attempted: true,
          ok: false,
          message: "已删除 Informio 标注数据；此前写回源 PDF 的视觉痕迹无法无损自动擦除。"
        }
      : { attempted: false, ok: true };
  return { annotationId: input.annotationId, sourceWrite };
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
    if (!isWritableTextDocument(known)) return known;
    return {
      ...known,
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
        markdown: doc.markdown,
        collection: doc.collection === "knowledge" ? "knowledge" : "writing",
        updatedAt: sanitizeUpdatedAt(doc.updatedAt),
        pinned: doc.pinned
      });
    }
  });

  return merged;
};

const normalizeActiveDocumentId = (documents: InformioDocument[], activeDocumentId: string) => {
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

const markdownTitle = (title: string) => title.replace(/\.(md|markdown|txt)$/i, "");

const normalizeLinkTitle = (value: string) =>
  decodeURIComponent(value)
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.(md|markdown|txt)$/i, "")
    .trim()
    .toLowerCase() ?? "";

const replaceWikiLinkTargets = (markdown: string, oldTitle: string, newTitle: string) =>
  markdown.replace(/\[\[([^\]\n]+)\]\]/g, (match, body: string) => {
    const [rawTarget, ...aliasParts] = body.split("|");
    const target = rawTarget.trim();
    const alias = aliasParts.join("|").trim();
    return normalizeLinkTitle(target) === normalizeLinkTitle(oldTitle) ? `[[${newTitle}${alias ? `|${alias}` : ""}]]` : match;
  });

const replaceLocalFileUrls = (markdown: string, resolveNextPath: (path: string) => string | null) =>
  markdown.replace(/local-file:\/\/[^\s)"'>]+/g, (value) => {
    for (const candidate of localFilePathCandidates(value)) {
      const nextPath = resolveNextPath(candidate);
      if (!nextPath || normalizeForCompare(nextPath) === normalizeForCompare(candidate)) continue;
      return localFileUrl(nextPath);
    }
    return value;
  });

const saveMarkdownFile = async (path: string, markdown: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown, "utf8");
};

const uniquePath = async (folder: string, baseName: string, extension = ".md") => {
  const cleanName = baseName.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";
  for (let index = 0; index < 999; index += 1) {
    const name = index === 0 ? `${cleanName}${extension}` : `${cleanName} ${index + 1}${extension}`;
    const path = join(folder, name);
    try {
      await stat(path);
    } catch {
      return path;
    }
  }
  return join(folder, `${cleanName}-${Date.now()}${extension}`);
};

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
        if (entry.isFile() && OPENABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) return { filePaths: [path], folderPaths: [] };
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

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const markdownToBasicHtml = (markdown: string) => {
  const blocks = markdown.split(/\n{2,}/);
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Informio Export</title></head>
<body>
${blocks
  .map((block) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(block.trim());
    if (heading) return `<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`;
    return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
  })
  .join("\n")}
</body>
</html>`;
};

const localFileUrl = (path: string) => `local-file://${encodeURI(path.replace(/\\/g, "/"))}`;

const localFilePathCandidates = (url: string) => {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.host ? `/${parsed.host}${parsed.pathname}` : parsed.pathname);
    const normalizedHomePath = pathname.startsWith("/users/") ? `/Users/${pathname.slice("/users/".length)}` : pathname;
    return Array.from(new Set([normalizedHomePath, pathname]));
  } catch {
    const pathname = decodeURIComponent(url.slice("local-file://".length));
    return [pathname.startsWith("/") ? pathname : `/${pathname}`];
  }
};

const pdfMarkdown = (path: string) =>
  `<iframe data-type="pdf" src="${localFileUrl(path)}" title="${escapeHtml(basename(path))}"></iframe>`;

const generatedMarkdownForAssetPath = (path: string) => {
  const ext = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return `![${basename(path)}](${localFileUrl(path)})`;
  if (VIDEO_EXTENSIONS.has(ext)) return `<video controls src="${localFileUrl(path)}" title="${escapeHtml(basename(path))}"></video>`;
  if (AUDIO_EXTENSIONS.has(ext)) return `<audio controls src="${localFileUrl(path)}" title="${escapeHtml(basename(path))}"></audio>`;
  if (PDF_EXTENSIONS.has(ext)) return pdfMarkdown(path);
  return null;
};

const withUpdatedLocalFileUrls = (document: InformioDocument, resolveNextPath: (path: string) => string | null) => {
  const markdown = replaceLocalFileUrls(document.markdown, resolveNextPath);
  return markdown === document.markdown
    ? document
    : { ...document, markdown, updatedAt: new Date().toISOString() };
};

const readDocumentsFromPaths = async (paths: string[]) => {
  const existingByPath = new Map(
    appData.documents
      .filter((document) => document.filePath)
      .map((document) => [document.filePath!, document] as const)
  );

  return (
    await Promise.all(
      paths.map(async (path) => {
        try {
          const existing = existingByPath.get(path);
          const ext = extname(path).toLowerCase();
          const isImage = IMAGE_EXTENSIONS.has(ext);
          const isVideo = VIDEO_EXTENSIONS.has(ext);
          const isAudio = AUDIO_EXTENSIONS.has(ext);
          const isPdf = PDF_EXTENSIONS.has(ext);
          let markdown: string;
          if (isImage) {
            markdown = `![${basename(path)}](${localFileUrl(path)})`;
          } else if (isVideo) {
            markdown = `<video controls src="${localFileUrl(path)}" title="${escapeHtml(basename(path))}"></video>`;
          } else if (isAudio) {
            markdown = `<audio controls src="${localFileUrl(path)}" title="${escapeHtml(basename(path))}"></audio>`;
          } else if (isPdf) {
            markdown = pdfMarkdown(path);
          } else {
            markdown = await readFile(path, "utf8");
          }
          return {
            id: existing?.id ?? `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: basename(path),
            filePath: path,
            collection: "writing" as const,
            updatedAt: new Date().toISOString(),
            markdown
          };
        } catch {
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
    } catch {
      allFolderPaths.push(projectPath);
      continue;
    }

    const { filePaths, folderPaths } = await scanWorkspaceEntries(projectPath, { ensure: false });
    allFilePaths.push(...filePaths);
    allFolderPaths.push(projectPath, ...folderPaths);
  }

  const filePathSet = new Set(allFilePaths);
  const existingByPath = new Map(appData.documents.filter((document) => document.filePath).map((document) => [document.filePath!, document]));
  const newPaths = allFilePaths.filter((path) => !existingByPath.has(path));
  const newDocuments = await readDocumentsFromPaths(newPaths);
  const isInsideTrackedProject = (path: string) => projectPaths.some((projectPath) => pathContains(projectPath, path));
  const nextDocuments = [
    ...newDocuments,
    ...appData.documents
      .filter((document) => !document.filePath || !isInsideTrackedProject(document.filePath) || filePathSet.has(document.filePath))
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
      { name: "Informio files", extensions: ["md", "markdown", "txt", "pdf"] },
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
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return appData;
  appData = await saveAppData({
    ...appData,
    projects: (appData.projects ?? []).map((project) =>
      project.path === projectPath ? { ...project, title: trimmedTitle } : project
    )
  });
  emitAppData();
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
  const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
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

const sanitizeFilesystemName = (value: string) => value.replace(/[\\/:*?"<>|]/g, "-").trim();

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

  const attachmentFolder = join(documentFolder, "attachment");
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

  return { path, fileName: basename(path) };
};

const copyAttachmentFromPath = async (sourcePath: string): Promise<SaveAttachmentResult> => {
  const doc = activeDocument();
  const documentFolder = doc?.filePath ? dirname(doc.filePath) : (appData.workspacePath || appData.settings.shortcuts.quickFolder);
  if (!documentFolder) throw new Error("No folder is available for this document.");

  const attachmentFolder = join(documentFolder, "attachment");
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

  return { path, fileName: basename(path) };
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
    } catch {
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

const saveActiveDocumentAs = async () => {
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

const exportActiveDocument = async (format: "markdown" | "html") => {
  const window = getFocusedMainWindow();
  const doc = activeDocument();
  if (!window || !doc || !isWritableTextDocument(doc)) return;
  const extension = format === "html" ? "html" : "md";
  const result = await dialog.showSaveDialog(window, {
    defaultPath: `${doc.title.replace(/\.[^.]+$/, "")}.${extension}`,
    filters: [{ name: format === "html" ? "HTML" : "Markdown", extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return;
  await saveMarkdownFile(result.filePath, format === "html" ? markdownToBasicHtml(doc.markdown) : doc.markdown);
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
  const attachment = await copyAttachmentFromPath(result.filePaths[0]);

  if (kind === "video" || kind === "audio") {
    const docMarkdown = kind === "video"
      ? `<video controls src="${localFileUrl(attachment.path)}" title="${escapeHtml(attachment.fileName)}"></video>`
      : `<audio controls src="${localFileUrl(attachment.path)}" title="${escapeHtml(attachment.fileName)}"></audio>`;
    const document: InformioDocument = {
      id: `media-${Date.now()}`,
      title: attachment.fileName,
      filePath: attachment.path,
      collection: "writing",
      updatedAt: new Date().toISOString(),
      markdown: docMarkdown
    };
    appData = await saveAppData({ ...appData, documents: [document, ...appData.documents] });
    updateApplicationMenu();
  }

  sendMenuCommand("insert:asset", { kind, path: attachment.path, name: attachment.fileName });
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
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: `关于 ${app.name}` },
        { type: "separator" },
        { label: "设置...", accelerator: "CommandOrControl+,", click: openSettingsWindow },
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
        { label: "新建", accelerator: "CommandOrControl+N", click: () => createFilesystemDocument() },
        { label: "命令面板", accelerator: "CommandOrControl+P", click: () => sendMenuCommand("command:open-palette") },
        { label: "新建窗口", accelerator: "Shift+CommandOrControl+N", click: () => createWindow() },
        { type: "separator" },
        { label: "快速打开", accelerator: "CommandOrControl+O", click: openFileDialog },
        { label: "打开文件...", click: openFileDialog },
        { label: "打开工作区...", accelerator: "Shift+CommandOrControl+O", click: openWorkspaceDialog },
        {
          label: "打开最近文件",
          submenu: recentFiles.length
            ? recentFiles.map((doc) => ({ label: doc.title, click: () => openMarkdownFiles([doc.filePath!]) }))
            : [{ label: "无最近文件", enabled: false }]
        },
        {
          label: "打开最近工作区",
          submenu: appData?.settings.shortcuts.quickFolder
            ? [{ label: appData.settings.shortcuts.quickFolder, click: () => loadWorkspace(appData.settings.shortcuts.quickFolder) }]
            : [{ label: "无最近工作区", enabled: false }]
        },
        { type: "separator" },
        { role: "close", label: "关闭", accelerator: "CommandOrControl+W" },
        { label: "关闭工作区", click: () => sendMenuCommand("file:close-workspace") },
        { type: "separator" },
        { label: "保存", accelerator: "CommandOrControl+S", click: () => sendMenuCommand("file:save") },
        { label: "另存为...", accelerator: "Shift+CommandOrControl+S", click: saveActiveDocumentAs },
        { label: "移动到...", click: moveActiveDocumentTo },
        {
          label: "导出",
          submenu: [
            { label: "Markdown...", click: () => exportActiveDocument("markdown") },
            { label: "HTML...", click: () => exportActiveDocument("html") }
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
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" },
        { type: "separator" },
        {
          label: "查找",
          submenu: [
            { label: "查找选中文本", accelerator: "CommandOrControl+F", click: () => sendMenuCommand("edit:find-selection") },
            { label: "查找下一个", accelerator: "CommandOrControl+G", click: () => sendMenuCommand("edit:find-next") }
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
        { label: "加粗", accelerator: "CommandOrControl+B", click: () => sendMenuCommand("format:bold") },
        { label: "倾斜", accelerator: "CommandOrControl+I", click: () => sendMenuCommand("format:italic") },
        { label: "下划线", accelerator: "CommandOrControl+U", click: () => sendMenuCommand("format:underline") },
        { label: "删除线", accelerator: "Shift+CommandOrControl+X", click: () => sendMenuCommand("format:strike") },
        { label: "链接", click: () => sendMenuCommand("insert:link") },
        { label: "行内代码", accelerator: "Shift+CommandOrControl+`", click: () => sendMenuCommand("format:inline-code") },
        { label: "高亮", accelerator: "Shift+CommandOrControl+M", click: () => sendMenuCommand("format:highlight") },
        { type: "separator" },
        { label: "下标", click: () => sendMenuCommand("format:subscript") },
        { label: "上标", click: () => sendMenuCommand("format:superscript") },
        { type: "separator" },
        {
          label: "列表",
          submenu: [
            { label: "项目符号列表", click: () => sendMenuCommand("format:bullet-list") },
            { label: "编号列表", click: () => sendMenuCommand("format:ordered-list") },
            { label: "任务列表", click: () => sendMenuCommand("format:task-list") }
          ]
        },
        { label: "引用", click: () => sendMenuCommand("format:blockquote") },
        {
          label: "转换",
          submenu: [
            { label: "转为大写", click: () => sendMenuCommand("convert:uppercase") },
            { label: "转为小写", click: () => sendMenuCommand("convert:lowercase") },
            { label: "清理 Markdown 标记", click: () => sendMenuCommand("convert:plain-text") }
          ]
        }
      ]
    },
    {
      label: "插入",
      submenu: [
        { label: "图片...", accelerator: "Shift+CommandOrControl+I", click: () => insertAsset("image") },
        { label: "视频...", click: () => insertAsset("video") },
        { label: "音频...", click: () => insertAsset("audio") },
        { label: "PDF...", click: () => insertAsset("pdf") },
        { type: "separator" },
        { label: "表格", click: () => sendMenuCommand("insert:table") },
        { label: "代码块", click: () => sendMenuCommand("format:code-block") },
        { label: "数学公式块", click: () => sendMenuCommand("insert:math") },
        { label: "图表", click: () => sendMenuCommand("insert:chart") },
        { label: "水平分隔线", click: () => sendMenuCommand("insert:horizontal-rule") },
        { type: "separator" },
        { label: "脚注", click: () => sendMenuCommand("insert:footnote") },
        { label: "折叠块", click: () => sendMenuCommand("insert:details") },
        { label: "信息框", click: () => sendMenuCommand("insert:callout") }
      ]
    },
    {
      label: "视图",
      submenu: [
        { label: "切换左栏", click: () => sendMenuCommand("view:toggle-left-panel") },
        { label: "切换 Assistant", click: () => sendMenuCommand("view:toggle-right-panel") },
        { type: "separator" },
        { label: "设置", click: openSettingsWindow }
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

app.whenReady().then(async () => {
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
        await stat(pathname);
        return net.fetch(pathToFileURL(pathname).toString());
      } catch {
        // Try the next normalized form before returning 404.
      }
    }
    return new Response(null, { status: 404 });
  });

  appData = await loadAppData();
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
  await initializeUpdater(appData.settings.updates.autoCheckOnLaunch);
  updateApplicationMenu();
  createWindow();
  globalShortcut.register(appData.settings.shortcuts.quickCapture, triggerQuickCapture);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
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

ipcMain.handle("app:open-files", async () => openFileDialog());

ipcMain.handle("app:open-workspace", async () => openWorkspaceDialog());

ipcMain.handle("app:add-project", async () => addProjectDialog());

ipcMain.handle("app:remove-project", async (_event, path: string) => removeProject(path));

ipcMain.handle("app:rename-project", async (_event, path: string, title: string) => renameProject(path, title));

ipcMain.handle("app:toggle-project-pinned", async (_event, path: string) => toggleProjectPinned(path));

ipcMain.handle("app:create-document", async (_event, folderPath?: string) => createFilesystemDocument(folderPath));

ipcMain.handle("app:create-default-markdown-document", async () => createDefaultMarkdownDocument());

ipcMain.handle("app:create-linked-document", async (_event, title: string) => createLinkedDocument(title));

ipcMain.handle("app:create-folder", async (_event, folderPath?: string) => createFilesystemFolder(folderPath));

ipcMain.handle("app:insert-asset", async (_event, kind: "image" | "video" | "audio" | "pdf") => insertAsset(kind));

ipcMain.handle("app:filesystem-action", async (_event, input: FileSystemOperationInput) => runFileSystemAction(input));

ipcMain.handle("app:save-attachment", async (_event, input: SaveAttachmentInput) => saveAttachment(input));

ipcMain.handle("pdf:load-annotations", async (_event, input: LoadPdfAnnotationsInput) => loadPdfAnnotations(input));

ipcMain.handle("pdf:save-annotation", async (_event, input: SavePdfAnnotationInput) => savePdfAnnotation(input));

ipcMain.handle("pdf:delete-annotation", async (_event, input: DeletePdfAnnotationInput) => deletePdfAnnotation(input));

ipcMain.handle("app:save-settings", async (_event, settings: AppSettings) => {
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
  globalShortcut.unregisterAll();
  globalShortcut.register(appData.settings.shortcuts.quickCapture, triggerQuickCapture);
  updateApplicationMenu();
  emitAppData();
  return appData.settings;
});

ipcMain.handle("app:get-info", async () => getAppInfo());

ipcMain.handle("app:get-updater-state", async () => getUpdaterState());

ipcMain.handle("app:check-for-updates", async () => checkForUpdates());

ipcMain.handle("app:restart-to-install-update", async () => {
  await restartToInstallUpdate();
});

ipcMain.handle("app:save-documents", async (_event, documents: InformioDocument[], activeDocumentId: string) => {
  const mergedDocuments = mergeRendererDocuments(documents);
  appData = await saveAppData({
    ...appData,
    documents: mergedDocuments,
    activeDocumentId: normalizeActiveDocumentId(mergedDocuments, activeDocumentId)
  });
  return appData;
});

ipcMain.handle("app:save-now", async (_event, documents: InformioDocument[], activeDocumentId: string): Promise<SaveResult> => {
  const mergedDocuments = mergeRendererDocuments(documents);
  appData = await saveAppDataAndFiles({
    ...appData,
    documents: mergedDocuments,
    activeDocumentId: normalizeActiveDocumentId(mergedDocuments, activeDocumentId)
  });
  return { data: appData, savedAt: new Date().toISOString() };
});

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
  const provider = appData.settings.agents.find((agent) => agent.id === input.providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  return agentRuntime.send(input, provider);
});

ipcMain.handle("agent-runtime:send-stream", async (event, requestId: string, input: SendAgentMessageInput) => {
  const provider = appData.settings.agents.find((agent) => agent.id === input.providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  return agentRuntime.sendStream(input, provider, (chunk) => {
    event.sender.send("agent-runtime:stream", requestId, chunk);
  });
});

ipcMain.handle("agent:session-stream", async (event, requestId: string, input: AgentSessionInput) => {
  const provider = appData.settings.agents.find((agent) => agent.id === input.providerId);
  if (!provider) throw new Error("Agent provider was not found.");
  return agentRuntime.runSessionStream(input, provider, (chunk) => {
    event.sender.send("agent:session-event", requestId, chunk);
  });
});

ipcMain.handle("agent:approval-response", async (_event, input: AgentApprovalResponseInput) => {
  const handled = agentRuntime.respondApproval(input, appData.settings.agents);
  if (!handled) throw new Error("Approval request is no longer active.");
  return { ok: true };
});

ipcMain.handle("agent:cancel-run", async (_event, providerId: string) => {
  const cancelled = agentRuntime.cancelRun(providerId, appData.settings.agents);
  return { ok: cancelled };
});

ipcMain.handle("app:open-external", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("app:open-path", async (_event, path: string) => {
  const error = await shell.openPath(path);
  if (error) throw new Error(error);
});
