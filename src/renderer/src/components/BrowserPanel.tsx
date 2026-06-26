import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, Maximize2, RotateCw, X } from "lucide-react";
import type { BrowserPaneState, BrowserTabMeta } from "../types";
import { cn } from "../lib/utils";
import { normalizeBrowserUrl } from "../lib/workspace-layout-utils";

export const BROWSER_BOUNDS_SYNC_EVENT = "informio:browser-bounds-sync";

const BROWSER_BOUNDS_INSET = 3;

type BrowserPanelProps = {
  paneId: string;
  tabId: string;
  initialUrl?: string;
  embedded?: boolean;
  className?: string;
  style?: CSSProperties;
  showPaneControls?: boolean;
  onClosePane?: () => void;
  onMaximizePane?: () => void;
  onTabMetaChange?: (tabId: string, meta: BrowserTabMeta) => void;
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
  tabId,
  initialUrl = "",
  embedded = false,
  className,
  style,
  showPaneControls = false,
  onClosePane,
  onMaximizePane,
  onTabMetaChange,
}: BrowserPanelProps) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const isEditingAddressRef = useRef(false);
  const committedUrlRef = useRef(initialUrl);
  const pendingNavigationUrlRef = useRef<string | null>(null);
  const [address, setAddress] = useState(initialUrl);
  const [state, setState] = useState<BrowserPaneState>(emptyState);

  const syncBounds = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const inset = BROWSER_BOUNDS_INSET;
    void window.informio.setBrowserPaneBounds(tabId, {
      x: rect.left + inset,
      y: rect.top + inset,
      width: Math.max(0, rect.width - inset * 2),
      height: Math.max(0, rect.height - inset * 2),
    });
  }, [tabId]);

  const updateTabMetadata = useCallback(
    (url: string, title?: string) => {
      onTabMetaChange?.(tabId, { url, title });
    },
    [onTabMetaChange, tabId],
  );

  const refreshState = useCallback(async () => {
    const next = await window.informio.getBrowserPaneState(tabId);
    if (!next) return;
    setState(next);
    if (!next.url || isEditingAddressRef.current) return;

    const pending = pendingNavigationUrlRef.current;
    if (pending) {
      if (!next.isLoading) {
        pendingNavigationUrlRef.current = null;
        committedUrlRef.current = next.url;
        setAddress(next.url);
        updateTabMetadata(next.url, next.title);
      }
      return;
    }

    committedUrlRef.current = next.url;
    setAddress(next.url);
    updateTabMetadata(next.url, next.title);
  }, [tabId, updateTabMetadata]);

  useEffect(() => {
    void window.informio.createBrowserPane({ browserId: tabId, paneId, initialUrl });
    return () => {
      void window.informio.destroyBrowserPane(tabId);
    };
  }, [tabId, paneId, initialUrl]);

  useEffect(() => {
    isEditingAddressRef.current = false;
    pendingNavigationUrlRef.current = null;
    committedUrlRef.current = initialUrl;
    setAddress(initialUrl);
    setState(emptyState);
    void window.informio.getBrowserPaneState(tabId).then((next) => {
      if (!next) return;
      setState(next);
      if (next.url) {
        committedUrlRef.current = next.url;
        setAddress(next.url);
      }
    });
  }, [initialUrl, tabId]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
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
      void window.informio.setBrowserPaneBounds(tabId, { x: 0, y: 0, width: 0, height: 0 });
    };
  }, [refreshState, syncBounds, tabId]);

  const submitAddress = async () => {
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
    updateTabMetadata(normalized, undefined);

    const result = await window.informio.loadBrowserPaneUrl(tabId, normalized);
    if (!result.ok) {
      pendingNavigationUrlRef.current = null;
      setState((current) => ({ ...current, error: result.error ?? t("browser.loadFailed"), isLoading: false }));
      return;
    }
    void refreshState();
  };

  return (
    <div
      className={cn(
        "browser-panel flex min-h-0 min-w-0 flex-col bg-white",
        embedded ? "h-full w-full flex-none" : "flex-1",
        className,
      )}
      style={style}
    >
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
          onClick={() => void window.informio.reloadBrowserPane(tabId).then(refreshState)}
        >
          {state.isLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
        </button>
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          title={t("browser.openExternal")}
          onClick={() => void window.informio.openBrowserPaneExternal(tabId)}
        >
          <ExternalLink size={12} />
        </button>
        {showPaneControls ? (
          <>
            <button
              type="button"
              aria-label={t("app.expandPane")}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMaximizePane?.();
              }}
            >
              <Maximize2 size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={t("app.closePane")}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClosePane?.();
              }}
            >
              <X size={12} strokeWidth={1.8} />
            </button>
          </>
        ) : null}
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
