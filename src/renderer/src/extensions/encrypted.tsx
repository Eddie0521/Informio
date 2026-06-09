import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import React from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { EncryptedTextOptions, EncryptedSecretAttrs, SecretDecryptRequest, NodeViewPositionGetter } from "../types";
import { INFORMIO_SECRET_TAG, SECRET_ITERATIONS, SECRET_ALGORITHM, SECRET_KDF } from "../constants";
import { secretAttrsAreValid, renderSecretMarkdown } from "../lib/encryption";
import { cn } from "../lib/utils";

const selectEncryptedNode = (editor: any, getPos: NodeViewPositionGetter) => {
  const position = getPos();
  if (typeof position !== "number") return;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
  editor.commands.focus();
};

function EncryptedInlineView({ editor, getPos, node, selected, extension }: ReactNodeViewProps) {
  const attrs = node.attrs as Partial<EncryptedSecretAttrs>;
  const valid = secretAttrsAreValid(attrs);
  const options = extension.options as EncryptedTextOptions;

  return (
    <NodeViewWrapper
      as="span"
      className={cn("informio-secret-inline", selected && "is-selected", !valid && "is-invalid")}
      contentEditable={false}
      aria-label={valid ? "已加密内容" : "加密内容损坏"}
      onMouseDown={(event: ReactMouseEvent) => {
        event.preventDefault();
        selectEncryptedNode(editor, getPos);
      }}
      onClick={() => {
        if (!valid) return;
        const position = getPos();
        if (typeof position !== "number") return;
        options.onRequestDecrypt({ pos: position, kind: "inline", attrs });
      }}
    >
      <span className="informio-secret-mask" aria-hidden="true" />
      {!valid ? <span className="informio-secret-label">损坏</span> : null}
      {!valid ? <span className="informio-secret-status">请检查源码标签</span> : null}
    </NodeViewWrapper>
  );
}

function EncryptedBlockView({ editor, getPos, node, selected, extension }: ReactNodeViewProps) {
  const attrs = node.attrs as Partial<EncryptedSecretAttrs>;
  const valid = secretAttrsAreValid(attrs);
  const options = extension.options as EncryptedTextOptions;

  return (
    <NodeViewWrapper
      className={cn("informio-secret-block", selected && "is-selected", !valid && "is-invalid")}
      contentEditable={false}
      aria-label={valid ? "已加密内容" : "加密内容损坏"}
      onMouseDown={(event: ReactMouseEvent) => {
        event.preventDefault();
        selectEncryptedNode(editor, getPos);
      }}
      onClick={() => {
        if (!valid) return;
        const position = getPos();
        if (typeof position !== "number") return;
        options.onRequestDecrypt({ pos: position, kind: "block", attrs });
      }}
    >
      <div className="informio-secret-block-body" aria-hidden="true">
        <div className="informio-secret-mask is-wide" />
      </div>
      {!valid ? <div className="informio-secret-status">标签缺失必要字段，无法安全解密</div> : null}
    </NodeViewWrapper>
  );
}

export const EncryptedInline = Node.create<EncryptedTextOptions>({
  name: "encryptedInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return {
      onRequestDecrypt: () => undefined
    };
  },
  addAttributes() {
    return {
      kind: {
        default: "inline",
        parseHTML: () => "inline"
      },
      version: {
        default: "1",
        parseHTML: (element) => element.getAttribute("version") ?? "1"
      },
      salt: {
        default: "",
        parseHTML: (element) => element.getAttribute("salt") ?? ""
      },
      iv: {
        default: "",
        parseHTML: (element) => element.getAttribute("iv") ?? ""
      },
      iterations: {
        default: SECRET_ITERATIONS,
        parseHTML: (element) => Number.parseInt(element.getAttribute("iterations") ?? "", 10) || SECRET_ITERATIONS
      },
      algorithm: {
        default: SECRET_ALGORITHM,
        parseHTML: (element) => element.getAttribute("algorithm") ?? SECRET_ALGORITHM
      },
      kdf: {
        default: SECRET_KDF,
        parseHTML: (element) => element.getAttribute("kdf") ?? SECRET_KDF
      },
      cipherText: {
        default: "",
        parseHTML: (element) => (element.textContent ?? "").trim()
      }
    };
  },
  parseHTML() {
    return [{ tag: `${INFORMIO_SECRET_TAG}[kind="inline"]` }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as EncryptedSecretAttrs;
    return [
      INFORMIO_SECRET_TAG,
      mergeAttributes(HTMLAttributes, {
        kind: "inline",
        version: attrs.version,
        salt: attrs.salt,
        iv: attrs.iv,
        iterations: String(attrs.iterations),
        algorithm: attrs.algorithm,
        kdf: attrs.kdf
      }),
      attrs.cipherText
    ];
  },
  renderMarkdown(node) {
    return renderSecretMarkdown(node.attrs as EncryptedSecretAttrs);
  },
  addNodeView() {
    return ReactNodeViewRenderer(EncryptedInlineView);
  }
});

export const EncryptedBlock = Node.create<EncryptedTextOptions>({
  name: "encryptedBlock",
  group: "block",
  atom: true,
  selectable: true,
  defining: true,
  addOptions() {
    return {
      onRequestDecrypt: () => undefined
    };
  },
  addAttributes() {
    return {
      kind: {
        default: "block",
        parseHTML: () => "block"
      },
      version: {
        default: "1",
        parseHTML: (element) => element.getAttribute("version") ?? "1"
      },
      salt: {
        default: "",
        parseHTML: (element) => element.getAttribute("salt") ?? ""
      },
      iv: {
        default: "",
        parseHTML: (element) => element.getAttribute("iv") ?? ""
      },
      iterations: {
        default: SECRET_ITERATIONS,
        parseHTML: (element) => Number.parseInt(element.getAttribute("iterations") ?? "", 10) || SECRET_ITERATIONS
      },
      algorithm: {
        default: SECRET_ALGORITHM,
        parseHTML: (element) => element.getAttribute("algorithm") ?? SECRET_ALGORITHM
      },
      kdf: {
        default: SECRET_KDF,
        parseHTML: (element) => element.getAttribute("kdf") ?? SECRET_KDF
      },
      cipherText: {
        default: "",
        parseHTML: (element) => (element.textContent ?? "").trim()
      }
    };
  },
  parseHTML() {
    return [{ tag: `${INFORMIO_SECRET_TAG}[kind="block"]` }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as EncryptedSecretAttrs;
    return [
      INFORMIO_SECRET_TAG,
      mergeAttributes(HTMLAttributes, {
        kind: "block",
        version: attrs.version,
        salt: attrs.salt,
        iv: attrs.iv,
        iterations: String(attrs.iterations),
        algorithm: attrs.algorithm,
        kdf: attrs.kdf
      }),
      attrs.cipherText
    ];
  },
  renderMarkdown(node) {
    return renderSecretMarkdown(node.attrs as EncryptedSecretAttrs);
  },
  addNodeView() {
    return ReactNodeViewRenderer(EncryptedBlockView);
  }
});
