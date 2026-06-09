import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { ProviderExecutionFlowProps, AgentSessionAction } from "../types";
import { classifyAgentAction, formatProcessDuration, isCancelledAgentMessage } from "../lib/agent";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentActionDetails } from "./AgentActionDetails";
import { ProviderSummaryBadges } from "./ProviderSummaryBadges";
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

export function OpenCodeExecutionFlow(props: ProviderExecutionFlowProps) {
  const { message, transcriptFontSize, transcriptLineHeight, processFontSize, processLineHeight, isExpanded, now, onToggleExpanded, onApprovalResponse, onOpenActionPath } = props;
  const visibleActions = message.actions.filter((action) => classifyAgentAction(action) !== "system");
  const pendingApprovalActions = visibleActions.filter((action) => action.approval && action.status === "pending");
  const completedActions = visibleActions.filter((action) => action.status !== "pending");
  const actionError = hasVisibleActionError(visibleActions);
  const duration = formatProcessDuration((message.completedAt ?? now) - message.submittedAt);
  const badgeFontSize = Math.max(10, processFontSize - 1);
  const lastAction = latestVisibleAction(visibleActions);
  const hasProcessContent = Boolean(message.reasoning.trim() || visibleActions.length || pendingApprovalActions.length);
  const subtitle =
    pendingApprovalActions.length
      ? `需要确认: ${actionShortLabel(pendingApprovalActions[0]) || "当前操作"}`
      : lastAction
        ? `最近步骤: ${actionShortLabel(lastAction)}`
        : message.reasoning.trim()
          ? "正在组织回复"
          : "";
  const phaseLabel =
    pendingApprovalActions.length
      ? "等待授权"
      : actionError
        ? "部分失败"
      : message.status === "tool-executing"
        ? "运行工具"
        : message.status === "thinking"
          ? "生成中"
          : message.status === "error"
            ? isCancelledAgentMessage(message) ? "已中断" : "运行失败"
            : "已完成";
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
              <span className="font-semibold text-slate-700">{phaseLabel}</span>
              {message.status === "thinking" || message.status === "tool-executing" ? (
                <Loader2 size={Math.max(10, transcriptFontSize)} className="shrink-0 animate-spin text-slate-400" />
              ) : null}
            </div>
            {subtitle ? <div className="mt-1 text-slate-500">{subtitle}</div> : null}
            <ProviderSummaryBadges actions={visibleActions} fontSize={badgeFontSize} />
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-slate-400">{duration}</div>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-3 pl-4">
          {message.reasoning.trim() ? (
            <div className="text-slate-600" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>可见过程</SectionLabel>
              <div className="whitespace-pre-wrap">{message.reasoning}</div>
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
          {completedActions.length ? (
            <div className="space-y-2">
              <SectionLabel fontSize={Math.max(11, processFontSize - 1)}>执行流</SectionLabel>
              {completedActions.map((action) => (
                <AgentActionDetails
                  key={action.toolId}
                  action={action}
                  fontSize={processFontSize}
                  lineHeight={processLineHeight}
                  onApprovalResponse={onApprovalResponse}
                  onOpenActionPath={onOpenActionPath}
                  mode="opencode"
                />
              ))}
            </div>
          ) : null}
          {!message.reasoning.trim() && !visibleActions.length && (message.status === "thinking" || message.status === "tool-executing") ? (
            <div className="text-slate-500" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              正在等待 OpenCode 返回阶段事件。
            </div>
          ) : null}
          {!hasProcessContent && message.status !== "thinking" && message.status !== "tool-executing" ? (
            <div className="text-slate-400" style={{ fontSize: `${processFontSize}px`, lineHeight: `${processLineHeight}px` }}>
              这次运行没有返回可展示的中间过程。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
