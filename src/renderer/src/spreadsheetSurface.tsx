import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Workbook } from "@fortune-sheet/react";
import type { WorkbookInstance } from "@fortune-sheet/react";
import { transformExcelToFortune } from "@corbe30/fortune-excel";
import * as XLSX from "xlsx";
import "@fortune-sheet/react/dist/index.css";
import type { InformioDocument } from "../../shared/types";
import { assetExtensionFromSrc } from "./lib/asset-url";
import { exportFormatFromPath, exportSpreadsheetBlob } from "./lib/spreadsheet-export";
import { registerSpreadsheetSaveHandler } from "./lib/spreadsheet-save-bridge";
import { sanitizeFortuneSheets } from "./lib/spreadsheet-sanitize";
import {
  applySpreadsheetZoom,
  isSpreadsheetPinchWheel,
  readActiveSpreadsheetZoom,
  spreadsheetZoomFromWheel
} from "./lib/spreadsheet-zoom";
import { pathBaseName } from "./lib/path";
import { cn } from "./lib/utils";

const SPREADSHEET_SAVE_DEBOUNCE_MS = 900;

type FortuneSheetData = NonNullable<ComponentProps<typeof Workbook>["data"]>;

const mimeTypeForSpreadsheetExtension = (ext: string) => {
  if (ext === "csv") return "text/csv";
  if (ext === "xls") return "application/vnd.ms-excel";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
};

const prepareSpreadsheetFile = async (data: ArrayBuffer, fileName: string, ext: string): Promise<File> => {
  if (ext !== "xls") {
    return new File([data], fileName, { type: mimeTypeForSpreadsheetExtension(ext) });
  }
  const workbook = XLSX.read(data, { type: "array" });
  const xlsxBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const xlsxName = fileName.replace(/\.xls$/i, ".xlsx");
  return new File([xlsxBuffer], xlsxName, { type: mimeTypeForSpreadsheetExtension("xlsx") });
};

const notifyFortuneSheetResize = () => {
  window.dispatchEvent(new Event("resize"));
};

type SpreadsheetSurfaceProps = {
  documentId: string;
  filePath: string;
  autoSave: boolean;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
};

