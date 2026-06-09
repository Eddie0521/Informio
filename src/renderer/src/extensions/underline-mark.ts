import { InputRule } from "@tiptap/core";
import UnderlineExtension from "@tiptap/extension-underline";

export const UnderlineMark = UnderlineExtension.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /\+\+([^+\n](?:[\s\S]*?[^+\n])?)\+\+$/,
        handler: ({ match, range, chain }) => {
          const text = match[1] ?? "";
          if (!text) return;
          chain()
            .deleteRange(range)
            .insertContent({
              type: "text",
              text,
              marks: [{ type: "underline" }]
            })
            .run();
        }
      })
    ];
  }
} as never);
