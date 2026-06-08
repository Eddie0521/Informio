import { describe, expect, it } from "vitest";
import { normalizeAgentMathMarkdown } from "./agentMathMarkdown";

describe("normalizeAgentMathMarkdown", () => {
  it("wraps bare LaTeX runs from agent prose", () => {
    const markdown = "得到 RGB 条件视频 V \\in \\mathbb{R}^{C \\times T \\times H \\times W}。";

    expect(normalizeAgentMathMarkdown(markdown)).toBe("得到 RGB 条件视频 $V \\in \\mathbb{R}^{C \\times T \\times H \\times W}$。");
  });

  it("wraps standalone variable subscripts used in equations", () => {
    const markdown = "z_cond = [E(V); E(D)] \\in \\mathbb{R}^{2C_z \\times T_z \\times H_z \\times W_z}.";

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      "$z_cond$ = [E(V); E(D)] $\\in \\mathbb{R}^{2C_z \\times T_z \\times H_z \\times W_z}$."
    );
  });

  it("keeps existing inline math unchanged", () => {
    const markdown = "这里已有 $x_i \\in \\mathbb{R}$，不要重复包裹。";

    expect(normalizeAgentMathMarkdown(markdown)).toBe(markdown);
  });

  it("does not normalize inline code or fenced code blocks", () => {
    const markdown = ["Use `x_i \\in R` as text.", "", "```", "z_cond \\in \\mathbb{R}", "```"].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe(markdown);
  });
});
