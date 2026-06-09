import type { ReactNode } from "react";

export function SettingRow({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-5 py-4">
      <div>
        <div className="text-[15px] font-bold text-[var(--text-main)]">{title}</div>
        {description ? <div className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</div> : null}
      </div>
      {children}
    </div>
  );
}
