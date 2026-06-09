import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Copy } from "lucide-react";

/**
 * 划词翻译结果文本。
 *
 * - 鼠标可正常拖选、Cmd+C 复制（依赖 user-select: text）
 * - 右上角常驻"复制"按钮一键复制整段，避免依赖不可靠的浏览器选区状态
 *   和右键浮动菜单（Electron 渲染层在 capture 监听时序下偶发吞掉 contextmenu）
 * - onMouseUp 把当前选中文本通过 onSelectionChange 上报给 App，作为 Cmd+C
 *   路径在 DOM 选区被 React 重渲染提前 collapse 时的兜底
 * - onMouseDown 走 stopPropagation，避免外层 markSelectionToolbarInteraction
 *   误判导致划词工具栏被收起
 */
export function TranslationResultText({
  text,
  onSelectionChange
}: {
  text: string;
  onSelectionChange?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard write can fail in some sandboxed contexts; ignore.
    }
    setCopied(true);
  };

  const stopMouseDown = (event: ReactMouseEvent<HTMLElement>) => event.stopPropagation();

  const handleMouseUp = () => {
    if (!onSelectionChange) return;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    const selected = selection?.isCollapsed ? "" : selection?.toString() ?? "";
    onSelectionChange(selected);
  };

  return (
    <div
      className="relative max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 pr-14 text-[12px] leading-5 text-[var(--text-main)] cursor-text select-text"
      onMouseDown={stopMouseDown}
      onMouseUp={handleMouseUp}
    >
      {text}
      <button
        type="button"
        onClick={handleCopy}
        onMouseDown={stopMouseDown}
        className="absolute right-1.5 top-1.5 inline-flex h-6 items-center gap-1 rounded-md border border-slate-200/80 bg-white/90 px-1.5 text-[11px] font-medium text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] backdrop-blur transition-colors hover:bg-white hover:text-slate-900"
        title="复制翻译结果"
        aria-label={copied ? "已复制" : "复制翻译结果"}
      >
        <Copy size={12} />
        <span>{copied ? "已复制" : "复制"}</span>
      </button>
    </div>
  );
}
