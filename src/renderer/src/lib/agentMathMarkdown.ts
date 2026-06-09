const LATEX_COMMAND_PATTERN =
  /\\(?:in|notin|mathbb|mathbf|mathrm|mathcal|times|cdot|sim|approx|leq|geq|neq|to|rightarrow|leftarrow|Rightarrow|Leftarrow|frac|sqrt|sum|prod|int|log|exp|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|psi|omega)\b/;

const CODE_FENCE_PATTERN = /^\s*(```|~~~)/;
const CJK_PATTERN = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const EXISTING_INLINE_MATH_PATTERN = /\$(?!\$)[^\n$]+?\$(?!\$)/g;
const DISPLAY_MATH_OPEN_PATTERN = /^\s*(?:\$\$|\\\[)\s*$/;
const DISPLAY_MATH_CLOSE_PATTERN = /^\s*(?:\$\$|\\\])\s*$/;
const DISPLAY_MATH_INLINE_OPEN_PATTERN = /^\s*(?:\$\$|\\\[)\s*(\S.*)$/;
const DISPLAY_MATH_INLINE_CLOSE_PATTERN = /^(.*\S)\s*(?:\$\$|\\\])\s*$/;
const MATH_SUBSCRIPT_PATTERN = /\b[A-Za-z][A-Za-z0-9]*(?:_\{[^}\n]+\}|_[A-Za-z0-9]+|\^\{[^}\n]+\}|\^[A-Za-z0-9]+)+/g;
const LATEX_RUN_PATTERN =
  /(?:\b[A-Za-z][A-Za-z0-9]*(?:_\{[^}\n]+\}|_[A-Za-z0-9]+|\^\{[^}\n]+\}|\^[A-Za-z0-9]+)?\s+)?\\(?:in|notin|mathbb|mathbf|mathrm|mathcal|times|cdot|sim|approx|leq|geq|neq|to|rightarrow|leftarrow|Rightarrow|Leftarrow|frac|sqrt|sum|prod|int|log|exp|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|psi|omega)\b(?:[A-Za-z0-9_\\^{}\[\]()+\-*/=,.;:|<> \t]*[A-Za-z0-9_\\^{}\]\)])?/g;
const BARE_DISPLAY_MATH_HINT_PATTERN =
  /(?:^\\[A-Za-z]+|\\(?:left|right|begin|end|tag|in|mathbb|times|frac|sum|prod|int)\b|[A-Za-z][A-Za-z0-9]*(?:_\{[^}\n]+\}|_[A-Za-z0-9]+|\^\{[^}\n]+\}|\^[A-Za-z0-9]+)\s*=|=\s*\\|\]\s*\\(?:in|to)|\\tag\{[^}\n]+})/;
const MARKDOWN_BLOCK_START_PATTERN = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|)/;
const FORMULA_OPERATOR_PATTERN = /(?:=|[+\-−*/]|\\(?:times|cdot)\b)/;
const FORMULA_IDENTIFIER_PATTERN = /\b[A-Z][A-Za-z0-9]*(?:_\{?[^}\s,.;]+}?|'\b)?/;
const MULTI_LETTER_SUBSCRIPT_PATTERN = /\b([A-Za-z][A-Za-z0-9]*)_([A-Za-z]{2,})(?=\b)/g;
const MULTI_LETTER_SUPERSCRIPT_PATTERN = /\b([A-Za-z][A-Za-z0-9]*)\^([A-Za-z]{2,})(?=\b)/g;
const INLINE_ASSIGNMENT_FORMULA_PATTERN =
  /(?:\b[A-Za-z][A-Za-z0-9]*(?:\([A-Za-z0-9]+\))?|[αβγδθλμπρστφψω](?:\([A-Za-z0-9]+\))?)\s*=\s*[^。；;，,\n]{1,140}/g;
const COMPACT_SUBSCRIPT_PATTERN = /\b([A-Z])(?:apt|min|max|old|new|cond)\b/g;
const MATH_FUNCTION_PATTERN = /\b(cos|sin|tan|log|exp)\b/g;

const MATH_UNICODE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/−/g, "-"],
  [/×/g, String.raw`\times `],
  [/·/g, String.raw`\cdot `],
  [/½/g, String.raw`\frac{1}{2}`],
  [/α/g, String.raw`\alpha `],
  [/β/g, String.raw`\beta `],
  [/γ/g, String.raw`\gamma `],
  [/δ/g, String.raw`\delta `],
  [/θ/g, String.raw`\theta `],
  [/λ/g, String.raw`\lambda `],
  [/μ/g, String.raw`\mu `],
  [/π/g, String.raw`\pi `],
  [/ρ/g, String.raw`\rho `],
  [/σ/g, String.raw`\sigma `],
  [/τ/g, String.raw`\tau `],
  [/φ/g, String.raw`\phi `],
  [/ψ/g, String.raw`\psi `],
  [/ω/g, String.raw`\omega `]
];

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

const normalizeDisplayMathSourceLine = (line: string) =>
  MATH_UNICODE_REPLACEMENTS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), line)
    .replace(MULTI_LETTER_SUBSCRIPT_PATTERN, "$1_{$2}")
    .replace(MULTI_LETTER_SUPERSCRIPT_PATTERN, "$1^{$2}")
    .replace(MATH_FUNCTION_PATTERN, "\\$1")
    .replace(COMPACT_SUBSCRIPT_PATTERN, (_match, variable: string) => {
      const suffix = _match.slice(variable.length);
      return `${variable}_{${suffix}}`;
    });

const normalizeAgentMathLine = (line: string) => {
  const withInlineAssignments = wrapMatches(line, INLINE_ASSIGNMENT_FORMULA_PATTERN, (value) => {
    if (!FORMULA_OPERATOR_PATTERN.test(value)) return false;
    return /(?:[A-Za-z][A-Za-z0-9]*|[αβγδθλμπρστφψω])\s*(?:\(|=)/.test(value);
  });
  const withNormalizedInlineAssignments = withInlineAssignments.replace(/\$(?!\$)([^\n$]+?)\$(?!\$)/g, (match, source: string) => {
    INLINE_ASSIGNMENT_FORMULA_PATTERN.lastIndex = 0;
    if (!INLINE_ASSIGNMENT_FORMULA_PATTERN.test(source)) return match;
    INLINE_ASSIGNMENT_FORMULA_PATTERN.lastIndex = 0;
    return `$${normalizeDisplayMathSourceLine(source)}$`;
  });
  const withLatexRuns = wrapMatches(withNormalizedInlineAssignments, LATEX_RUN_PATTERN, (value) => LATEX_COMMAND_PATTERN.test(value));
  return wrapMatches(withLatexRuns, MATH_SUBSCRIPT_PATTERN, (value) => value.length <= 80);
};

const isBareDisplayMathLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (CJK_PATTERN.test(trimmed)) return false;
  if (MARKDOWN_BLOCK_START_PATTERN.test(trimmed)) return false;
  if (trimmed.includes("`")) return false;
  if (trimmed.length > 240) return false;
  return BARE_DISPLAY_MATH_HINT_PATTERN.test(trimmed) || (FORMULA_OPERATOR_PATTERN.test(trimmed) && FORMULA_IDENTIFIER_PATTERN.test(trimmed));
};

const isDisplayMathContinuationLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (CJK_PATTERN.test(trimmed)) return false;
  if (MARKDOWN_BLOCK_START_PATTERN.test(trimmed)) return false;
  if (trimmed.includes("`")) return false;
  if (trimmed.length > 240) return false;
  return (
    LATEX_COMMAND_PATTERN.test(trimmed)
    || /\\tag\{[^}\n]+}/.test(trimmed)
    || BARE_DISPLAY_MATH_HINT_PATTERN.test(trimmed)
    || (FORMULA_OPERATOR_PATTERN.test(trimmed) && FORMULA_IDENTIFIER_PATTERN.test(trimmed))
  );
};

const isDisplayMathSourceLine = (line: string) => isBareDisplayMathLine(line) || isDisplayMathContinuationLine(line);

const normalizeDisplayMathDelimiters = (line: string) => {
  if (/^\s*\\\[\s*$/.test(line)) return "$$";
  if (/^\s*\\\]\s*$/.test(line)) return "$$";
  return line;
};

const normalizedDisplayMathBlock = (lines: string[]) => ["$$", ...lines.map(normalizeDisplayMathSourceLine), "$$"];

const splitDisplayMathContent = (lines: string[]) => {
  const firstProseIndex = lines.findIndex((contentLine) => !isDisplayMathSourceLine(contentLine));
  return {
    mathLines: firstProseIndex === -1 ? lines : lines.slice(0, firstProseIndex),
    proseLines: firstProseIndex === -1 ? [] : lines.slice(firstProseIndex)
  };
};

