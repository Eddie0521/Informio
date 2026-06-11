import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import type { SecretPromptRequest } from "../types";

export function SecretPassphraseDialog({
  request,
  onClose,
  onConfirm
}: {
  request: SecretPromptRequest | null;
  onClose: () => void;
  onConfirm: (input: { passphrase: string; confirmPassphrase?: string }) => void;
}) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setPassphrase("");
    setConfirmPassphrase("");
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [request]);

  const trimmedPassphrase = passphrase.trim();
  const trimmedConfirmPassphrase = confirmPassphrase.trim();
  const needsConfirmation = request?.mode === "set-passphrase";
  const canSubmit = needsConfirmation
    ? Boolean(trimmedPassphrase && trimmedConfirmPassphrase)
    : Boolean(trimmedPassphrase);

  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/18" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 text-[var(--text-main)] shadow-[0_24px_64px_rgba(15,23,42,0.24),0_0_0_1px_rgba(15,23,42,0.08)] focus:outline-none">
          <Dialog.Title className="text-[14px] font-extrabold">
            {request?.mode === "set-passphrase" ? t("secretdialog.setPassphrase") : t("secretdialog.enterPassphrase")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
            {request?.mode === "set-passphrase"
              ? t("secretdialog.setDescription")
              : request?.intent === "decrypt"
                ? t("secretdialog.decryptDescription")
                : t("secretdialog.encryptDescription")}
          </Dialog.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              onConfirm({
                passphrase: trimmedPassphrase,
                confirmPassphrase: needsConfirmation ? trimmedConfirmPassphrase : undefined
              });
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[var(--text-muted)]">{t("secretdialog.passphrase")}</span>
              <input
                ref={inputRef}
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
              />
            </label>
            {needsConfirmation ? (
              <label className="grid gap-1.5">
                <span className="text-[12px] font-bold text-[var(--text-muted)]">{t("secretdialog.confirmPassphrase")}</span>
                <input
                  type="password"
                  value={confirmPassphrase}
                  onChange={(event) => setConfirmPassphrase(event.target.value)}
                  className="h-9 w-full rounded-md bg-slate-50 px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-[var(--divider)] focus:bg-white focus:ring-2 focus:ring-emerald-500/45"
                />
              </label>
            ) : null}
            {request?.error ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-semibold leading-5 text-red-700">{request.error}</div> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-8 rounded-md px-3 text-[12px] font-bold text-slate-600 transition-[background-color,transform] hover:bg-slate-100 active:scale-[0.99]"
                onClick={onClose}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-8 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white transition-[background-color,opacity,transform] hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45"
              >
                {t("common.confirm")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
