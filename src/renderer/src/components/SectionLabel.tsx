import type { ReactNode } from "react";

export function SectionLabel({ children, fontSize }: { children: ReactNode; fontSize: number }) {
  return (
    <div className="mb-1 text-slate-400" style={{ fontSize: `${fontSize}px`, lineHeight: 1.3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </div>
  );
}
