import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { InformioDocument, PropertyGroup } from "../types";
import { cn } from "../lib/utils";
import { parseFrontmatter } from "../lib/frontmatter";

const stringifyPropertyValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (value === null) return "null";
  return String(value);
};

const propertyFrontmatterCache = new Map<string, { markdown: string; frontmatter: ReturnType<typeof parseFrontmatter> }>();

const cachedDocumentFrontmatter = (document: InformioDocument) => {
  const cached = propertyFrontmatterCache.get(document.id);
  if (cached?.markdown === document.markdown) return cached.frontmatter;
  const frontmatter = parseFrontmatter(document.markdown);
  propertyFrontmatterCache.set(document.id, { markdown: document.markdown, frontmatter });
  return frontmatter;
};

const isFrontmatterPrimitive = (value: unknown) =>
  value === null || ["string", "number", "boolean"].includes(typeof value) || value instanceof Date;

const buildPropertyGroups = (documents: InformioDocument[]): PropertyGroup[] => {
  const propertyMap = new Map<string, Map<string, InformioDocument[]>>();
  const documentIds = new Set(documents.map((document) => document.id));
  Array.from(propertyFrontmatterCache.keys()).forEach((id) => {
    if (!documentIds.has(id)) propertyFrontmatterCache.delete(id);
  });

  for (const document of documents) {
    const frontmatter = cachedDocumentFrontmatter(document);
    if (!frontmatter.hasFrontmatter || frontmatter.error) continue;
    const entries = Object.entries(frontmatter.values);
    if (!entries.length) continue;

    for (const [key, rawValue] of entries) {
      const values = Array.isArray(rawValue)
        ? rawValue.filter((item) => isFrontmatterPrimitive(item)).map(stringifyPropertyValue)
        : isFrontmatterPrimitive(rawValue)
          ? [stringifyPropertyValue(rawValue)]
          : [];
      if (!values.length) continue;

      const valueMap = propertyMap.get(key) ?? new Map<string, InformioDocument[]>();
      propertyMap.set(key, valueMap);
      for (const value of values) {
        const files = valueMap.get(value) ?? [];
        files.push(document);
        valueMap.set(value, files);
      }
    }
  }

  return Array.from(propertyMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, valueMap]) => ({
      name,
      values: Array.from(valueMap.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([value, files]) => ({
          value,
          files: [...files].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        }))
    }));
};

const frontmatterCacheKey = (documents: InformioDocument[]) =>
  documents
    .map((document) => {
      const end = document.markdown.indexOf("\n---");
      if (!document.markdown.startsWith("---")) return `${document.id}:`;
      const block = end > 0 ? document.markdown.slice(0, end + 4) : document.markdown.slice(0, 512);
      return `${document.id}:${block}`;
    })
    .join("|");

export const PropertiesList = memo(function PropertiesList({
  documents,
  activeDocumentId,
  width,
  onSelect
}: {
  documents: InformioDocument[];
  activeDocumentId: string;
  width: number;
  onSelect: (id: string) => void;
}) {
  const frontmatterKey = useMemo(() => frontmatterCacheKey(documents), [documents]);
  const groups = useMemo(() => buildPropertyGroups(documents), [frontmatterKey]);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(() => new Set());
  const [expandedValues, setExpandedValues] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const propertyNames = new Set(groups.map((group) => group.name));
    const valueKeys = new Set(groups.flatMap((group) => group.values.map((item) => `${group.name}::${item.value}`)));

    setExpandedProperties((current) => {
      const next = new Set(Array.from(current).filter((name) => propertyNames.has(name)));
      return next.size === current.size ? current : next;
    });
    setExpandedValues((current) => {
      const next = new Set(Array.from(current).filter((key) => valueKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  const toggleProperty = (name: string) => {
    setExpandedProperties((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleValue = (key: string) => {
    setExpandedValues((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className="context-panel h-full shrink-0" style={{ width }}>
      <div className="space-y-1.5 overflow-y-auto px-3 py-3">
        {groups.length ? (
          groups.map((group) => {
            const propertyOpen = expandedProperties.has(group.name);
            return (
              <div key={group.name} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleProperty(group.name)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-[background-color,transform] active:scale-[0.99] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                >
                  {propertyOpen ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-main)]">{group.name}</span>
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--text-muted)]">{group.values.length}</span>
                </button>

                {propertyOpen ? (
                  <div className="space-y-1">
                    {group.values.map((valueGroup) => {
                      const valueKey = `${group.name}::${valueGroup.value}`;
                      const valueOpen = expandedValues.has(valueKey);
                      return (
                        <div key={valueKey} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => toggleValue(valueKey)}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-[background-color,transform] active:scale-[0.99] hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                            style={{ paddingLeft: 24 }}
                          >
                            {valueOpen ? <ChevronDown size={13} className="shrink-0 text-slate-400" /> : <ChevronRight size={13} className="shrink-0 text-slate-400" />}
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700">{valueGroup.value}</span>
                            <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--text-muted)]">{valueGroup.files.length}</span>
                          </button>
                          {valueOpen ? (
                            <div className="space-y-1">
                              {valueGroup.files.map((document) => {
                                const active = document.id === activeDocumentId;
                                return (
                                  <button
                                    key={`${valueKey}:${document.id}`}
                                    type="button"
                                    onClick={() => onSelect(document.id)}
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-[background-color,transform] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                                      active
                                        ? "bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(15,23,42,0.10)]"
                                        : "hover:bg-white/65"
                                    )}
                                    style={{ paddingLeft: 40 }}
                                  >
                                    <FileText size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                                    <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-main)]">{document.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : null}
      </div>
    </aside>
  );
});
