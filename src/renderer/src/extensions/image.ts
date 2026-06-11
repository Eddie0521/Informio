import Image from "@tiptap/extension-image";
import { ResizableNodeView } from "@tiptap/core";
import type { MarkdownTokenLike, MarkdownHelperLike } from "../types";
import { renderImageMarkdown } from "../lib/markdown";
import { resolveMarkdownAssetSrc, resolveMarkdownAssetPath, loadLocalAssetObjectUrl } from "../lib/asset-url";

export const ResizableImage = Image.extend({
  markdownTokenizer: {
    name: "image",
    level: "block",
    start(src: string) {
      return src.match(/^!\[/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^!\[([^\]\n]*)]\(([^)\s]+)(?:\s+["']([^"'\n]+)["'])?\)(?:\n|$)/);
      if (!match) return undefined;
      return { type: "image", raw: match[0], text: match[1], src: match[2], title: match[3] ?? "" };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("image", { src: token.src ?? "", alt: token.text ?? "", title: token.title ?? null }, []);
  },
  renderMarkdown(node: { attrs?: { src?: string | null; alt?: string | null; title?: string | null; width?: number | string | null } }) {
    return renderImageMarkdown(node.attrs ?? {});
  },
  addNodeView(this: any) {
    if (!this.options.resize || !this.options.resize.enabled || typeof document === "undefined") {
      return null;
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize;

    return ({ node, getPos, HTMLAttributes, editor }: any) => {
      const el = document.createElement("img");
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) {
          switch (key) {
            case "width":
            case "height":
              break;
            default:
              el.setAttribute(key, String(value));
              break;
          }
        }
      });

      let objectUrl = "";
      let disposed = false;
      const applyImageSrc = async (rawSrc: string) => {
        const localPath = resolveMarkdownAssetPath(rawSrc, this.options.assetBasePath);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
        if (!localPath) {
          el.src = resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath);
          return;
        }
        try {
          objectUrl = await loadLocalAssetObjectUrl(localPath);
          if (disposed) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          el.src = objectUrl;
        } catch (error) {
          console.warn("Failed to load local image asset:", error);
          el.src = resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath);
        }
      };
      let currentSrc = String(HTMLAttributes.src ?? "");
      void applyImageSrc(currentSrc);
      el.style.height = "auto";

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (width, height) => {
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
        },
        onCommit: (width) => {
          const pos = getPos();
          if (pos === undefined) return;
          const roundedWidth = Math.max(120, Math.round(width));
          editor.chain().setNodeSelection(pos).updateAttributes(this.name, { width: roundedWidth, height: null }).run();
          el.style.width = `${roundedWidth}px`;
          el.style.height = "auto";
        },
        onUpdate: (updatedNode: any) => {
          if (updatedNode.type !== node.type) return false;
          const nextSrc = String(updatedNode.attrs.src ?? "");
          if (nextSrc !== currentSrc) {
            currentSrc = nextSrc;
            void applyImageSrc(currentSrc);
          }
          const nextWidth = updatedNode.attrs.width;
          el.style.width =
            typeof nextWidth === "number"
              ? `${nextWidth}px`
              : typeof nextWidth === "string" && nextWidth.trim()
                ? `${nextWidth}px`
                : "";
          el.style.height = "auto";
          return true;
        },
        options: {
          directions,
          min: {
            width: minWidth,
            height: minHeight
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
          className: {
            container: "informio-image-resize-container",
            wrapper: "informio-image-resize-wrapper",
            handle: "informio-image-resize-handle",
            resizing: "is-resizing-image"
          }
        }
      });

      const dom = nodeView.dom;
      dom.style.visibility = "hidden";
      dom.style.pointerEvents = "none";
      el.onload = () => {
        dom.style.visibility = "";
        dom.style.pointerEvents = "";
      };
      el.onerror = () => {
        dom.style.visibility = "";
        dom.style.pointerEvents = "";
      };
      const originalDestroy = nodeView.destroy?.bind(nodeView);
      nodeView.destroy = () => {
        disposed = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        originalDestroy?.();
      };
      return nodeView;
    };
  }
} as never);
