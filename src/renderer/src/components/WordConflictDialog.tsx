import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export function WordConflictDialog({
  open,
  fileName,
  hasUnsavedChanges,
  onReload,
  onKeepLocal,
  onSaveAs,
  onClose
}: {
  open: boolean;
  fileName: string;
  hasUnsavedChanges: boolean;
  onReload: () => void;
  onKeepLocal: () => void;
  onSaveAs: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[92] bg-slate-950/22 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[93] w-[min(480px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[15px] font-extrabold">{t("word.conflictTitle")}</Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                {t("word.conflictDescription", { fileName })}
                {hasUnsavedChanges ? ` ${t("word.conflictUnsavedWarning")}` : ""}
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label={t("common.close")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={onReload}
            >
              {t("word.conflictReload")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={onKeepLocal}
            >
              {t("word.conflictKeepLocal")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md bg-[var(--accent)] px-3 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
              onClick={onSaveAs}
            >
              {t("word.conflictSaveAs")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
