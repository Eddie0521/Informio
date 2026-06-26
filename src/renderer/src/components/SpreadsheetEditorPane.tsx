import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import type { InformioDocument } from "../types";

const SpreadsheetViewerSurface = lazy(() =>
  import("../spreadsheetSurface").then((module) => ({ default: module.SpreadsheetViewerSurface }))
);

export function SpreadsheetEditorPane({
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
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="informio-editor-shell is-spreadsheet-document flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<div className="informio-spreadsheet-message">{t("editor.assetLoading")}</div>}>
          <SpreadsheetViewerSurface
            document={document}
            autoSave={autoSave}
            onDirtyChange={onDirtyChange}
            onFilePathChange={onFilePathChange}
            onRequestSaveAs={onRequestSaveAs}
          />
        </Suspense>
      </div>
    </div>
  );
}
