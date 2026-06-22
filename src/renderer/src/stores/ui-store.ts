import { create } from "zustand";
import type { ApiCheckState, BrowserTab, RightPanelMode, SidebarMode } from "../types";
import { createBrowserTab } from "../lib/workspace-layout-utils";

const initialRightBrowserTab = createBrowserTab();

type UiStore = {
  sidebarMode: SidebarMode;
  rightPanelMode: RightPanelMode;
  rightBrowserTabs: BrowserTab[];
  rightBrowserActiveTabId: string;
  commandPaletteOpen: boolean;
  checkingApiModels: boolean;
  apiCheckState: ApiCheckState;

  setSidebarMode: (mode: SidebarMode) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  setRightBrowserTabs: (tabs: BrowserTab[], activeTabId: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCheckingApiModels: (checking: boolean) => void;
  setApiCheckState: (state: ApiCheckState) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  sidebarMode: "files",
  rightPanelMode: "agent",
  rightBrowserTabs: [initialRightBrowserTab],
  rightBrowserActiveTabId: initialRightBrowserTab.id,
  commandPaletteOpen: false,
  checkingApiModels: false,
  apiCheckState: { status: "idle" },

  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  setRightBrowserTabs: (tabs, activeTabId) => set({ rightBrowserTabs: tabs, rightBrowserActiveTabId: activeTabId }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCheckingApiModels: (checking) => set({ checkingApiModels: checking }),
  setApiCheckState: (state) => set({ apiCheckState: state }),
}));
