import { create } from "zustand";
import type { SetStateAction } from "react";
import type {
  DocumentConflict,
  EditorDropZone,
  EditorPaneState,
  EditorViewMode,
  OutlineJumpRequest,
  SplitDirection,
} from "../types";

type DocumentStore = {
  openDocumentIds: string[];
  editorPanes: EditorPaneState[];
  activePaneId: EditorPaneState["id"];
  editorViewModes: Record<EditorPaneState["id"], EditorViewMode>;
  splitDirection: SplitDirection;
  paneRatio: number;
  dropZone: EditorDropZone | null;
  documentRefreshTokens: Record<string, number>;
  dirtyDocumentIds: Set<string>;
  documentConflicts: Map<string, DocumentConflict>;
  activeConflictDocumentId: string | null;
  outlineJumpRequest: OutlineJumpRequest | null;
  fileListCreationSignal: number;

  setOpenDocumentIds: (value: SetStateAction<string[]>) => void;
  setEditorPanes: (value: SetStateAction<EditorPaneState[]>) => void;
  setActivePaneId: (value: SetStateAction<EditorPaneState["id"]>) => void;
  setEditorViewModes: (value: SetStateAction<Record<EditorPaneState["id"], EditorViewMode>>) => void;
  setSplitDirection: (dir: SplitDirection) => void;
  setPaneRatio: (ratio: number) => void;
  setDropZone: (zone: EditorDropZone | null) => void;
  setDocumentRefreshTokens: (value: SetStateAction<Record<string, number>>) => void;
  setDirtyDocumentIds: (value: SetStateAction<Set<string>>) => void;
  setDocumentConflicts: (value: SetStateAction<Map<string, DocumentConflict>>) => void;
  setActiveConflictDocumentId: (value: SetStateAction<string | null>) => void;
  setOutlineJumpRequest: (value: SetStateAction<OutlineJumpRequest | null>) => void;
  setFileListCreationSignal: (value: SetStateAction<number>) => void;
  incrementFileListCreationSignal: () => void;
};

const resolve = <T>(prev: T, value: SetStateAction<T>): T =>
  typeof value === "function" ? (value as (prev: T) => T)(prev) : value;

export const useDocumentStore = create<DocumentStore>((set) => ({
  openDocumentIds: [],
  editorPanes: [],
  activePaneId: "main",
  editorViewModes: { main: "rich-text", secondary: "rich-text" },
  splitDirection: "horizontal",
  paneRatio: 0.5,
  dropZone: null,
  documentRefreshTokens: {},
  dirtyDocumentIds: new Set(),
  documentConflicts: new Map(),
  activeConflictDocumentId: null,
  outlineJumpRequest: null,
  fileListCreationSignal: 0,

  setOpenDocumentIds: (value) => set((s) => ({ openDocumentIds: resolve(s.openDocumentIds, value) })),
  setEditorPanes: (value) => set((s) => ({ editorPanes: resolve(s.editorPanes, value) })),
  setActivePaneId: (value) => set((s) => ({ activePaneId: resolve(s.activePaneId, value) })),
  setEditorViewModes: (value) => set((s) => ({ editorViewModes: resolve(s.editorViewModes, value) })),
  setSplitDirection: (dir) => set({ splitDirection: dir }),
  setPaneRatio: (ratio) => set({ paneRatio: ratio }),
  setDropZone: (zone) => set({ dropZone: zone }),
  setDocumentRefreshTokens: (value) => set((s) => ({ documentRefreshTokens: resolve(s.documentRefreshTokens, value) })),
  setDirtyDocumentIds: (value) => set((s) => ({ dirtyDocumentIds: resolve(s.dirtyDocumentIds, value) })),
  setDocumentConflicts: (value) => set((s) => ({ documentConflicts: resolve(s.documentConflicts, value) })),
  setActiveConflictDocumentId: (value) => set((s) => ({ activeConflictDocumentId: resolve(s.activeConflictDocumentId, value) })),
  setOutlineJumpRequest: (value) => set((s) => ({ outlineJumpRequest: resolve(s.outlineJumpRequest, value) })),
  setFileListCreationSignal: (value) => set((s) => ({ fileListCreationSignal: resolve(s.fileListCreationSignal, value) })),
  incrementFileListCreationSignal: () => set((s) => ({ fileListCreationSignal: s.fileListCreationSignal + 1 })),
}));
