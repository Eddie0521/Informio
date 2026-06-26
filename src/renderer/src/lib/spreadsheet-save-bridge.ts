import type { AppData, InformioDocument } from "../../../shared/types";

type SpreadsheetSaveHandler = () => Promise<void>;
type SpreadsheetExportHandler = () => Promise<{ blob: Blob }>;

const saveHandlers = new Map<string, SpreadsheetSaveHandler>();
const exportHandlers = new Map<string, SpreadsheetExportHandler>();

export const registerSpreadsheetSaveHandler = (documentId: string, handler: SpreadsheetSaveHandler) => {
  saveHandlers.set(documentId, handler);
  return () => {
    if (saveHandlers.get(documentId) === handler) {
      saveHandlers.delete(documentId);
    }
  };
};

export const registerSpreadsheetExportHandler = (documentId: string, handler: SpreadsheetExportHandler) => {
  exportHandlers.set(documentId, handler);
  return () => {
    if (exportHandlers.get(documentId) === handler) {
      exportHandlers.delete(documentId);
    }
  };
};

export const exportSpreadsheetDocumentBlob = async (documentId: string) => {
  const handler = exportHandlers.get(documentId);
  if (!handler) throw new Error("Spreadsheet export handler is not registered");
  return handler();
};

export const saveSpreadsheetDocumentNow = async (documentId: string): Promise<boolean> => {
  const handler = saveHandlers.get(documentId);
  if (!handler) return false;
  await handler();
  return true;
};

export const saveSpreadsheetDocumentAs = async (
  documentId: string,
  documents: InformioDocument[],
  activeDocumentId: string
): Promise<AppData | undefined> => {
  const { blob } = await exportSpreadsheetDocumentBlob(documentId);
  const buffer = await blob.arrayBuffer();
  return window.informio.saveSpreadsheetAs(documents, activeDocumentId, buffer);
};
