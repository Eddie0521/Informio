import { describe, expect, it } from "vitest";
import { extractOpenCodeSessionId } from "./openCodeSdk";

describe("extractOpenCodeSessionId", () => {
  it("reads the wrapped SDK response shape", () => {
    expect(extractOpenCodeSessionId({ data: { id: "ses_wrapped" } })).toBe("ses_wrapped");
  });

  it("reads the bare Session response shape", () => {
    expect(extractOpenCodeSessionId({ id: "ses_bare", title: "Translate 3.2" })).toBe("ses_bare");
  });

  it("accepts OpenCode sessionID casing", () => {
    expect(extractOpenCodeSessionId({ data: { sessionID: "ses_upper" } })).toBe("ses_upper");
  });

  it("reads nested session objects from compatibility wrappers", () => {
    expect(extractOpenCodeSessionId({ session: { sessionId: "ses_nested" } })).toBe("ses_nested");
    expect(extractOpenCodeSessionId({ data: { session: { id: "ses_data_nested" } } })).toBe("ses_data_nested");
  });

  it("returns an empty string for invalid responses", () => {
    expect(extractOpenCodeSessionId({ data: {} })).toBe("");
    expect(extractOpenCodeSessionId(null)).toBe("");
  });
});
