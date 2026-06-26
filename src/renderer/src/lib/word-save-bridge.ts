import type { AppData, InformioDocument } from "../../../shared/types";

type WordSaveHandler = () => Promise<void>;
type WordExportHandler = () => Promise<{ buffer: ArrayBuffer }>;

const saveHandlers = new Map<string, WordSaveHandler>();
const exportHandlers = new Map<string, WordExportHandler>();

export const registerWordSaveHandler = (documentId: string, handler: WordSaveHandler) => {
  saveHandlers.set(documentId, handler);
  return () => {
    if (saveHandlers.get(documentId) === handler) {
      saveHandlers.delete(documentId);
    }
  };
};

export const registerWordExportHandler = (documentId: string, handler: WordExportHandler) => {
  exportHandlers.set(documentId, handler);
  return () => {
    if (exportHandlers.get(documentId) === handler) {
      exportHandlers.delete(documentId);
    }
  };
};

export const exportWordDocumentBuffer = async (documentId: string) => {
  const handler = exportHandlers.get(documentId);
  if (!handler) throw new Error("Word export handler is not registered");
  return handler();
};

export const saveWordDocumentNow = async (documentId: string): Promise<boolean> => {
  const handler = saveHandlers.get(documentId);
  if (!handler) return false;
  await handler();
  return true;
};

export const saveWordDocumentAs = async (
  documentId: string,
  documents: InformioDocument[],
  activeDocumentId: string
): Promise<AppData | undefined> => {
  const { buffer } = await exportWordDocumentBuffer(documentId);
  return window.informio.saveWordAs(documents, activeDocumentId, buffer);
};