const emitDisplayMathContent = (output: string[], lines: string[]) => {
  const { mathLines, proseLines } = splitDisplayMathContent(lines);
  if (mathLines.length > 0) output.push(...normalizedDisplayMathBlock(mathLines));
  if (proseLines.length > 0) output.push(...normalizeAgentMathBlocks(proseLines.join("\n")).split("\n"));
};

const normalizeAgentMathBlocks = (markdown: string) => {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (CODE_FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    const inlineDisplayOpen = line.match(DISPLAY_MATH_INLINE_OPEN_PATTERN);
    if (inlineDisplayOpen) {
      const content = [inlineDisplayOpen[1]];
      let contentEnd = lines.length;

      const sameLineClose = content[0].match(DISPLAY_MATH_INLINE_CLOSE_PATTERN);
      if (sameLineClose) {
        content[0] = sameLineClose[1];
        contentEnd = index;
      } else {
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
          const closingLine = lines[cursor];
          if (DISPLAY_MATH_CLOSE_PATTERN.test(closingLine)) {
            contentEnd = cursor;
            break;
          }

          const inlineClose = closingLine.match(DISPLAY_MATH_INLINE_CLOSE_PATTERN);
          if (inlineClose) {
            content.push(inlineClose[1]);
            contentEnd = cursor;
            break;
          }

          content.push(closingLine);
        }
      }

      emitDisplayMathContent(output, content);
      index = contentEnd < lines.length ? contentEnd : lines.length - 1;
      continue;
    }

    if (DISPLAY_MATH_OPEN_PATTERN.test(line) || DISPLAY_MATH_CLOSE_PATTERN.test(line)) {
      const contentStart = index + 1;
      let contentEnd = lines.length;
      for (let cursor = contentStart; cursor < lines.length; cursor += 1) {
        const closingLine = lines[cursor];
        if (DISPLAY_MATH_CLOSE_PATTERN.test(closingLine)) {
          contentEnd = cursor;
          break;
        }

        const inlineClose = closingLine.match(DISPLAY_MATH_INLINE_CLOSE_PATTERN);
        if (inlineClose) {
          lines[cursor] = inlineClose[1];
          contentEnd = cursor;
          break;
        }
      }

      emitDisplayMathContent(output, lines.slice(contentStart, contentEnd + (contentEnd < lines.length && !DISPLAY_MATH_CLOSE_PATTERN.test(lines[contentEnd]) ? 1 : 0)));
      index = contentEnd < lines.length ? contentEnd : lines.length - 1;
      continue;
    }

    if (!isBareDisplayMathLine(line)) {
      output.push(line);
      continue;
    }

    const block = [line];
    let cursor = index + 1;
    while (cursor < lines.length && isDisplayMathContinuationLine(lines[cursor])) {
      block.push(lines[cursor]);
      cursor += 1;
    }

    output.push("$$", ...block.map(normalizeDisplayMathSourceLine), "$$");
    index = cursor - 1;
  }

  return output.join("\n");
};

export const normalizeAgentMathMarkdown = (markdown: string) => {
  let inFence = false;
  let inDisplayMath = false;
  return normalizeAgentMathBlocks(markdown)
    .split("\n")
    .map((line) => {
      if (CODE_FENCE_PATTERN.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (DISPLAY_MATH_OPEN_PATTERN.test(line) || DISPLAY_MATH_CLOSE_PATTERN.test(line)) {
        inDisplayMath = !inDisplayMath;
        return line;
      }
      if (inDisplayMath) return line;
      return normalizeAgentMathLine(line);
    })
    .join("\n");
};
