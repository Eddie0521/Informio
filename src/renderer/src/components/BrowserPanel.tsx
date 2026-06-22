import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, Plus, RotateCw, X } from "lucide-react";
import type { BrowserPaneState, BrowserTab } from "../types";
import { cn } from "../lib/utils";
import { browserTabLabel, createBrowserTab, normalizeBrowserUrl } from "../lib/workspace-layout-utils";

export const BROWSER_BOUNDS_SYNC_EVENT = "informio:browser-bounds-sync";

const BROWSER_BOUNDS_INSET = 3;

type BrowserPanelProps = {
  paneId: string;
  tabs: BrowserTab[];
  activeTabId: string;
  onTabsChange: (tabs: BrowserTab[], activeTabId: string) => void;
  embedded?: boolean;
  className?: string;
  style?: CSSProperties;
};

const emptyState: BrowserPaneState = {
  url: "",
  title: "",
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
};

export function BrowserPanel({
  paneId,
  tabs,
  activeTabId,
  onTabsChange,
  embedded = false,
  className,
  style,
}: BrowserPanelProps) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mountedTabsRef = useRef<Set<string>>(new Set());
  const isEditingAddressRef = useRef(false);
  const committedUrlRef = useRef("");
  const pendingNavigationUrlRef = useRef<string | null>(null);
  const [address, setAddress] = useState("");
  const [state, setState] = useState<BrowserPaneState>(emptyState);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const syncBounds = useCallback(() => {
    if (!activeTab) return;
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const inset = BROWSER_BOUNDS_INSET;
    void window.informio.setBrowserPaneBounds(activeTab.id, {
      x: rect.left + inset,
      y: rect.top + inset,
      width: Math.max(0, rect.width - inset * 2),
      height: Math.max(0, rect.height - inset * 2),
    });
  }, [activeTab]);

  const hideInactiveTabBounds = useCallback(() => {
    for (const tab of tabs) {
      if (tab.id === activeTab?.id) continue;
      void window.informio.setBrowserPaneBounds(tab.id, { x: 0, y: 0, width: 0, height: 0 });
    }
  }, [activeTab?.id, tabs]);

  const updateActiveTabMetadata = useCallback(
    (url: string, title?: string) => {
      if (!activeTab) return;
      const nextTabs = tabs.map((tab) =>
        tab.id === activeTab.id ? { ...tab, url, title: title ?? tab.title } : tab,
      );
      const changed = nextTabs.some((tab, index) => tab.url !== tabs[index]?.url || tab.title !== tabs[index]?.title);
      if (changed) onTabsChange(nextTabs, activeTabId);
    },
    [activeTab, activeTabId, onTabsChange, tabs],
  );

  const refreshState = useCallback(async () => {
    if (!activeTab) return;
    const next = await window.informio.getBrowserPaneState(activeTab.id);
    if (!next) return;
    setState(next);
    if (!next.url || isEditingAddressRef.current) return;

    const pending = pendingNavigationUrlRef.current;
    if (pending) {
      if (!next.isLoading) {
        pendingNavigationUrlRef.current = null;
        committedUrlRef.current = next.url;
        setAddress(next.url);
        updateActiveTabMetadata(next.url, next.title);
      }
      return;
    }

    committedUrlRef.current = next.url;
    setAddress(next.url);
    updateActiveTabMetadata(next.url, next.title);
  }, [activeTab, updateActiveTabMetadata]);

  useEffect(() => {
    const currentIds = new Set(tabs.map((tab) => tab.id));
    for (const tab of tabs) {
      if (mountedTabsRef.current.has(tab.id)) continue;
      mountedTabsRef.current.add(tab.id);
      void window.informio.createBrowserPane({ browserId: tab.id, paneId, initialUrl: tab.url ?? "" });
    }
    for (const tabId of [...mountedTabsRef.current]) {
      if (currentIds.has(tabId)) continue;
      mountedTabsRef.current.delete(tabId);
      void window.informio.destroyBrowserPane(tabId);
    }
  }, [paneId, tabs]);

  useEffect(() => {
    return () => {
      for (const tabId of mountedTabsRef.current) {
        void window.informio.destroyBrowserPane(tabId);
      }
      mountedTabsRef.current.clear();
    };
  }, [paneId]);

  useEffect(() => {
    if (!activeTab) return;
    isEditingAddressRef.current = false;
    pendingNavigationUrlRef.current = null;
    committedUrlRef.current = activeTab.url ?? "";
    setAddress(activeTab.url ?? "");
    setState(emptyState);
    hideInactiveTabBounds();
    void window.informio.getBrowserPaneState(activeTab.id).then((next) => {
      if (!next) return;
      setState(next);
      if (next.url) {
        committedUrlRef.current = next.url;
        setAddress(next.url);
      }
    });
    syncBounds();
  }, [activeTab, hideInactiveTabBounds, syncBounds]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !activeTab) return;
    syncBounds();
    const observer = new ResizeObserver(() => syncBounds());
    observer.observe(element);
    const onWindowResize = () => syncBounds();
    const onBoundsSync = () => syncBounds();
    window.addEventListener("resize", onWindowResize);
    window.addEventListener(BROWSER_BOUNDS_SYNC_EVENT, onBoundsSync);
    const timer = window.setInterval(() => {
      void refreshState();
    }, 500);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener(BROWSER_BOUNDS_SYNC_EVENT, onBoundsSync);
      window.clearInterval(timer);
      if (activeTab) {
        void window.informio.setBrowserPaneBounds(activeTab.id, { x: 0, y: 0, width: 0, height: 0 });
      }
    };
  }, [activeTab, refreshState, syncBounds]);

  const submitAddress = async () => {
    if (!activeTab) return;
    const normalized = normalizeBrowserUrl(address);
    if (!normalized) {
      setState((current) => ({ ...current, error: t("browser.invalidUrl") }));
      return;
    }

    isEditingAddressRef.current = false;
    pendingNavigationUrlRef.current = normalized;
    committedUrlRef.current = normalized;
    setAddress(normalized);
    setState((current) => ({ ...current, error: undefined, isLoading: true }));
    onTabsChange(
      tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, url: normalized, title: undefined } : tab)),
      activeTabId,
    );

    const result = await window.informio.loadBrowserPaneUrl(activeTab.id, normalized);
    if (!result.ok) {
      pendingNavigationUrlRef.current = null;
      setState((current) => ({ ...current, error: result.error ?? t("browser.loadFailed"), isLoading: false }));
      return;
    }
    void refreshState();
  };

  const selectTab = (tabId: string) => {
    if (tabId === activeTabId) return;
    onTabsChange(tabs, tabId);
  };

  const addTab = () => {
    const tab = createBrowserTab();
    onTabsChange([...tabs, tab], tab.id);
  };

  const closeTab = (tabId: string) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return;
    if (tabs.length === 1) {
      const tab = createBrowserTab();
      void window.informio.destroyBrowserPane(tabId);
      mountedTabsRef.current.delete(tabId);
      onTabsChange([tab], tab.id);
      return;
    }
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const nextActive =
      activeTabId === tabId ? nextTabs[Math.max(0, index - 1)]?.id ?? nextTabs[0]?.id : activeTabId;
    void window.informio.destroyBrowserPane(tabId);
    mountedTabsRef.current.delete(tabId);
    onTabsChange(nextTabs, nextActive);
  };

  if (!activeTab) return null;

  return (
    <div
      className={cn(
        "browser-panel flex min-h-0 min-w-0 flex-col bg-white",
        embedded ? "h-full w-full flex-none" : "flex-1",
        className,
      )}
      style={style}
    >
      <div className="browser-panel-tabs flex h-7 shrink-0 items-center gap-1 border-b border-slate-200/80 px-1.5">
        <div className="browser-tabs-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={cn(
                  "group relative flex h-6 min-w-[4.5rem] max-w-32 shrink-0 items-center rounded-md text-[11px] font-semibold text-[var(--text-muted)]",
                  active && "surface-card text-[var(--text-main)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className="no-drag flex h-full min-w-0 flex-1 items-center rounded-md px-2 pr-6 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                >
                  <span className="truncate">{browserTabLabel(tab, t("browser.newTab"))}</span>
                  {active && state.isLoading ? (
                    <Loader2 size={10} className="ml-1 shrink-0 animate-spin text-slate-400" />
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={t("browser.closeTab")}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={cn(
                    "no-drag absolute right-0.5 grid h-4 w-4 place-items-center rounded-md text-[var(--text-muted)] opacity-0 transition-[background-color,opacity,transform,color] active:scale-95",
                    "hover:bg-slate-200/60 hover:text-[var(--text-main)] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 group-hover:opacity-100",
                  )}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-label={t("browser.newTab")}
          title={t("browser.newTab")}
          onClick={addTab}
          className="no-drag grid h-5 w-5 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="browser-panel-toolbar flex h-8 shrink-0 items-center gap-1.5 border-b border-slate-200/80 px-2">
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={() => {
            isEditingAddressRef.current = true;
          }}
          onBlur={() => {
            isEditingAddressRef.current = false;
            setAddress(committedUrlRef.current);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submitAddress();
              return;
            }
            if (event.key === "Escape") {
              isEditingAddressRef.current = false;
              setAddress(committedUrlRef.current);
              event.currentTarget.blur();
            }
          }}
          placeholder={t("browser.addressPlaceholder")}
          className="browser-panel-address h-6 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] leading-6 text-slate-700 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/25"
        />
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          title={t("browser.reload")}
          onClick={() => void window.informio.reloadBrowserPane(activeTab.id).then(refreshState)}
        >
          {state.isLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
        </button>
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          title={t("browser.openExternal")}
          onClick={() => void window.informio.openBrowserPaneExternal(activeTab.id)}
        >
          <ExternalLink size={12} />
        </button>
      </div>
      {state.error ? (
        <div className="browser-panel-error shrink-0 border-b border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {state.error}
        </div>
      ) : null}
      {!embedded && !address && !state.url ? (
        <div className="browser-panel-empty grid flex-1 place-items-center px-6 text-center text-[12px] text-slate-500">
          {t("browser.emptyHint")}
        </div>
      ) : null}
      <div ref={viewportRef} className="browser-panel-viewport min-h-0 flex-1 bg-slate-50" />
    </div>
  );
}
