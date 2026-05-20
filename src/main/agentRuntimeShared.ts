import type {
  AgentConversationMessage,
  AgentSessionInput,
  AgentProvider,
  SendAgentMessageInput
} from "../shared/types.js";

export const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const modelId = (provider: AgentProvider, override?: string) => {
  const value = override || provider.model || provider.models?.[0]?.id || "";
  return value && value !== "default" ? value : "";
};

export const markdownTitle = (title: string) => title.replace(/\.(md|markdown|txt)$/i, "");

export const buildPrompt = (input: SendAgentMessageInput) => {
  const selected = input.context.selectedText?.trim();
  return [
    input.message.trim(),
    "",
    "Context:",
    `Document: ${input.context.documentTitle}`,
    selected ? `Selected text:\n${selected}` : "Selected text: none",
    "",
    "Current Markdown:",
    input.context.documentMarkdown
  ].join("\n");
};

const buildConversationHistorySection = (history: AgentConversationMessage[] | undefined) => {
  if (!history?.length) return "";
  const recent = history.slice(-16);
  const lines = recent
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const body = message.content.trim() || (message.role === "assistant" && message.errorMessage ? `(error) ${message.errorMessage}` : "");
      return body ? `${role}:\n${body}` : "";
    })
    .filter(Boolean);
  if (!lines.length) return "";
  const joined = lines.join("\n\n");
  return joined.length > 12000 ? joined.slice(joined.length - 12000) : joined;
};

export const buildFallbackConversationHistory = (history: AgentConversationMessage[] | undefined) => {
  if (!history?.length) return "";
  const recent = history.slice(-16);
  return recent
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const body = message.content.trim() || (message.role === "assistant" && message.errorMessage ? `(error) ${message.errorMessage}` : "");
      return body ? `${role}:\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
};

export const withFallbackConversationHistory = (prompt: string, history: AgentConversationMessage[] | undefined) => {
  const conversationHistory = buildFallbackConversationHistory(history);
  if (!conversationHistory) return prompt;
  return [
    "Recent conversation history:",
    conversationHistory,
    "",
    "Continue naturally from the history above.",
    "",
    prompt
  ].join("\n");
};

export const buildSessionPrompt = (input: AgentSessionInput, options: { includeConversationHistory?: boolean } = {}) => {
  const current = input.context.currentDocument;
  const selection = input.context.selection?.text.trim();
  const selectionLabel =
    input.context.selection?.kind === "pdf"
      ? `PDF selection: ${input.context.selection.title}, page ${input.context.selection.page}`
      : "Selected text";
  const openTabs = input.context.openTabs.map((doc) => `- ${doc.title}${doc.filePath ? ` (${doc.filePath})` : ""}`).join("\n");
  const noteList = input.context.noteList
    .slice(0, 80)
    .map((doc) => `- ${doc.title}${doc.filePath ? ` (${doc.filePath})` : ""}`)
    .join("\n");
  const references = input.context.references
    .map((ref) => [
      `## [[${markdownTitle(ref.title)}]]${ref.filePath ? ` (${ref.filePath})` : ""}`,
      ref.markdown ? ref.markdown : "(metadata only)"
    ].join("\n"))
    .join("\n\n");
  const conversationHistory = options.includeConversationHistory === false ? "" : buildConversationHistorySection(input.conversationHistory);
  const permission =
    input.permissionMode === "read_only"
      ? [
          "Permission mode: read only.",
          "Do not use shell, Bash, git, Python/Node scripts, or command-line tools.",
          "Do not directly modify files through native Read/Edit/Write/Bash tools.",
          "Use the provided context to answer. If a change is needed, describe the suggested edit clearly or use controlled Informio tools if they are available."
        ].join("\n")
      : input.permissionMode === "default"
        ? [
            "Permission mode: default.",
            "You may use native Read/Edit/Write/Bash capabilities when the selected agent exposes them.",
            "Keep all file and shell operations scoped to the current Informio workspace.",
            "Ask for approval before commands or file changes that require it."
          ].join("\n")
        : [
            "Permission mode: full access.",
            "You may use native Read/Edit/Write/Bash capabilities without workspace restrictions.",
            "You may access files outside the current Informio workspace when needed.",
            "Avoid destructive commands unless explicitly requested."
          ].join("\n");

  return [
    "You are working inside Informio, a local-first Markdown writing and knowledge workspace.",
    "The user writes naturally. Decide whether to answer, inspect context, suggest edits, or perform allowed actions based on the request.",
    "When referencing notes, use [[Note Title]] wikilink syntax.",
    "Be concise and make your work visible through short summaries.",
    "",
    permission,
    "",
    "Informio context tools represented in this run:",
    "- get_workspace_context: orientation, open tabs, note list, explicit references",
    "- get_current_document: active document Markdown",
    "- get_open_tabs: currently open tabs",
    "- get_selection: current selected text, when present",
    "- search_notes/get_note/open_note/highlight_editor/refresh_workspace may be available through Informio integrations in future runs",
    "",
    `User request:\n${input.message.trim()}`,
    "",
    "Workspace:",
    input.context.workspacePath || "(none)",
    "",
    "Open tabs:",
    openTabs || "(none)",
    "",
    "Note list:",
    noteList || "(none)",
    "",
    selection ? `${selectionLabel}:\n${selection}` : "Selected text: none",
    "",
    references ? `Explicit references:\n${references}` : "Explicit references: none",
    "",
    conversationHistory ? `Recent conversation history:\n${conversationHistory}` : "Recent conversation history: none",
    "",
    current
      ? [
          "Current document:",
          `Title: ${current.title}`,
          current.filePath ? `Path: ${current.filePath}` : "Path: none",
          "",
          current.markdown
        ].join("\n")
      : "Current document: none"
  ].join("\n");
};