function SpreadsheetSurface({ documentId, filePath, autoSave, onDirtyChange }: SpreadsheetSurfaceProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<WorkbookInstance | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const importingRef = useRef(false);
  const suppressSaveUntilRef = useRef(0);
  const filePathRef = useRef(filePath);
  const autoSaveRef = useRef(autoSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const [sheets, setSheets] = useState<FortuneSheetData | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(filePath));
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState("");
  const [saveError, setSaveError] = useState("");

  autoSaveRef.current = autoSave;
  onDirtyChangeRef.current = onDirtyChange;

  const setDirtyState = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return;
    dirtyRef.current = dirty;
    onDirtyChangeRef.current(documentId, dirty);
  }, [documentId]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || typeof ResizeObserver === "undefined") return;

    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      if (sheetRef.current) {
        notifyFortuneSheetResize();
      }
    });

    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  const persistSpreadsheet = useCallback(async () => {
    const currentPath = filePathRef.current;
    if (!currentPath || !dirtyRef.current || savingRef.current) return;
    if (!sheetRef.current || typeof sheetRef.current.getAllSheets !== "function") return;

    savingRef.current = true;
    try {
      const blob = await exportSpreadsheetBlob(sheetRef, exportFormatFromPath(currentPath));
      const buffer = await blob.arrayBuffer();
      await window.informio.saveSpreadsheetFile(currentPath, buffer);
      setDirtyState(false);
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      savingRef.current = false;
    }
  }, [setDirtyState]);

  const flushSpreadsheetSave = useCallback(async () => {
    clearSaveTimer();
    await persistSpreadsheet();
  }, [clearSaveTimer, persistSpreadsheet]);

  const scheduleSave = useCallback(() => {
    if (importingRef.current || isLoading || !dirtyRef.current || !autoSaveRef.current) return;
    if (!sheetRef.current || typeof sheetRef.current.getAllSheets !== "function") return;
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistSpreadsheet();
    }, SPREADSHEET_SAVE_DEBOUNCE_MS);
  }, [clearSaveTimer, isLoading, persistSpreadsheet]);

  const handleWorkbookOp = useCallback(() => {
    if (importingRef.current || isLoading || Date.now() < suppressSaveUntilRef.current) return;
    setDirtyState(true);
    scheduleSave();
  }, [isLoading, scheduleSave, setDirtyState]);

  useEffect(() => {
    return registerSpreadsheetSaveHandler(documentId, flushSpreadsheetSave);
  }, [documentId, flushSpreadsheetSave]);

  useEffect(() => {
    if (!filePath) {
      setSheets(null);
      setLoadFailed(false);
      setIsLoading(false);
      setSaveError("");
      setDirtyState(false);
      return;
    }

    let disposed = false;
    clearSaveTimer();
    setDirtyState(false);
    importingRef.current = true;
    suppressSaveUntilRef.current = Date.now() + 5000;
    setSheets(null);
    setIsLoading(true);
    setLoadFailed(false);
    setLoadErrorDetail("");
    setSaveError("");

    void (async () => {
      try {
        const asset = await window.informio.loadAsset(filePath);
        if (disposed) return;
        const fileName = pathBaseName(filePath);
        const ext = assetExtensionFromSrc(filePath);
        const file = await prepareSpreadsheetFile(asset.data, fileName, ext);
        await transformExcelToFortune(
          file,
          (nextSheets: FortuneSheetData) => {
            if (disposed) return;
            const sanitized = sanitizeFortuneSheets(nextSheets);
            if (sanitized.length === 0) {
              throw new Error("Spreadsheet has no sheets");
            }
            setSheets(sanitized);
          },
          () => 0,
          { current: null }
        );
        if (!disposed) {
          suppressSaveUntilRef.current = Date.now() + 1500;
        }
      } catch (error) {
        if (!disposed) {
          setLoadFailed(true);
          setLoadErrorDetail(error instanceof Error ? error.message : String(error));
        }
      } finally {
        importingRef.current = false;
        if (!disposed) setIsLoading(false);
      }
    })();

    return () => {
      disposed = true;
      importingRef.current = false;
      clearSaveTimer();
      if (dirtyRef.current) {
        void flushSpreadsheetSave();
      }
    };
  }, [clearSaveTimer, filePath, flushSpreadsheetSave, setDirtyState]);

  useEffect(() => {
    if (isLoading || !sheets) return;

    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleWheel = (event: WheelEvent) => {
      if (!isSpreadsheetPinchWheel(event)) return;
      const instance = sheetRef.current;
      if (!instance || typeof instance.applyOp !== "function") return;

      event.preventDefault();
      event.stopPropagation();

      const currentZoom = readActiveSpreadsheetZoom(instance);
      const nextZoom = spreadsheetZoomFromWheel(currentZoom, event.deltaY);
      applySpreadsheetZoom(instance, nextZoom);
    };

    viewer.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => viewer.removeEventListener("wheel", handleWheel, { capture: true });
  }, [isLoading, sheets]);

  useEffect(() => {
    if (isLoading || !sheets) return;

    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled && sheetRef.current) {
          notifyFortuneSheetResize();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [isLoading, sheets, filePath]);

  if (!filePath) {
    return <div className="informio-spreadsheet-message is-error">{t("spreadsheet.missingFilePath")}</div>;
  }

  if (loadFailed) {
    return (
      <div className="informio-spreadsheet-message is-error">
        {t("editor.assetDecodeError", { type: t("spreadsheet.fileType") })}
        {loadErrorDetail ? ` (${loadErrorDetail})` : ""}
      </div>
    );
  }

  return (
    <div className={cn("informio-spreadsheet-shell", "is-full")}>
      <div ref={viewerRef} className="informio-spreadsheet-viewer">
        {isLoading || !sheets ? (
          <div className="informio-spreadsheet-loading">{t("editor.assetLoading")}</div>
        ) : (
          <Workbook key={filePath} ref={sheetRef} data={sheets} onOp={handleWorkbookOp} />
        )}
      </div>
      {saveError ? <div className="informio-spreadsheet-save-error-bar">{saveError}</div> : null}
    </div>
  );
}

export function SpreadsheetViewerSurface({
  document,
  autoSave,
  onDirtyChange
}: {
  document: InformioDocument;
  autoSave: boolean;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
}) {
  const filePath = document.filePath ?? "";
  return (
    <SpreadsheetSurface
      documentId={document.id}
      filePath={filePath}
      autoSave={autoSave}
      onDirtyChange={onDirtyChange}
    />
  );
}
