import { describe, expect, it } from "vitest";

import { sanitizeAgentResponse, sanitizeAgentTextPart } from "./agentResponse.js";

describe("sanitizeAgentResponse", () => {
  it("keeps partial think tags hidden while streaming", () => {
    expect(sanitizeAgentTextPart("<thi", { trim: false })).toBe("");
    expect(sanitizeAgentTextPart("<think>The user wants me to inspect files", { trim: false })).toBe("");
    expect(sanitizeAgentTextPart("<think>The user wants me to inspect files</think>结论：已完成。")).toBe("结论：已完成。");
  });

  it("removes leaked think blocks", () => {
    expect(sanitizeAgentResponse("<think>I should inspect files first.</think>\n\n结论：已完成。")).toBe("结论：已完成。");
  });

  it("filters leaked reasoning lines when no clear boundary exists", () => {
    // Content with reasoning leak pattern but no finalAnswerBoundary (no 结论/总结/Summary:)
    // This triggers the else branch at line 25
    const content = "I need to read the file first.\nThe user wants me to check the config.\nHere is the result:\nThe config is valid.";
    const result = sanitizeAgentResponse(content);
    // "I need to" and "The user wants me" lines should be filtered
    expect(result).not.toContain("I need to");
    expect(result).not.toContain("The user wants me");
    expect(result).toContain("Here is the result:");
  });

  it("keeps the final answer when OpenCode leaks reasoning before a summary", () => {
    const content = [
      "The user wants me to summarize a paper.",
      "",
      "I need to read the PDF file first.",
      "",
      "Key points:",
      "1. Draft note that should not be shown",
      "",
      "论文总结：MultiWorld",
      "",
      "MultiWorld 是一个多智能体视频世界模型框架。"
    ].join("\n");

    expect(sanitizeAgentResponse(content)).toBe("论文总结：MultiWorld\n\nMultiWorld 是一个多智能体视频世界模型框架。");
  });
});
