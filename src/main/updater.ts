import { app, BrowserWindow } from "electron";
import type { AppInfo, UpdaterState } from "../shared/types.js";
import { APP_GITHUB_URL, APP_NAME } from "../shared/appMeta.js";

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on: (event: string, listener: (...args: any[]) => void) => void;
  checkForUpdates: () => Promise<unknown>;
  quitAndInstall: () => void;
};

let currentState: UpdaterState = { status: "idle", message: "自动更新尚未检查。" };
let updaterPromise: Promise<AutoUpdaterLike | null> | null = null;
let listenersBound = false;

const emitUpdaterState = () => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("app:updater-state", currentState);
  });
};

const setUpdaterState = (next: UpdaterState) => {
  currentState = next;
  emitUpdaterState();
};

const formatError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "检查更新失败，请稍后重试。";
};

const updaterUnavailableMessage = () => {
  if (!APP_GITHUB_URL) return "尚未配置 GitHub Releases 仓库信息。";
  if (!app.isPackaged) return "开发环境不执行自动更新。";
  return "当前环境暂不支持自动更新。";
};

const bindUpdaterEvents = (updater: AutoUpdaterLike) => {
  if (listenersBound) return;
  listenersBound = true;

  updater.on("checking-for-update", () => {
    setUpdaterState({ status: "checking", message: "正在检查更新..." });
  });

  updater.on("update-available", (info?: { version?: string }) => {
    setUpdaterState({
      status: "available",
      version: info?.version,
      message: info?.version ? `发现新版本 ${info.version}，正在下载...` : "发现新版本，正在下载..."
    });
  });

  updater.on("update-not-available", () => {
    setUpdaterState({ status: "up-to-date", message: "当前已经是最新版本。" });
  });

  updater.on("download-progress", (progress?: { percent?: number; transferred?: number; total?: number }) => {
    const percent = Number(progress?.percent ?? 0);
    setUpdaterState({
      status: "downloading",
      progress: percent,
      transferredBytes: progress?.transferred,
      totalBytes: progress?.total,
      message: `正在下载更新${Number.isFinite(percent) ? ` ${Math.round(percent)}%` : ""}...`
    });
  });

  updater.on("update-downloaded", (info?: { version?: string }) => {
    setUpdaterState({
      status: "downloaded",
      version: info?.version,
      message: info?.version ? `新版本 ${info.version} 已下载，重启后安装。` : "更新已下载，重启后安装。"
    });
  });

  updater.on("error", (error: unknown) => {
    setUpdaterState({ status: "error", message: formatError(error) });
  });
};

const loadAutoUpdater = async () => {
  if (updaterPromise) return updaterPromise;

  updaterPromise = (async () => {
    if (!APP_GITHUB_URL || !app.isPackaged) {
      setUpdaterState({ status: "idle", message: updaterUnavailableMessage() });
      return null;
    }

    try {
      const mod = await import("electron-updater");
      const updater = mod.autoUpdater as AutoUpdaterLike | undefined;
      if (!updater) throw new Error("electron-updater 未正确导出 autoUpdater。");
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      bindUpdaterEvents(updater);
      if (currentState.status === "idle") {
        setUpdaterState({ status: "idle", message: "自动更新已就绪。" });
      }
      return updater;
    } catch (error) {
      setUpdaterState({
        status: "error",
        message: `自动更新模块不可用：${formatError(error)}`
      });
      return null;
    }
  })();

  return updaterPromise;
};

export const getAppInfo = (): AppInfo => ({
  name: app.getName() || APP_NAME,
  version: app.getVersion(),
  githubUrl: APP_GITHUB_URL
});

export const getUpdaterState = () => currentState;

export const initializeUpdater = async (autoCheckOnLaunch: boolean) => {
  const updater = await loadAutoUpdater();
  if (!updater) return;
  if (autoCheckOnLaunch) {
    void checkForUpdates();
  }
};

export const checkForUpdates = async () => {
  const updater = await loadAutoUpdater();
  if (!updater) return currentState;

  try {
    await updater.checkForUpdates();
  } catch (error) {
    setUpdaterState({ status: "error", message: formatError(error) });
  }

  return currentState;
};

export const restartToInstallUpdate = async () => {
  const updater = await loadAutoUpdater();
  if (!updater) throw new Error(updaterUnavailableMessage());
  if (currentState.status !== "downloaded") throw new Error("更新尚未下载完成。");
  updater.quitAndInstall();
};
