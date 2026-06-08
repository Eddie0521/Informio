export const CLIPBOARD_FRAGMENT_MARKER_PATTERN = /<!--\s*(?:StartFragment|EndFragment)\s*-->/gi;

export const stripClipboardFragmentMarkers = (value: string) => value.replace(CLIPBOARD_FRAGMENT_MARKER_PATTERN, "");

export const extractClipboardHtmlFragment = (html: string) => {
  const startMatch = /<!--\s*StartFragment\s*-->/i.exec(html);
  const endMatch = /<!--\s*EndFragment\s*-->/i.exec(html);
  if (!startMatch || !endMatch || endMatch.index < startMatch.index) return stripClipboardFragmentMarkers(html);
  return html.slice(startMatch.index + startMatch[0].length, endMatch.index);
};

const removeHtmlComments = (root: DocumentFragment) => {
  const comments: Comment[] = [];
  const walker = document.createTreeWalker(root, globalThis.NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((comment) => comment.remove());
};

const pasteAttributeAllowed = (element: Element, name: string) => {
  const tagName = element.tagName.toLowerCase();
  if (name === "href") return tagName === "a";
  if (name === "src" || name === "alt" || name === "title") return tagName === "img";
  if (name === "colspan" || name === "rowspan") return tagName === "td" || tagName === "th";
  if (name === "checked") return tagName === "input";
  return false;
};

export const sanitizeHtmlFragmentForPaste = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = extractClipboardHtmlFragment(html);
  removeHtmlComments(template.content);
  template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith("on")
        || !pasteAttributeAllowed(node, name)
        || ((name === "href" || name === "src") && value.startsWith("javascript:"))
      ) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.content;
};

export const plainTextFromHtml = (html: string) => {
  const fragment = sanitizeHtmlFragmentForPaste(html);
  const container = document.createElement("div");
  container.appendChild(fragment.cloneNode(true));
  return (container.textContent ?? "").replace(/\u00a0/g, " ").trim();
};

export const htmlFragmentHasContent = (fragment: DocumentFragment) =>
  Array.from(fragment.childNodes).some((node) => {
    if (node.nodeType === globalThis.Node.TEXT_NODE) return Boolean(node.textContent?.trim());
    if (node.nodeType !== globalThis.Node.ELEMENT_NODE) return false;
    const element = node as Element;
    return Boolean(element.textContent?.trim()) || ["img", "table", "hr", "br"].includes(element.tagName.toLowerCase());
  });

export const clipboardPlainTextForPaste = (text: string, html = "") => {
  const withoutMarkers = stripClipboardFragmentMarkers(text).trim();
  if (!withoutMarkers) return "";

  if (html) {
    const htmlText = plainTextFromHtml(html);
    if (htmlText) return htmlText;
  }

  if (/<[A-Za-z][\s\S]*>/.test(withoutMarkers)) {
    const htmlText = plainTextFromHtml(withoutMarkers.replace(/&quot;/g, "\""));
    if (htmlText) return htmlText;
  }

  return withoutMarkers;
};

export const insertTextIntoTextarea = (textarea: HTMLTextAreaElement, text: string) => {
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const nextValue = `${textarea.value.slice(0, selectionStart)}${text}${textarea.value.slice(selectionEnd)}`;
  const nextSelection = selectionStart + text.length;
  textarea.value = nextValue;
  textarea.setSelectionRange(nextSelection, nextSelection);
  return nextValue;
};
