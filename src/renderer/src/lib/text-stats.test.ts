import { describe, expect, it } from "vitest";
import { markdownToStatusText, countWords, countCharacters, countLines } from "./text-stats";

describe("markdownToStatusText", () => {
  it("strips code block fences, keeps content", () => {
    expect(markdownToStatusText("```js\ncode\n```")).toBe("js\ncode\n");
  });

  it("strips inline code", () => {
    expect(markdownToStatusText("use `console.log`")).toBe("use console.log");
  });

  it("strips images and links", () => {
    expect(markdownToStatusText("![alt](url)")).toBe("alt");
    expect(markdownToStatusText("[text](url)")).toBe("text");
  });

  it("strips headings", () => {
    expect(markdownToStatusText("# Title")).toBe("Title");
    expect(markdownToStatusText("### Sub")).toBe("Sub");
  });

  it("strips blockquotes", () => {
    expect(markdownToStatusText("> quote")).toBe("quote");
  });

  it("strips list markers", () => {
    expect(markdownToStatusText("- item")).toBe("item");
    expect(markdownToStatusText("1. item")).toBe("item");
  });

  it("strips list markers before task markers", () => {
    // List marker regex runs first, leaving [x] done
    expect(markdownToStatusText("- [x] done")).toBe("[x] done");
  });

  it("strips emphasis markers", () => {
    expect(markdownToStatusText("**bold**")).toBe("bold");
    expect(markdownToStatusText("*italic*")).toBe("italic");
    expect(markdownToStatusText("~~strike~~")).toBe("strike");
  });

  it("strips HTML tags", () => {
    expect(markdownToStatusText("<br>")).toBe("");
    expect(markdownToStatusText("<span>text</span>")).toBe("text");
  });

  it("normalizes CRLF", () => {
    expect(markdownToStatusText("a\r\nb")).toBe("a\nb");
  });
});

describe("countWords", () => {
  it("counts Latin words", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("counts CJK characters individually", () => {
    expect(countWords("你好世界")).toBe(4);
  });

  it("counts mixed Latin and CJK", () => {
    expect(countWords("hello 世界")).toBe(3);
  });

  it("handles empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("handles hyphenated words as one", () => {
    expect(countWords("well-known")).toBe(1);
  });
});

describe("countCharacters", () => {
  it("counts characters after stripping markdown", () => {
    expect(countCharacters("**bold**")).toBe(4);
  });

  it("counts CJK characters", () => {
    expect(countCharacters("你好")).toBe(2);
  });
});

describe("countLines", () => {
  it("counts non-empty lines", () => {
    expect(countLines("a\n\nb\nc")).toBe(3);
  });

  it("ignores trailing empty lines", () => {
    expect(countLines("a\n\n")).toBe(1);
  });

  it("returns 0 for empty string", () => {
    expect(countLines("")).toBe(0);
  });

  it("ignores blank lines", () => {
    expect(countLines("a\n   \nb")).toBe(2);
  });
});
