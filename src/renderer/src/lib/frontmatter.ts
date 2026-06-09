import * as YAML from "yaml";
import type { FrontmatterParseResult } from "../types";

export const parseFrontmatter = (markdown: string): FrontmatterParseResult => {
  if (!markdown.startsWith("---\n") && markdown.trim() !== "---") return { hasFrontmatter: false, raw: "", body: markdown, values: {} };
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) return { hasFrontmatter: true, raw: markdown.slice(4), body: "", values: {}, error: "Frontmatter is missing a closing --- line." };
  const closeEnd = markdown.indexOf("\n", end + 4);
  const raw = markdown.slice(4, end).replace(/^\n/, "");
  const body = closeEnd >= 0 ? markdown.slice(closeEnd + 1) : "";
  try {
    const parsed = YAML.parse(raw || "{}");
    return { hasFrontmatter: true, raw, body, values: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {} };
  } catch (error) {
    return { hasFrontmatter: true, raw, body, values: {}, error: error instanceof Error ? error.message : String(error) };
  }
};

export const stringifyFrontmatter = (values: Record<string, unknown>) => {
  const yaml = YAML.stringify(values, { lineWidth: 0 }).trim();
  return yaml ? `---\n${yaml}\n---\n` : "";
};

export const composeMarkdownWithFrontmatter = (frontmatter: FrontmatterParseResult, body: string) =>
  frontmatter.hasFrontmatter ? `---\n${frontmatter.raw.trimEnd()}\n---\n${body.replace(/^\n+/, "")}` : body;
