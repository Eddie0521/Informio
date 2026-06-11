import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/mock/userData"),
  },
}));

vi.mock("electron-log", () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

import {
  defaultSettings,
  defaultData,
  projectRecord,
  pruneAgentConversations,
  normalizeAgentConversations,
  loadAppData,
  saveAppData,
  saveAppDataAndFiles,
  createQuickDocument,
} from "./store";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { app } from "electron";

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedMkdir = vi.mocked(mkdir);
const mockedStat = vi.mocked(stat);
const mockedGetPath = vi.mocked(app.getPath);

beforeEach(() => {
  vi.clearAllMocks();
  mockedWriteFile.mockResolvedValue(undefined);
  mockedMkdir.mockResolvedValue(undefined);
  mockedGetPath.mockReturnValue("/mock/userData");
});

// ---------------------------------------------------------------------------
// defaultSettings
// ---------------------------------------------------------------------------
describe("defaultSettings", () => {
  it("has valid structure", () => {
    expect(defaultSettings).toBeDefined();
    expect(defaultSettings.appearance).toBeDefined();
    expect(defaultSettings.editor).toBeDefined();
    expect(defaultSettings.agents).toBeDefined();
    expect(defaultSettings.shortcuts).toBeDefined();
  });

  it("has at least one agent", () => {
    expect(defaultSettings.agents.length).toBeGreaterThan(0);
  });

  it("has valid theme", () => {
    expect(defaultSettings.appearance.theme).toBeTruthy();
  });

  it("has api configuration", () => {
    expect(defaultSettings.api).toBeDefined();
    expect(defaultSettings.api.provider).toBe("openai-compatible");
    expect(defaultSettings.api.baseUrl).toBeTruthy();
    expect(defaultSettings.api.models).toEqual([]);
  });

  it("has markdown settings", () => {
    expect(defaultSettings.markdown).toBeDefined();
    expect(defaultSettings.markdown.autoSave).toBe(true);
    expect(defaultSettings.markdown.tabSize).toBe(2);
    expect(defaultSettings.markdown.exportFormat).toBe("markdown");
  });

  it("has agentRuntime settings", () => {
    expect(defaultSettings.agentRuntime).toBeDefined();
    expect(defaultSettings.agentRuntime.enabled).toBe(true);
    expect(defaultSettings.agentRuntime.autoStart).toBe(true);
    expect(defaultSettings.agentRuntime.conversationRetentionLimit).toBeGreaterThan(0);
    expect(defaultSettings.agentRuntime.conversationRetentionDays).toBeGreaterThan(0);
  });

  it("has editor settings with numeric values", () => {
    expect(defaultSettings.editor.fontSize).toBeGreaterThan(0);
    expect(defaultSettings.editor.lineHeight).toBeGreaterThan(0);
    expect(defaultSettings.editor.contentWidth).toBeGreaterThan(0);
    expect(typeof defaultSettings.editor.spellcheck).toBe("boolean");
    expect(typeof defaultSettings.editor.typewriterMode).toBe("boolean");
  });

  it("has appearance settings with panel widths", () => {
    expect(defaultSettings.appearance.leftPanelWidth).toBeGreaterThan(0);
    expect(defaultSettings.appearance.rightPanelWidth).toBeGreaterThan(0);
    expect(["expanded", "collapsed"]).toContain(defaultSettings.appearance.leftPanel);
    expect(["expanded", "collapsed"]).toContain(defaultSettings.appearance.rightPanel);
  });

  it("has language setting", () => {
    expect(["zh-CN", "en-US"]).toContain(defaultSettings.language);
  });

  it("has activeAgentId and toolbarAgentId", () => {
    expect(defaultSettings.activeAgentId).toBeTruthy();
    expect(defaultSettings.toolbarAgentId).toBeTruthy();
  });

  it("includes three default agents", () => {
    const ids = defaultSettings.agents.map((a) => a.id);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("codex");
    expect(ids).toContain("opencode");
  });

  it("each agent has required fields", () => {
    for (const agent of defaultSettings.agents) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.transport).toBeTruthy();
      expect(agent.command).toBeTruthy();
      expect(Array.isArray(agent.args)).toBe(true);
      expect(typeof agent.enabled).toBe("boolean");
      expect(typeof agent.description).toBe("string");
    }
  });

  it("each agent has runtimeSupportsResume and runtimePermissionModes", () => {
    for (const agent of defaultSettings.agents) {
      expect(typeof agent.runtimeSupportsResume).toBe("boolean");
      expect(Array.isArray(agent.runtimePermissionModes)).toBe(true);
      expect(agent.runtimePermissionModes!.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// defaultData
// ---------------------------------------------------------------------------
describe("defaultData", () => {
  it("has valid structure", () => {
    expect(defaultData).toBeDefined();
    expect(defaultData.settings).toBeDefined();
    expect(defaultData.documents).toBeDefined();
    expect(Array.isArray(defaultData.documents)).toBe(true);
  });

  it("has folders", () => {
    expect(Array.isArray(defaultData.folders)).toBe(true);
    expect(defaultData.folders.length).toBeGreaterThan(0);
  });

  it("has projects", () => {
    expect(Array.isArray(defaultData.projects)).toBe(true);
    expect(defaultData.projects.length).toBeGreaterThan(0);
  });

  it("has activeDocumentId", () => {
    expect(defaultData.activeDocumentId).toBeTruthy();
  });

  it("activeDocumentId references an existing document", () => {
    const ids = defaultData.documents.map((d) => d.id);
    expect(ids).toContain(defaultData.activeDocumentId);
  });

  it("has empty agentConversations by default", () => {
    expect(defaultData.agentConversations).toEqual([]);
  });

  it("documents have required fields", () => {
    for (const doc of defaultData.documents) {
      expect(doc.id).toBeTruthy();
      expect(doc.title).toBeTruthy();
      expect(typeof doc.markdown).toBe("string");
      expect(doc.updatedAt).toBeTruthy();
    }
  });

  it("documents have kind field", () => {
    for (const doc of defaultData.documents) {
      expect(doc.kind).toBeDefined();
    }
  });

  it("has workspacePath", () => {
    expect(defaultData.workspacePath).toBeTruthy();
  });

  it("settings reference defaults", () => {
    expect(defaultData.settings).toBe(defaultSettings);
  });
});

// ---------------------------------------------------------------------------
// projectRecord
// ---------------------------------------------------------------------------
describe("projectRecord", () => {
  it("creates project from path", () => {
    const project = projectRecord("/my/project");
    expect(project.path).toBe("/my/project");
    expect(project.title).toBe("project");
    expect(project.id).toBeTruthy();
    expect(project.addedAt).toBeTruthy();
  });

  it("uses last path segment as title", () => {
    expect(projectRecord("/a/b/my-project").title).toBe("my-project");
  });

  it("id contains the path", () => {
    const project = projectRecord("/some/path");
    expect(project.id).toContain("/some/path");
  });

  it("generates ISO timestamp for addedAt", () => {
    const project = projectRecord("/test");
    expect(project.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles root-like path", () => {
    const project = projectRecord("/");
    expect(project.path).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// pruneAgentConversations
// ---------------------------------------------------------------------------
describe("pruneAgentConversations", () => {
  const makeConversation = (overrides: Record<string, unknown> = {}) => ({
    id: "conv-1",
    providerId: "claude",
    title: "Test",
    messages: [],
    workspaceScopeId: "scope",
    workspaceLabel: "label",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  it("returns empty for empty input", () => {
    expect(pruneAgentConversations([], 10, 30)).toEqual([]);
  });

  it("keeps conversations within limit", () => {
    const conversations = [
      makeConversation({ id: "1", providerId: "claude" }),
      makeConversation({ id: "2", providerId: "claude" }),
    ];
    expect(pruneAgentConversations(conversations, 10, 30)).toHaveLength(2);
  });

  it("trims to limit per provider", () => {
    const conversations = Array.from({ length: 20 }, (_, i) =>
      makeConversation({ id: String(i), providerId: "claude" })
    );
    const result = pruneAgentConversations(conversations, 5, 365);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("groups by provider", () => {
    const conversations = [
      makeConversation({ id: "1", providerId: "claude" }),
      makeConversation({ id: "2", providerId: "openai" }),
    ];
    const result = pruneAgentConversations(conversations, 10, 30);
    expect(result).toHaveLength(2);
  });

  it("filters out expired conversations by retentionDays", () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const conversations = [
      makeConversation({ id: "old", providerId: "claude", updatedAt: oldDate }),
      makeConversation({ id: "new", providerId: "claude" }),
    ];
    const result = pruneAgentConversations(conversations, 100, 30);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("new");
  });

  it("keeps most recent conversations when over limit", () => {
    const now = Date.now();
    const conversations = Array.from({ length: 5 }, (_, i) =>
      makeConversation({
        id: String(i),
        providerId: "claude",
        updatedAt: new Date(now - i * 1000).toISOString(),
      })
    );
    const result = pruneAgentConversations(conversations, 2, 365);
    expect(result).toHaveLength(2);
    // The two most recent should be id "0" and "1"
    const ids = result.map((c) => c.id).sort();
    expect(ids).toEqual(["0", "1"]);
  });

  it("treats limit 0 as falsy and falls back to default limit", () => {
    const conversations = Array.from({ length: 10 }, (_, i) =>
      makeConversation({ id: String(i), providerId: "claude" })
    );
    // limit=0 is falsy, so it falls back to the default (5)
    const result = pruneAgentConversations(conversations, 0, 365);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("clamps limit to maximum 200", () => {
    const conversations = Array.from({ length: 250 }, (_, i) =>
      makeConversation({ id: String(i), providerId: "claude" })
    );
    const result = pruneAgentConversations(conversations, 300, 365);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("filters conversations with invalid updatedAt", () => {
    const conversations = [
      makeConversation({ id: "1", providerId: "claude", updatedAt: "not-a-date" }),
      makeConversation({ id: "2", providerId: "claude" }),
    ];
    const result = pruneAgentConversations(conversations, 100, 365);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });
});

// ---------------------------------------------------------------------------
// normalizeAgentConversations
// ---------------------------------------------------------------------------
describe("normalizeAgentConversations", () => {
  it("returns empty for undefined input", () => {
    const result = normalizeAgentConversations(undefined, "/workspace", []);
    expect(result).toEqual([]);
  });

  it("normalizes valid conversations", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
        title: "Test",
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("conv-1");
  });

  it("skips conversations without id", () => {
    const input = [{ providerId: "claude" }];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result).toHaveLength(0);
  });

  it("skips conversations without providerId", () => {
    const input = [{ id: "conv-1" }];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result).toHaveLength(0);
  });

  it("normalizes messages with valid roles", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
        title: "Test",
        messages: [
          { id: "m1", role: "user" as const, content: "Hello", createdAt: new Date().toISOString(), permissionMode: "full_access" as const },
          { id: "m2", role: "assistant" as const, content: "Hi there", createdAt: new Date().toISOString(), permissionMode: "full_access" as const },
        ],
      },
    ];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result).toHaveLength(1);
    expect(result[0].messages).toHaveLength(2);
    expect(result[0].messages[0].role).toBe("user");
    expect(result[0].messages[1].role).toBe("assistant");
  });

  it("filters out messages with invalid roles", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
        messages: [{ id: "m1", role: "system" as "user" | "assistant", content: "should be skipped", createdAt: new Date().toISOString(), permissionMode: "full_access" as const }],
      },
    ];
    const result = normalizeAgentConversations(input as any, "/workspace", []);
    expect(result).toHaveLength(1);
    expect(result[0].messages).toHaveLength(0);
  });

  it("assigns workspaceScopeId from buildWorkspaceScopeId if missing", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
      },
    ];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result).toHaveLength(1);
    expect(result[0].workspaceScopeId).toBeTruthy();
  });

  it("preserves existing workspaceScopeId", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
        workspaceScopeId: "my-scope",
      },
    ];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result[0].workspaceScopeId).toBe("my-scope");
  });

  it("defaults title to new session if empty", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
      },
    ];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result[0].title).toBe("新会话");
  });

  it("trims whitespace from title", () => {
    const input = [
      {
        id: "conv-1",
        providerId: "claude",
        title: "  My Title  ",
      },
    ];
    const result = normalizeAgentConversations(input, "/workspace", []);
    expect(result[0].title).toBe("My Title");
  });
});

