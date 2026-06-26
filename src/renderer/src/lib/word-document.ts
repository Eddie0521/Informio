import { pathBaseName } from "./path";

export const wordDocumentMarkdown = (filePath: string) => {
  const name = pathBaseName(filePath);
  return `[${name}](${name})`;
};
