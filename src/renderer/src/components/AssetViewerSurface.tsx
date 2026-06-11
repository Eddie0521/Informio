import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InformioDocument } from "../types";
import { cn } from "../lib/utils";
import { pathBaseName } from "../lib/path";
import { documentKind } from "../lib/file-type";

export function AssetViewerSurface({ document }: { document: InformioDocument }) {
  const { t } = useTranslation();
  const filePath = document.filePath ?? "";
  const title = document.title || pathBaseName(filePath) || "Asset";
  const kind = documentKind(document);
  const [assetUrl, setAssetUrl] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (!filePath || (kind !== "image" && kind !== "video" && kind !== "audio")) {
      setAssetUrl("");
      setLoadFailed(false);
      setIsLoading(false);
      return;
    }
    let disposed = false;
    let objectUrl = "";
    setIsLoading(true);
    setLoadFailed(false);
    window.informio.loadAsset(filePath)
      .then((asset) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType }));
        setAssetUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) setLoadFailed(true);
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });
    return () => {
      disposed = true;
      setAssetUrl("");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath, kind]);
  const openInSystem = () => {
    if (filePath) void window.informio.openPath(filePath);
  };

  if (!filePath) {
    return <div className="informio-asset-message is-error">{t("editor.assetError")}</div>;
  }

  const isLoadableAsset = kind === "image" || kind === "video" || kind === "audio";
  const body = isLoadableAsset
    ? isLoading || (!assetUrl && !loadFailed) ? (
      <div className="informio-asset-message">{t("editor.assetLoading")}</div>
    ) : loadFailed ? (
      <div className="informio-asset-message is-error">{t("editor.assetDecodeError", { type: kind === "image" ? t("assetviewer.imageType") : kind === "video" ? t("assetviewer.videoType") : t("assetviewer.audioType") })}</div>
    ) : kind === "image" ? (
      <img className="informio-asset-image" src={assetUrl} alt={title} onError={() => setLoadFailed(true)} />
    ) : kind === "video" ? (
      <video className="informio-asset-video" src={assetUrl} controls onError={() => setLoadFailed(true)} />
    ) : (
      <audio className="informio-asset-audio" src={assetUrl} controls onError={() => setLoadFailed(true)} />
    )
    : <div className="informio-asset-message">{t("assetviewer.previewUnsupported")}</div>;

  return (
    <div className="informio-asset-surface">
      <div className={cn("informio-asset-stage", kind === "audio" && "is-audio")}>{body}</div>
      <div className="informio-asset-footer">
        <span>{title}</span>
        <button type="button" onClick={openInSystem}>
          {t("editor.openInSystem")}
        </button>
      </div>
    </div>
  );
}
