import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocxEditor, type DocxEditorRef } from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";
import type { InformioDocument, WordDiskFingerprint } from "../../shared/types";
import { WordConflictDialog } from "./components/WordConflictDialog";
import { isEditableWordFile, isLegacyWordFile } from "./lib/file-type";
import { pathBaseName } from "./lib/path";
import {
  clampSpreadsheetZoom,
  isSpreadsheetPinchWheel,
  spreadsheetZoomFromWheel
} from "./lib/spreadsheet-zoom";
import { registerWordExportHandler, registerWordSaveHandler } from "./lib/word-save-bridge";
import { wordFingerprintsEqual } from "./lib/word-fingerprint";
import { cn } from "./lib/utils";

const WORD_SAVE_DEBOUNCE_MS = 900;
const WORD_CONFLICT_POLL_MS = 30_000;

const readWordFingerprint = async (path: string): Promise<WordDiskFingerprint | null> => {
  const fingerprint = await window.informio.getWordFileStat(path);
  return fingerprint ?? null;
};

type WordSurfaceProps = {
  documentId: string;
  filePath: string;
  autoSave: boolean;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
  onRequestSaveAs: () => void;
};

function WordSurface({ documentId, filePath, autoSave, onDirtyChange, onRequestSaveAs }: WordSurfaceProps) {
  const { t } = useTranslation();
  const editorRef = useRef<DocxEditorRef>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const importingRef = useRef(false);
  const suppressSaveUntilRef = useRef(0);
  const filePathRef = useRef(filePath);
  const autoSaveRef = useRef(autoSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onRequestSaveAsRef = useRef(onRequestSaveAs);
  const diskFingerprintRef = useRef<WordDiskFingerprint | null>(null);
  const conflictCheckInFlightRef = useRef(false);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(filePath) && isEditableWordFile(filePath));
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictHasUnsavedChanges, setConflictHasUnsavedChanges] = useState(false);
  const [pendingFingerprint, setPendingFingerprint] = useState<WordDiskFingerprint | null>(null);

  autoSaveRef.current = autoSave;
  onDirtyChangeRef.current = onDirtyChange;
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
    const fingerprint = await readWordFingerprint(path);
    if (fingerprint) {
      diskFingerprintRef.current = fingerprint;
    }
  }, []);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const exportCurrentWord = useCallback(async () => {
    const buffer = await editorRef.current?.save();
    if (!buffer) throw new Error(t("word.saveFailed"));
    return { buffer };
  }, [t]);

  const persistWord = useCallback(async () => {
    const currentPath = filePathRef.current;
    if (!currentPath || !dirtyRef.current || savingRef.current) return;
    if (!editorRef.current) return;

    savingRef.current = true;
    try {
      const { buffer } = await exportCurrentWord();
      const result = await window.informio.saveWordFile(currentPath, buffer);
      if (!result) throw new Error(t("word.saveFailed"));
      await rememberDiskFingerprint(result.path);
      setDirtyState(false);
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      savingRef.current = false;
    }
  }, [documentId, exportCurrentWord, rememberDiskFingerprint, setDirtyState, t]);

  const flushWordSave = useCallback(async () => {
    clearSaveTimer();
    await persistWord();
  }, [clearSaveTimer, persistWord]);

  const scheduleSave = useCallback(() => {
    if (importingRef.current || isLoading || !dirtyRef.current || !autoSaveRef.current) return;
    if (!editorRef.current) return;
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistWord();
    }, WORD_SAVE_DEBOUNCE_MS);
  }, [clearSaveTimer, isLoading, persistWord]);

  const markDirty = useCallback(() => {
    if (importingRef.current || isLoading || Date.now() < suppressSaveUntilRef.current) return;
    setDirtyState(true);
    scheduleSave();
  }, [isLoading, scheduleSave, setDirtyState]);

  useEffect(() => {
    return registerWordSaveHandler(documentId, flushWordSave);
  }, [documentId, flushWordSave]);

  useEffect(() => {
    return registerWordExportHandler(documentId, exportCurrentWord);
  }, [documentId, exportCurrentWord]);

  const checkDiskConflict = useCallback(async () => {
    const currentPath = filePathRef.current;
    if (!currentPath || isLoading || !documentBuffer || conflictOpen || conflictCheckInFlightRef.current) return;
    const baseline = diskFingerprintRef.current;
    if (!baseline) return;

    conflictCheckInFlightRef.current = true;
    try {
      const nextFingerprint = await readWordFingerprint(currentPath);
      if (!nextFingerprint || wordFingerprintsEqual(baseline, nextFingerprint)) return;
      setConflictHasUnsavedChanges(dirtyRef.current);
      setPendingFingerprint(nextFingerprint);
      setConflictOpen(true);
    } finally {
      conflictCheckInFlightRef.current = false;
    }
  }, [conflictOpen, documentBuffer, isLoading]);

  useEffect(() => {
    if (!filePath || !isEditableWordFile(filePath)) {
      setDocumentBuffer(null);
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
    setDocumentBuffer(null);
    setIsLoading(true);
    setLoadFailed(false);
    setLoadErrorDetail("");
    setSaveError("");
    setConflictOpen(false);
    setPendingFingerprint(null);
    diskFingerprintRef.current = null;

    void (async () => {
      try {
        const asset = await window.informio.loadAsset(filePath);
        if (disposed) return;
        setDocumentBuffer(asset.data);
        suppressSaveUntilRef.current = Date.now() + 1500;
        await rememberDiskFingerprint(filePath);
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
        void flushWordSave();
      }
    };
  }, [clearSaveTimer, filePath, flushWordSave, reloadNonce, rememberDiskFingerprint, setDirtyState]);

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
    if (isLoading || !documentBuffer) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void checkDiskConflict();
    }, WORD_CONFLICT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [checkDiskConflict, documentBuffer, isLoading]);

  useEffect(() => {
    if (isLoading || !documentBuffer) return;

    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleWheel = (event: WheelEvent) => {
      const formattingBar = (event.target as HTMLElement | null)?.closest(
        '[data-testid="formatting-bar"]'
      ) as HTMLElement | null;

      if (formattingBar && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        const canScroll =
          formattingBar.scrollWidth > formattingBar.clientWidth + 1;
        if (canScroll) {
          formattingBar.scrollLeft += event.deltaY;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (!isSpreadsheetPinchWheel(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const editor = editorRef.current;
      if (!editor) return;
      const nextZoom = spreadsheetZoomFromWheel(editor.getZoom(), event.deltaY);
      editor.setZoom(clampSpreadsheetZoom(nextZoom));
    };

    viewer.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => viewer.removeEventListener("wheel", handleWheel, { capture: true });
  }, [documentBuffer, isLoading, reloadNonce]);

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

  const openInSystem = () => {
    if (filePath) void window.informio.openPath(filePath);
  };

  if (!filePath) {
    return <div className="informio-word-message is-error">{t("word.missingFilePath")}</div>;
  }

  if (isLegacyWordFile(filePath)) {
    return (
      <div className="informio-word-fallback">
        <p className="informio-word-message">{t("word.legacyUnsupported")}</p>
        <button type="button" className="informio-word-open-system" onClick={openInSystem}>
          {t("editor.openInSystem")}
        </button>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="informio-word-message is-error">
        {t("editor.assetDecodeError", { type: t("word.fileType") })}
        {loadErrorDetail ? ` (${loadErrorDetail})` : ""}
      </div>
    );
  }

  return (
    <div className={cn("informio-word-shell", "is-full")}>
      <div ref={viewerRef} className="informio-word-viewer">
        {isLoading || !documentBuffer ? (
          <div className="informio-word-loading">{t("editor.assetLoading")}</div>
        ) : (
          <DocxEditor
            key={`${filePath}-${reloadNonce}`}
            ref={editorRef}
            documentBuffer={documentBuffer}
            documentName={pathBaseName(filePath)}
            documentNameEditable={false}
            mode="editing"
            colorMode="light"
            initialZoom={1}
            showFileOpen={false}
            showHelpMenu={false}
            showOutline={false}
            showOutlineButton={false}
            showZoomControl={false}
            showMarginGuides={false}
            showRuler={false}
            disableFindReplaceShortcuts
            renderLogo={() => null}
            placeholder={null}
            onChange={() => markDirty()}
            className="informio-word-editor"
          />
        )}
      </div>
      {saveError ? <div className="informio-word-save-error-bar">{saveError}</div> : null}
      <WordConflictDialog
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

export function WordViewerSurface({
  document,
  autoSave,
  onDirtyChange,
  onRequestSaveAs
}: {
  document: InformioDocument;
  autoSave: boolean;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
  onRequestSaveAs: () => void;
}) {
  const filePath = document.filePath ?? "";
  return (
    <WordSurface
      documentId={document.id}
      filePath={filePath}
      autoSave={autoSave}
      onDirtyChange={onDirtyChange}
      onRequestSaveAs={onRequestSaveAs}
    />
  );
}
