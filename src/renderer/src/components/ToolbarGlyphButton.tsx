import type { MouseEvent as ReactMouseEvent } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ToolbarIcon } from "../types";
import { cn } from "../lib/utils";

export function ToolbarGlyphButton({
  label,
  icon: Icon,
  onClick,
  onMouseDown,
  pressed,
  disabled,
  className,
  iconClassName,
  iconSize = 14,
  tooltipSide = "top",
  ariaHasPopup,
  badgeColor
}: {
  label: string;
  icon: ToolbarIcon;
  onClick?: () => void;
  onMouseDown?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  iconSize?: number;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  ariaHasPopup?: "menu" | "listbox" | "tree" | "grid" | "dialog" | true;
  badgeColor?: string | null;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          aria-haspopup={ariaHasPopup}
          disabled={disabled}
          onMouseDown={onMouseDown}
          onClick={onClick}
          className={cn("relative", className)}
        >
          <Icon size={iconSize} strokeWidth={1.9} className={iconClassName} />
          {badgeColor ? (
            <span
              aria-hidden="true"
              className="absolute bottom-[4px] right-[4px] h-[6px] w-[6px] rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.92)]"
              style={{ backgroundColor: badgeColor }}
            />
          ) : null}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={tooltipSide} className="z-50 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
