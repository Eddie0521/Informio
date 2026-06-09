import { Minus, Square, X } from "lucide-react";

export function WindowControls({ visible }: { visible: boolean }) {
  if (!visible) return null;
  const runWindowControl = (action: "minimize" | "toggleMaximize" | "close") => {
    void window.informio.windowControl(action);
  };
  return (
    <div className="window-controls no-drag flex h-full shrink-0 items-stretch">
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        className="window-control-button"
        onClick={() => runWindowControl("minimize")}
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="最大化或还原"
        title="最大化或还原"
        className="window-control-button"
        onClick={() => runWindowControl("toggleMaximize")}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        className="window-control-button is-close"
        onClick={() => runWindowControl("close")}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
