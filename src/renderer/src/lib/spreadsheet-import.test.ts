import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { sanitizeFortuneSheets } from "./spreadsheet-sanitize";

const require = createRequire(import.meta.url);
const JSZip = require("jszip/dist/jszip.min.js");
const { FortuneFile } = require("@corbe30/fortune-excel/dist/ToFortuneSheet/FortuneFile.js");

const fixturePath = resolve("test-fixtures/Benchmark_完整表格.xlsx");

const importBenchmarkSheets = async () => {
  const buffer = readFileSync(fixturePath);
  const zip = await JSZip.loadAsync(new Uint8Array(buffer));
  const files: Record<string, unknown> = {};
  for (const [path, entry] of Object.entries(zip.files) as [string, { dir: boolean; async: (type: string) => Promise<unknown> }][]) {
    if (entry.dir) continue;
    const suffix = path.split(".").pop()?.toLowerCase();
    const fileType = ["png", "jpeg", "jpg", "gif", "bmp", "tif", "webp"].includes(suffix ?? "")
      ? "base64"
      : suffix === "emf"
        ? "arraybuffer"
        : "string";
    files[path] = await entry.async(fileType);
  }
  const ff = new FortuneFile(files, "Benchmark_完整表格.xlsx");
  ff.Parse();
  return ff.serialize().sheets;
};

describe("Benchmark xlsx import", () => {
  it("sanitizes fortune-excel NaN defaults that break FortuneSheet grid sizing", async () => {
    const imported = await importBenchmarkSheets();
    expect(imported.length).toBeGreaterThan(0);
    expect(imported[0]?.celldata?.length ?? 0).toBeGreaterThan(0);
    expect(Number.isNaN(Number(imported[0]?.defaultRowHeight))).toBe(true);
    expect(Number.isNaN(Number(imported[0]?.defaultColWidth))).toBe(true);

    const sanitized = sanitizeFortuneSheets(imported);
    expect(sanitized[0]?.defaultRowHeight).toBeUndefined();
    expect(sanitized[0]?.defaultColWidth).toBeUndefined();
    expect(sanitized[0]?.celldata?.[0]?.v).toMatchObject({ v: "任务分类" });
  }, 30_000);
});
