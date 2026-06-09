import type { AgentSessionAction, AgentApprovalDecision } from "../types";
import { cn } from "../lib/utils";
import { AgentApprovalCard } from "./AgentApprovalCard";

const renderActionStatusDot = (status: AgentSessionAction["status"]) =>
  cn("h-2 w-2 rounded-full", status === "pending" ? "bg-amber-400" : status === "error" ? "bg-red-500" : "bg-emerald-500");

export function AgentActionDetails({
  action,
  fontSize,
  lineHeight,
  onApprovalResponse,
  onOpenActionPath,
  mode = "generic"
}: {
  action: AgentSessionAction;
  fontSize: number;
  lineHeight: number;
  onApprovalResponse: (approvalId: string, decision: AgentApprovalDecision) => void;
  onOpenActionPath: (path: string) => void;
  mode?: "generic" | "opencode" | "claude" | "codex";
}) {
  const shellClassName =
    mode === "opencode"
      ? "px-0 py-1 text-slate-700"
      : mode === "codex"
        ? "px-0 py-1 text-slate-700"
        : "px-0 py-1 text-slate-600";
  return (
    <details className={shellClassName} style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
      <summary className="flex cursor-default list-none items-center gap-2">
        <span className={renderActionStatusDot(action.status)} />
        <span className="min-w-0 flex-1 truncate font-semibold">{action.label || action.tool}</span>
        {action.path ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onOpenActionPath(action.path!);
            }}
            className="rounded px-1.5 py-0.5 font-semibold text-slate-500 hover:bg-slate-200"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            打开
          </button>
        ) : null}
      </summary>
      {action.approval && action.status !== "pending" ? (
        <div className="mt-2">
          <AgentApprovalCard
            action={action}
            fontSize={fontSize}
            lineHeight={lineHeight}
            onApprovalResponse={onApprovalResponse}
            onOpenActionPath={onOpenActionPath}
          />
        </div>
      ) : null}
      {action.input && !action.approval ? (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap" style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
          {action.input}
        </pre>
      ) : null}
      {action.output ? (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap" style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
          {action.output}
        </pre>
      ) : null}
    </details>
  );
}
