import pkg from "electron-updater";
import log from "electron-log";

const { autoUpdater } = pkg;
import { app, BrowserWindow, ipcMain } from "electron";

// Configure auto-updater
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.forceDevUpdateConfig = !app.isPackaged;

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  // Check for updates on startup (delayed)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      log.debug("Auto-update check failed:", error.message);
    });
  }, 30_000); // 30s after app start

  // Periodic check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      log.debug("Periodic update check failed:", error.message);
    });
  }, 4 * 60 * 60 * 1000);

  // IPC handlers
  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const updateInfo = result?.updateInfo;
      if (!updateInfo) return { available: false };
      const releaseNotes = updateInfo.releaseNotes;
      return {
        available: true,
        version: updateInfo.version,
        releaseNotes: typeof releaseNotes === "string" ? releaseNotes : ""
      };
    } catch (error) {
      log.debug("Manual update check failed:", error);
      return { available: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error("Update download failed:", error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("updater:install", () => {
    autoUpdater.quitAndInstall();
  });

  // Event handlers — notify renderer
  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info.version);
    const win = getMainWindow();
    win?.webContents.send("updater:update-available", { version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    const win = getMainWindow();
    win?.webContents.send("updater:download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info.version);
    const win = getMainWindow();
    win?.webContents.send("updater:update-downloaded", { version: info.version });
  });

  autoUpdater.on("error", (error) => {
    log.error("Auto-updater error:", error);
  });
}
