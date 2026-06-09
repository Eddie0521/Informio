import { Search, FileText, Pencil, Code2, Shield, Bot } from "lucide-react";
import type { AgentSessionAction, AgentProcessCategory } from "../types";
import { processCategoryLabel } from "../constants";
import { classifyAgentAction } from "../lib/agent";

const actionCategoryIcon = (category: AgentProcessCategory) => {
  if (category === "search") return Search;
  if (category === "read") return FileText;
  if (category === "edit") return Pencil;
  if (category === "command") return Code2;
  if (category === "approval") return Shield;
  return Bot;
};

const summarizeByCategory = (actions: AgentSessionAction[]) => {
  const counts = new Map<AgentProcessCategory, number>();
  actions.forEach((action) => {
    const category = classifyAgentAction(action);
    if (category === "system") return;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  return Array.from(counts.entries());
};

export function ProviderSummaryBadges({
  actions,
  fontSize
}: {
  actions: AgentSessionAction[];
  fontSize: number;
}) {
  const segments = summarizeByCategory(actions);
  if (!segments.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
      {segments.map(([category, count]) => {
        const Icon = actionCategoryIcon(category);
        const label = category === "other" ? "step" : processCategoryLabel[category as Exclude<AgentProcessCategory, "system">];
        return (
          <span key={category} className="inline-flex items-center gap-1" style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}>
            <Icon size={Math.max(10, fontSize)} />
            <span>{label}</span>
            <span className="font-semibold text-slate-600">{count}</span>
          </span>
        );
      })}
    </div>
  );
}
