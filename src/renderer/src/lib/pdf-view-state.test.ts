import { beforeEach, describe, expect, it } from "vitest";
import {
  PDF_VIEW_STATE_CACHE_LIMIT,
  cachePdfViewState,
  getCachedPdfViewState,
  pdfViewStateKey,
  resetPdfViewStateCacheForTest
} from "./pdf-view-state";

describe("pdf view state", () => {
  beforeEach(() => {
    resetPdfViewStateCacheForTest();
  });

  it("builds a stable key from surface mode, pane, and PDF identity", () => {
    expect(
      pdfViewStateKey({
        mode: "full",
        paneId: "main",
        fingerprintFallback: "/Users/me/report.pdf",
        pdfPath: "/tmp/object.pdf"
      })
    ).toBe("full:main:/Users/me/report.pdf");
  });

  it("falls back to the PDF path when no fingerprint is provided", () => {
    expect(
      pdfViewStateKey({
        mode: "compact",
        pdfPath: "/Users/me/embed.pdf"
      })
    ).toBe("compact:default:/Users/me/embed.pdf");
  });

  it("returns null when the PDF has no stable identity", () => {
    expect(pdfViewStateKey({ mode: "full", fingerprintFallback: " ", pdfPath: "" })).toBeNull();
  });

  it("keeps the last valid state for a PDF tab", () => {
    const key = pdfViewStateKey({ mode: "full", paneId: "main", pdfPath: "/Users/me/report.pdf" });
    cachePdfViewState(key, {
      pageNumber: 7,
      scrollOffset: { x: 12, y: 2400 },
      zoomLevel: 1.5,
      updatedAt: 100
    });

    expect(getCachedPdfViewState(key)).toEqual({
      pageNumber: 7,
      scrollOffset: { x: 12, y: 2400 },
      zoomLevel: 1.5,
      updatedAt: 100
    });
  });

  it("does not let invalid first-page initialization overwrite a saved state", () => {
    const key = pdfViewStateKey({ mode: "full", paneId: "main", pdfPath: "/Users/me/report.pdf" });
    cachePdfViewState(key, {
      pageNumber: 9,
      scrollOffset: { x: 0, y: 3200 },
      updatedAt: 100
    });

    cachePdfViewState(key, {
      pageNumber: 0,
      scrollOffset: { x: 0, y: 0 },
      updatedAt: 101
    });

    expect(getCachedPdfViewState(key)?.pageNumber).toBe(9);
  });

  it("prunes the oldest cached PDFs", () => {
    for (let index = 0; index < PDF_VIEW_STATE_CACHE_LIMIT + 1; index += 1) {
      cachePdfViewState(`full:main:/doc-${index}.pdf`, {
        pageNumber: 1,
        scrollOffset: { x: 0, y: index },
        updatedAt: index
      });
    }

    expect(getCachedPdfViewState("full:main:/doc-0.pdf")).toBeNull();
    expect(getCachedPdfViewState(`full:main:/doc-${PDF_VIEW_STATE_CACHE_LIMIT}.pdf`)?.scrollOffset.y).toBe(
      PDF_VIEW_STATE_CACHE_LIMIT
    );
  });
});
