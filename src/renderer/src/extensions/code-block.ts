import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";

// InformioCodeBlock extends CodeBlockLowlight with a custom NodeView (CodeBlockView).
// CodeBlockView is currently defined in App.tsx and will be moved to node-views/ in a later step.
// This file is a placeholder — the actual extension registration happens in App.tsx
// where CodeBlockView is available.
//
// Once CodeBlockView is extracted, uncomment the following:
//
// import { ReactNodeViewRenderer } from "@tiptap/react";
// import { CodeBlockView } from "../node-views/CodeBlockView";
//
// export const InformioCodeBlock = CodeBlockLowlight.extend({
//   addNodeView() {
//     return ReactNodeViewRenderer(CodeBlockView);
//   }
// });
