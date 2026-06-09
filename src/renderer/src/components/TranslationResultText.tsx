import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Copy } from "lucide-react";

type CopyMenu = { x: number; y: number; selected: string };

/**
 * 划词翻译结果文本。
 *
 * - 鼠标可正常拖选、Cmd+C 复制（依赖父级 user-select: text）
 * - 选区非空时右键：拦掉默认菜单，在右键处弹出浮动"复制选中文本"按钮
 * - 关闭：Esc / 容器外 mousedown / 滚动 / resize / 复制完成
 * - onMouseDown 走 stopPropagation，避免外层 markSelectionToolbarInteraction
 *   误判导致划词工具栏被收起
 */
export function TranslationResultText({ text }: { text: string }) {
  const [menu, setMenu] = useState<CopyMenu | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-translation-copy-menu]")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    const closeOnViewportChange = () => setMenu(null);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [menu]);

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed) return;
    const selected = sel.toString();
    if (!selected.trim()) return;
    event.preventDefault();
    const menuWidth = 168;
    const menuHeight = 36;
    const padding = 8;
    const x = Math.max(padding, Math.min(event.clientX, window.innerWidth - menuWidth - padding));
    const y = Math.max(padding, Math.min(event.clientY, window.innerHeight - menuHeight - padding));
    setMenu({ x, y, selected });
  };

  const handleCopy = () => {
    if (!menu) return;
    void navigator.clipboard?.writeText(menu.selected);
    setMenu(null);
  };

  return (
    <>
      <div
        className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-[var(--text-main)] cursor-text select-text"
        onContextMenu={handleContextMenu}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {text}
      </div>
      {menu ? (
        <div
          data-translation-copy-menu
          className="fixed z-[100] inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-1 text-[12px] font-medium text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.06)]"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-6 items-center gap-1 rounded px-2 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Copy size={12} />
            <span>复制选中文本</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
