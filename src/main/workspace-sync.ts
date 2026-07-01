import { join } from "node:path";

export const WORKSPACE_REFRESH_FALLBACK_THRESHOLD = 50;

export const normalizeWorkspacePath = (path: string, windows = process.platform === "win32") => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return windows ? normalized.toLowerCase() : normalized;
};

export const workspacePathContains = (folder: string, path: string, windows = process.platform === "win32") => {
  const normalizedFolder = normalizeWorkspacePath(folder, windows);
  const normalizedPath = normalizeWorkspacePath(path, windows);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
};

export type PendingWorkspaceChange =
  | { kind: "path"; absolutePath: string }
  | { kind: "fallback" };

export const collectPendingChange = (
  watchRoot: string,
  eventType: string,
  filename?: string | Buffer | null,
  windows = process.platform === "win32"
): PendingWorkspaceChange | null => {
  if (!filename) return { kind: "fallback" };
  const relativePath = typeof filename === "string" ? filename : filename.toString();
  if (!relativePath.trim()) return { kind: "fallback" };
  if (eventType === "rename" && relativePath.includes("\0")) return { kind: "fallback" };
  const absolutePath = normalizeWorkspacePath(join(watchRoot, relativePath), windows);
  return { kind: "path", absolutePath };
};

export const shouldFallbackToFullRefresh = (
  pending: ReadonlySet<string>,
  options: { threshold?: number; forceFullRefresh?: boolean } = {}
) => {
  if (options.forceFullRefresh) return true;
  const threshold = options.threshold ?? WORKSPACE_REFRESH_FALLBACK_THRESHOLD;
  return pending.size > threshold;
};

export const isPathUnderAnyProject = (path: string, projectPaths: string[], windows = process.platform === "win32") =>
  projectPaths.some((projectPath) => workspacePathContains(projectPath, path, windows));

export const documentMatchesRemovedPath = (
  filePath: string,
  removedPath: string,
  windows = process.platform === "win32"
) => {
  const normalizedFile = normalizeWorkspacePath(filePath, windows);
  const normalizedRemoved = normalizeWorkspacePath(removedPath, windows);
  return normalizedFile === normalizedRemoved || workspacePathContains(normalizedRemoved, normalizedFile, windows);
};

export const mergeRefreshedDocuments = <T extends { id: string; filePath?: string }>(
  currentDocuments: T[],
  refreshedDocuments: T[],
  removedPaths: string[],
  isInsideTrackedProject: (path: string) => boolean,
  windows = process.platform === "win32"
): T[] => {
  const removedSet = new Set(removedPaths.map((path) => normalizeWorkspacePath(path, windows)));
  const refreshedByPath = new Map(
    refreshedDocuments
      .filter((document) => document.filePath)
      .map((document) => [normalizeWorkspacePath(document.filePath!, windows), document] as const)
  );

  const kept = currentDocuments.filter((document) => {
    if (!document.filePath) return true;
    if (!isInsideTrackedProject(document.filePath)) return true;
    const normalizedPath = normalizeWorkspacePath(document.filePath, windows);
    if (refreshedByPath.has(normalizedPath)) return false;
    return !removedPaths.some((removedPath) => documentMatchesRemovedPath(document.filePath!, removedPath, windows));
  });

  const merged = [...kept, ...refreshedDocuments];
  const seenPaths = new Set<string>();
  return merged.filter((document) => {
    if (!document.filePath) return true;
    const key = normalizeWorkspacePath(document.filePath, windows);
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  });
};

export const filterFolderPathsAfterRemoval = (
  folderPaths: string[],
  removedPaths: string[],
  windows = process.platform === "win32"
) =>
  folderPaths.filter(
    (folderPath) =>
      !removedPaths.some(
        (removedPath) =>
          workspacePathContains(removedPath, folderPath, windows)
          || normalizeWorkspacePath(folderPath, windows) === normalizeWorkspacePath(removedPath, windows)
      )
  );

export const collectUniquePaths = (paths: string[], windows = process.platform === "win32") => {
  const seen = new Set<string>();
  const result: string[] = [];
  paths.forEach((path) => {
    const key = normalizeWorkspacePath(path, windows);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(path);
  });
  return result;
};
