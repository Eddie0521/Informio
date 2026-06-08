// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  clipboardPlainTextForPaste,
  extractClipboardHtmlFragment,
  htmlFragmentHasContent,
  insertTextIntoTextarea,
  sanitizeHtmlFragmentForPaste,
  stripClipboardFragmentMarkers
} from "./clipboardPaste";

const fragmentHtml = (fragment: DocumentFragment) => {
  const container = document.createElement("div");
  container.appendChild(fragment.cloneNode(true));
  return container.innerHTML;
};

describe("clipboard paste normalization", () => {
  it("removes ChatGPT clipboard fragment comments without changing the text", () => {
    const html = "<!--StartFragment-->MoE 模型<!--EndFragment-->";
    const fragment = sanitizeHtmlFragmentForPaste(html);

    expect(fragmentHtml(fragment)).toBe("MoE 模型");
    expect(clipboardPlainTextForPaste("<!--StartFragment-->MoE 模型<!--EndFragment-->", html)).toBe("MoE 模型");
  });

  it("extracts only the selected HTML fragment from clipboard wrapper markup", () => {
    const html = "<html><body><p>Before</p><!--StartFragment--><strong>Selected</strong><!--EndFragment--><p>After</p></body></html>";

    expect(extractClipboardHtmlFragment(html)).toBe("<strong>Selected</strong>");
    expect(fragmentHtml(sanitizeHtmlFragmentForPaste(html))).toBe("<strong>Selected</strong>");
  });

  it("turns GitHub styled spans into readable content", () => {
    const html =
      '<!--StartFragment--><span style="color: rgb(255, 255, 255); font-family: &quot;Mona Sans VF&quot;; background-color: rgb(1, 4, 9);">Claude Code / Codex</span><!--EndFragment-->';

    const fragment = sanitizeHtmlFragmentForPaste(html);

    expect(fragmentHtml(fragment)).toBe("<span>Claude Code / Codex</span>");
    expect(clipboardPlainTextForPaste(html)).toBe("Claude Code / Codex");
  });

  it("keeps useful semantic attributes and strips site styling", () => {
    const html =
      '<p class="markdown-body" data-sourcepos="1:1" style="color:red"><a href="https://example.com" class="link">Example</a><img src="image.png" alt="diagram" title="Diagram" style="width:999px"></p>';

    expect(fragmentHtml(sanitizeHtmlFragmentForPaste(html))).toBe(
      '<p><a href="https://example.com">Example</a><img src="image.png" alt="diagram" title="Diagram"></p>'
    );
  });

  it("removes unsafe nodes and javascript URLs", () => {
    const html =
      '<p onclick="alert(1)">Safe <a href="javascript:alert(1)">bad</a><img src="javascript:alert(1)" alt="bad"><script>alert(1)</script><iframe src="https://example.com"></iframe></p>';

    expect(fragmentHtml(sanitizeHtmlFragmentForPaste(html))).toBe('<p>Safe <a>bad</a><img alt="bad"></p>');
  });

  it("preserves non-text HTML nodes as pasteable rich content", () => {
    expect(htmlFragmentHasContent(sanitizeHtmlFragmentForPaste("<img src=\"diagram.png\" alt=\"diagram\">"))).toBe(true);
    expect(htmlFragmentHasContent(sanitizeHtmlFragmentForPaste("<hr>"))).toBe(true);
    expect(htmlFragmentHasContent(sanitizeHtmlFragmentForPaste("<!--StartFragment--><!--EndFragment-->"))).toBe(false);
  });

  it("keeps plain Markdown untouched when there is no HTML clipboard flavor", () => {
    const markdown = "## Title\n\n- **one**\n- `two`";

    expect(clipboardPlainTextForPaste(markdown)).toBe(markdown);
  });

  it("prefers readable HTML text in source mode when both HTML and plain text are available", () => {
    const text = '<span style="color:red">Claude Code / Codex</span>';
    const html = '<span style="color:red">Claude Code / Codex</span>';

    expect(clipboardPlainTextForPaste(text, html)).toBe("Claude Code / Codex");
  });

  it("inserts normalized textarea text at the current selection", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hello ugly paste";
    textarea.setSelectionRange(6, 10);

    expect(insertTextIntoTextarea(textarea, "clean")).toBe("Hello clean paste");
    expect(textarea.selectionStart).toBe(11);
    expect(textarea.selectionEnd).toBe(11);
  });

  it("strips fragment markers case-insensitively", () => {
    expect(stripClipboardFragmentMarkers("<!-- startfragment -->Text<!-- ENDFRAGMENT -->")).toBe("Text");
  });
});
