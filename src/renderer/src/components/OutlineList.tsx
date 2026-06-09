import { useEffect, useMemo, useState } from "react";
import type { InformioDocument, OutlineItem } from "../types";
import { cn } from "../lib/utils";

function getDocumentOutline(markdown: string): OutlineItem[] {
  return markdown
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      return {
        id: `${index}-${match[2]}`,
        title: match[2].replace(/[#*_`]/g, "").trim(),
        level: match[1].length,
        line: index + 1,
        order: -1
      };
    })
    .filter((item): item is OutlineItem => Boolean(item))
    .map((item, order) => ({ ...item, order }));
}

export function OutlineList({
  document,
  width,
  onJump
}: {
  document: InformioDocument;
  width: number;
  onJump: (item: OutlineItem) => void;
}) {
  const outline = useMemo(() => getDocumentOutline(document.markdown), [document.markdown]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const baseLevel = outline.reduce((level, item) => Math.min(level, item.level), 6);

  useEffect(() => {
    if (!activeOutlineId || outline.some((item) => item.id === activeOutlineId)) return;
    setActiveOutlineId(null);
  }, [activeOutlineId, outline]);

  return (
    <aside className="context-panel informio-outline-panel h-full shrink-0" style={{ width }}>
      <div className="informio-outline-list">
        {outline.length ? (
          outline.map((item) => {
            const depth = Math.max(0, item.level - baseLevel);
            const active = activeOutlineId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveOutlineId(item.id);
                  onJump(item);
                }}
                className={cn("informio-outline-item", active && "is-active", `is-level-${item.level}`)}
                style={{ paddingLeft: 18 + depth * 18 }}
              >
                <span>{item.title}</span>
              </button>
            );
          })
        ) : (
          <div className="informio-outline-empty">暂无大纲</div>
        )}
      </div>
    </aside>
  );
}
