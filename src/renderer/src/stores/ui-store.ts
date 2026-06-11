import { create } from "zustand";
import type { SidebarMode, ApiCheckState } from "../types";

type UiStore = {
  sidebarMode: SidebarMode;
  commandPaletteOpen: boolean;
  checkingApiModels: boolean;
  apiCheckState: ApiCheckState;

  setSidebarMode: (mode: SidebarMode) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCheckingApiModels: (checking: boolean) => void;
  setApiCheckState: (state: ApiCheckState) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  sidebarMode: "files",
  commandPaletteOpen: false,
  checkingApiModels: false,
  apiCheckState: { status: "idle" },

  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCheckingApiModels: (checking) => set({ checkingApiModels: checking }),
  setApiCheckState: (state) => set({ apiCheckState: state }),
}));
