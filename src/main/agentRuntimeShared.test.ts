import { describe, expect, it } from "vitest";

import {
  asErrorMessage,
  modelId,
  markdownTitle,
  AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS,
  buildPrompt,
  buildFallbackConversationHistory,
  withFallbackConversationHistory,
  buildSessionPrompt
} from "./agentRuntimeShared.js";
import type {
  AgentConversationMessage,
  AgentProvider,
  AgentSessionInput,
  SendAgentMessageInput
} from "../shared/types.js";

// ---------------------------------------------------------------------------
// asErrorMessage
// ---------------------------------------------------------------------------
describe("asErrorMessage", () => {
  it("extracts .message from Error instances", () => {
    expect(asErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns the string itself for string errors", () => {
    expect(asErrorMessage("something broke")).toBe("something broke");
  });

  it("converts numbers to string", () => {
    expect(asErrorMessage(404)).toBe("404");
    expect(asErrorMessage(0)).toBe("0");
    expect(asErrorMessage(-1)).toBe("-1");
  });

  it("converts booleans to string", () => {
    expect(asErrorMessage(true)).toBe("true");
    expect(asErrorMessage(false)).toBe("false");
  });

  it("converts bigints to string", () => {
    expect(asErrorMessage(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it("handles null and undefined via String()", () => {
    expect(asErrorMessage(null)).toBe("null");
    expect(asErrorMessage(undefined)).toBe("undefined");
  });

  it("extracts 'message' key from a plain object", () => {
    expect(asErrorMessage({ message: "from object" })).toBe("from object");
  });

  it("falls through known keys in priority order", () => {
    expect(asErrorMessage({ error: "err" })).toBe("err");
    expect(asErrorMessage({ detail: "det" })).toBe("det");
    expect(asErrorMessage({ reason: "rea" })).toBe("rea");
    expect(asErrorMessage({ code: "EFAIL" })).toBe("EFAIL");
    expect(asErrorMessage({ status: "timeout" })).toBe("timeout");
  });

  it("prefers 'message' over later keys", () => {
    expect(asErrorMessage({ message: "msg", error: "err", detail: "det" })).toBe("msg");
  });

  it("skips empty string values for known keys", () => {
    expect(asErrorMessage({ message: "", error: "real error" })).toBe("real error");
    expect(asErrorMessage({ message: "   ", error: "real error" })).toBe("real error");
  });

  it("recursively resolves nested objects", () => {
    const nested = { error: { message: "deep error" } };
    expect(asErrorMessage(nested)).toBe("deep error");
  });

  it("skips nested objects that resolve to '[object Object]'", () => {
    // A nested circular object causes JSON.stringify to throw, falling back to
    // Object.prototype.toString.call which returns "[object Object]".
    // The outer loop then skips it and tries the next key.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(asErrorMessage({ error: circular, detail: "ok" })).toBe("ok");
  });

  it("falls back to JSON.stringify for objects with no known keys", () => {
    expect(asErrorMessage({ foo: "bar" })).toBe('{"foo":"bar"}');
  });

  it("falls back to toString for objects where JSON.stringify fails (circular)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // JSON.stringify throws on circular, so it falls to Object.prototype.toString.call
    const result = asErrorMessage(circular);
    expect(result).toBe("[object Object]");
  });

  it("handles empty objects", () => {
    // No known keys match, JSON.stringify works
    expect(asErrorMessage({})).toBe("{}");
  });
});

// ---------------------------------------------------------------------------
// modelId
// ---------------------------------------------------------------------------
describe("modelId", () => {
  const makeProvider = (overrides: Partial<AgentProvider> = {}): AgentProvider => ({
    id: "p1",
    name: "test",
    transport: "claude-agent-sdk",
    command: "test",
    args: [],
    enabled: true,
    description: "test provider",
    ...overrides
  });

  it("uses override when provided and non-empty", () => {
    expect(modelId(makeProvider(), "gpt-4")).toBe("gpt-4");
  });

  it("uses provider.model when no override", () => {
    expect(modelId(makeProvider({ model: "claude-3" }))).toBe("claude-3");
  });

  it("uses first model id when no override and no provider.model", () => {
    const provider = makeProvider({
      models: [{ id: "m1", label: "M1" }, { id: "m2", label: "M2" }]
    });
    expect(modelId(provider)).toBe("m1");
  });

  it("returns empty string when nothing is set", () => {
    expect(modelId(makeProvider())).toBe("");
  });

  it("returns empty string for 'default' value", () => {
    expect(modelId(makeProvider(), "default")).toBe("");
    expect(modelId(makeProvider({ model: "default" }))).toBe("");
  });

  it("override takes precedence over provider.model", () => {
    expect(modelId(makeProvider({ model: "old" }), "new")).toBe("new");
  });

  it("override takes precedence over models array", () => {
    const provider = makeProvider({
      model: "from-model",
      models: [{ id: "from-models", label: "X" }]
    });
    expect(modelId(provider, "override")).toBe("override");
  });

  it("falls through to provider.model when override is empty string", () => {
    // Empty string is falsy, so `override || provider.model` evaluates to provider.model
    expect(modelId(makeProvider({ model: "good" }), "")).toBe("good");
  });

  it("provider.model takes precedence over models array", () => {
    const provider = makeProvider({
      model: "primary",
      models: [{ id: "fallback", label: "F" }]
    });
    expect(modelId(provider)).toBe("primary");
  });

  it("returns empty string when models array is empty", () => {
    expect(modelId(makeProvider({ models: [] }))).toBe("");
  });
});

// ---------------------------------------------------------------------------
// markdownTitle
// ---------------------------------------------------------------------------
describe("markdownTitle", () => {
  it("strips .md extension", () => {
    expect(markdownTitle("readme.md")).toBe("readme");
  });

  it("strips .markdown extension", () => {
    expect(markdownTitle("notes.markdown")).toBe("notes");
  });

  it("strips .txt extension", () => {
    expect(markdownTitle("todo.txt")).toBe("todo");
  });

  it("is case-insensitive for the extension", () => {
    expect(markdownTitle("file.MD")).toBe("file");
    expect(markdownTitle("file.MARKDOWN")).toBe("file");
    expect(markdownTitle("file.TXT")).toBe("file");
    expect(markdownTitle("file.Md")).toBe("file");
  });

  it("leaves filenames without target extensions unchanged", () => {
    expect(markdownTitle("file.pdf")).toBe("file.pdf");
    expect(markdownTitle("file.html")).toBe("file.html");
    expect(markdownTitle("no-extension")).toBe("no-extension");
    expect(markdownTitle("")).toBe("");
  });

  it("handles filenames with multiple dots", () => {
    expect(markdownTitle("my.project.v2.md")).toBe("my.project.v2");
  });
});

// ---------------------------------------------------------------------------
// AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS
// ---------------------------------------------------------------------------
describe("AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS", () => {
  it("contains key formatting rules", () => {
    expect(AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS).toContain("$...$");
    expect(AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS).toContain("$$...$$");
    expect(AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS).toContain("bare LaTeX");
    expect(AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS).toContain("K_{old}");
    expect(AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS).toContain("z_{cond}");
  });

  it("is a multi-line string", () => {
    expect(AGENT_MARKDOWN_FORMATTING_INSTRUCTIONS.split("\n").length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------
describe("buildPrompt", () => {
  const makeInput = (overrides: Partial<SendAgentMessageInput> = {}): SendAgentMessageInput => ({
    providerId: "test",
    message: "Do something",
    context: {
      documentTitle: "doc.md",
      documentMarkdown: "# Hello",
      selectedText: undefined
    },
    ...overrides
  });

  it("includes the user message", () => {
    expect(buildPrompt(makeInput())).toContain("Do something");
  });

  it("includes the document markdown", () => {
    expect(buildPrompt(makeInput())).toContain("# Hello");
  });

  it("includes the document title", () => {
    expect(buildPrompt(makeInput())).toContain("Document: doc.md");
  });

  it("includes math formatting instructions", () => {
    const prompt = buildPrompt(makeInput());
    expect(prompt).toContain("$...$");
    expect(prompt).toContain("K_{old}");
  });

  it("shows 'Selected text: none' when no selection", () => {
    expect(buildPrompt(makeInput())).toContain("Selected text: none");
  });

  it("includes selected text when present", () => {
    const input = makeInput({
      context: { documentTitle: "doc.md", documentMarkdown: "# H", selectedText: "highlighted text" }
    });
    expect(buildPrompt(input)).toContain("Selected text:\nhighlighted text");
  });

  it("trims selected text", () => {
    const input = makeInput({
      context: { documentTitle: "d.md", documentMarkdown: "m", selectedText: "  padded  " }
    });
    expect(buildPrompt(input)).toContain("Selected text:\npadded");
  });

  it("trims the user message", () => {
    const input = makeInput({ message: "  trimmed message  " });
    // The prompt starts with the trimmed message
    expect(buildPrompt(input)).toMatch(/^trimmed message/);
  });
});

// ---------------------------------------------------------------------------
// buildFallbackConversationHistory
// ---------------------------------------------------------------------------
describe("buildFallbackConversationHistory", () => {
  const makeMessage = (
    role: "user" | "assistant",
    content: string,
    extra: Partial<AgentConversationMessage> = {}
  ): AgentConversationMessage => ({
    id: `msg-${Math.random()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    permissionMode: "default",
    ...extra
  });

  it("returns empty string for undefined history", () => {
    expect(buildFallbackConversationHistory(undefined)).toBe("");
  });

  it("returns empty string for empty history", () => {
    expect(buildFallbackConversationHistory([])).toBe("");
  });

  it("formats user and assistant messages", () => {
    const history = [
      makeMessage("user", "Hello"),
      makeMessage("assistant", "Hi there")
    ];
    const result = buildFallbackConversationHistory(history);
    expect(result).toContain("User:\nHello");
    expect(result).toContain("Assistant:\nHi there");
  });

  it("uses errorMessage for empty assistant content", () => {
    const history = [
      makeMessage("assistant", "", { errorMessage: "API timeout" })
    ];
    const result = buildFallbackConversationHistory(history);
    expect(result).toContain("(error) API timeout");
  });

  it("skips user messages with empty content", () => {
    const history = [
      makeMessage("user", ""),
      makeMessage("assistant", "reply")
    ];
    const result = buildFallbackConversationHistory(history);
    expect(result).not.toContain("User:");
    expect(result).toContain("Assistant:\nreply");
  });

  it("skips assistant messages with empty content and no errorMessage", () => {
    const history = [
      makeMessage("assistant", "")
    ];
    const result = buildFallbackConversationHistory(history);
    expect(result).toBe("");
  });

  it("trims message content", () => {
    const history = [makeMessage("user", "  trimmed  ")];
    expect(buildFallbackConversationHistory(history)).toContain("User:\ntrimmed");
  });

  it("limits to the last 16 messages", () => {
    const history = Array.from({ length: 20 }, (_, i) =>
      makeMessage(i % 2 === 0 ? "user" : "assistant", `msg-${i}`)
    );
    const result = buildFallbackConversationHistory(history);
    expect(result).toContain("msg-4"); // 5th message (index 4) is first included
    expect(result).toContain("msg-19");
    expect(result).not.toContain("msg-3");
  });

  it("separates messages with double newlines", () => {
    const history = [
      makeMessage("user", "a"),
      makeMessage("assistant", "b")
    ];
    const result = buildFallbackConversationHistory(history);
    expect(result).toBe("User:\na\n\nAssistant:\nb");
  });
});

// ---------------------------------------------------------------------------
// withFallbackConversationHistory
// ---------------------------------------------------------------------------
describe("withFallbackConversationHistory", () => {
  const makeMessage = (
    role: "user" | "assistant",
    content: string
  ): AgentConversationMessage => ({
    id: `msg-${Math.random()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    permissionMode: "default"
  });

  it("returns the original prompt when history is undefined", () => {
    expect(withFallbackConversationHistory("hello", undefined)).toBe("hello");
  });

  it("returns the original prompt when history is empty", () => {
    expect(withFallbackConversationHistory("hello", [])).toBe("hello");
  });

  it("prepends conversation history when present", () => {
    const history = [makeMessage("user", "question"), makeMessage("assistant", "answer")];
    const result = withFallbackConversationHistory("follow-up", history);
    expect(result).toContain("Recent conversation history:");
    expect(result).toContain("User:\nquestion");
    expect(result).toContain("Assistant:\nanswer");
    expect(result).toContain("Continue naturally from the history above.");
    expect(result).toContain("follow-up");
  });

  it("places the prompt at the end", () => {
    const history = [makeMessage("user", "x")];
    const result = withFallbackConversationHistory("my prompt", history);
    const lines = result.split("\n");
    expect(lines[lines.length - 1]).toBe("my prompt");
  });
});

// ---------------------------------------------------------------------------
// buildSessionPrompt
// ---------------------------------------------------------------------------
describe("buildSessionPrompt", () => {
  const baseInput: AgentSessionInput = {
    providerId: "test",
    message: "Summarize this",
    permissionMode: "read_only",
    workspaceScopeId: "ws",
    context: {
      workspacePath: "/workspace",
      currentDocument: {
        id: "doc1",
        title: "paper.md",
        filePath: "/workspace/paper.md",
        markdown: "# Paper\nContent here"
      },
      openTabs: [{ id: "t1", title: "paper.md", filePath: "/workspace/paper.md" }],
      noteList: [
        { id: "n1", title: "Note A", filePath: "/workspace/note-a.md", updatedAt: "2024-01-01" }
      ],
      references: [{ title: "Ref 1", filePath: "/workspace/ref.md", markdown: "# Ref" }]
    }
  };

  it("includes the user message", () => {
    expect(buildSessionPrompt(baseInput)).toContain("User request:\nSummarize this");
  });

  it("includes math formatting instructions", () => {
    const prompt = buildSessionPrompt(baseInput);
    expect(prompt).toContain("$...$");
    expect(prompt).toContain("K_{old}");
  });

  it("includes workspace path", () => {
    expect(buildSessionPrompt(baseInput)).toContain("/workspace");
  });

  it("includes open tabs", () => {
    expect(buildSessionPrompt(baseInput)).toContain("paper.md (/workspace/paper.md)");
  });

  it("includes note list", () => {
    expect(buildSessionPrompt(baseInput)).toContain("Note A (/workspace/note-a.md)");
  });

  it("includes current document markdown", () => {
    expect(buildSessionPrompt(baseInput)).toContain("# Paper\nContent here");
  });

  it("includes current document title and path", () => {
    const prompt = buildSessionPrompt(baseInput);
    expect(prompt).toContain("Title: paper.md");
    expect(prompt).toContain("Path: /workspace/paper.md");
  });

  it("shows 'Selected text: none' when no selection", () => {
    expect(buildSessionPrompt(baseInput)).toContain("Selected text: none");
  });

  // --- permission modes ---
  it("generates read_only permission text", () => {
    const prompt = buildSessionPrompt(baseInput);
    expect(prompt).toContain("Permission mode: read only");
    expect(prompt).toContain("Do not use shell");
  });

  it("generates default permission text", () => {
    const input = { ...baseInput, permissionMode: "default" as const };
    const prompt = buildSessionPrompt(input);
    expect(prompt).toContain("Permission mode: approval required");
  });

  it("generates full_access permission text", () => {
    const input = { ...baseInput, permissionMode: "full_access" as const };
    const prompt = buildSessionPrompt(input);
    expect(prompt).toContain("Permission mode: default");
    expect(prompt).toContain("without workspace restrictions");
  });

  // --- selection ---
  it("includes markdown selection text", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        selection: {
          kind: "markdown",
          documentId: "doc1",
          from: 0,
          to: 10,
          text: "selected content"
        }
      }
    };
    expect(buildSessionPrompt(input)).toContain("Selected text:\nselected content");
  });

  it("labels PDF selection with title and page", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        selection: {
          kind: "pdf",
          documentId: "pdf1",
          title: "Research Paper",
          page: 3,
          text: "pdf selected text",
          rects: []
        }
      }
    };
    const prompt = buildSessionPrompt(input);
    expect(prompt).toContain("PDF selection: Research Paper, page 3");
    expect(prompt).toContain("pdf selected text");
  });

  // --- references ---
  it("includes references with markdown", () => {
    const prompt = buildSessionPrompt(baseInput);
    expect(prompt).toContain("## [[Ref 1]] (/workspace/ref.md)");
    expect(prompt).toContain("# Ref");
  });

  it("shows '(metadata only)' for references without markdown", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        references: [{ title: "No MD Ref" }]
      }
    };
    expect(buildSessionPrompt(input)).toContain("(metadata only)");
  });

  it("shows 'Explicit references: none' when empty", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: { ...baseInput.context, references: [] }
    };
    expect(buildSessionPrompt(input)).toContain("Explicit references: none");
  });

  // --- conversation history ---
  it("includes conversation history by default", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      conversationHistory: [
        {
          id: "m1",
          role: "user",
          content: "prev question",
          createdAt: "2024-01-01",
          permissionMode: "default"
        },
        {
          id: "m2",
          role: "assistant",
          content: "prev answer",
          createdAt: "2024-01-01",
          permissionMode: "default"
        }
      ]
    };
    const prompt = buildSessionPrompt(input);
    expect(prompt).toContain("Recent conversation history:");
    expect(prompt).toContain("prev question");
    expect(prompt).toContain("prev answer");
  });

  it("excludes conversation history when includeConversationHistory is false", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      conversationHistory: [
        {
          id: "m1",
          role: "user",
          content: "should not appear",
          createdAt: "2024-01-01",
          permissionMode: "default"
        }
      ]
    };
    const prompt = buildSessionPrompt(input, { includeConversationHistory: false });
    expect(prompt).toContain("Recent conversation history: none");
    expect(prompt).not.toContain("should not appear");
  });

  it("shows 'Recent conversation history: none' when history is empty", () => {
    expect(buildSessionPrompt(baseInput)).toContain("Recent conversation history: none");
  });

  it("uses errorMessage for assistant messages with empty content", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      conversationHistory: [
        {
          id: "m1",
          role: "assistant",
          content: "",
          errorMessage: "connection lost",
          createdAt: "2024-01-01",
          permissionMode: "default"
        }
      ]
    };
    expect(buildSessionPrompt(input)).toContain("(error) connection lost");
  });

  // --- empty context fields ---
  it("shows '(none)' for empty workspace path", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: { ...baseInput.context, workspacePath: "" }
    };
    expect(buildSessionPrompt(input)).toContain("Workspace:\n(none)");
  });

  it("shows '(none)' for empty open tabs", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: { ...baseInput.context, openTabs: [] }
    };
    expect(buildSessionPrompt(input)).toContain("Open tabs:\n(none)");
  });

  it("shows '(none)' for empty note list", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: { ...baseInput.context, noteList: [] }
    };
    expect(buildSessionPrompt(input)).toContain("Note list:\n(none)");
  });

  it("shows 'Current document: none' when no current document", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: { ...baseInput.context, currentDocument: undefined }
    };
    expect(buildSessionPrompt(input)).toContain("Current document: none");
  });

  it("shows 'Path: none' when current document has no filePath", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        currentDocument: { id: "d", title: "No Path", markdown: "content" }
      }
    };
    expect(buildSessionPrompt(input)).toContain("Path: none");
  });

  // --- noteList truncation ---
  it("truncates note list to 80 entries", () => {
    const notes = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}`,
      title: `Note ${i}`,
      filePath: `/path/${i}.md`,
      updatedAt: "2024-01-01"
    }));
    const input: AgentSessionInput = {
      ...baseInput,
      context: { ...baseInput.context, noteList: notes }
    };
    const prompt = buildSessionPrompt(input);
    expect(prompt).toContain("Note 0");
    expect(prompt).toContain("Note 79");
    expect(prompt).not.toContain("Note 80");
  });

  // --- trim message ---
  it("trims the user message", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      message: "  padded message  "
    };
    expect(buildSessionPrompt(input)).toContain("User request:\npadded message");
  });

  // --- tabs without filePath ---
  it("renders tabs without filePath", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        openTabs: [{ id: "t1", title: "Untitled" }]
      }
    };
    expect(buildSessionPrompt(input)).toContain("- Untitled\n");
  });

  // --- notes without filePath ---
  it("renders notes without filePath", () => {
    const input: AgentSessionInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        noteList: [{ id: "n1", title: "Quick Note", updatedAt: "2024-01-01" }]
      }
    };
    expect(buildSessionPrompt(input)).toContain("- Quick Note\n");
  });
});
