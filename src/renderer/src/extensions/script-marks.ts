import { InputRule } from "@tiptap/core";
import type { JSONContent, MarkdownParseHelpers, MarkdownRendererHelpers } from "@tiptap/core";
import SubscriptExtension from "@tiptap/extension-subscript";
import SuperscriptExtension from "@tiptap/extension-superscript";
import type { MarkdownTokenLike } from "../types";

const scriptBasePattern = "([A-Za-z0-9)\\]])";
const scriptValuePattern = "(\\{[^{}\\n]+\\}|\\([^()\\n]+\\)|(?:\\d+|[A-Za-z])(?![A-Za-z0-9]))";

const scriptSyntaxRegex = (marker: "^" | "_", anchored: boolean) => {
  const escapedMarker = marker === "^" ? "\\^" : "_";
  return new RegExp(`${anchored ? "^" : ""}${scriptBasePattern}${escapedMarker}${scriptValuePattern}${anchored ? "" : ""}`);
};

const unwrapScriptValue = (value: string) => {
  if (
    (value.startsWith("{") && value.endsWith("}"))
    || (value.startsWith("(") && value.endsWith(")"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const renderScriptMarkdown = (marker: "^" | "_", value: string) => {
  const plainValue = value.replace(/\n+/g, " ").trim();
  if (!plainValue) return "";
  if (/^\d+$/.test(plainValue) || /^[A-Za-z]$/.test(plainValue)) {
    return `${marker}${plainValue}`;
  }
  return `${marker}{${plainValue}}`;
};

const extractPlainScriptText = (content: JSONContent[] | undefined) => {
  if (!content?.length) return "";
  const plainSegments: string[] = [];
  for (const child of content) {
    if (child.type !== "text" || child.marks?.length) return null;
    plainSegments.push(child.text ?? "");
  }
  return plainSegments.join("");
};

const createScriptExtension = (
  extension: typeof SubscriptExtension | typeof SuperscriptExtension,
  options: {
    name: "subscript" | "superscript";
    marker: "_" | "^";
    htmlTag: "sub" | "sup";
  }
) =>
  extension.extend({
    markdownTokenName: `${options.name}Syntax`,
    markdownOptions: {
      htmlReopen: {
        open: `<${options.htmlTag}>`,
        close: `</${options.htmlTag}>`
      }
    },
    markdownTokenizer: {
      name: `${options.name}Syntax`,
      level: "inline",
      start(src: string) {
        return src.match(scriptSyntaxRegex(options.marker, false))?.index ?? -1;
      },
      tokenize(src: string) {
        const match = src.match(scriptSyntaxRegex(options.marker, true));
        if (!match) return undefined;
        return {
          type: `${options.name}Syntax`,
          raw: match[0],
          base: match[1],
          script: unwrapScriptValue(match[2])
        };
      }
    },
    parseMarkdown(token: MarkdownTokenLike, helpers: MarkdownParseHelpers) {
      const base = token.base ?? "";
      const script = token.script ?? "";
      if (!script) {
        return helpers.createTextNode(token.raw ?? "");
      }
      return [
        ...(base ? [helpers.createTextNode(base)] : []),
        helpers.createTextNode(script, [{ type: options.name }])
      ];
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      const plainText = extractPlainScriptText(node.content);
      if (plainText !== null) {
        return renderScriptMarkdown(options.marker, plainText);
      }
      return `<${options.htmlTag}>${helpers.renderChildren(node.content ?? [])}</${options.htmlTag}>`;
    },
    addInputRules() {
      return [
        new InputRule({
          find: new RegExp(`${scriptBasePattern}${options.marker === "^" ? "\\^" : "_"}${scriptValuePattern}$`),
          handler: ({ match, range, chain }) => {
            const base = match[1] ?? "";
            const script = unwrapScriptValue(match[2] ?? "");
            if (!base || !script) return;
            const from = range.from + base.length;
            chain()
              .deleteRange({ from, to: range.to })
              .insertContentAt(from, {
                type: "text",
                text: script,
                marks: [{ type: options.name }]
              })
              .setTextSelection(from + script.length)
              .run();
          }
        })
      ];
    }
  });

export const SubscriptMark = createScriptExtension(SubscriptExtension, {
  name: "subscript",
  marker: "_",
  htmlTag: "sub"
});

export const SuperscriptMark = createScriptExtension(SuperscriptExtension, {
  name: "superscript",
  marker: "^",
  htmlTag: "sup"
});
