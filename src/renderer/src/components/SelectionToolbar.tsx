import type { MouseEvent as ReactMouseEvent } from "react";
import { Languages, Loader2, Shield, X } from "lucide-react";
import type { SelectionToolbarAction } from "../types";
import { cn } from "../lib/utils";
import { markSelectionToolbarInteraction } from "./InsertToolbar";
import { ToolbarGlyphButton } from "./ToolbarGlyphButton";
import { TranslationResultText } from "./TranslationResultText";
import { setLastToolbarSelectionText } from "../lib/settings-helpers";

export function SelectionToolbar({
  visible,
  enabled,
  busy,
  left,
  top,
  formatActions,
  response,
  error,
  onEncrypt,
  onTranslate,
  onClose
}: {
  visible: boolean;
  enabled: boolean;
  busy: boolean;
  left: number;
  top: number;
  formatActions: Array<SelectionToolbarAction & { pressed?: boolean; onClick: () => void }>;
  response: string;
  error?: string;
  onEncrypt?: () => void;
  onTranslate: () => void;
  onClose: () => void;
}) {
  const preserveSelection = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed z-[90] max-w-[360px]"
      style={{ left, top }}
      data-selection-toolbar-safe-area="true"
      onMouseDownCapture={markSelectionToolbarInteraction}
    >
      <div className="surface-card w-fit max-w-[min(420px,calc(100vw-32px))] rounded-xl p-[5px] shadow-[0_14px_36px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]">
        <div className={cn("space-y-2", response || error ? "w-[min(360px,calc(100vw-32px))]" : "w-fit")}>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5">
              {formatActions.map((action) => (
                <ToolbarGlyphButton
                  key={action.id}
                  label={action.label}
                  icon={action.icon}
                  pressed={action.pressed}
                  disabled={!enabled}
                  onMouseDown={preserveSelection}
                  onClick={action.onClick}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-md text-slate-600 transition-[background-color,color,transform] active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                    action.pressed ? "bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]" : "hover:bg-slate-100 hover:text-slate-900",
                    !enabled && "cursor-not-allowed opacity-35 active:scale-100"
                  )}
                />
              ))}
            </div>
            <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
            {onEncrypt ? (
              <ToolbarGlyphButton
                label="加密"
                icon={Shield}
                disabled={!enabled}
                onMouseDown={preserveSelection}
                onClick={onEncrypt}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md text-slate-600 transition-[background-color,color,transform] active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                  "hover:bg-slate-100 hover:text-slate-900",
                  !enabled && "cursor-not-allowed opacity-35 active:scale-100"
                )}
              />
            ) : null}
            <ToolbarGlyphButton
              label="翻译"
              icon={busy ? Loader2 : Languages}
              disabled={!enabled || busy}
              onMouseDown={preserveSelection}
              onClick={onTranslate}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md text-slate-600 transition-[background-color,color,transform] active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                "hover:bg-slate-100 hover:text-slate-900",
                (!enabled || busy) && "cursor-not-allowed opacity-35 active:scale-100"
              )}
              iconClassName={busy ? "animate-spin" : undefined}
            />
            <button
              type="button"
              onMouseDown={preserveSelection}
              onClick={onClose}
              className="ml-0.5 grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="关闭工具栏"
            >
              <X size={12} />
            </button>
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
      </div>
    </div>
  );
}
