import { create } from "zustand";
import type { SetStateAction } from "react";
import type { AppData, AppInfo, AppSettings } from "../types";

type AppStore = {
  data: AppData | null;
  loadError: string | null;
  appInfo: AppInfo;

  setData: (value: SetStateAction<AppData | null>) => void;
  setLoadError: (error: string | null) => void;
  setAppInfo: (info: AppInfo) => void;
  updateSettings: (settings: AppSettings) => void;
  updateActiveAgentModel: (model: string) => void;
};

const resolve = <T>(prev: T, value: SetStateAction<T>): T =>
  typeof value === "function" ? (value as (prev: T) => T)(prev) : value;

export const useAppStore = create<AppStore>((set, get) => ({
  data: null,
  loadError: null,
  appInfo: {
    name: "Informio",
    version: "",
    platform: navigator.platform.toLowerCase().includes("win") ? "win32" : "darwin",
    githubUrl: "",
    iconDataUrl: undefined
  },

  setData: (value) => set((s) => ({ data: resolve(s.data, value) })),
  setLoadError: (error) => set({ loadError: error }),
  setAppInfo: (info) => set({ appInfo: info }),
  updateSettings: (settings) => {
    const { data } = get();
    if (!data) return;
    set({ data: { ...data, settings } });
    window.informio.saveSettings(settings).then((saved) => {
      if (saved) set((s) => s.data ? { data: { ...s.data, settings: saved } } : {});
    });
  },
  updateActiveAgentModel: (model) => {
    const { data } = get();
    if (!data) return;
    const providerId = data.settings.activeAgentId;
    const settings = {
      ...data.settings,
      agents: data.settings.agents.map((agent) => (agent.id === providerId ? { ...agent, model } : agent))
    };
    get().updateSettings(settings);
  }
}));
