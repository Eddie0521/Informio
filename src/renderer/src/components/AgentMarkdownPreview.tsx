import { useEffect, useMemo } from "react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { cn } from "../lib/utils";
import { normalizeAgentMathMarkdown } from "../lib/agentMathMarkdown";
import { UnderlineMark } from "../extensions/underline-mark";
import { MarkdownLink } from "../extensions/markdown-link";
import { SubscriptMark, SuperscriptMark } from "../extensions/script-marks";
import { MathInline, MathBlock } from "../extensions/math";

const INVALID_AUTO_LINK_CHAR_PATTERN = /[㐀-鿿豈-﫿，。！？；：、（）【】《》""]'']/;

export function AgentMarkdownPreview({
  markdown,
  align = "left",
  className,
  fontSize,
  lineHeight
}: {
  markdown: string;
  align?: "left" | "right";
  className?: string;
  fontSize: number;
  lineHeight: number;
}) {
  const normalizedMarkdown = useMemo(() => normalizeAgentMathMarkdown(markdown), [markdown]);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: false,
          underline: false
        }),
        Highlight,
        MarkdownLink.configure({
          autolink: true,
          defaultProtocol: "https",
          enableClickSelection: false,
          isAllowedUri: (url, context) => !INVALID_AUTO_LINK_CHAR_PATTERN.test(url) && context.defaultValidate(url),
          openOnClick: true
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        SubscriptMark,
        SuperscriptMark,
        UnderlineMark,
        MathInline,
        MathBlock,
        Markdown.configure({ indentation: { style: "space", size: 2 } })
      ],
      content: normalizedMarkdown,
      contentType: "markdown",
      editable: false,
      editorProps: {
        attributes: {
          class: cn("informio-agent-markdown prose prose-slate max-w-none text-left focus:outline-none", align === "right" && "ml-auto"),
          "data-agent-markdown": "true"
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(normalizedMarkdown, { contentType: "markdown", emitUpdate: false } as never);
  }, [editor, normalizedMarkdown]);

  return (
    <div
      className={cn("cursor-text select-text text-[var(--text-main)]", className)}
      style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
