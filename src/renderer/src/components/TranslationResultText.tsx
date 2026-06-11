import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Copy } from "lucide-react";

/**
 * 划词翻译结果文本。
 *
 * - 鼠标可正常拖选、Cmd+C 复制（依赖 user-select: text）
 * - 右上角常驻"复制"按钮一键复制整段，避免依赖不可靠的浏览器选区状态
 *   和右键浮动菜单（Electron 渲染层在 capture 监听时序下偶发吞掉 contextmenu）
 * - selectionchange 全局监听 + onMouseUp 双重保障，确保 lastToolbarSelectionText
 *   始终持有翻译结果中最新的拖选文本，供 App 的 copyCurrentSelection 兜底
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
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("Translation clipboard write failed:", error);
    }
    setCopied(true);
  };

  const stopMouseDown = (event: ReactMouseEvent<HTMLElement>) => event.stopPropagation();

  // Intercept Cmd/Ctrl+C in the capture phase so embedpdf's document-level
  // keydown handler (which copies the PDF selection and calls preventDefault,
  // blocking the Electron menu accelerator) never fires when the user has a
  // selection inside this panel.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      if (!(anchor && container.contains(anchor)) && !(focus && container.contains(focus))) return;
      event.preventDefault();
      event.stopPropagation();
      void navigator.clipboard.writeText(selection.toString());
    };
    container.addEventListener("keydown", handleKeyDown, true);
    return () => container.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Track selection changes globally so lastToolbarSelectionText is always fresh.
  // The mouseup handler alone is unreliable: in Electron the menu accelerator for
  // Cmd+C can fire before the mouseup callback updates the cached text, and the
  // DOM Selection may already have collapsed by the time copyCurrentSelection runs.
  useEffect(() => {
    const handleSelectionChange = () => {
      const container = containerRef.current;
      if (!container) return;
      const callback = onSelectionChangeRef.current;
      if (!callback) return;
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (!selection || selection.rangeCount === 0) {
        callback("");
        return;
      }
      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      const inside =
        (anchor && container.contains(anchor)) || (focus && container.contains(focus));
      if (!inside) return;
      callback(selection.isCollapsed ? "" : selection.toString());
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const handleMouseUp = () => {
    if (!onSelectionChange) return;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    const selected = selection?.isCollapsed ? "" : selection?.toString() ?? "";
    onSelectionChange(selected);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 pr-14 text-[12px] leading-5 text-[var(--text-main)] cursor-text select-text focus:outline-none"
      onMouseDown={stopMouseDown}
      onMouseUp={handleMouseUp}
    >
      {text}
      <button
        type="button"
        onClick={handleCopy}
        onMouseDown={stopMouseDown}
        className="absolute right-1.5 top-1.5 inline-flex h-6 items-center gap-1 rounded-md border border-slate-200/80 bg-white/90 px-1.5 text-[11px] font-medium text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] backdrop-blur transition-colors hover:bg-white hover:text-slate-900"
        title={t("translationresult.copyResult")}
        aria-label={copied ? t("translationresult.copied") : t("translationresult.copyResult")}
      >
        <Copy size={12} />
        <span>{copied ? t("translationresult.copied") : t("translationresult.copy")}</span>
      </button>
    </div>
  );
}
