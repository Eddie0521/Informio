import { describe, expect, it } from "vitest";
import {
  normalizeEditorPanes,
  formatRelative,
  clamp,
  sameAgentSelection,
  samePdfSelectionRects,
  findNextTextMatch,
  buildEditorTextSearchIndex
} from "./editor-utils";

// Lightweight ProseMirror node mock for buildEditorTextSearchIndex
function mockTextNode(text: string, pos: number) {
  return {
    isText: true,
    isTextblock: false,
    text,
    type: { name: "text" },
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      cb({ isText: true, isTextblock: false, text, type: { name: "text" } }, pos);
    }
  };
}

function mockHardBreak(pos: number) {
  return {
    isText: false,
    isTextblock: false,
    type: { name: "hardBreak" },
    text: undefined
  };
}

function mockTextBlock(children: Array<{ node: unknown; childPos: number }>, blockPos: number) {
  return {
    isText: false,
    isTextblock: true,
    type: { name: "paragraph" },
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      for (const { node, childPos } of children) {
        cb(node, childPos);
      }
    }
  };
}

function mockDoc(blocks: Array<{ block: unknown; pos: number }>) {
  return {
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      for (const { block, pos } of blocks) {
        const shouldDescend = cb(block, pos);
        if (shouldDescend === false) continue;
      }
    }
  };
}

describe("normalizeEditorPanes", () => {
  it("filters invalid document ids", () => {
    const panes = [{ id: "main" as const, documentId: "a" }, { id: "secondary" as const, documentId: "b" }];
    const result = normalizeEditorPanes(panes, (id) => id === "a");
    expect(result).toEqual([{ id: "main", documentId: "a" }]);
  });

  it("removes duplicate document ids", () => {
    const panes = [{ id: "main" as const, documentId: "a" }, { id: "secondary" as const, documentId: "a" }];
    const result = normalizeEditorPanes(panes);
    expect(result).toEqual([{ id: "main", documentId: "a" }]);
  });

  it("caps at 2 panes", () => {
    const panes = [
      { id: "main" as const, documentId: "a" },
      { id: "secondary" as const, documentId: "b" },
      { id: "main" as const, documentId: "c" }
    ];
    const result = normalizeEditorPanes(panes);
    expect(result).toHaveLength(2);
  });

  it("returns empty for all invalid", () => {
    const panes = [{ id: "main" as const, documentId: "x" }];
    expect(normalizeEditorPanes(panes, () => false)).toEqual([]);
  });
});

describe("formatRelative", () => {
  it("shows minutes for recent timestamps", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelative(fiveMinAgo)).toBe("edited 5m ago");
  });

  it("shows hours for older timestamps", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelative(threeHoursAgo)).toBe("edited 3h ago");
  });

  it("shows yesterday for 24h+", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    expect(formatRelative(twoDaysAgo)).toBe("edited yesterday");
  });
});

describe("clamp", () => {
  it("clamps to min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns value in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("samePdfSelectionRects", () => {
  it("returns true for both undefined", () => {
    expect(samePdfSelectionRects(undefined, undefined)).toBe(true);
  });

  it("returns true for same rects", () => {
    const rects = [{ x: 1, y: 2, width: 3, height: 4 }];
    expect(samePdfSelectionRects(rects, rects)).toBe(true);
  });

  it("returns false for different length", () => {
    const a = [{ x: 1, y: 2, width: 3, height: 4 }];
    expect(samePdfSelectionRects(a, [])).toBe(false);
  });

  it("returns false for different values", () => {
    const a = [{ x: 1, y: 2, width: 3, height: 4 }];
    const b = [{ x: 1, y: 2, width: 3, height: 5 }];
    expect(samePdfSelectionRects(a, b)).toBe(false);
  });
});

describe("sameAgentSelection", () => {
  it("returns true for both null", () => {
    expect(sameAgentSelection(null, null)).toBe(true);
  });

  it("returns true for same reference", () => {
    const sel = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    expect(sameAgentSelection(sel, sel)).toBe(true);
  });

  it("returns false for null vs value", () => {
    const sel = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    expect(sameAgentSelection(null, sel)).toBe(false);
  });

  it("returns false for different text", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    const b = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "world", markdown: "world" };
    expect(sameAgentSelection(a, b)).toBe(false);
  });
});

