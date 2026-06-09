import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { ProviderExecutionFlowProps } from "../types";
import { classifyAgentAction, summarizeAgentProcess, formatProcessDuration } from "../lib/agent";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentActionDetails } from "./AgentActionDetails";

export function GenericExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const processSummary = summarizeAgentProcess(message.actions);
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  return (
    <>
      {pendingApprovalActions.length ? (
        <div className="mb-2 space-y-2">
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
      <div className="mb-2">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex max-w-full items-center gap-1 py-0.5 text-left text-[var(--text-muted)]"
          style={{ fontSize: `${transcriptFontSize}px`, lineHeight: `${transcriptLineHeight}px` }}
        >
          {isExpanded ? <ChevronDown size={Math.max(10, transcriptFontSize)} className="shrink-0" /> : <ChevronRight size={Math.max(10, transcriptFontSize)} className="shrink-0" />}
          <span className="text-[var(--text-muted)]">已处理 {duration}</span>
          {processSummary.summary ? <span className="min-w-0 truncate text-slate-400">{processSummary.summary}</span> : null}
          {message.status === "thinking" || message.status === "tool-executing" ? (
            <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
          ) : null}
        </button>
        {isExpanded ? (
          <div className="pb-2 pl-5">
            {message.reasoning.trim() ? (
              <div className="mb-3 text-[var(--text-muted)]" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
                <div className="font-semibold text-slate-700">可见过程</div>
                <div className="mt-1 whitespace-pre-wrap">{message.reasoning}</div>
              </div>
            ) : null}
            {visibleActions.length ? (
              <div className="space-y-1.5">
                {visibleActions.map((action) => (
                  <AgentActionDetails
                    key={action.toolId}
                    action={action}
                    fontSize={processFontSize}
                    lineHeight={processLineHeight}
                    onApprovalResponse={onApprovalResponse}
                    onOpenActionPath={onOpenActionPath}
                  />
                ))}
              </div>
            ) : null}
            {!message.reasoning.trim() && !visibleActions.length ? (
              <div className="text-slate-500" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
                {message.status === "thinking" || message.status === "tool-executing"
                  ? "正在等待 Agent 返回可展示的过程事件。"
                  : "这次运行没有返回可展示的过程事件。"}
              </div>
            ) : null}
            {processSummary.hiddenSystemActions ? (
              <div className="mt-3 text-slate-400" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
                已隐藏 {processSummary.hiddenSystemActions} 个既定上下文步骤
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
