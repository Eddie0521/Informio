export const shortcutDisplayPlatform = navigator.platform.toLowerCase().includes("mac") ? "mac" : "windows";
export const isWindowsPlatform = shortcutDisplayPlatform === "windows";

export const normalizePath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
export const normalizePathForCompare = (path: string) => {
  const normalized = normalizePath(path);
  return isWindowsPlatform ? normalized.toLowerCase() : normalized;
};

export const pathBaseName = (path: string) => normalizePath(path).split("/").filter(Boolean).at(-1) ?? path;

export const pathDirName = (path: string) => normalizePath(path).split("/").slice(0, -1).join("/") || path;

export const pathExtName = (path: string) => {
  const base = pathBaseName(path);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
};

export const isAbsoluteAssetPath = (path: string) => path.startsWith("/") || /^[A-Za-z]:\//.test(path);

export const hasRenderableScheme = (src: string) => /^(?:https?:|data:|blob:|local-file:)/i.test(src);

export const safeDecodeUri = (value: string) => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};

export const encodeLocalFilePath = (path: string) => normalizePath(path).split("/").map((part) => encodeURIComponent(part)).join("/");

export const localFileUrlForPath = (path: string) => {
  const encoded = encodeLocalFilePath(path);
  return `local-file://${encoded.startsWith("/") ? encoded : `/${encoded}`}`;
};

export const joinAssetPath = (folder: string, assetPath: string) => {
  const normalizedFolder = normalizePath(folder);
  const normalizedAsset = normalizePath(assetPath).replace(/^\.?\//, "");
  return `${normalizedFolder}/${normalizedAsset}`;
};

export const pathContains = (folder: string, path: string) => {
  const normalizedFolder = normalizePathForCompare(folder);
  const normalizedPath = normalizePathForCompare(path);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
};

export const relativePath = (folder: string, path: string) => {
  const normalizedFolder = normalizePath(folder);
  const normalizedPath = normalizePath(path);
  return pathContains(folder, path) ? normalizedPath.slice(normalizedFolder.length).replace(/^\/+/, "") || pathBaseName(path) : pathBaseName(path);
};
