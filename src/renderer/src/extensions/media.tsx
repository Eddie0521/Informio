import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownTokenLike, MarkdownHelperLike } from "../types";
import {
  sourceText,
  sourceContent,
  nodeSourceAttr,
  jsonSourceText,
  defaultBlockSource,
  sourceBackedBlockContent,
} from "../lib/markdown-block-parser";
import {
  resolveMarkdownAssetSrc,
  resolveMarkdownAssetPath,
  loadLocalAssetObjectUrl,
} from "../lib/asset-url";
import { mediaKindFromSrc } from "../lib/file-type";
import { escapeHtml, plainText, parseHtmlAttr } from "../lib/markdown";

export const MediaBlock = Node.create({
  name: "mediaBlock",
  group: "block",
  atom: true,
  addOptions() {
    return {
      assetBasePath: ""
    };
  },
  addAttributes() {
    return {
      kind: { default: "video" },
      src: { default: "" },
      title: { default: "Media" }
    };
  },
  markdownTokenizer: {
    name: "mediaBlock",
    level: "block",
    start(src: string) {
      return (src.match(/^<(video|audio)\b/im) ?? src.match(/^\[[^\]\n]+]\([^) \n]+\)/m))?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^<(video|audio)\b([^>]*)><\/\1>(?:\n|$)/i);
      if (match) {
        return {
          type: "mediaBlock",
          raw: match[0],
          kind: match[1].toLowerCase(),
          src: parseHtmlAttr(match[2], "src"),
          title: parseHtmlAttr(match[2], "title") || parseHtmlAttr(match[2], "aria-label") || "Media"
        };
      }
      const linkMatch = src.match(/^\[([^\]\n]+)]\(([^)\s]+)(?:\s+["']([^"'\n]+)["'])?\)(?:\n|$)/);
      const linkedSrc = linkMatch?.[2] ?? "";
      const linkedKind = mediaKindFromSrc(linkedSrc);
      if (!linkMatch || !linkedKind) return undefined;
      return {
        type: "mediaBlock",
        raw: linkMatch[0],
        kind: linkedKind,
        src: linkedSrc,
        title: linkMatch[3] || linkMatch[1] || "Media"
      };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("mediaBlock", { kind: token.kind ?? "video", src: token.src ?? "", title: token.title ?? "Media" }, []);
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="media-block"]' }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { kind: string; src: string; title: string } };
  }) {
    const kind = node.attrs.kind === "audio" ? "audio" : "video";
    const wrapperClassName = `informio-media-block is-${kind}`;
    const captionClassName = `informio-media-caption is-${kind}`;
    const mediaClassName = `informio-media is-${kind}`;
    const title = node.attrs.title || "Media";

    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-type": "media-block", class: wrapperClassName }),
      [kind, { controls: "", src: node.attrs.src || "", class: mediaClassName }],
      ["figcaption", { class: captionClassName }, title]
    ];
  },
  addNodeView(this: any) {
    return ({ node }: { node: { attrs: { kind: string; src: string; title: string } } }) => {
      const kind = node.attrs.kind === "audio" ? "audio" : "video";
      const wrapper = document.createElement("figure");
      wrapper.setAttribute("data-type", "media-block");
      wrapper.className = `informio-media-block is-${kind}`;
      wrapper.contentEditable = "false";

      const title = node.attrs.title || "Media";
      const appendCaption = () => {
        const caption = document.createElement("figcaption");
        caption.className = `informio-media-caption is-${kind}`;
        caption.textContent = title;
        wrapper.appendChild(caption);
      };

      const media = document.createElement(kind);
      media.setAttribute("controls", "");
      let objectUrl = "";
      let disposed = false;
      const applyMediaSrc = async (rawSrc: string) => {
        const localPath = resolveMarkdownAssetPath(rawSrc, this.options.assetBasePath);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
        if (!localPath) {
          media.setAttribute("src", resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath));
          return;
        }
        try {
          objectUrl = await loadLocalAssetObjectUrl(localPath);
          if (disposed) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          media.setAttribute("src", objectUrl);
        } catch (error) {
          console.warn("Failed to load local media asset:", error);
          media.setAttribute("src", resolveMarkdownAssetSrc(rawSrc, this.options.assetBasePath));
        }
      };
      let currentSrc = node.attrs.src || "";
      void applyMediaSrc(currentSrc);
      media.className = `informio-media is-${kind}`;
      wrapper.appendChild(media);

      appendCaption();

      return {
        dom: wrapper,
        update(updatedNode: { attrs: { kind: string; src: string; title: string }; type?: unknown }) {
          const nextKind = updatedNode.attrs.kind === "audio" ? "audio" : "video";
          if (nextKind !== kind) return false;
          const nextSrc = updatedNode.attrs.src || "";
          if (nextSrc !== currentSrc) {
            currentSrc = nextSrc;
            void applyMediaSrc(currentSrc);
          }
          return true;
        },
        destroy() {
          disposed = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
      };
    };
  },
  renderMarkdown(node: { attrs?: { kind?: string; src?: string; title?: string } }) {
    const title = (node.attrs?.title ?? "Media").replace(/[\[\]\n]/g, " ").trim() || "Media";
    const src = node.attrs?.src ?? "";
    const kind = node.attrs?.kind === "audio" ? "audio" : "video";
    return `\n<${kind} controls src="${escapeHtml(src)}" title="${escapeHtml(title)}"></${kind}>\n`;
  }
} as never);
