import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { EditorDropZone, WorkspaceDropTarget } from "../types";

type WorkspaceDropOverlayProps = {
  containerRef: RefObject<HTMLElement | null>;
  dropTarget: WorkspaceDropTarget;
};

const ZONE_CLIP: Record<EditorDropZone, string> = {
  left: "polygon(0 0, 0 100%, 50% 50%)",
  right: "polygon(100% 0, 100% 100%, 50% 50%)",
  top: "polygon(0 0, 100% 0, 50% 50%)",
  bottom: "polygon(0 100%, 100% 100%, 50% 50%)",
};

export function WorkspaceDropOverlay({ containerRef, dropTarget }: WorkspaceDropOverlayProps) {
  const { t } = useTranslation();
  const [paneRect, setPaneRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!dropTarget) {
      setPaneRect(null);
      return;
    }
    const update = () => {
      const pane = document.querySelector(`[data-pane-id="${dropTarget.paneId}"]`);
      setPaneRect(pane?.getBoundingClientRect() ?? null);
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [dropTarget]);

  if (!dropTarget || !paneRect || !containerRef.current) return null;

  const zone = dropTarget.zone;
  const label =
    zone === "left"
      ? t("app.splitLeft")
      : zone === "right"
        ? t("app.splitRight")
        : zone === "top"
          ? t("app.splitTop")
          : t("app.splitBottom");

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80]"
      style={{
        left: paneRect.left,
        top: paneRect.top,
        width: paneRect.width,
        height: paneRect.height,
      }}
    >
      <div
        className="absolute inset-0 bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/35"
        style={{ clipPath: ZONE_CLIP[zone] }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-md bg-white/80 px-3 py-1 text-center text-[12px] font-semibold text-emerald-700 shadow-sm">
          {label}
        </div>
      </div>
    </div>,
    document.body,
  );
}