// ---------------------------------------------------------------------------
// loadAppData
// ---------------------------------------------------------------------------
describe("loadAppData", () => {
  it("loads and merges valid JSON data", async () => {
    const stored = {
      settings: {
        api: { provider: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "key", model: "claude", models: [] },
        language: "en-US",
        agents: [
          { id: "claude-code", name: "Claude Code", transport: "claude-agent-sdk", command: "claude", args: [], enabled: true, model: "", models: [], description: "test" },
          { id: "codex", name: "Codex CLI", transport: "codex-app-server", command: "codex", args: ["app-server", "--listen", "stdio://"], enabled: true, model: "", models: [], description: "test" },
          { id: "opencode", name: "Opencode", transport: "opencode-sdk", command: "opencode", args: [], enabled: true, model: "", models: [], description: "test" },
        ],
      },
      documents: [{ id: "doc-1", title: "Test.md", markdown: "content", kind: "markdown", updatedAt: new Date().toISOString() }],
      workspacePath: "/my/workspace",
    };
    mockedReadFile.mockResolvedValue(JSON.stringify(stored));

    const result = await loadAppData();

    expect(mockedReadFile).toHaveBeenCalledWith("/mock/userData/informio-data.json", "utf8");
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.documents.find((d) => d.id === "doc-1")).toBeDefined();
    expect(result.settings.language).toBe("en-US");
  });

  it("returns defaultData on read error", async () => {
    mockedReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await loadAppData();

    expect(result).toBe(defaultData);
  });

  it("returns defaultData on JSON parse error", async () => {
    mockedReadFile.mockResolvedValue("not valid json {");

    const result = await loadAppData();

    expect(result).toBe(defaultData);
  });

  it("saves defaultData when loading fails", async () => {
    mockedReadFile.mockRejectedValue(new Error("file not found"));

    await loadAppData();

    expect(mockedWriteFile).toHaveBeenCalled();
    expect(mockedMkdir).toHaveBeenCalled();
  });

  it("uses app.getPath('userData') for data path", async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({}));

    await loadAppData();

    expect(mockedGetPath).toHaveBeenCalledWith("userData");
    expect(mockedReadFile).toHaveBeenCalledWith("/mock/userData/informio-data.json", "utf8");
  });

  it("merges partial data with defaults", async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({}));

    const result = await loadAppData();

    expect(result.settings).toBeDefined();
    expect(result.settings.appearance).toBeDefined();
    expect(result.settings.editor).toBeDefined();
    expect(result.documents).toBeDefined();
    expect(result.folders).toBeDefined();
    expect(result.projects).toBeDefined();
  });

  it("preserves document kind from stored data", async () => {
    const stored = {
      documents: [
        { id: "img-1", title: "photo.png", markdown: "", kind: "image", updatedAt: new Date().toISOString() },
      ],
    };
    mockedReadFile.mockResolvedValue(JSON.stringify(stored));

    const result = await loadAppData();

    const imgDoc = result.documents.find((d) => d.id === "img-1");
    expect(imgDoc).toBeDefined();
    expect(imgDoc!.kind).toBe("image");
  });
});

