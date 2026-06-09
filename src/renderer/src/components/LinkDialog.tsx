import { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { LinkRequest } from "../types";

export function LinkDialog({
  request,
  onClose,
  onConfirm
}: {
  request: LinkRequest | null;
  onClose: () => void;
  onConfirm: (input: { text: string; url: string; title?: string }) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setText(request.text || "链接文字");
    setUrl(request.url);
    setTitle(request.title ?? "");
    window.setTimeout(() => {
      (request.url ? urlInputRef.current : urlInputRef.current)?.focus();
      urlInputRef.current?.select();
    }, 0);
  }, [request]);

  const trimmedText = text.trim();
  const trimmedUrl = url.trim();
  const canSubmit = Boolean(trimmedText && trimmedUrl);

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">链接</Dialog.Title>
          <Dialog.Description className="sr-only">输入链接文字和地址，确认后插入或更新超链接。</Dialog.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) onConfirm({ text: trimmedText, url: trimmedUrl, title: title.trim() || undefined });
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">文字</span>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">地址</span>
              <input
                ref={urlInputRef}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">标题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="可选"
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-[background-color,transform] hover:bg-slate-100 active:scale-[0.99]"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-[background-color,opacity,transform] hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45"
              >
                确认
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
