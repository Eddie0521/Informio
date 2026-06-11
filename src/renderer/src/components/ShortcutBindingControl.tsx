import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { acceleratorFromKeyboardEvent, acceleratorToDisplay } from "../../../shared/shortcuts";
import { shortcutDisplayPlatform } from "../lib/path";

export function ShortcutBindingControl({
  value,
  recording,
  onStartRecording,
  onCapture,
  onClear,
  onRestoreDefault
}: {
  value?: string;
  recording: boolean;
  onStartRecording: () => void;
  onCapture: (accelerator: string) => void;
  onClear: () => void;
  onRestoreDefault: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onStartRecording}
        onKeyDown={(event) => {
          if (!recording) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            onStartRecording();
            return;
          }
          const accelerator = acceleratorFromKeyboardEvent(event);
          if (accelerator) onCapture(accelerator);
        }}
        className={cn(
          "min-w-[132px] rounded-md bg-white px-2.5 py-1.5 text-left font-mono text-[12px] text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
          recording && "bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.28)]"
        )}
      >
        {recording ? t("shortcutbinding.pressNewKey") : acceleratorToDisplay(value, shortcutDisplayPlatform)}
      </button>
      <button
        type="button"
        onClick={onRestoreDefault}
        className="rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        {t("shortcutbinding.default")}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!value}
        className="rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {t("shortcutbinding.clear")}
      </button>
    </div>
  );
}