describe("findNextTextMatch", () => {
  it("finds match at fromIndex", () => {
    expect(findNextTextMatch("hello world", "world", 0)).toEqual({ start: 6, end: 11 });
  });

  it("wraps around", () => {
    expect(findNextTextMatch("hello world", "hello", 5)).toEqual({ start: 0, end: 5 });
  });

  it("returns null for empty query", () => {
    expect(findNextTextMatch("hello", "", 0)).toBeNull();
  });

  it("returns null for no match", () => {
    expect(findNextTextMatch("hello", "xyz", 0)).toBeNull();
  });
});

describe("normalizeEditorPanes additional branches", () => {
  it("preserves two distinct valid panes", () => {
    const panes = [
      { id: "main" as const, documentId: "a" },
      { id: "secondary" as const, documentId: "b" }
    ];
    const result = normalizeEditorPanes(panes);
    expect(result).toEqual([
      { id: "main", documentId: "a" },
      { id: "secondary", documentId: "b" }
    ]);
  });

  it("normalizes id labels to main/secondary based on index", () => {
    const panes = [
      { id: "secondary" as const, documentId: "x" },
      { id: "main" as const, documentId: "y" }
    ];
    const result = normalizeEditorPanes(panes);
    expect(result[0].id).toBe("main");
    expect(result[1].id).toBe("secondary");
  });

  it("returns empty array for empty input", () => {
    expect(normalizeEditorPanes([])).toEqual([]);
  });

  it("handles single valid pane", () => {
    const panes = [{ id: "main" as const, documentId: "only" }];
    const result = normalizeEditorPanes(panes);
    expect(result).toEqual([{ id: "main", documentId: "only" }]);
  });

  it("filters first pane invalid but second valid", () => {
    const panes = [
      { id: "main" as const, documentId: "bad" },
      { id: "secondary" as const, documentId: "good" }
    ];
    const result = normalizeEditorPanes(panes, (id) => id === "good");
    expect(result).toEqual([{ id: "main", documentId: "good" }]);
  });
});

describe("samePdfSelectionRects additional branches", () => {
  it("returns false when left is undefined and right is defined", () => {
    const right = [{ x: 1, y: 2, width: 3, height: 4 }];
    expect(samePdfSelectionRects(undefined, right)).toBe(false);
  });

  it("returns false when left is defined and right is undefined", () => {
    const left = [{ x: 1, y: 2, width: 3, height: 4 }];
    expect(samePdfSelectionRects(left, undefined)).toBe(false);
  });

  it("returns true for empty arrays", () => {
    expect(samePdfSelectionRects([], [])).toBe(true);
  });

  it("returns true for multiple identical rects", () => {
    const rects = [
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 5, y: 6, width: 7, height: 8 }
    ];
    expect(samePdfSelectionRects(rects, [...rects])).toBe(true);
  });

  it("returns false when one rect differs among many", () => {
    const a = [
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 5, y: 6, width: 7, height: 8 }
    ];
    const b = [
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 5, y: 6, width: 7, height: 99 }
    ];
    expect(samePdfSelectionRects(a, b)).toBe(false);
  });
});

describe("sameAgentSelection additional branches", () => {
  it("returns false for value vs null (right)", () => {
    const sel = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    expect(sameAgentSelection(sel, null)).toBe(false);
  });

  it("returns false for different kind", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    const b = { kind: "pdf" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    expect(sameAgentSelection(a, b)).toBe(false);
  });

  it("returns false for different documentId", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    const b = { kind: "markdown" as const, documentId: "b", from: 0, to: 5, text: "hello", markdown: "hello" };
    expect(sameAgentSelection(a, b)).toBe(false);
  });

  it("returns false for different from/to", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hello" };
    const b = { kind: "markdown" as const, documentId: "a", from: 2, to: 7, text: "hello", markdown: "hello" };
    expect(sameAgentSelection(a, b)).toBe(false);
  });

  it("returns false for different markdown", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "hi" };
    const b = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "hello", markdown: "bye" };
    expect(sameAgentSelection(a, b)).toBe(false);
  });

  it("returns true for equal selections with all optional fields", () => {
    const sel = {
      kind: "pdf" as const,
      documentId: "doc1",
      from: 10,
      to: 20,
      text: "selected",
      markdown: "selected",
      title: "Page Title",
      filePath: "/path/file.pdf",
      page: 3,
      overlayLeft: 100,
      overlayTop: 200,
      rects: [{ x: 1, y: 2, width: 3, height: 4 }]
    };
    expect(sameAgentSelection(sel, { ...sel })).toBe(true);
  });

  it("returns false for different rects", () => {
    const base = {
      kind: "pdf" as const,
      documentId: "doc1",
      from: 10,
      to: 20,
      text: "selected",
      markdown: "selected",
      rects: [{ x: 1, y: 2, width: 3, height: 4 }]
    };
    const other = { ...base, rects: [{ x: 1, y: 2, width: 3, height: 99 }] };
    expect(sameAgentSelection(base, other)).toBe(false);
  });

  it("returns false for different overlayLeft", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "h", markdown: "h", overlayLeft: 10 };
    const b = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "h", markdown: "h", overlayLeft: 20 };
    expect(sameAgentSelection(a, b)).toBe(false);
  });

  it("returns false for different title", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "h", markdown: "h", title: "A" };
    const b = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "h", markdown: "h", title: "B" };
    expect(sameAgentSelection(a, b)).toBe(false);
  });

  it("returns false for different page", () => {
    const a = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "h", markdown: "h", page: 1 };
    const b = { kind: "markdown" as const, documentId: "a", from: 0, to: 5, text: "h", markdown: "h", page: 2 };
    expect(sameAgentSelection(a, b)).toBe(false);
  });
});

