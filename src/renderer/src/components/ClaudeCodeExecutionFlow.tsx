import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { ProviderExecutionFlowProps, AgentSessionAction } from "../types";
import { classifyAgentAction, summarizeAgentProcess, formatProcessDuration, isCancelledAgentMessage } from "../lib/agent";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentActionDetails } from "./AgentActionDetails";
import { SectionLabel } from "./SectionLabel";

// ─── Shared helpers ───

const hasVisibleActionError = (actions: AgentSessionAction[]) =>
  actions.some((action) => classifyAgentAction(action) !== "system" && action.status === "error");

const firstProcessLine = (processText: string) => processText.trim().split("\n").find(Boolean) ?? "";

export function ClaudeCodeExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const processSummary = summarizeAgentProcess(message.actions);
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  const reasoningPreview = firstProcessLine(message.reasoning);
  const actionError = hasVisibleActionError(visibleActions);
  const statusLabel =
    pendingApprovalActions.length ? "等待授权" : actionError ? "部分失败" : message.status === "tool-executing" ? "执行中" : message.status === "thinking" ? "处理中" : message.status === "error" ? isCancelledAgentMessage(message) ? "已中断" : "运行失败" : "完成";
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
            <div className="mt-1 text-slate-500">{reasoningPreview ? `最近步骤: ${reasoningPreview}` : "最近步骤: Claude Code"}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-slate-400">
              {processSummary.summary ? <span>{processSummary.summary}</span> : null}
              {message.reasoning.trim() ? <span>summary</span> : null}
              {pendingApprovalActions.length ? <span>approval</span> : null}
            </div>
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-slate-400">{duration}</div>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-3 pl-4">
          {message.reasoning.trim() ? (
            <div className="text-[var(--text-muted)]" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>可见过程</SectionLabel>
              <div className="mt-1 whitespace-pre-wrap">{message.reasoning}</div>
            </div>
          ) : null}
          {pendingApprovalActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>授权</SectionLabel>
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
          {visibleActions.length ? (
            <div className="space-y-1.5">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>执行流</SectionLabel>
              {visibleActions.map((action) => (
                <AgentActionDetails
                  key={action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                  mode="claude"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
