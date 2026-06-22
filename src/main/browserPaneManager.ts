import { BrowserWindow, WebContentsView, screen, session, shell } from "electron";
import type { BrowserPaneBounds, BrowserPaneState } from "../shared/types.js";

const BROWSER_PARTITION = "persist:informio-browser";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const PANEL_RESIZE_HANDLE_WIDTH = 8;
const PROXIMITY_THRESHOLD = 14;
const PROXIMITY_POLL_MS = 50;

export const normalizeBrowserNavigationUrl = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const url = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
};

type ManagedBrowserView = {
  view: WebContentsView;
  paneId: string;
  browserId: string;
  visible: boolean;
  error?: string;
};

type PanelLayout = {
  leftOpen: boolean;
  rightOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
};

type PanelLayoutGetter = () => PanelLayout | null;

export class BrowserPaneManager {
  private window: BrowserWindow | null = null;
  private views = new Map<string, ManagedBrowserView>();
  private lastBounds = new Map<string, BrowserPaneBounds>();
  private getPanelLayout: PanelLayoutGetter | null = null;
  private proximityTimer: NodeJS.Timeout | null = null;
  private detached = false;
  private panelResizing = false;

  setPanelLayoutGetter(getter: PanelLayoutGetter) {
    this.getPanelLayout = getter;
  }

  attachWindow(window: BrowserWindow | null) {
    this.stopProximityPolling();
    this.detached = false;
    this.panelResizing = false;
    this.window = window;
    if (!window) {
      this.destroyAll();
      return;
    }
    for (const browserId of this.views.keys()) {
      this.applyBounds(browserId);
    }
    this.ensureProximityPolling();
  }

  createView(browserId: string, paneId: string, initialUrl = "") {
    if (this.views.has(browserId)) return;
    const browserSession = session.fromPartition(BROWSER_PARTITION);
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    view.setBackgroundColor("#ffffff");

    const webContents = view.webContents;
    webContents.setWindowOpenHandler(({ url }) => {
      const normalized = normalizeBrowserNavigationUrl(url);
      if (normalized) void webContents.loadURL(normalized);
      return { action: "deny" };
    });
    webContents.on("will-navigate", (event, url) => {
      const normalized = normalizeBrowserNavigationUrl(url);
      if (!normalized) {
        event.preventDefault();
        return;
      }
      if (normalized !== url) {
        event.preventDefault();
        void webContents.loadURL(normalized);
      }
    });
    webContents.on("did-fail-load", (_event, _code, errorDescription, _validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      const state = this.views.get(browserId);
      if (state) state.error = errorDescription || "Failed to load page";
    });
    webContents.on("did-finish-load", () => {
      const state = this.views.get(browserId);
      if (state) state.error = undefined;
    });

    this.views.set(browserId, { view, paneId, browserId, visible: false });
    this.window?.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    const normalized = normalizeBrowserNavigationUrl(initialUrl);
    if (normalized) void webContents.loadURL(normalized);
    this.ensureProximityPolling();
  }

  destroyView(browserId: string) {
    const state = this.views.get(browserId);
    if (!state) return;
    this.removeViewFromWindow(state);
    state.view.webContents.close();
    this.views.delete(browserId);
    this.lastBounds.delete(browserId);
    if (this.views.size === 0) {
      this.stopProximityPolling();
      this.detached = false;
      this.panelResizing = false;
    }
  }

  destroyAll() {
    for (const browserId of Array.from(this.views.keys())) {
      this.destroyView(browserId);
    }
  }

  setBounds(browserId: string, bounds: BrowserPaneBounds) {
    this.lastBounds.set(browserId, bounds);
    this.applyBounds(browserId);
    this.ensureProximityPolling();
  }

  hideAll() {
    this.detachAllViews();
  }

  setPanelResizing(resizing: boolean) {
    this.panelResizing = resizing;
    if (resizing) {
      this.detachAllViews();
      return;
    }
    if (!this.isNearResizeEdge()) {
      this.restoreAllViews();
    }
  }

  loadUrl(browserId: string, url: string) {
    const state = this.views.get(browserId);
    if (!state) return { ok: false as const, error: "Browser pane not found" };
    const normalized = normalizeBrowserNavigationUrl(url);
    if (!normalized) return { ok: false as const, error: "Invalid URL" };
    state.error = undefined;
    void state.view.webContents.loadURL(normalized);
    return { ok: true as const };
  }

