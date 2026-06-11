import { describe, expect, it } from "vitest";
import { getDocumentOutline, buildOutlineTree } from "./outline";

describe("getDocumentOutline", () => {
  it("extracts headings from markdown", () => {
    const md = "# Title\nSome text\n## Subtitle\n### Deep";
    const items = getDocumentOutline(md);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: "Title", level: 1, line: 1 });
    expect(items[1]).toMatchObject({ title: "Subtitle", level: 2, line: 3 });
    expect(items[2]).toMatchObject({ title: "Deep", level: 3, line: 4 });
  });

  it("strips formatting from heading text", () => {
    const md = "# **bold** and `code`";
    const items = getDocumentOutline(md);
    expect(items[0].title).toBe("bold and code");
  });

  it("returns empty array for no headings", () => {
    expect(getDocumentOutline("just plain text\nanother line")).toEqual([]);
  });

  it("assigns sequential order", () => {
    const md = "# A\n# B\n# C";
    const items = getDocumentOutline(md);
    expect(items.map((i) => i.order)).toEqual([0, 1, 2]);
  });
});

describe("buildOutlineTree", () => {
  it("nests deeper headings under parents", () => {
    const items = getDocumentOutline("# A\n## B\n## C\n### D");
    const tree = buildOutlineTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe("A");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].title).toBe("B");
    expect(tree[0].children[1].title).toBe("C");
    expect(tree[0].children[1].children).toHaveLength(1);
    expect(tree[0].children[1].children[0].title).toBe("D");
  });

  it("creates multiple roots for same-level headings", () => {
    const items = getDocumentOutline("# A\n# B");
    const tree = buildOutlineTree(items);
    expect(tree).toHaveLength(2);
    expect(tree[0].title).toBe("A");
    expect(tree[1].title).toBe("B");
  });

  it("handles empty input", () => {
    expect(buildOutlineTree([])).toEqual([]);
  });

  it("handles skipped levels", () => {
    const items = getDocumentOutline("# A\n### Deep without h2");
    const tree = buildOutlineTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].title).toBe("Deep without h2");
  });
});
