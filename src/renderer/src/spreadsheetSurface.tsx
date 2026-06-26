import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { InformioDocument, SpreadsheetDiskFingerprint } from "../../shared/types";
import { SpreadsheetConflictDialog } from "./components/SpreadsheetConflictDialog";
import { SpreadsheetGrid } from "./components/SpreadsheetGrid";
import { assetExtensionFromSrc } from "./lib/asset-url";
import { exportFormatFromPath, exportSpreadsheetBlob } from "./lib/spreadsheet-export";
import { spreadsheetFingerprintsEqual } from "./lib/spreadsheet-fingerprint";
import { registerSpreadsheetExportHandler, registerSpreadsheetSaveHandler } from "./lib/spreadsheet-save-bridge";
import {
  clampSpreadsheetZoom,
  isSpreadsheetPinchWheel,
  spreadsheetZoomFromWheel
} from "./lib/spreadsheet-zoom";
import {
  loadSpreadsheetWorkbook,
  parseCellInput,
  updateWorkbookCell,
  type SpreadsheetWorkbook
} from "./lib/spreadsheet-workbook";
import { pathBaseName } from "./lib/path";
import { cn } from "./lib/utils";

const SPREADSHEET_SAVE_DEBOUNCE_MS = 900;
const SPREADSHEET_CONFLICT_POLL_MS = 30_000;

const readSpreadsheetFingerprint = async (path: string): Promise<SpreadsheetDiskFingerprint | null> => {
  const fingerprint = await window.informio.getSpreadsheetFileStat(path);
  return fingerprint ?? null;
};

type SpreadsheetSurfaceProps = {
  documentId: string;
  filePath: string;
  autoSave: boolean;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
  onFilePathChange: (documentId: string, nextPath: string) => void;
  onRequestSaveAs: () => void;
};

