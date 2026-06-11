export function markdownToStatusText(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/```([\s\S]*?)```/g, (_match, code: string) => code)
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-+*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^\s*[-+*]\s+\[(?: |x)\]\s+/gim, "")
    .replace(/[*_~]/g, "")
    .replace(/<\/?[^>]+>/g, "");
}

export function countWords(markdown: string) {
  const latinWords = markdown.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
  const cjkChars = markdown.match(/[一-鿿]/g)?.length ?? 0;
  return latinWords + cjkChars;
}

export function countCharacters(markdown: string) {
  return markdownToStatusText(markdown).length;
}

export function countLines(markdown: string) {
  const content = markdownToStatusText(markdown).replace(/\n+$/g, "");
  return content ? content.split("\n").filter((line) => line.trim().length > 0).length : 0;
}
