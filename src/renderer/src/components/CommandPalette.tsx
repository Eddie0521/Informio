import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { CommandPaletteItem } from "../types";
import { cn } from "../lib/utils";

const fuzzyScore = (item: CommandPaletteItem, query: string) => {
  const haystack = `${item.title} ${item.subtitle ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  let index = 0;
  let score = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, index);
    if (found < 0) return 0;
    score += found === index ? 3 : 1;
    index = found + 1;
  }
  return score + (haystack.includes(needle) ? 10 : 0);
};

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: CommandPaletteItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const matches = useMemo(
    () =>
      commands
        .map((command) => ({ command, score: fuzzyScore(command, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
        .slice(0, 80)
        .map((item) => item.command),
    [commands, query]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeItem = listRef.current?.querySelector<HTMLButtonElement>(".command-palette-item.is-active") ?? itemRefs.current[index];
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [index, matches, open]);

  useEffect(() => {
    if (!open) return;
    setIndex((value) => Math.min(value, Math.max(0, matches.length - 1)));
  }, [matches.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((value) => Math.min(value + 1, Math.max(0, matches.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "Enter" && matches[index]) {
        event.preventDefault();
        matches[index].run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, matches, onClose, open]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop no-drag" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-palette-input">
          <Search size={16} />
          <input ref={inputRef} value={query} placeholder={t("commandpalette.searchPlaceholder")} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} />
          <kbd>Esc</kbd>
        </div>
        <div ref={listRef} className="command-palette-list">
          {matches.map((command, itemIndex) => (
            <button
              key={command.id}
              ref={(element) => {
                itemRefs.current[itemIndex] = element;
              }}
              type="button"
              className={cn("command-palette-item", itemIndex === index && "is-active")}
              onMouseEnter={() => setIndex(itemIndex)}
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span>
                <strong>{command.title}</strong>
                {command.subtitle ? <small>{command.subtitle}</small> : null}
              </span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          ))}
          {!matches.length ? <div className="command-palette-empty">{t("commandpalette.noMatches")}</div> : null}
        </div>
      </div>
    </div>
  );
}
