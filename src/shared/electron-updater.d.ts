declare module "electron-updater" {
  export const autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    on: (event: string, listener: (...args: any[]) => void) => void;
    checkForUpdates: () => Promise<unknown>;
    quitAndInstall: () => void;
  };
}
