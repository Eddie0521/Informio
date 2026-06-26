import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import type { InformioDocument } from "../types";

const WordViewerSurface = lazy(() =>
  import("../wordSurface").then((module) => ({ default: module.WordViewerSurface }))
);

export function WordEditorPane({
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
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="informio-editor-shell is-word-document flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<div className="informio-word-loading">{t("editor.assetLoading")}</div>}>
          <WordViewerSurface
            document={document}
            autoSave={autoSave}
            onDirtyChange={onDirtyChange}
            onRequestSaveAs={onRequestSaveAs}
          />
        </Suspense>
      </div>
    </div>
  );
}
