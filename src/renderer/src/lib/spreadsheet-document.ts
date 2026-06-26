import { pathBaseName } from "./path";

export const spreadsheetDocumentMarkdown = (filePath: string) => {
  const name = pathBaseName(filePath);
  return `[${name}](${name})`;
};
