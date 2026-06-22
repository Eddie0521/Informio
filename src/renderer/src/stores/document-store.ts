import { create } from "zustand";
import type { SetStateAction } from "react";
import type {
  DocumentConflict,
  EditorViewMode,
  OutlineJumpRequest,
  WorkspaceDropTarget,
  WorkspacePaneId,
  WorkspaceSplitNode,
} from "../types";
import { MAIN_PANE_ID } from "../lib/workspace-layout-utils";

type DocumentStore = {
  openDocumentIds: string[];
  workspaceLayout: WorkspaceSplitNode | null;
  activePaneId: WorkspacePaneId;
  editorViewModes: Record<string, EditorViewMode>;
  dropTarget: WorkspaceDropTarget;
  documentRefreshTokens: Record<string, number>;
  dirtyDocumentIds: Set<string>;
  documentConflicts: Map<string, DocumentConflict>;
  activeConflictDocumentId: string | null;
  outlineJumpRequest: OutlineJumpRequest | null;
  fileListCreationSignal: number;

  setOpenDocumentIds: (value: SetStateAction<string[]>) => void;
  setWorkspaceLayout: (value: SetStateAction<WorkspaceSplitNode | null>) => void;
  setActivePaneId: (value: SetStateAction<WorkspacePaneId>) => void;
  setEditorViewModes: (value: SetStateAction<Record<string, EditorViewMode>>) => void;
  setDropTarget: (target: WorkspaceDropTarget) => void;
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
  workspaceLayout: null,
  activePaneId: MAIN_PANE_ID,
  editorViewModes: { [MAIN_PANE_ID]: "rich-text" },
  dropTarget: null,
  documentRefreshTokens: {},
  dirtyDocumentIds: new Set(),
  documentConflicts: new Map(),
  activeConflictDocumentId: null,
  outlineJumpRequest: null,
  fileListCreationSignal: 0,

  setOpenDocumentIds: (value) => set((s) => ({ openDocumentIds: resolve(s.openDocumentIds, value) })),
  setWorkspaceLayout: (value) => set((s) => ({ workspaceLayout: resolve(s.workspaceLayout, value) })),
  setActivePaneId: (value) => set((s) => ({ activePaneId: resolve(s.activePaneId, value) })),
  setEditorViewModes: (value) => set((s) => ({ editorViewModes: resolve(s.editorViewModes, value) })),
  setDropTarget: (target) => set({ dropTarget: target }),
  setDocumentRefreshTokens: (value) => set((s) => ({ documentRefreshTokens: resolve(s.documentRefreshTokens, value) })),
  setDirtyDocumentIds: (value) => set((s) => ({ dirtyDocumentIds: resolve(s.dirtyDocumentIds, value) })),
  setDocumentConflicts: (value) => set((s) => ({ documentConflicts: resolve(s.documentConflicts, value) })),
  setActiveConflictDocumentId: (value) => set((s) => ({ activeConflictDocumentId: resolve(s.activeConflictDocumentId, value) })),
  setOutlineJumpRequest: (value) => set((s) => ({ outlineJumpRequest: resolve(s.outlineJumpRequest, value) })),
  setFileListCreationSignal: (value) => set((s) => ({ fileListCreationSignal: resolve(s.fileListCreationSignal, value) })),
  incrementFileListCreationSignal: () => set((s) => ({ fileListCreationSignal: s.fileListCreationSignal + 1 })),
}));
