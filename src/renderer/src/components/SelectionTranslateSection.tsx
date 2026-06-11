import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { TranslationResultText } from "./TranslationResultText";
import { setLastToolbarSelectionText } from "../lib/settings-helpers";

export function SelectionTranslateSection({
  variant = "floating",
  enabled,
  busy,
  response,
  error,
  onEncrypt,
  onTranslate,
  onClose,
  preserveSelection: preserveSelectionHandler,
  className
}: {
  variant?: "floating" | "compact" | "pdf";
  enabled: boolean;
  busy: boolean;
  response: string;
  error?: string;
  onEncrypt?: () => void;
  onTranslate?: () => void;
  onClose?: () => void;
  preserveSelection?: (event: ReactMouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const preserveSelection = (event: ReactMouseEvent<HTMLElement>) => {
    preserveSelectionHandler?.(event);
  };
  const hasOutput = Boolean(response || error);
  const buttonClassName =
    variant === "pdf"
      ? "inline-flex shrink-0 items-center gap-1.5 text-left"
      : variant === "compact"
        ? "inline-flex h-5 items-center gap-0.5 rounded-md px-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        : "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35";
  const closeButtonClassName =
    variant === "compact"
      ? "grid h-5 w-5 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      : "ml-auto grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600";
  const spinnerSize = variant === "compact" ? 12 : 14;
  const spinnerSlotClassName = variant === "compact" ? "inline-flex w-3 items-center justify-center" : "inline-flex w-4 items-center justify-center";
  const containerClassName =
    variant === "compact"
      ? hasOutput
        ? "w-[min(320px,calc(100vw-32px))] space-y-2"
        : "w-fit space-y-0"
      : variant === "pdf"
        ? hasOutput
          ? "min-w-[220px] max-w-[320px] space-y-2"
          : "flex min-w-0 items-center"
        : "space-y-2";
  return (
    <div className={cn(containerClassName, className)}>
      <div className={cn("flex items-center gap-1", variant === "compact" && "w-fit gap-0.5")}>
        {variant === "pdf" || !onEncrypt ? null : (
          <button
            type="button"
            onMouseDown={preserveSelection}
            onClick={onEncrypt}
            disabled={!enabled}
            className={buttonClassName}
          >
            <span>{t("common.encrypt")}</span>
          </button>
        )}
        {onTranslate ? (
          <button
            type="button"
            onMouseDown={preserveSelection}
            onClick={onTranslate}
            disabled={!enabled || busy}
            className={buttonClassName}
          >
            <span>{t("common.translate")}</span>
            <span className={spinnerSlotClassName} aria-hidden="true">
              {busy ? <Loader2 size={spinnerSize} className="animate-spin" /> : null}
            </span>
          </button>
        ) : (
          <div className={cn(buttonClassName, "text-[var(--text-main)]")} aria-live="polite">
            <span>{busy ? t("selectiontoolbar.translating") : t("selectiontoolbar.translationResult")}</span>
            <span className={spinnerSlotClassName} aria-hidden="true">
              {busy ? <Loader2 size={spinnerSize} className="animate-spin" /> : null}
            </span>
          </div>
        )}
        {onClose ? (
          <button
            type="button"
            onMouseDown={preserveSelection}
            onClick={onClose}
            className={closeButtonClassName}
            aria-label={t("selectiontoolbar.closeToolbar")}
          >
            <X size={variant === "compact" ? 12 : 14} />
          </button>
        ) : null}
      </div>
      {response ? (
        <TranslationResultText
          text={response}
          onSelectionChange={(value) => {
            setLastToolbarSelectionText(value);
          }}
        />
      ) : null}
      {error ? (
        <div
          className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700 cursor-text select-text"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
