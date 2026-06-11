import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import type { ImageRequest } from "../types";

export function ImageDialog({
  request,
  onClose,
  onConfirm
}: {
  request: ImageRequest | null;
  onClose: () => void;
  onConfirm: (input: { alt: string; src: string; title: string }) => void;
}) {
  const { t } = useTranslation();
  const [alt, setAlt] = useState("");
  const [src, setSrc] = useState("");
  const [title, setTitle] = useState("");
  const srcInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setAlt(request.alt);
    setSrc(request.src);
    setTitle(request.title);
    window.setTimeout(() => {
      srcInputRef.current?.focus();
      srcInputRef.current?.select();
    }, 0);
  }, [request]);

  const canSubmit = Boolean(src.trim());

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">{t("imagedialog.title")}</Dialog.Title>
          <Dialog.Description className="sr-only">{t("imagedialog.description")}</Dialog.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) onConfirm({ alt: alt.trim(), src: src.trim(), title: title.trim() });
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">{t("imagedialog.url")}</span>
              <input
                ref={srcInputRef}
                value={src}
                onChange={(event) => setSrc(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">{t("imagedialog.altText")}</span>
              <input
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">{t("imagedialog.caption")}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("common.optional")}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-[background-color,transform] hover:bg-slate-100 active:scale-[0.99]" onClick={onClose}>
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={!canSubmit} className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-[background-color,opacity,transform] hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45">
                {t("common.confirm")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
