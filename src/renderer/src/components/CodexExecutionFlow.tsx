import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { ProviderExecutionFlowProps, AgentSessionAction } from "../types";
import { classifyAgentAction, formatProcessDuration } from "../lib/agent";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentActionDetails } from "./AgentActionDetails";
import { SectionLabel } from "./SectionLabel";

// ─── Shared helpers ───

const latestVisibleAction = (actions: AgentSessionAction[]) => {
  const visible = actions.filter((action) => classifyAgentAction(action) !== "system");
  return visible.at(-1);
};

const hasVisibleActionError = (actions: AgentSessionAction[]) =>
  actions.some((action) => classifyAgentAction(action) !== "system" && action.status === "error");

const actionShortLabel = (action?: AgentSessionAction) => {
  if (!action) return "";
  return (action.label || action.tool || "").replace(/\s+/g, " ").trim();
};

const isVerificationAction = (action: AgentSessionAction) => {
  const haystack = `${action.tool} ${action.label} ${action.input ?? ""}`.toLowerCase();
  return /test|typecheck|build|lint|verify|check|pytest|cargo test|pnpm build|tsc/.test(haystack);
};

export function CodexExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const verificationActions = visibleActions.filter((action) => isVerificationAction(action));
  const actionError = hasVisibleActionError(visibleActions);
  const grouped = {
    command: visibleActions.filter((action) => classifyAgentAction(action) === "command" && !isVerificationAction(action)),
    edit: visibleActions.filter((action) => classifyAgentAction(action) === "edit"),
    inspect: visibleActions.filter((action) => {
      const category = classifyAgentAction(action);
      return category === "read" || category === "search" || category === "explore";
    }),
    other: visibleActions.filter((action) => {
      const category = classifyAgentAction(action);
      return !["command", "edit", "read", "search", "explore"].includes(category) && !isVerificationAction(action);
    })
  };
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  const summary = [
    grouped.inspect.length ? `检查 ${grouped.inspect.length}` : "",
    grouped.command.length ? `命令 ${grouped.command.length}` : "",
    grouped.edit.length ? `改动 ${grouped.edit.length}` : "",
    verificationActions.length ? `验证 ${verificationActions.length}` : ""
  ].filter(Boolean).join(" · ");
  const statusLabel =
    pendingApprovalActions.length ? "等待授权" : actionError ? "部分失败" : message.status === "tool-executing" ? "执行中" : message.status === "thinking" ? "处理中" : message.status === "error" ? "失败" : "完成";
  const lastAction = latestVisibleAction(visibleActions);
  return (
    <div className="mb-3 px-0 py-1">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-start justify-between gap-3 text-left"
        style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
      >
        <div className="flex min-w-0 items-start gap-2">
          {isExpanded ? <ChevronDown size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={Math.max(10, transcriptFontSize)} className="mt-0.5 shrink-0 text-slate-400" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">{statusLabel}</span>
              {message.status === "thinking" || message.status === "tool-executing" ? (
                <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
              ) : null}
            </div>
            <div className="mt-1 text-slate-500">{lastAction ? `最近步骤: ${actionShortLabel(lastAction)}` : "最近步骤: Codex"}</div>
            {summary ? <div className="mt-1 text-slate-400">{summary}</div> : null}
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-slate-400">{duration}</div>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-3 pl-4">
          {message.reasoning.trim() ? (
            <div className="text-slate-400" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>可见过程</SectionLabel>
              <div className="whitespace-pre-wrap">{message.reasoning}</div>
            </div>
          ) : null}
          {pendingApprovalActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>Approval</SectionLabel>
              {pendingApprovalActions.map((action) => (
                <AgentApprovalCard
                  key={action.approval?.id ?? action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                />
              ))}
            </div>
          ) : null}
          {([
            ["检查", grouped.inspect],
            ["命令", grouped.command],
            ["改动", grouped.edit],
            ["验证", verificationActions],
            ["其他", grouped.other]
          ] as Array<[string, AgentSessionAction[]]>)
            .filter(([, actions]) => actions.length)
            .map(([label, actions]) => (
              <div key={label}>
                <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>{label}</SectionLabel>
                <div className="space-y-1.5">
                  {actions.map((action) => (
                    <AgentActionDetails
                      key={action.toolId}
                      action={action}
                      fontSize={processFontSize}
                      lineHeight={processLineHeight}
                      onApprovalResponse={onApprovalResponse}
                      onOpenActionPath={onOpenActionPath}
                      mode="codex"
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
