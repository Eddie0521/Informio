import { describe, expect, it, vi } from "vitest";
import { registerSpreadsheetSaveHandler, saveSpreadsheetDocumentNow } from "./spreadsheet-save-bridge";

describe("spreadsheet-save-bridge", () => {
  it("registers and invokes save handlers by document id", async () => {
    const save = vi.fn(async () => undefined);
    const unregister = registerSpreadsheetSaveHandler("doc-1", save);

    await expect(saveSpreadsheetDocumentNow("doc-1")).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);

    unregister();
    await expect(saveSpreadsheetDocumentNow("doc-1")).resolves.toBe(false);
  });
});
