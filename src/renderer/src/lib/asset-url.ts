import { normalizePath, pathExtName, pathDirName, isAbsoluteAssetPath, hasRenderableScheme, safeDecodeUri, localFileUrlForPath, joinAssetPath } from "./path";

export const assetPathPartFromSrc = (src: string) => {
  const trimmed = src.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol === "local-file:" || url.protocol === "file:") {
      const host = decodeURIComponent(url.host);
      const pathname = decodeURIComponent(url.pathname);
      if (/^[A-Za-z]:?$/.test(host)) return `${host.replace(/:$/, "")}:${pathname}`;
      return url.host ? `/${host}${pathname}` : pathname;
    }
    if (url.protocol === "http:" || url.protocol === "https:") return decodeURIComponent(url.pathname);
  } catch {
    // Fall back to path-style parsing below.
  }
  return safeDecodeUri(trimmed.split(/[?#]/, 1)[0] ?? "");
};

export const assetExtensionFromSrc = (src: string) =>
  pathExtName(assetPathPartFromSrc(src)).slice(1).toLowerCase();

export const resolveMarkdownAssetSrc = (src: string, basePath?: string) => {
  const trimmed = src.trim();
  if (!trimmed || hasRenderableScheme(trimmed)) return trimmed;
  if (/^file:\/\//i.test(trimmed)) return trimmed.replace(/^file:\/\//i, "local-file://");
  const [pathPart, suffix = ""] = trimmed.split(/([?#].*)/, 2);
  const decodedPath = safeDecodeUri(pathPart);
  const baseFolder = basePath ? (pathExtName(basePath) ? pathDirName(basePath) : normalizePath(basePath)) : "";
  const absolutePath = isAbsoluteAssetPath(decodedPath)
    ? decodedPath
    : baseFolder
      ? joinAssetPath(baseFolder, decodedPath)
      : "";
  return absolutePath ? `${localFileUrlForPath(absolutePath)}${suffix}` : trimmed;
};

export const resolveMarkdownAssetPath = (src: string, basePath?: string) => {
  const trimmed = src.trim();
  if (!trimmed || /^(?:https?:|data:|blob:)/i.test(trimmed)) return "";
  if (/^(?:local-file:|file:)/i.test(trimmed)) return assetPathPartFromSrc(trimmed);
  const [pathPart] = trimmed.split(/[?#]/, 1);
  const decodedPath = safeDecodeUri(pathPart ?? "");
  const baseFolder = basePath ? (pathExtName(basePath) ? pathDirName(basePath) : normalizePath(basePath)) : "";
  if (isAbsoluteAssetPath(decodedPath)) return decodedPath;
  return baseFolder ? joinAssetPath(baseFolder, decodedPath) : "";
};

export const loadLocalAssetObjectUrl = async (path: string) => {
  const asset = await window.informio.loadAsset(path);
  return URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType }));
};
