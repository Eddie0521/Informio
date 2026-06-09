import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/utils";

export function IconButton({
  label,
  children,
  className,
  disabled,
  onClick,
  pressed
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-md text-slate-600 transition-[background-color,transform,color] duration-150 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
            disabled && "cursor-not-allowed opacity-40 active:scale-100",
            pressed ? "bg-emerald-50 text-slate-950 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.24)]" : "hover:bg-slate-100",
            className
          )}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          className="z-50 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
