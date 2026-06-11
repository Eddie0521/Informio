import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { Fragment as ProseMirrorFragment } from "@tiptap/pm/model";
import { cn } from "../lib/utils";
import { normalizeCodeLanguage, highlightedCodeHtml } from "../lib/markdown-block-parser";

export const CodeBlockView = ({ editor, getPos, node, selected }: { editor: Editor; getPos: () => number | undefined; node: { attrs: Record<string, unknown>; textContent: string; nodeSize: number }; selected: boolean; updateAttributes: (attrs: Record<string, unknown>) => void }) => {
  const { t } = useTranslation();
  const language = normalizeCodeLanguage(String(node.attrs.language || "plaintext"));
  const displayLanguage = language === "plaintext" ? "" : language;
  const [sourceFocused, setSourceFocused] = useState(false);
  const [draftCode, setDraftCode] = useState(node.textContent);
  const [draftLanguage, setDraftLanguage] = useState(displayLanguage);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const previewHtml = highlightedCodeHtml(language, node.textContent);

  const resizeSourceTextarea = () => {
    const textarea = sourceRef.current;
    if (!textarea || !sourceFocused) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(() => {
    if (sourceFocused) return;
    setDraftCode(node.textContent);
    setDraftLanguage(displayLanguage);
  }, [displayLanguage, node.textContent, sourceFocused]);

  useLayoutEffect(() => {
    resizeSourceTextarea();
  }, [sourceFocused, draftCode]);

  const commitLanguage = (value = draftLanguage) => {
    const position = getPos();
    if (typeof position !== "number") return;
    const nextLanguage = normalizeCodeLanguage(value || "plaintext");
    if (nextLanguage === language) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, language: nextLanguage }));
  };

  useEffect(() => {
    if (!sourceFocused) return;
    const handlePointerDown = (event: PointerEvent) => {
      const wrapper = wrapperRef.current;
      if (!wrapper || !(event.target instanceof globalThis.Node) || wrapper.contains(event.target)) return;
      commitLanguage();
      setSourceFocused(false);
      sourceRef.current?.blur();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [commitLanguage, sourceFocused]);

  const applyCode = (value: string) => {
    setDraftCode(value);
    const position = getPos();
    if (typeof position !== "number") return;
    const textContent = value ? editor.schema.text(value) : ProseMirrorFragment.empty;
    const tr = editor.state.tr.replaceWith(position + 1, position + node.nodeSize - 1, textContent);
    editor.view.dispatch(tr);
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={cn("informio-code-block", sourceFocused && "is-editing")}
      onMouseDown={(event: ReactMouseEvent) => {
        if (sourceFocused) return;
        event.preventDefault();
        setSourceFocused(true);
        const position = getPos();
        if (typeof position === "number") editor.chain().focus().setTextSelection(position + 1).run();
      }}
    >
      <div className={cn("informio-code-source", !sourceFocused && "is-hidden-source-content")}>
        <textarea
          ref={sourceRef}
          value={draftCode}
          rows={Math.max(3, draftCode.split("\n").length)}
          contentEditable={false}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="informio-code-source-textarea"
          onMouseDown={(event) => event.stopPropagation()}
          onFocus={() => setSourceFocused(true)}
          onBlur={() => {
            window.setTimeout(() => {
              const wrapper = wrapperRef.current;
              const activeElement = document.activeElement;
              if (wrapper && activeElement && wrapper.contains(activeElement)) return;
              commitLanguage();
              setSourceFocused(false);
            }, 0);
          }}
          onChange={(event) => applyCode(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              const position = getPos();
              if (typeof position !== "number") return;
              event.preventDefault();
              setSourceFocused(false);
              event.currentTarget.blur();
              editor.chain().focus().setTextSelection(position + node.nodeSize).run();
            }
          }}
        />
        <input
          value={draftLanguage}
          aria-label={t("codeblock.codeLanguage")}
          placeholder="plain text"
          spellCheck={false}
          className="informio-code-language-widget"
          onMouseDown={(event) => event.stopPropagation()}
          onFocus={() => setSourceFocused(true)}
          onBlur={() => {
            window.setTimeout(() => {
              const wrapper = wrapperRef.current;
              const activeElement = document.activeElement;
              if (wrapper && activeElement && wrapper.contains(activeElement)) return;
              commitLanguage();
              setSourceFocused(false);
            }, 0);
          }}
          onChange={(event) => setDraftLanguage(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Escape" && event.key !== "Enter") return;
            event.preventDefault();
            if (event.key === "Enter") commitLanguage(event.currentTarget.value);
            else setDraftLanguage(displayLanguage);
            setSourceFocused(false);
            event.currentTarget.blur();
            const position = getPos();
            if (typeof position === "number") editor.chain().focus().setTextSelection(position + node.nodeSize).run();
          }}
        />
      </div>
      {!sourceFocused ? (
        <pre contentEditable={false}>
          <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </pre>
      ) : null}
    </NodeViewWrapper>
  );
};
