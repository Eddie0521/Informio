import { describe, expect, it } from "vitest";
import type { JSONContent, MarkdownRendererHelpers } from "@tiptap/core";
import { renderTableToGfm } from "./markdown";

const mockRenderChildren = (node: JSONContent): string => {
  if (node.type === "text") {
    let text = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `**${text}**`;
      else if (mark.type === "link") text = `[${text}](${String(mark.attrs?.href ?? "")})`;
    }
    return text;
  }
  return (node.content ?? []).map((child) => mockRenderChildren(child)).join("");
};

const mockHelpers = {
  renderChildren: mockRenderChildren
} as MarkdownRendererHelpers;

const sampleTable = (overrides: Partial<JSONContent> = {}): JSONContent => ({
  type: "table",
  content: [
    {
      type: "tableRow",
      content: [
        {
          type: "tableHeader",
          attrs: { align: "left" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "H1" }] }]
        },
        {
          type: "tableHeader",
          attrs: { align: "center" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "H2" }] }]
        },
        {
          type: "tableHeader",
          attrs: { align: "right" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "H3" }] }]
        }
      ]
    },
    {
      type: "tableRow",
      content: [
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }]
        },
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }]
        },
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }]
        }
      ]
    }
  ],
  ...overrides
});

describe("renderTableToGfm", () => {
  it("renders a basic GFM table", () => {
    const markdown = renderTableToGfm(sampleTable(), mockHelpers);
    expect(markdown).toContain("| H1 | H2 | H3 |");
    expect(markdown).toContain("| A | B | C |");
  });

  it("exports per-column alignment in the separator row", () => {
    const markdown = renderTableToGfm(sampleTable(), mockHelpers);
    expect(markdown).toContain("| --- | :---: | ---: |");
  });

  it("preserves cell marks when colwidth attrs are present", () => {
    const table = sampleTable();
    const headerRow = table.content?.[0];
    const firstHeader = headerRow?.content?.[0];
    if (firstHeader) {
      firstHeader.attrs = { ...firstHeader.attrs, colwidth: [180] };
      firstHeader.content = [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "text", text: " link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }
          ]
        }
      ];
    }

    const markdown = renderTableToGfm(table, mockHelpers);
    expect(markdown).toContain("**Bold**");
    expect(markdown).toContain("[ link](https://example.com)");
  });
});
