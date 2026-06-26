import type { InformioDocument, InformioDocumentKind, AgentMessageAttachment } from "../types";
import { imageExtensions, pdfExtensions, spreadsheetExtensions, videoExtensions, audioExtensions, wordExtensions } from "../constants";
import { assetExtensionFromSrc } from "./asset-url";

export const documentKindFromPath = (path?: string): InformioDocumentKind => {
  if (!path) return "markdown";
  const extension = assetExtensionFromSrc(path);
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "txt") return "text";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  if (pdfExtensions.has(extension)) return "pdf";
  if (spreadsheetExtensions.has(extension)) return "spreadsheet";
  if (wordExtensions.has(extension)) return "word";
  return "unknown";
};

export const isEditableWordFile = (path?: string) => Boolean(path && assetExtensionFromSrc(path) === "docx");
export const isLegacyWordFile = (path?: string) => Boolean(path && assetExtensionFromSrc(path) === "doc");

export const documentKind = (document?: InformioDocument | null): InformioDocumentKind =>
  document ? (document.kind ?? documentKindFromPath(document.filePath ?? document.title)) : "unknown";

export const isImageFile = (path?: string) => Boolean(path && imageExtensions.has(assetExtensionFromSrc(path)));
export const isPdfFile = (path?: string) => Boolean(path && pdfExtensions.has(assetExtensionFromSrc(path)));
export const isVideoFile = (path?: string) => Boolean(path && videoExtensions.has(assetExtensionFromSrc(path)));
export const isAudioFile = (path?: string) => Boolean(path && audioExtensions.has(assetExtensionFromSrc(path)));

export const mediaKindFromSrc = (src: string) => {
  const extension = assetExtensionFromSrc(src);
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  return "";
};

export const isEmbeddableAssetFile = (path?: string) =>
  isPdfFile(path) || isImageFile(path) || isVideoFile(path) || isAudioFile(path);

export const isEmbeddableAssetDocument = (document?: InformioDocument | null) => {
  const kind = documentKind(document);
  return kind === "pdf" || kind === "image" || kind === "video" || kind === "audio";
};

export const isWritableTextDocument = (document?: InformioDocument | null) => {
  if (!document) return false;
  const kind = documentKind(document);
  return kind === "markdown" || kind === "text";
};

export const isMarkdownDocument = (document?: InformioDocument | null) => {
  if (!document) return false;
  return documentKind(document) === "markdown";
};

export const imageExtensionFromMimeType = (mimeType: string) => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
};

export const fileKindFromName = (name: string): AgentMessageAttachment["kind"] =>
  /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? "image" : "file";

export const mimeTypeFromName = (name: string) => {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".xls") return "application/vnd.ms-excel";
  if (extension === ".csv") return "text/csv";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".doc") return "application/msword";
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".txt") return "text/plain";
  return undefined;
};
