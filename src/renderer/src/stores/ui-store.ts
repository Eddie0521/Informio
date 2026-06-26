import { create } from "zustand";
import type { ApiCheckState, RightPanelMode, SidebarMode } from "../types";

type UiStore = {
  sidebarMode: SidebarMode;
  rightPanelMode: RightPanelMode;
  commandPaletteOpen: boolean;
  checkingApiModels: boolean;
  apiCheckState: ApiCheckState;

  setSidebarMode: (mode: SidebarMode) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCheckingApiModels: (checking: boolean) => void;
  setApiCheckState: (state: ApiCheckState) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  sidebarMode: "files",
  rightPanelMode: "agent",
  commandPaletteOpen: false,
  checkingApiModels: false,
  apiCheckState: { status: "idle" },

  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCheckingApiModels: (checking) => set({ checkingApiModels: checking }),
  setApiCheckState: (state) => set({ apiCheckState: state }),
}));
