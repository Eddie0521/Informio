const reasoningLeakMarkerPattern =
  /(?:<think\b|The user wants me\b|I need to\b|Let me\b|I should\b|I will\b|I'll\b|I've\b|It seems\b|Key points:\s*$)/im;

const finalAnswerBoundaryPattern =
  /(^|\n)(?:[#>*\s-]*(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*)?)?(论文总结|总结|结论(?:先行)?|最终回答|回答|答复|Summary|Conclusion|Final answer)\s*[:：]/iu;

const leakedReasoningLinePattern =
  /^\s*(?:The user wants me\b|I need to\b|Let me\b|I should\b|I will\b|I'll\b|I've\b|It seems\b|The .+ tool\b|Key points:\s*$)/i;

export const sanitizeAgentTextPart = (content: string, options: { trim?: boolean } = {}) => {
  const withoutThinkBlocks = content
    .replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/<t(?:h(?:i(?:n(?:k)?)?)?)?$/i, "");
  return options.trim === false ? withoutThinkBlocks : withoutThinkBlocks.trim();
};

export const sanitizeAgentResponse = (content: string, options: { trim?: boolean } = {}) => {
  let cleaned = sanitizeAgentTextPart(content, { trim: false });
  const hasReasoningLeak = reasoningLeakMarkerPattern.test(cleaned);
  if (hasReasoningLeak) {
    const boundary = cleaned.match(finalAnswerBoundaryPattern);
    if (boundary?.index !== undefined && boundary.index > 0) {
      cleaned = cleaned.slice(boundary.index + boundary[1].length);
    } else {
      cleaned = cleaned
        .split("\n")
        .filter((line) => !leakedReasoningLinePattern.test(line))
        .join("\n");
    }
  }
  const normalized = cleaned.replace(/\n{3,}/g, "\n\n");
  return options.trim === false ? normalized : normalized.trim();
};
