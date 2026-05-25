import { statSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

type FileSnapshotKind = "missing" | "file" | "directory" | "other";

type FileSnapshot = {
  kind: FileSnapshotKind;
  size: number | null;
  mtimeMs: number | null;
};

export type FileChangeAudit = {
  cwd: string;
  roots: string[];
  paths: string[];
  before: Map<string, FileSnapshot>;
};

export type FileChangeVerification = {
  ok: boolean;
  changedPaths: string[];
  unchangedPaths: string[];
  message: string;
};

const displayPath = (targetPath: string, cwd: string, roots: string[]) => {
  const bases = [cwd, ...roots].map((entry) => normalizeFsPath(entry));
  const candidates = bases
    .filter((base) => targetPath === base || targetPath.startsWith(`${base}/`))
    .map((base) => {
      const value = relative(base, targetPath).replace(/\\/g, "/");
      return value || ".";
    })
    .filter(Boolean)
    .sort((left, right) => left.length - right.length);
  return candidates[0] ?? targetPath;
};

const formatPathList = (paths: string[], cwd: string, roots: string[]) => paths.map((path) => `- ${displayPath(path, cwd, roots)}`).join("\n");

const snapshotFile = (targetPath: string): FileSnapshot => {
  try {
    const stats = statSync(targetPath, { throwIfNoEntry: false });
    if (!stats) return { kind: "missing", size: null, mtimeMs: null };
    if (stats.isFile()) {
      return {
        kind: "file",
        size: stats.size,
        mtimeMs: stats.mtimeMs
      };
    }
    if (stats.isDirectory()) {
      return {
        kind: "directory",
        size: null,
        mtimeMs: stats.mtimeMs
      };
    }
    return {
      kind: "other",
      size: null,
      mtimeMs: stats.mtimeMs
    };
  } catch {
    return { kind: "missing", size: null, mtimeMs: null };
  }
};

const fileSnapshotChanged = (before: FileSnapshot, after: FileSnapshot) =>
  before.kind !== after.kind || before.size !== after.size || before.mtimeMs !== after.mtimeMs;

const resolveTrackedPath = (rawPath: string, cwd: string, roots: string[]) => {
  const trimmed = rawPath.trim();
  if (!trimmed) return [];
  if (isAbsolute(trimmed)) return [normalizeFsPath(trimmed)];

  const bases = Array.from(new Set([cwd, ...roots].filter(Boolean).map((entry) => normalizeFsPath(entry))));
  const candidates = bases.map((base) => normalizeFsPath(resolve(base, trimmed)));
  const existing = candidates.filter((candidate) => snapshotFile(candidate).kind !== "missing");
  if (existing.length) return Array.from(new Set(existing));
  return candidates[0] ? [candidates[0]] : [];
};

export const normalizeFsPath = (value: string) => normalize(resolve(value)).replace(/\\/g, "/");

export const collectFileChangePaths = (value: unknown, pathKeysOnly = true, parentKey = ""): string[] => {
  if (!value) return [];
  if (typeof value === "string") {
    if (!pathKeysOnly || /(^|_)(path|file|cwd|dir|directory)$/i.test(parentKey)) return [value];
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFileChangePaths(item, pathKeysOnly, parentKey));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => collectFileChangePaths(item, pathKeysOnly, key));
  }
  return [];
};

export const createFileChangeAudit = (rawPaths: string[], options: { cwd: string; roots?: string[] }): FileChangeAudit => {
  const cwd = normalizeFsPath(options.cwd);
  const roots = Array.from(new Set((options.roots ?? []).filter(Boolean).map((entry) => normalizeFsPath(entry))));
  const paths = Array.from(new Set(rawPaths.flatMap((path) => resolveTrackedPath(path, cwd, roots))));
  return {
    cwd,
    roots,
    paths,
    before: new Map(paths.map((path) => [path, snapshotFile(path)]))
  };
};

export const verifyFileChangeAudit = (audit: FileChangeAudit): FileChangeVerification => {
  if (!audit.paths.length) {
    return {
      ok: false,
      changedPaths: [],
      unchangedPaths: [],
      message: "Agent 报告编辑文件，但没有提供可校验路径，无法确认改动是否真正写入磁盘。"
    };
  }

  const changedPaths: string[] = [];
  const unchangedPaths: string[] = [];

  audit.paths.forEach((path) => {
    const before = audit.before.get(path) ?? snapshotFile(path);
    const after = snapshotFile(path);
    if (fileSnapshotChanged(before, after)) changedPaths.push(path);
    else unchangedPaths.push(path);
  });

  if (!changedPaths.length) {
    return {
      ok: false,
      changedPaths,
      unchangedPaths,
      message: [
        "未在磁盘确认到任何实际变化。",
        formatPathList(unchangedPaths, audit.cwd, audit.roots),
        "请检查 Agent 是否改到了其他路径，或 patch 实际没有成功应用。"
      ].filter(Boolean).join("\n")
    };
  }

  if (!unchangedPaths.length) {
    return {
      ok: true,
      changedPaths,
      unchangedPaths,
      message: ["已确认写入磁盘：", formatPathList(changedPaths, audit.cwd, audit.roots)].join("\n")
    };
  }

  return {
    ok: true,
    changedPaths,
    unchangedPaths,
    message: [
      "已确认部分改动写入磁盘：",
      formatPathList(changedPaths, audit.cwd, audit.roots),
      "",
      "以下路径未检测到变化：",
      formatPathList(unchangedPaths, audit.cwd, audit.roots)
    ].join("\n")
  };
};

export const mergeToolOutput = (summary: Array<string | undefined>) => summary.filter((item) => item && item.trim()).join("\n\n");
