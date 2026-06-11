import type { OutlineItem, OutlineTreeItem } from "../types";

export function getDocumentOutline(markdown: string): OutlineItem[] {
  return markdown
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      return {
        id: `${index}-${match[2]}`,
        title: match[2].replace(/[#*_`]/g, "").trim(),
        level: match[1].length,
        line: index + 1,
        order: -1
      };
    })
    .filter((item): item is OutlineItem => Boolean(item))
    .map((item, order) => ({ ...item, order }));
}

export function buildOutlineTree(items: OutlineItem[]): OutlineTreeItem[] {
  const roots: OutlineTreeItem[] = [];
  const stack: OutlineTreeItem[] = [];

  for (const item of items) {
    const next: OutlineTreeItem = { ...item, children: [] };
    while (stack.length && stack[stack.length - 1].level >= next.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(next);
    else roots.push(next);
    stack.push(next);
  }

  return roots;
}
