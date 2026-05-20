import type { AppData } from "./types.js";

const normalizeScopePath = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const dedupeSortedPaths = (paths: string[]) =>
  Array.from(
    new Map(
      paths
        .map((path) => path.trim())
        .filter(Boolean)
        .map((path) => [normalizeScopePath(path), path.replace(/\\/g, "/").replace(/\/+$/, "")])
    ).values()
  ).sort((left, right) => normalizeScopePath(left).localeCompare(normalizeScopePath(right)));

export const buildWorkspaceScopeId = (data: Pick<AppData, "projects" | "workspacePath">): string => {
  const projectPaths = dedupeSortedPaths((data.projects ?? []).map((project) => project.path));
  if (projectPaths.length) return `projects:${projectPaths.join("|")}`;
  if (data.workspacePath?.trim()) return `workspace:${normalizeScopePath(data.workspacePath)}`;
  return "global:empty";
};