  goBack(browserId: string) {
    const state = this.views.get(browserId);
    if (!state?.view.webContents.canGoBack()) return;
    state.view.webContents.goBack();
  }

  goForward(browserId: string) {
    const state = this.views.get(browserId);
    if (!state?.view.webContents.canGoForward()) return;
    state.view.webContents.goForward();
  }

  reload(browserId: string) {
    const state = this.views.get(browserId);
    if (!state) return;
    state.error = undefined;
    state.view.webContents.reload();
  }

  openExternal(browserId: string) {
    const state = this.views.get(browserId);
    if (!state) return;
    const url = state.view.webContents.getURL();
    if (!url) return;
    void shell.openExternal(url);
  }

  clearSession() {
    const browserSession = session.fromPartition(BROWSER_PARTITION);
    void browserSession.clearStorageData();
  }

  getState(browserId: string): BrowserPaneState | null {
    const state = this.views.get(browserId);
    if (!state) return null;
    const webContents = state.view.webContents;
    return {
      url: webContents.getURL(),
      title: webContents.getTitle(),
      isLoading: webContents.isLoading(),
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      error: state.error,
    };
  }

  private applyBounds(browserId: string) {
    const state = this.views.get(browserId);
    if (!state || !this.window) return;
    if (this.isInteractionBlocked()) return;

    const bounds = this.lastBounds.get(browserId);
    if (!bounds) return;

    const width = Math.max(0, Math.round(bounds.width));
    const height = Math.max(0, Math.round(bounds.height));
    const visible = width > 0 && height > 0;
    state.visible = visible;

    if (!visible) {
      this.removeViewFromWindow(state);
      return;
    }

    this.ensureViewOnWindow(state);
    state.view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width,
      height,
    });
  }

  private isInteractionBlocked() {
    return this.detached || this.panelResizing;
  }

  private detachAllViews() {
    if (this.detached) return;
    this.detached = true;
    for (const state of this.views.values()) {
      state.visible = false;
      this.removeViewFromWindow(state);
    }
  }

  private restoreAllViews() {
    if (!this.detached) return;
    this.detached = false;
    for (const browserId of this.views.keys()) {
      this.applyBounds(browserId);
    }
  }

  private ensureViewOnWindow(state: ManagedBrowserView) {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    if (!window.contentView.children.includes(state.view)) {
      window.contentView.addChildView(state.view);
    }
  }

  private removeViewFromWindow(state: ManagedBrowserView) {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    if (window.contentView.children.includes(state.view)) {
      window.contentView.removeChildView(state.view);
    }
    state.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  private ensureProximityPolling() {
    if (this.proximityTimer || this.views.size === 0) return;
    this.proximityTimer = setInterval(() => this.checkResizeProximity(), PROXIMITY_POLL_MS);
  }

  private stopProximityPolling() {
    if (!this.proximityTimer) return;
    clearInterval(this.proximityTimer);
    this.proximityTimer = null;
  }

  private checkResizeProximity() {
    if (this.views.size === 0) {
      this.stopProximityPolling();
      return;
    }
    if (this.panelResizing) {
      this.detachAllViews();
      return;
    }
    if (this.isNearResizeEdge()) {
      this.detachAllViews();
      return;
    }
    if (this.detached) {
      this.restoreAllViews();
    }
  }

  private isNearResizeEdge() {
    const layout = this.getPanelLayout?.();
    const window = this.window;
    if (!layout || !window || window.isDestroyed()) return false;

    const point = screen.getCursorScreenPoint();
    const content = window.getContentBounds();
    const edges: number[] = [];

    if (layout.leftOpen) {
      edges.push(content.x + layout.leftPanelWidth + PANEL_RESIZE_HANDLE_WIDTH / 2);
    }
    if (layout.rightOpen) {
      edges.push(content.x + content.width - layout.rightPanelWidth - PANEL_RESIZE_HANDLE_WIDTH / 2);
    }

    return edges.some((edge) => Math.abs(point.x - edge) <= PROXIMITY_THRESHOLD);
  }
}

export const browserPaneManager = new BrowserPaneManager();
