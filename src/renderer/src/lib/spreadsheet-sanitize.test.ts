import { describe, expect, it } from "vitest";
import { sanitizeCellValue, sanitizeFortuneSheets } from "./spreadsheet-sanitize";

describe("sanitizeFortuneSheets", () => {
  it("drops NaN default row/column dimensions from fortune-excel import", () => {
    const sanitized = sanitizeFortuneSheets([
      {
        name: "Benchmarks",
        defaultRowHeight: Number.NaN,
        defaultColWidth: Number.NaN,
        celldata: [{ r: 0, c: 0, v: { v: "任务分类" } }]
      }
    ]);

    expect(sanitized[0]?.defaultRowHeight).toBeUndefined();
    expect(sanitized[0]?.defaultColWidth).toBeUndefined();
  });

  it("keeps valid default dimensions", () => {
    const sanitized = sanitizeFortuneSheets([
      {
        name: "Sheet1",
        defaultRowHeight: 25,
        defaultColWidth: 72,
        celldata: [{ r: 0, c: 0, v: { v: "Hello" } }]
      }
    ]);

    expect(sanitized[0]?.defaultRowHeight).toBe(25);
    expect(sanitized[0]?.defaultColWidth).toBe(72);
  });
});

describe("sanitizeCellValue", () => {
  it("converts broken inlineStr cells to plain text", () => {
    expect(
      sanitizeCellValue({
        ct: { t: "inlineStr", fa: "General" },
        m: "rich text"
      })
    ).toEqual({
      m: "rich text",
      v: "rich text"
    });
  });

  it("converts inlineStr rich text segments to plain text", () => {
    expect(
      sanitizeCellValue({
        ct: {
          t: "inlineStr",
          s: [{ v: "任" }, { v: "务" }]
        },
        v: "fallback"
      })
    ).toEqual({
      v: "任务",
      m: "任务"
    });
  });
});