function SpreadsheetSurface({
  documentId,
  filePath,
  autoSave,
  onDirtyChange,
  onFilePathChange,
  onRequestSaveAs
}: SpreadsheetSurfaceProps) {
  const { t } = useTranslation();
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const workbookRef = useRef<SpreadsheetWorkbook | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const importingRef = useRef(false);
  const suppressSaveUntilRef = useRef(0);
  const filePathRef = useRef(filePath);
  const autoSaveRef = useRef(autoSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onFilePathChangeRef = useRef(onFilePathChange);
  const onRequestSaveAsRef = useRef(onRequestSaveAs);
  const diskFingerprintRef = useRef<SpreadsheetDiskFingerprint | null>(null);
  const conflictCheckInFlightRef = useRef(false);
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(Boolean(filePath));
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictHasUnsavedChanges, setConflictHasUnsavedChanges] = useState(false);
  const [pendingFingerprint, setPendingFingerprint] = useState<SpreadsheetDiskFingerprint | null>(null);

  workbookRef.current = workbook;

  autoSaveRef.current = autoSave;
  onDirtyChangeRef.current = onDirtyChange;
  onFilePathChangeRef.current = onFilePathChange;
  onRequestSaveAsRef.current = onRequestSaveAs;

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

  const rememberDiskFingerprint = useCallback(async (path: string) => {
    const fingerprint = await readSpreadsheetFingerprint(path);
    if (fingerprint) {
      diskFingerprintRef.current = fingerprint;
    }
  }, []);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const exportCurrentSpreadsheet = useCallback(async () => {
    return exportSpreadsheetBlob(workbookRef as RefObject<SpreadsheetWorkbook | null>, exportFormatFromPath(filePathRef.current));
  }, []);

  const persistSpreadsheet = useCallback(async () => {
    const currentPath = filePathRef.current;
    if (!currentPath || !dirtyRef.current || savingRef.current) return;
    if (!workbookRef.current) return;

    savingRef.current = true;
    try {
      const { blob } = await exportCurrentSpreadsheet();
      const buffer = await blob.arrayBuffer();
      const result = await window.informio.saveSpreadsheetFile(currentPath, buffer);
      if (!result) throw new Error(t("spreadsheet.saveFailed"));

      if (result.path !== currentPath) {
        filePathRef.current = result.path;
        onFilePathChangeRef.current(documentId, result.path);
      }

      await rememberDiskFingerprint(result.path);
      setDirtyState(false);
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      savingRef.current = false;
    }
  }, [documentId, exportCurrentSpreadsheet, rememberDiskFingerprint, setDirtyState, t]);

  const flushSpreadsheetSave = useCallback(async () => {
    clearSaveTimer();
    await persistSpreadsheet();
  }, [clearSaveTimer, persistSpreadsheet]);

  const scheduleSave = useCallback(() => {
    if (importingRef.current || isLoading || !dirtyRef.current || !autoSaveRef.current) return;
    if (!workbookRef.current) return;
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistSpreadsheet();
    }, SPREADSHEET_SAVE_DEBOUNCE_MS);
  }, [clearSaveTimer, isLoading, persistSpreadsheet]);

  const markDirty = useCallback(() => {
    if (importingRef.current || isLoading || Date.now() < suppressSaveUntilRef.current) return;
    setDirtyState(true);
    scheduleSave();
  }, [isLoading, scheduleSave, setDirtyState]);

  useEffect(() => {
    return registerSpreadsheetSaveHandler(documentId, flushSpreadsheetSave);
  }, [documentId, flushSpreadsheetSave]);

  useEffect(() => {
    return registerSpreadsheetExportHandler(documentId, exportCurrentSpreadsheet);
  }, [documentId, exportCurrentSpreadsheet]);

  const checkDiskConflict = useCallback(async () => {
    const currentPath = filePathRef.current;
    if (!currentPath || isLoading || !workbook || conflictOpen || conflictCheckInFlightRef.current) return;
    const baseline = diskFingerprintRef.current;
    if (!baseline) return;

    conflictCheckInFlightRef.current = true;
    try {
      const nextFingerprint = await readSpreadsheetFingerprint(currentPath);
      if (!nextFingerprint || spreadsheetFingerprintsEqual(baseline, nextFingerprint)) return;
      setConflictHasUnsavedChanges(dirtyRef.current);
      setPendingFingerprint(nextFingerprint);
      setConflictOpen(true);
    } finally {
      conflictCheckInFlightRef.current = false;
    }
  }, [conflictOpen, isLoading, workbook]);

  useEffect(() => {
    if (!filePath) {
      setWorkbook(null);
      setLoadFailed(false);
      setIsLoading(false);
      setSaveError("");
      setConflictOpen(false);
      setPendingFingerprint(null);
      diskFingerprintRef.current = null;
      setDirtyState(false);
      return;
    }

    let disposed = false;
    clearSaveTimer();
    setDirtyState(false);
    importingRef.current = true;
    suppressSaveUntilRef.current = Date.now() + 5000;
    setWorkbook(null);
    setIsLoading(true);
    setLoadFailed(false);
    setLoadErrorDetail("");
    setSaveError("");
    setConflictOpen(false);
    setPendingFingerprint(null);
    diskFingerprintRef.current = null;
    setZoom(1);

    void (async () => {
      try {
        const asset = await window.informio.loadAsset(filePath);
        if (disposed) return;
        const ext = assetExtensionFromSrc(filePath);
        const loaded = loadSpreadsheetWorkbook(asset.data, ext);
        if (loaded.sheets.length === 0) {
          throw new Error("Spreadsheet has no sheets");
        }
        if (!disposed) {
          setWorkbook(loaded);
          suppressSaveUntilRef.current = Date.now() + 1500;
          await rememberDiskFingerprint(filePath);
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
  }, [clearSaveTimer, filePath, flushSpreadsheetSave, reloadNonce, rememberDiskFingerprint, setDirtyState]);

  useEffect(() => {
    const handleFocus = () => {
      void checkDiskConflict();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checkDiskConflict]);

  useEffect(() => {
    const unsubscribe = window.informio.onAppDataUpdated(() => {
      void checkDiskConflict();
    });
    return unsubscribe;
  }, [checkDiskConflict]);

  useEffect(() => {
    if (isLoading || !workbook) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void checkDiskConflict();
    }, SPREADSHEET_CONFLICT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [checkDiskConflict, isLoading, workbook]);

  useEffect(() => {
    if (isLoading || !workbook) return;

    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleWheel = (event: WheelEvent) => {
      if (!isSpreadsheetPinchWheel(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setZoom((currentZoom) => spreadsheetZoomFromWheel(currentZoom, event.deltaY));
    };

    viewer.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => viewer.removeEventListener("wheel", handleWheel, { capture: true });
  }, [isLoading, workbook]);

  const handleWorkbookChange = (next: SpreadsheetWorkbook) => {
    setWorkbook(next);
    markDirty();
  };

  const handleCellChange = (sheetIndex: number, row: number, column: number, rawValue: string) => {
    if (!workbook) return;
    const nextValue = parseCellInput(rawValue);
    const currentValue = workbook.sheets[sheetIndex]?.rows[row]?.[column] ?? null;
    const currentText = currentValue == null ? "" : String(currentValue);
    if (rawValue === currentText || (rawValue.trim() === "" && currentValue == null)) return;
    setWorkbook(updateWorkbookCell(workbook, sheetIndex, row, column, nextValue));
    markDirty();
  };

  const handleConflictReload = () => {
    setConflictOpen(false);
    setPendingFingerprint(null);
    clearSaveTimer();
    setDirtyState(false);
    setSaveError("");
    setReloadNonce((value) => value + 1);
  };

  const handleConflictKeepLocal = () => {
    if (pendingFingerprint) {
      diskFingerprintRef.current = pendingFingerprint;
    }
    setPendingFingerprint(null);
    setConflictOpen(false);
  };

  const handleConflictSaveAs = () => {
    setConflictOpen(false);
    setPendingFingerprint(null);
    onRequestSaveAsRef.current();
  };

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
        {isLoading || !workbook ? (
          <div className="informio-spreadsheet-loading">{t("editor.assetLoading")}</div>
        ) : (
          <SpreadsheetGrid
            key={`${filePath}-${reloadNonce}`}
            workbook={workbook}
            zoom={clampSpreadsheetZoom(zoom)}
            onWorkbookChange={handleWorkbookChange}
            onCellChange={handleCellChange}
          />
        )}
      </div>
      {saveError ? <div className="informio-spreadsheet-save-error-bar">{saveError}</div> : null}
      <SpreadsheetConflictDialog
        open={conflictOpen}
        fileName={pathBaseName(filePath)}
        hasUnsavedChanges={conflictHasUnsavedChanges}
        onReload={handleConflictReload}
        onKeepLocal={handleConflictKeepLocal}
        onSaveAs={handleConflictSaveAs}
        onClose={() => {
          setConflictOpen(false);
          setPendingFingerprint(null);
        }}
      />
    </div>
  );
}

export function SpreadsheetViewerSurface({
  document,
  autoSave,
  onDirtyChange,
  onFilePathChange,
  onRequestSaveAs
}: {
  document: InformioDocument;
  autoSave: boolean;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
  onFilePathChange: (documentId: string, nextPath: string) => void;
  onRequestSaveAs: () => void;
}) {
  const filePath = document.filePath ?? "";
  return (
    <SpreadsheetSurface
      documentId={document.id}
      filePath={filePath}
      autoSave={autoSave}
      onDirtyChange={onDirtyChange}
      onFilePathChange={onFilePathChange}
      onRequestSaveAs={onRequestSaveAs}
    />
  );
}
