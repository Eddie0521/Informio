type SpreadsheetSaveHandler = () => Promise<void>;

const saveHandlers = new Map<string, SpreadsheetSaveHandler>();

export const registerSpreadsheetSaveHandler = (documentId: string, handler: SpreadsheetSaveHandler) => {
  saveHandlers.set(documentId, handler);
  return () => {
    if (saveHandlers.get(documentId) === handler) {
      saveHandlers.delete(documentId);
    }
  };
};

export const saveSpreadsheetDocumentNow = async (documentId: string): Promise<boolean> => {
  const handler = saveHandlers.get(documentId);
  if (!handler) return false;
  await handler();
  return true;
};
