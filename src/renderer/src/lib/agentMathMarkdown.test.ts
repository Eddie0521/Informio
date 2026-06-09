import { describe, expect, it } from "vitest";
import { normalizeAgentMathMarkdown } from "./agentMathMarkdown";

describe("normalizeAgentMathMarkdown", () => {
  it("wraps bare LaTeX runs from agent prose", () => {
    const markdown = "得到 RGB 条件视频 V \\in \\mathbb{R}^{C \\times T \\times H \\times W}。";

    expect(normalizeAgentMathMarkdown(markdown)).toBe("得到 RGB 条件视频 $V \\in \\mathbb{R}^{C \\times T \\times H \\times W}$。");
  });

  it("wraps standalone equation lines as display math", () => {
    const markdown = "z_cond = [E(V); E(D)] \\in \\mathbb{R}^{2C_z \\times T_z \\times H_z \\times W_z}.";

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      ["$$", "z_{cond} = [E(V); E(D)] \\in \\mathbb{R}^{2C_z \\times T_z \\times H_z \\times W_z}.", "$$"].join("\n")
    );
  });

  it("wraps operator-only formula lines and fixes multi-letter subscripts", () => {
    const markdown = "K = (1 − α) K_old + α K_new,    V = (1 − α) V_old + α V_new    (6)";

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      [
        "$$",
        "K = (1 - \\alpha ) K_{old} + \\alpha  K_{new},    V = (1 - \\alpha ) V_{old} + \\alpha  V_{new}    (6)",
        "$$"
      ].join("\n")
    );
  });

  it("wraps bare inline assignment formulas inside Chinese prose", () => {
    const markdown = "其中 α 在过渡窗口内按余弦调度从 0 增加到 1： α(t) = ½(1 − cos πt)。";

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      "其中 α 在过渡窗口内按余弦调度从 0 增加到 1： $\\alpha (t) = \\frac{1}{2}(1 - \\cos \\pi t)$。"
    );
  });

  it("normalizes compact inline window variables from pasted agent prose", () => {
    const markdown = "并将过渡窗口长度设为 Wapt = Wmin + d · (Wmax − Wmin)，四舍五入到最近的片段边界。";

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      "并将过渡窗口长度设为 $W_{apt} = W_{min} + d \\cdot  (W_{max} - W_{min})$，四舍五入到最近的片段边界。"
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

  it("wraps bare multi-line display equations from agent translations", () => {
    const markdown = [
      "单个主体 j，此注入公式为：",
      "",
      "\\tilde{z}_t = \\left[ z'_t; E(I_j ) \\right]",
      "\\in \\mathbb{R}^{C_z \\times (T_z + 1) \\times H_z \\times",
      "W_z}. \\tag{4}",
      "",
      "该公式自然地扩展到 N 个智能体场景。"
    ].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      [
        "单个主体 j，此注入公式为：",
        "",
        "$$",
        "\\tilde{z}_t = \\left[ z'_t; E(I_j ) \\right]",
        "\\in \\mathbb{R}^{C_z \\times (T_z + 1) \\times H_z \\times",
        "W_z}. \\tag{4}",
        "$$",
        "",
        "该公式自然地扩展到 N 个智能体场景。"
      ].join("\n")
    );
  });

  it("normalizes bracket display math delimiters for the existing math block parser", () => {
    const markdown = ["\\[", "x_i \\in \\mathbb{R}^{C \\times T}", "\\]"].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe(["$$", "x_i \\in \\mathbb{R}^{C \\times T}", "$$"].join("\n"));
  });

  it("normalizes existing display math source without changing the delimiters", () => {
    const markdown = ["$$", "K_old + V_new = 1", "$$"].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe(["$$", "K_{old} + V_{new} = 1", "$$"].join("\n"));
  });

  it("unwraps prose accidentally placed inside display math delimiters", () => {
    const markdown = ["$$", "Looking at the extracted text, I can see this is a paper about MultiWorld.", "$$"].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe("Looking at the extracted text, I can see this is a paper about MultiWorld.");
  });

  it("closes malformed display math before prose so body text is not swallowed", () => {
    const markdown = [
      "$$\\mathbf{z}_{\\text{cond}} = [\\mathcal{E}(\\mathbf{V});",
      "\\mathcal{E}(\\mathbf{D})] \\in \\mathbb{R}^{2C_z \\times T_z",
      "\\times H_z \\times W_z}.",
      "为匹配扩散模型的潜空间，该联合表示由一个零初始化的特征压缩网络处理。",
      "\\mathbf{z}'_t = \\mathbf{z}_t + F_{zero}(\\mathbf{z}_{cond}).",
      "$$",
      "该公式通过简单地追加额外的潜身份帧自然地扩展。"
    ].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      [
        "$$",
        "\\mathbf{z}_{\\text{cond}} = [\\mathcal{E}(\\mathbf{V});",
        "\\mathcal{E}(\\mathbf{D})] \\in \\mathbb{R}^{2C_z \\times T_z",
        "\\times H_z \\times W_z}.",
        "$$",
        "为匹配扩散模型的潜空间，该联合表示由一个零初始化的特征压缩网络处理。",
        "$$",
        "\\mathbf{z}'_t = \\mathbf{z}_t + F_{zero}(\\mathbf{z}_{cond}).",
        "$$",
        "该公式通过简单地追加额外的潜身份帧自然地扩展。"
      ].join("\n")
    );
  });

  it("keeps reference links and prose visible after a malformed display block", () => {
    const markdown = [
      "$$x_i \\in \\mathbb{R}^{C \\times T}",
      "从论文参考文献中提取：",
      "",
      "- **MultiWorld** [28]: https://arxiv.org/abs/2604.18564",
      "- **VerseCrafter** [36]: https://arxiv.org/abs/2601.07261"
    ].join("\n");

    expect(normalizeAgentMathMarkdown(markdown)).toBe(
      [
        "$$",
        "x_i \\in \\mathbb{R}^{C \\times T}",
        "$$",
        "从论文参考文献中提取：",
        "",
        "- **MultiWorld** [28]: https://arxiv.org/abs/2604.18564",
        "- **VerseCrafter** [36]: https://arxiv.org/abs/2601.07261"
      ].join("\n")
    );
  });
});
