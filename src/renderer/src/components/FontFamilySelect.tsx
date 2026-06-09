import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LocalFontOption } from "../types";
import { cn } from "../lib/utils";

export function FontFamilySelect({
  value,
  options,
  onValueChange,
  onOpenChange
}: {
  value: string;
  options: LocalFontOption[];
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((font) => {
      const haystacks = [font.family, font.fullName, font.style]
        .filter(Boolean)
        .map((item) => item!.toLowerCase());
      return haystacks.some((item) => item.includes(normalizedQuery));
    });
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
      onOpenChange(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setQuery("");
      onOpenChange(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative min-w-[260px] max-w-[360px]">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (!nextOpen) setQuery("");
          onOpenChange(nextOpen);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (open) return;
          setOpen(true);
          onOpenChange(true);
        }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md bg-white px-3 text-left text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45"
      >
        <span className="block truncate">{value}</span>
        <span aria-hidden="true">
          <ChevronDown size={14} className="block text-slate-400" />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-full overflow-hidden rounded-lg bg-white p-1 shadow-xl ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-2 pb-2 pt-1">
            <input
              ref={searchInputRef}
              value={query}
              placeholder="搜索字体名，例如 PingFang、苹方、Mono"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  setQuery("");
                  onOpenChange(false);
                }
              }}
              className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-medium text-slate-700 outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filteredOptions.map((font) => (
              <button
                type="button"
                key={`font-family-${font.family}`}
                onClick={() => {
                  onValueChange(font.family);
                  setOpen(false);
                  setQuery("");
                  onOpenChange(false);
                }}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-slate-700 outline-none transition-colors hover:bg-emerald-50 hover:text-slate-950 focus:bg-emerald-50 focus:text-slate-950",
                  font.family === value && "bg-emerald-50 text-slate-950"
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{font.family}</div>
                  {font.fullName && font.fullName !== font.family ? (
                    <div className="truncate text-[11px] font-medium text-slate-500">{font.fullName}</div>
                  ) : null}
                </div>
              </button>
            ))}
            {!filteredOptions.length ? (
              <div className="px-3 py-3 text-[12px] text-slate-500">没有匹配的字体，换个关键词试试。</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