// ---------------------------------------------------------------------------
// saveAppData
// ---------------------------------------------------------------------------
describe("saveAppData", () => {
  it("writes JSON to the data path", async () => {
    const result = await saveAppData(defaultData);

    expect(mockedMkdir).toHaveBeenCalledWith("/mock/userData", { recursive: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      "/mock/userData/informio-data.json",
      expect.any(String),
      "utf8"
    );
    expect(result).toBe(defaultData);
  });

  it("writes valid JSON", async () => {
    await saveAppData(defaultData);

    const written = mockedWriteFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.settings).toBeDefined();
    expect(parsed.documents).toBeDefined();
  });

  it("writes pretty-printed JSON with 2-space indent", async () => {
    await saveAppData(defaultData);

    const written = mockedWriteFile.mock.calls[0][1] as string;
    expect(written).toContain("\n  ");
  });

  it("returns the same data object", async () => {
    const result = await saveAppData(defaultData);
    expect(result).toBe(defaultData);
  });
});

// ---------------------------------------------------------------------------
// saveAppDataAndFiles
// ---------------------------------------------------------------------------
describe("saveAppDataAndFiles", () => {
  it("saves app data and returns it", async () => {
    const result = await saveAppDataAndFiles(defaultData);

    expect(result).toBe(defaultData);
    expect(mockedWriteFile).toHaveBeenCalled();
  });

  it("writes document files for text documents with filePath", async () => {
    const data = {
      ...defaultData,
      documents: [
        {
          id: "doc-1",
          title: "Test.md",
          kind: "markdown" as const,
          collection: "writing" as const,
          markdown: "# Hello",
          filePath: "/docs/Test.md",
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await saveAppDataAndFiles(data);

    expect(mockedMkdir).toHaveBeenCalledWith("/docs", { recursive: true });
    expect(mockedWriteFile).toHaveBeenCalledWith("/docs/Test.md", "# Hello", "utf8");
  });

  it("does not write files for documents without filePath", async () => {
    const data = {
      ...defaultData,
      documents: [
        {
          id: "doc-1",
          title: "Test.md",
          kind: "markdown" as const,
          collection: "writing" as const,
          markdown: "# Hello",
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await saveAppDataAndFiles(data);

    // writeFile should be called once for the app data json, not for the document
    const docWrites = mockedWriteFile.mock.calls.filter(
      ([path]) => typeof path === "string" && path === "/docs/Test.md"
    );
    expect(docWrites).toHaveLength(0);
  });

  it("does not write files for non-text documents", async () => {
    const data = {
      ...defaultData,
      documents: [
        {
          id: "img-1",
          title: "photo.png",
          kind: "image" as const,
          collection: "writing" as const,
          markdown: "",
          filePath: "/images/photo.png",
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await saveAppDataAndFiles(data);

    const imageWrites = mockedWriteFile.mock.calls.filter(
      ([path]) => typeof path === "string" && path === "/images/photo.png"
    );
    expect(imageWrites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createQuickDocument
// ---------------------------------------------------------------------------
describe("createQuickDocument", () => {
  it("creates a new document with Quick- prefix", async () => {
    // stat throws for all paths (no existing files), so uniqueMarkdownPath returns the first candidate
    mockedStat.mockRejectedValue(new Error("ENOENT"));

    const result = await createQuickDocument(defaultData);

    const quickDoc = result.documents[0];
    expect(quickDoc.title).toMatch(/^Quick-.*\.md$/);
    expect(quickDoc.kind).toBe("markdown");
    expect(quickDoc.markdown).toBe("");
    expect(quickDoc.collection).toBe("writing");
  });

  it("sets the new document as active", async () => {
    mockedStat.mockRejectedValue(new Error("ENOENT"));

    const result = await createQuickDocument(defaultData);

    expect(result.activeDocumentId).toBe(result.documents[0].id);
  });

  it("prepends the new document to the list", async () => {
    mockedStat.mockRejectedValue(new Error("ENOENT"));

    const result = await createQuickDocument(defaultData);

    expect(result.documents.length).toBe(defaultData.documents.length + 1);
    expect(result.documents[0].title).toMatch(/^Quick-/);
  });

  it("collapses both panels", async () => {
    mockedStat.mockRejectedValue(new Error("ENOENT"));

    const result = await createQuickDocument(defaultData);

    expect(result.settings.appearance.leftPanel).toBe("collapsed");
    expect(result.settings.appearance.rightPanel).toBe("collapsed");
  });

  it("saves to disk via saveAppDataAndFiles", async () => {
    mockedStat.mockRejectedValue(new Error("ENOENT"));

    await createQuickDocument(defaultData);

    expect(mockedWriteFile).toHaveBeenCalled();
    expect(mockedMkdir).toHaveBeenCalled();
  });

  it("generates a unique path when the first candidate exists", async () => {
    // First call succeeds (file exists), second fails (file does not exist)
    mockedStat
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof stat>>)
      .mockRejectedValueOnce(new Error("ENOENT"));

    const result = await createQuickDocument(defaultData);

    expect(result.documents[0].filePath).toMatch(/Quick-.*-2\.md$/);
  });
});