describe("buildEditorTextSearchIndex", () => {
  it("builds index from a single text block", () => {
    const textNode = mockTextNode("hello", 1);
    const block = mockTextBlock([{ node: textNode, childPos: 0 }], 0);
    const doc = mockDoc([{ block, pos: 0 }]);

    const result = buildEditorTextSearchIndex(doc as any);
    expect(result.text).toBe("hello");
    expect(result.positions).toEqual([1, 2, 3, 4, 5]);
  });

  it("inserts newline between text blocks", () => {
    const block1 = mockTextBlock([{ node: mockTextNode("ab", 1), childPos: 0 }], 0);
    const block2 = mockTextBlock([{ node: mockTextNode("cd", 5), childPos: 0 }], 4);
    const doc = mockDoc([
      { block: block1, pos: 0 },
      { block: block2, pos: 4 }
    ]);

    const result = buildEditorTextSearchIndex(doc as any);
    expect(result.text).toBe("ab\ncd");
    // positions: a=1, b=2, \n=4(max(0,4)), c=5, d=6
    expect(result.positions).toEqual([1, 2, 4, 5, 6]);
  });

  it("handles hardBreak nodes", () => {
    const textNode1 = mockTextNode("a", 1);
    const hardBreak = mockHardBreak(2);
    const textNode2 = mockTextNode("b", 3);
    const block = mockTextBlock([
      { node: textNode1, childPos: 0 },
      { node: hardBreak, childPos: 2 },
      { node: textNode2, childPos: 3 }
    ], 0);
    const doc = mockDoc([{ block, pos: 0 }]);

    const result = buildEditorTextSearchIndex(doc as any);
    expect(result.text).toBe("a\nb");
    // a=0+1+0+0=1, \n(hardBreak)=0+1+2=3, b=0+1+3+0=4
    expect(result.positions).toEqual([1, 3, 4]);
  });

  it("skips non-textblock nodes", () => {
    const nonTextBlock = {
      isText: false,
      isTextblock: false,
      type: { name: "image" },
      descendants: () => {}
    };
    const textBlock = mockTextBlock([{ node: mockTextNode("ok", 1), childPos: 0 }], 5);
    const doc = mockDoc([
      { block: nonTextBlock, pos: 0 },
      { block: textBlock, pos: 5 }
    ]);

    const result = buildEditorTextSearchIndex(doc as any);
    expect(result.text).toBe("ok");
  });

  it("returns empty index for empty document", () => {
    const doc = mockDoc([]);
    const result = buildEditorTextSearchIndex(doc as any);
    expect(result.text).toBe("");
    expect(result.positions).toEqual([]);
  });

  it("handles multiple children in a single block", () => {
    const block = mockTextBlock([
      { node: mockTextNode("hi", 1), childPos: 0 },
      { node: mockTextNode("bye", 3), childPos: 2 }
    ], 0);
    const doc = mockDoc([{ block, pos: 0 }]);

    const result = buildEditorTextSearchIndex(doc as any);
    expect(result.text).toBe("hibye");
    // pos=0, child1: pos+1+childPos+0=1, pos+1+childPos+1=2
    // child2: pos+1+childPos+0=3, pos+1+childPos+1=4, pos+1+childPos+2=5
    expect(result.positions).toEqual([1, 2, 3, 4, 5]);
  });
});
