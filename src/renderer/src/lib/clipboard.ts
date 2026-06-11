export const writeClipboardText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn("Async clipboard write failed, falling back to execCommand:", error);
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export const selectionIsInsideElement = (selection: Selection, container: HTMLElement) => {
  if (!selection.rangeCount || selection.isCollapsed || !selection.toString()) return false;
  if (selection.anchorNode && container.contains(selection.anchorNode)) return true;
  if (selection.focusNode && container.contains(selection.focusNode)) return true;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const ancestor = range.commonAncestorContainer;
    const node = ancestor.nodeType === globalThis.Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
    if (node && container.contains(node)) return true;
    if (range.intersectsNode(container)) return true;
  }
  return false;
};
