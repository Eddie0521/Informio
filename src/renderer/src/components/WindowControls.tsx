import { useTranslation } from "react-i18next";
import { Minus, Square, X } from "lucide-react";

export function WindowControls({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  if (!visible) return null;
  const runWindowControl = (action: "minimize" | "toggleMaximize" | "close") => {
    void window.informio.windowControl(action);
  };
  return (
    <div className="window-controls no-drag flex h-full shrink-0 items-stretch">
      <button
        type="button"
        aria-label={t("windowcontrols.minimize")}
        title={t("windowcontrols.minimize")}
        className="window-control-button"
        onClick={() => runWindowControl("minimize")}
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label={t("windowcontrols.maximizeRestore")}
        title={t("windowcontrols.maximizeRestore")}
        className="window-control-button"
        onClick={() => runWindowControl("toggleMaximize")}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label={t("windowcontrols.close")}
        title={t("windowcontrols.close")}
        className="window-control-button is-close"
        onClick={() => runWindowControl("close")}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
