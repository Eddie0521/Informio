import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Clipboard, ClipboardPaste, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";

export type SpreadsheetMenuTarget =
  | { kind: "cell"; row: number; column: number }
  | { kind: "row"; row: number }
  | { kind: "column"; column: number }
  | { kind: "sheet"; sheetIndex: number }
  | { kind: "sheetBar" };

export type SpreadsheetContextMenuState = {
  x: number;
  y: number;
  target: SpreadsheetMenuTarget;
};

type SpreadsheetContextMenuProps = {
  state: SpreadsheetContextMenuState;
  canDeleteSheet: boolean;
  onClose: () => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onDeleteRow: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDeleteColumn: () => void;
  onClearCell: () => void;
  onClearRow: () => void;
  onClearColumn: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onAddSheet: () => void;
  onRenameSheet: () => void;
  onDeleteSheet: () => void;
};

const MenuButton = ({
  label,
  icon: Icon,
  onClick,
  destructive = false,
  disabled = false
}: {
  label: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    className={cn(
      "flex h-7 w-full items-center gap-2 px-3 text-left text-[11px] font-semibold transition-[background-color,color] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45",
      destructive ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100"
    )}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }}
  >
    {Icon ? <Icon size={12} strokeWidth={2} /> : <span className="inline-block w-[12px]" />}
    <span>{label}</span>
  </button>
);

const MenuDivider = () => <div className="my-1 h-px bg-slate-200" />;

const MENU_VIEWPORT_PADDING = 8;

const clampMenuPosition = (x: number, y: number, width: number, height: number) => {
  const padding = MENU_VIEWPORT_PADDING;
  const maxX = Math.max(padding, window.innerWidth - width - padding);
  const maxY = Math.max(padding, window.innerHeight - height - padding);
  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY)
  };
};

export function SpreadsheetContextMenu({
  state,
  canDeleteSheet,
  onClose,
  onInsertRowAbove,
  onInsertRowBelow,
  onDeleteRow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onDeleteColumn,
  onClearCell,
  onClearRow,
  onClearColumn,
  onCopy,
  onPaste,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet
}: SpreadsheetContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({ x: state.x, y: state.y }));

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition(clampMenuPosition(state.x, state.y, width, height));
  }, [state.x, state.y, state.target, canDeleteSheet, t]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  const showRow = state.target.kind === "cell" || state.target.kind === "row";
  const showColumn = state.target.kind === "cell" || state.target.kind === "column";
  const showCell = state.target.kind === "cell";
  const showSheet = state.target.kind === "sheet" || state.target.kind === "sheetBar";

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-[80] min-w-48 overflow-hidden rounded-md bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {showRow ? (
        <>
          <MenuButton label={t("spreadsheet.insertRowAbove")} icon={Plus} onClick={() => run(onInsertRowAbove)} />
          <MenuButton label={t("spreadsheet.insertRowBelow")} icon={Plus} onClick={() => run(onInsertRowBelow)} />
          <MenuButton label={t("spreadsheet.deleteRow")} icon={Trash2} destructive onClick={() => run(onDeleteRow)} />
        </>
      ) : null}
      {showRow && showColumn ? <MenuDivider /> : null}
      {showColumn ? (
        <>
          <MenuButton label={t("spreadsheet.insertColumnLeft")} icon={Plus} onClick={() => run(onInsertColumnLeft)} />
          <MenuButton label={t("spreadsheet.insertColumnRight")} icon={Plus} onClick={() => run(onInsertColumnRight)} />
          <MenuButton label={t("spreadsheet.deleteColumn")} icon={Trash2} destructive onClick={() => run(onDeleteColumn)} />
        </>
      ) : null}
      {showCell ? (
        <>
          <MenuDivider />
          <MenuButton label={t("spreadsheet.copy")} icon={Copy} onClick={() => run(onCopy)} />
          <MenuButton label={t("spreadsheet.paste")} icon={ClipboardPaste} onClick={() => run(onPaste)} />
          <MenuButton label={t("spreadsheet.clearCell")} icon={Clipboard} onClick={() => run(onClearCell)} />
        </>
      ) : null}
      {state.target.kind === "row" ? (
        <MenuButton label={t("spreadsheet.clearRow")} icon={Clipboard} onClick={() => run(onClearRow)} />
      ) : null}
      {state.target.kind === "column" ? (
        <MenuButton label={t("spreadsheet.clearColumn")} icon={Clipboard} onClick={() => run(onClearColumn)} />
      ) : null}
      {showSheet ? (
        <>
          {(showRow || showColumn || showCell) && <MenuDivider />}
          <MenuButton label={t("spreadsheet.addSheet")} icon={Plus} onClick={() => run(onAddSheet)} />
          {state.target.kind === "sheet" ? (
            <>
              <MenuButton label={t("spreadsheet.renameSheet")} icon={Pencil} onClick={() => run(onRenameSheet)} />
              <MenuButton
                label={t("spreadsheet.deleteSheet")}
                icon={Trash2}
                destructive
                disabled={!canDeleteSheet}
                onClick={() => run(onDeleteSheet)}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
