import { describe, expect, it } from "vitest";
import { isExternalWebsiteUrl, normalizeExternalWebsiteUrl } from "./external-links";

describe("normalizeExternalWebsiteUrl", () => {
  it("normalizes http and https website URLs", () => {
    expect(normalizeExternalWebsiteUrl(" https://example.com/docs?q=1 ")).toBe("https://example.com/docs?q=1");
    expect(normalizeExternalWebsiteUrl("HTTP://Example.com")).toBe("http://example.com/");
  });

  it("rejects non-website URLs", () => {
    expect(normalizeExternalWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalWebsiteUrl("file:///tmp/report.html")).toBeNull();
    expect(normalizeExternalWebsiteUrl("mailto:hello@example.com")).toBeNull();
    expect(normalizeExternalWebsiteUrl("/relative/path")).toBeNull();
    expect(normalizeExternalWebsiteUrl("")).toBeNull();
  });
});

describe("isExternalWebsiteUrl", () => {
  it("returns true only for valid website URLs", () => {
    expect(isExternalWebsiteUrl("https://example.com")).toBe(true);
    expect(isExternalWebsiteUrl("notaurl")).toBe(false);
  });
});
