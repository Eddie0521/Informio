const LATEX_COMMAND_PATTERN =
  /\\(?:in|notin|mathbb|mathbf|mathrm|mathcal|times|cdot|sim|approx|leq|geq|neq|to|rightarrow|leftarrow|Rightarrow|Leftarrow|frac|sqrt|sum|prod|int|log|exp|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|psi|omega)\b/;

const CODE_FENCE_PATTERN = /^\s*(```|~~~)/;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const EXISTING_INLINE_MATH_PATTERN = /\$(?!\$)[^\n$]+?\$(?!\$)/g;
const MATH_SUBSCRIPT_PATTERN = /\b[A-Za-z][A-Za-z0-9]*(?:_\{[^}\n]+\}|_[A-Za-z0-9]+|\^\{[^}\n]+\}|\^[A-Za-z0-9]+)+/g;
const LATEX_RUN_PATTERN =
  /(?:\b[A-Za-z][A-Za-z0-9]*(?:_\{[^}\n]+\}|_[A-Za-z0-9]+|\^\{[^}\n]+\}|\^[A-Za-z0-9]+)?\s+)?\\(?:in|notin|mathbb|mathbf|mathrm|mathcal|times|cdot|sim|approx|leq|geq|neq|to|rightarrow|leftarrow|Rightarrow|Leftarrow|frac|sqrt|sum|prod|int|log|exp|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|psi|omega)\b(?:[A-Za-z0-9_\\^{}\[\]()+\-*/=,.;:|<> \t]*[A-Za-z0-9_\\^{}\]\)])?/g;

type ProtectedRange = { start: number; end: number };

const protectedRanges = (line: string): ProtectedRange[] => {
  const ranges: ProtectedRange[] = [];
  for (const pattern of [INLINE_CODE_PATTERN, EXISTING_INLINE_MATH_PATTERN]) {
    for (const match of line.matchAll(pattern)) {
      ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
    }
  }
  return ranges;
};

const rangeOverlaps = (ranges: ProtectedRange[], start: number, end: number) =>
  ranges.some((range) => start < range.end && end > range.start);

const wrapMatches = (line: string, pattern: RegExp, shouldWrap: (match: string) => boolean) => {
  const ranges = protectedRanges(line);
  let output = "";
  let lastIndex = 0;

  for (const match of line.matchAll(pattern)) {
    const start = match.index ?? 0;
    const value = match[0];
    const end = start + value.length;
    if (rangeOverlaps(ranges, start, end) || !shouldWrap(value)) continue;
    output += line.slice(lastIndex, start);
    output += `$${value.trim()}$`;
    lastIndex = end;
  }

  if (lastIndex === 0) return line;
  return output + line.slice(lastIndex);
};

const normalizeAgentMathLine = (line: string) => {
  const withLatexRuns = wrapMatches(line, LATEX_RUN_PATTERN, (value) => LATEX_COMMAND_PATTERN.test(value));
  return wrapMatches(withLatexRuns, MATH_SUBSCRIPT_PATTERN, (value) => value.length <= 80);
};

export const normalizeAgentMathMarkdown = (markdown: string) => {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (CODE_FENCE_PATTERN.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return normalizeAgentMathLine(line);
    })
    .join("\n");
};
