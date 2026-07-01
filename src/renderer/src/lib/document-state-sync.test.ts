import { describe, expect, it } from "vitest";
import {
  mergeLiveMarkdownIntoDocuments,
  pruneSyncedLiveMarkdown,
  shouldSkipDocumentStateSync
} from "./document-state-sync";
import type { InformioDocument } from "../types";

const makeDocument = (overrides: Partial<InformioDocument> = {}): InformioDocument => ({
  id: "doc-1",
  title: "Test",
  markdown: "# Hello",
  collection: "writing",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("mergeLiveMarkdownIntoDocuments", () => {
  it("returns the same array reference when nothing changed", () => {
    const docs = [makeDocument()];
    const live = new Map<string, string>();
    expect(mergeLiveMarkdownIntoDocuments(docs, live)).toBe(docs);
  });

  it("merges pending markdown for a single document", () => {
    const docs = [makeDocument({ id: "a" }), makeDocument({ id: "b", markdown: "# B" })];
    const live = new Map([["a", "# Updated"]]);
    const merged = mergeLiveMarkdownIntoDocuments(docs, live);
    expect(merged).not.toBe(docs);
    expect(merged[0]?.markdown).toBe("# Updated");
    expect(merged[1]?.markdown).toBe("# B");
  });

  it("ignores live entries equal to current markdown", () => {
    const docs = [makeDocument({ markdown: "# Same" })];
    const live = new Map([["doc-1", "# Same"]]);
    expect(mergeLiveMarkdownIntoDocuments(docs, live)).toBe(docs);
  });
});

describe("pruneSyncedLiveMarkdown", () => {
  it("removes entries that match persisted documents", () => {
    const live = new Map([
      ["doc-1", "# Hello"],
      ["doc-2", "# Pending"]
    ]);
    pruneSyncedLiveMarkdown(live, [
      makeDocument({ id: "doc-1", markdown: "# Hello" }),
      makeDocument({ id: "doc-2", markdown: "# Old" })
    ]);
    expect(live.has("doc-1")).toBe(false);
    expect(live.get("doc-2")).toBe("# Pending");
  });
});

describe("shouldSkipDocumentStateSync", () => {
  it("skips while composing", () => {
    expect(shouldSkipDocumentStateSync(true)).toBe(true);
    expect(shouldSkipDocumentStateSync(false)).toBe(false);
    expect(shouldSkipDocumentStateSync(undefined)).toBe(false);
  });
});
