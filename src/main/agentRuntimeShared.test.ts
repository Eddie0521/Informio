import { describe, expect, it } from "vitest";

import { buildPrompt, buildSessionPrompt } from "./agentRuntimeShared.js";
import type { AgentSessionInput, SendAgentMessageInput } from "../shared/types.js";

describe("agentRuntimeShared prompt formatting", () => {
  const expectedMathRules = ["$...$", "$$...$$", "Do not output bare LaTeX", "K_{old}", "z_{cond}"];

  it("adds math Markdown requirements to legacy send prompts", () => {
    const input: SendAgentMessageInput = {
      providerId: "test",
      message: "Translate section 3.2",
      context: {
        documentTitle: "paper.md",
        documentMarkdown: "K_old + V_new",
        selectedText: "K_old + V_new"
      }
    };

    const prompt = buildPrompt(input);

    for (const rule of expectedMathRules) {
      expect(prompt).toContain(rule);
    }
  });

  it("adds math Markdown requirements to agent session prompts", () => {
    const input: AgentSessionInput = {
      providerId: "test",
      message: "Explain this formula",
      permissionMode: "read_only",
      workspaceScopeId: "workspace",
      context: {
        workspacePath: "/workspace",
        currentDocument: {
          id: "doc",
          title: "paper.md",
          markdown: "K_old + V_new"
        },
        openTabs: [],
        noteList: [],
        references: []
      }
    };

    const prompt = buildSessionPrompt(input);

    for (const rule of expectedMathRules) {
      expect(prompt).toContain(rule);
    }
  });
});
