import { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { ConflictDiffLine, DocumentConflict, InformioDocument, MarkdownDiffHunk } from "../types";

// ─── Diff constants ───

const MAX_DIFF_MATRIX_CELLS = 600_000;
const MAX_CONFLICT_PREVIEW_LINES = 80;
const MAX_CONFLICT_PREVIEW_CHARS = 4000;

// ─── Diff utilities ───

const canBuildDiffMatrix = (leftLength: number, rightLength: number) =>
  (leftLength + 1) * (rightLength + 1) <= MAX_DIFF_MATRIX_CELLS;

const conflictPreviewText = (lines: string[]) => {
  const text = lines.slice(0, MAX_CONFLICT_PREVIEW_LINES).join(" / ");
  return text.length > MAX_CONFLICT_PREVIEW_CHARS ? `${text.slice(0, MAX_CONFLICT_PREVIEW_CHARS)}...` : text;
};

const buildMarkdownDiffHunks = (base: string[], next: string[]): MarkdownDiffHunk[] => {
  const table = Array.from({ length: base.length + 1 }, () => Array(next.length + 1).fill(0) as number[]);
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = next.length - 1; j >= 0; j -= 1) {
      table[i][j] = base[i] === next[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const hunks: MarkdownDiffHunk[] = [];
  let i = 0;
  let j = 0;
  let current: MarkdownDiffHunk | null = null;

  const startHunk = () => {
    if (!current) current = { baseStart: i, baseEnd: i, replacement: [] };
    return current;
  };
  const closeHunk = () => {
    if (!current) return;
    hunks.push(current);
    current = null;
  };

  while (i < base.length && j < next.length) {
    if (base[i] === next[j]) {
      closeHunk();
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      const hunk = startHunk();
      hunk.baseEnd = i + 1;
      i += 1;
    } else {
      const hunk = startHunk();
      hunk.replacement.push(next[j]);
      j += 1;
    }
  }

  while (i < base.length) {
    const hunk = startHunk();
    hunk.baseEnd = i + 1;
    i += 1;
  }
  while (j < next.length) {
    const hunk = startHunk();
    hunk.replacement.push(next[j]);
    j += 1;
  }
  closeHunk();
  return hunks;
};

const sameHunkReplacement = (left: MarkdownDiffHunk, right: MarkdownDiffHunk) =>
  left.baseStart === right.baseStart &&
  left.baseEnd === right.baseEnd &&
  left.replacement.length === right.replacement.length &&
  left.replacement.every((line, index) => line === right.replacement[index]);

const hunksOverlap = (left: MarkdownDiffHunk, right: MarkdownDiffHunk) => {
  if (left.baseStart === left.baseEnd && right.baseStart === right.baseEnd) {
    return left.baseStart === right.baseStart;
  }
  return Math.max(left.baseStart, right.baseStart) < Math.min(left.baseEnd, right.baseEnd);
};

export const mergeMarkdownWithBase = (
  baseMarkdown: string,
  localMarkdown: string,
  externalMarkdown: string
): { mergedMarkdown: string; conflicted: boolean } => {
  if (localMarkdown === externalMarkdown) return { mergedMarkdown: localMarkdown, conflicted: false };
  if (localMarkdown === baseMarkdown) return { mergedMarkdown: externalMarkdown, conflicted: false };
  if (externalMarkdown === baseMarkdown) return { mergedMarkdown: localMarkdown, conflicted: false };

  const base = baseMarkdown.split("\n");
  const localLines = localMarkdown.split("\n");
  const externalLines = externalMarkdown.split("\n");
  if (!canBuildDiffMatrix(base.length, localLines.length) || !canBuildDiffMatrix(base.length, externalLines.length)) {
    return { mergedMarkdown: localMarkdown, conflicted: true };
  }

  const localHunks = buildMarkdownDiffHunks(base, localLines);
  const externalHunks = buildMarkdownDiffHunks(base, externalLines);
  const merged: string[] = [];
  let baseIndex = 0;
  let localIndex = 0;
  let externalIndex = 0;

  const applyHunk = (hunk: MarkdownDiffHunk) => {
    merged.push(...base.slice(baseIndex, hunk.baseStart), ...hunk.replacement);
    baseIndex = hunk.baseEnd;
  };

  while (localIndex < localHunks.length || externalIndex < externalHunks.length) {
    const local = localHunks[localIndex];
    const external = externalHunks[externalIndex];
    if (!external || (local && local.baseStart < external.baseStart && !hunksOverlap(local, external))) {
      applyHunk(local);
      localIndex += 1;
      continue;
    }
    if (!local || (external.baseStart < local.baseStart && !hunksOverlap(local, external))) {
      applyHunk(external);
      externalIndex += 1;
      continue;
    }
    if (local && external && sameHunkReplacement(local, external)) {
      applyHunk(local);
      localIndex += 1;
      externalIndex += 1;
      continue;
    }
    return { mergedMarkdown: localMarkdown, conflicted: true };
  }

  merged.push(...base.slice(baseIndex));
  return { mergedMarkdown: merged.join("\n"), conflicted: false };
};

export const buildConflictDiffLines = (externalMarkdown: string, localMarkdown: string): ConflictDiffLine[] => {
  const removed = externalMarkdown.split("\n");
  const added = localMarkdown.split("\n");
  if (!canBuildDiffMatrix(removed.length, added.length)) {
    return [
      {
        key: "diff-too-large",
        kind: "same",
        text: `文档过长，已跳过逐行 Diff 以避免界面卡顿。外部版本 ${removed.length} 行，我的版本 ${added.length} 行。`
      },
      { key: "diff-too-large-external", kind: "removed", text: `外部版本预览：${conflictPreviewText(removed)}` },
      { key: "diff-too-large-local", kind: "added", text: `我的版本预览：${conflictPreviewText(added)}` }
    ];
  }
  const table = Array.from({ length: removed.length + 1 }, () => Array(added.length + 1).fill(0) as number[]);
  for (let i = removed.length - 1; i >= 0; i -= 1) {
    for (let j = added.length - 1; j >= 0; j -= 1) {
      table[i][j] = removed[i] === added[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines: ConflictDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < removed.length && j < added.length) {
    if (removed[i] === added[j]) {
      lines.push({ key: `same-${i}-${j}`, kind: "same", text: removed[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ key: `removed-${i}-${j}`, kind: "removed", text: removed[i] });
      i += 1;
    } else {
      lines.push({ key: `added-${i}-${j}`, kind: "added", text: added[j] });
      j += 1;
    }
  }
  while (i < removed.length) {
    lines.push({ key: `removed-${i}-${j}`, kind: "removed", text: removed[i] });
    i += 1;
  }
  while (j < added.length) {
    lines.push({ key: `added-${i}-${j}`, kind: "added", text: added[j] });
    j += 1;
  }
  return lines;
};

// ─── DocumentConflictDialog ───

export function DocumentConflictDialog({
  conflict,
  document,
  onClose,
  onKeepLocal,
  onUseExternal
}: {
  conflict: DocumentConflict | null;
  document?: InformioDocument;
  onClose: () => void;
  onKeepLocal: (documentId: string) => void;
  onUseExternal: (documentId: string) => void;
}) {
  const diffLines = useMemo(
    () => (conflict ? buildConflictDiffLines(conflict.externalMarkdown, conflict.localMarkdown) : []),
    [conflict]
  );
  const copyExternal = () => {
    if (!conflict) return;
    void navigator.clipboard?.writeText(conflict.externalMarkdown);
  };

  return (
    <Dialog.Root open={Boolean(conflict)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[92] bg-slate-950/22 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[93] flex h-[min(720px,calc(100vh-40px))] w-[min(980px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[15px] font-extrabold">需要合并更改</Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-[12px] leading-5 text-[var(--text-muted)]">
                {document?.title ?? conflict?.filePath ?? "当前文档"} 的同一段内容同时被你和外部修改。自动保存已暂停，请选择如何处理。
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="关闭"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
            <aside className="border-r border-slate-200 bg-slate-50/80 p-3 text-[12px] leading-5 text-slate-600">
              <div className="font-bold text-slate-900">处理方式</div>
              <p className="mt-2">绿色是你当前编辑器里的内容，红色是外部版本中被替换或删除的内容。</p>
              <p className="mt-2">关闭不会解决冲突，自动保存会继续暂停。</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
                onClick={copyExternal}
              >
                <Copy size={13} />
                复制外部版本
              </button>
            </aside>
            <div className="min-h-0 overflow-auto p-3">
              <pre className="min-h-full whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[12px] leading-5 text-slate-200">
                {diffLines.map((line) => (
                  <div
                    key={line.key}
                    className={cn(
                      "block min-h-5 px-1",
                      line.kind === "removed" && "bg-red-500/20 text-red-100",
                      line.kind === "added" && "bg-emerald-500/20 text-emerald-100",
                      line.kind === "same" && "text-slate-300"
                    )}
                  >
                    <span className="select-none pr-2 text-slate-500">
                      {line.kind === "removed" ? "-" : line.kind === "added" ? "+" : " "}
                    </span>
                    {line.text || " "}
                  </div>
                ))}
              </pre>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <div className="text-[12px] text-[var(--text-muted)]">也可以手动合并后再选择"保留我的版本"保存。</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
                onClick={onClose}
              >
                稍后处理
              </button>
              <button
                type="button"
                disabled={!conflict}
                className="h-8 rounded-md bg-slate-900 px-3 text-[12px] font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-45"
                onClick={() => conflict && onUseExternal(conflict.documentId)}
              >
                采用外部版本
              </button>
              <button
                type="button"
                disabled={!conflict}
                className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-45"
                onClick={() => conflict && onKeepLocal(conflict.documentId)}
              >
                保留我的版本
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
