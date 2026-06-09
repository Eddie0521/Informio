import type { AgentSessionAction, AgentApprovalDecision } from "../types";

export function AgentApprovalCard({
  action,
  fontSize,
  lineHeight,
  onApprovalResponse,
  onOpenActionPath
}: {
  action: AgentSessionAction;
  fontSize: number;
  lineHeight: number;
  onApprovalResponse: (approvalId: string, decision: AgentApprovalDecision) => void;
  onOpenActionPath: (path: string) => void;
}) {
  if (!action.approval) return null;
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
      style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="font-semibold">{action.approval.title || action.label}</div>
        {action.path ? (
          <button
            type="button"
            onClick={() => onOpenActionPath(action.path!)}
            className="rounded px-1.5 py-0.5 font-semibold text-amber-700 hover:bg-amber-100"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            打开
          </button>
        ) : null}
      </div>
      {action.approval.message ? <div className="mb-1 whitespace-pre-wrap">{action.approval.message}</div> : null}
      {action.approval.command ? (
        <pre
          className="mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-white/70 px-2 py-1 text-amber-900"
          style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
        >
          {action.approval.command}
        </pre>
      ) : null}
      {action.approval.cwd ? <div className="mb-2 text-amber-700">cwd: {action.approval.cwd}</div> : null}
      {action.status === "pending" ? (
        <div className="flex flex-wrap gap-1.5">
          {action.approval.availableDecisions.includes("accept") ? (
            <button
              type="button"
              onClick={() => onApprovalResponse(action.approval!.id, "accept")}
              className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700"
              style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
            >
              批准本次
            </button>
          ) : null}
          {action.approval.availableDecisions.includes("acceptForSession") ? (
            <button
              type="button"
              onClick={() => onApprovalResponse(action.approval!.id, "acceptForSession")}
              className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-100"
              style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
            >
              本会话批准
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onApprovalResponse(action.approval!.id, "decline")}
            className="rounded bg-white px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            拒绝
          </button>
        </div>
      ) : null}
    </div>
  );
}
