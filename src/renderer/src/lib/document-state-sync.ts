import type { InformioDocument } from "../types";

export const DOCUMENT_STATE_SYNC_DEBOUNCE_MS = 200;

export const mergeLiveMarkdownIntoDocuments = (
  documents: InformioDocument[],
  liveMarkdown: ReadonlyMap<string, string>
): InformioDocument[] => {
  if (!liveMarkdown.size) return documents;
  let changed = false;
  const next = documents.map((doc) => {
    const markdown = liveMarkdown.get(doc.id);
    if (markdown === undefined || markdown === doc.markdown) return doc;
    changed = true;
    return { ...doc, markdown, updatedAt: new Date().toISOString() };
  });
  return changed ? next : documents;
};

export const pruneSyncedLiveMarkdown = (
  liveMarkdown: Map<string, string>,
  documents: InformioDocument[]
) => {
  documents.forEach((doc) => {
    if (liveMarkdown.get(doc.id) === doc.markdown) {
      liveMarkdown.delete(doc.id);
    }
  });
};

export const shouldSkipDocumentStateSync = (composing: boolean | undefined) => Boolean(composing);
