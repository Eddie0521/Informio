import type { Editor, JSONContent } from "@tiptap/core";
import type { SecretKind, EncryptedSecretAttrs } from "../types";
import { INFORMIO_SECRET_TAG, SECRET_ITERATIONS, SECRET_ALGORITHM, SECRET_KDF } from "../constants";

export const documentSecretPassphraseCache = new Map<string, string>();

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return window.btoa(binary);
};

export const base64ToBytes = (value: string) => Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
export const normalizeSecretBytes = (bytes: Uint8Array) => Uint8Array.from(bytes);

export const secretAttrsFromElement = (element: HTMLElement, kind: SecretKind): EncryptedSecretAttrs => ({
  kind,
  version: element.getAttribute("version") ?? "1",
  salt: element.getAttribute("salt") ?? "",
  iv: element.getAttribute("iv") ?? "",
  iterations: Number.parseInt(element.getAttribute("iterations") ?? "", 10) || SECRET_ITERATIONS,
  algorithm: element.getAttribute("algorithm") ?? SECRET_ALGORITHM,
  kdf: element.getAttribute("kdf") ?? SECRET_KDF,
  cipherText: (element.textContent ?? "").trim()
});

export const secretAttrsAreValid = (attrs: Partial<EncryptedSecretAttrs> | null | undefined): attrs is EncryptedSecretAttrs =>
  Boolean(
    attrs
    && (attrs.kind === "inline" || attrs.kind === "block")
    && attrs.version === "1"
    && typeof attrs.salt === "string"
    && typeof attrs.iv === "string"
    && typeof attrs.cipherText === "string"
    && attrs.salt
    && attrs.iv
    && attrs.cipherText
    && Number.isFinite(Number(attrs.iterations))
    && Number(attrs.iterations) > 0
    && attrs.algorithm === SECRET_ALGORITHM
    && attrs.kdf === SECRET_KDF
  );

export const renderSecretMarkdown = (attrs: EncryptedSecretAttrs) => {
  const serialized = `<${INFORMIO_SECRET_TAG} kind="${attrs.kind}" version="${attrs.version}" salt="${attrs.salt}" iv="${attrs.iv}" iterations="${attrs.iterations}" algorithm="${attrs.algorithm}" kdf="${attrs.kdf}">${attrs.cipherText}</${INFORMIO_SECRET_TAG}>`;
  return attrs.kind === "block" ? `\n${serialized}\n` : serialized;
};

export const importSecretKeyMaterial = async (passphrase: string) =>
  window.crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);

export const deriveSecretKey = async (passphrase: string, salt: Uint8Array, iterations: number) =>
  window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: normalizeSecretBytes(salt),
      iterations
    },
    await importSecretKeyMaterial(passphrase),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

export const encryptSecretMarkdown = async (markdown: string, passphrase: string, kind: SecretKind): Promise<EncryptedSecretAttrs> => {
  const salt = normalizeSecretBytes(window.crypto.getRandomValues(new Uint8Array(16)));
  const iv = normalizeSecretBytes(window.crypto.getRandomValues(new Uint8Array(12)));
  const key = await deriveSecretKey(passphrase, salt, SECRET_ITERATIONS);
  const cipherBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(markdown));

  return {
    kind,
    version: "1",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: SECRET_ITERATIONS,
    algorithm: SECRET_ALGORITHM,
    kdf: SECRET_KDF,
    cipherText: bytesToBase64(new Uint8Array(cipherBuffer))
  };
};

export const decryptSecretMarkdown = async (attrs: EncryptedSecretAttrs, passphrase: string) => {
  const salt = normalizeSecretBytes(base64ToBytes(attrs.salt));
  const iv = normalizeSecretBytes(base64ToBytes(attrs.iv));
  const cipherText = normalizeSecretBytes(base64ToBytes(attrs.cipherText));
  const key = await deriveSecretKey(passphrase, salt, attrs.iterations);
  const plainBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherText);
  return new TextDecoder().decode(plainBuffer);
};

export const serializeSelectionFragmentToMarkdown = (editor: Editor, from: number, to: number, kind: SecretKind) => {
  const fragment = editor.state.doc.slice(from, to).content.toJSON() as JSONContent[];
  if (!editor.markdown) return editor.state.doc.textBetween(from, to, "\n");
  if (kind === "inline") {
    return editor.markdown.serialize({
      type: "doc",
      content: [{ type: "paragraph", content: fragment }]
    } as JSONContent);
  }
  return editor.markdown.serialize({ type: "doc", content: fragment } as JSONContent);
};

export const parseInlineMarkdownContent = (editor: Editor, markdown: string): JSONContent[] => {
  const parsed = editor.markdown?.parse(markdown);
  if (!parsed?.content?.length) return [{ type: "text", text: markdown }];
  const first = parsed.content[0];
  if (first.type === "paragraph" && first.content?.length) return first.content;
  return [{ type: "text", text: markdown }];
};

export const selectionShouldUseBlockSecret = (editor: Editor) => {
  const { selection } = editor.state;
  if (selection.empty) return false;
  if (!selection.$from.sameParent(selection.$to)) return true;
  if (!selection.$from.parent.isTextblock) return true;
  return selection.from <= selection.$from.start() && selection.to >= selection.$to.end();
};

export const selectionContainsSecretNode = (editor: Editor, from: number, to: number) => {
  let containsSecret = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === "encryptedInline" || node.type.name === "encryptedBlock") {
      containsSecret = true;
      return false;
    }
    return true;
  });
  return containsSecret;
};

export const findFirstValidSecretInDocument = (editor: Editor) => {
  let found: EncryptedSecretAttrs | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "encryptedInline" && node.type.name !== "encryptedBlock") return true;
    const attrs = node.attrs as Partial<EncryptedSecretAttrs>;
    if (secretAttrsAreValid(attrs)) {
      found = attrs;
      return false;
    }
    return true;
  });
  return found;
};

export const documentContainsSecretNode = (editor: Editor) => {
  let containsSecret = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "encryptedInline" || node.type.name === "encryptedBlock") {
      containsSecret = true;
      return false;
    }
    return true;
  });
  return containsSecret;
};
