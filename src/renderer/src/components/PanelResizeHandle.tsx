export function PanelResizeHandle({
  label,
  onPointerDown
}: {
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="panel-resize-handle no-drag relative z-30 h-full w-2 shrink-0 cursor-col-resize touch-none"
    />
  );
}
