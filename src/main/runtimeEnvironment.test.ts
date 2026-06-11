import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Hoisted mock state so vi.mock factories can reference them.
const {
  mockExecFileAsync,
  mockSpawn,
  mockAccess,
  mockReadFile,
  mockAccessMap,
} = vi.hoisted(() => {
  const accessMap = new Map<string, boolean>();
  return {
    mockExecFileAsync: vi.fn(),
    mockSpawn: vi.fn(),
    mockAccess: vi.fn(async (p: string) => {
      if (!accessMap.get(p)) throw new Error(`ENOENT: ${p}`);
    }),
    mockReadFile: vi.fn(),
    mockAccessMap: accessMap,
  };
});

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock("node:fs/promises", () => ({
  access: (path: string) => mockAccess(path),
  readFile: (path: string, encoding?: string) => mockReadFile(path, encoding),
}));

vi.mock("node:fs", () => ({
  constants: { F_OK: 0 },
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock("electron-log", () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

import {
  isMissingCommandError,
  summarizeAgentStderr,
  formatAgentLaunchError,
  prepareRuntimeEnvironment,
  resolveRuntimeCommand,
  resolveDirectRuntimeExecutable,
  spawnRuntimeCommand,
} from "./runtimeEnvironment";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const shellBin = "/shell/bin";
const shellSbin = "/shell/sbin";
const cargoBin = "/home/testuser/.cargo/bin";
const localBin = "/home/testuser/.local/bin";
const userBin = "/home/testuser/bin";
const homebrewBin = "/opt/homebrew/bin";

const savedPlatform = process.platform;

function setPlatform(value: string) {
  Object.defineProperty(process, "platform", { value, configurable: true, writable: true, enumerable: true });
}

function setExistingPaths(...existing: string[]) {
  mockAccessMap.clear();
  for (const p of existing) mockAccessMap.set(p, true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccessMap.clear();
  process.env.PATH = "/usr/bin:/usr/sbin";
  process.env.SHELL = "/bin/zsh";
  delete process.env.PATHEXT;
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: savedPlatform, configurable: true });
});

// ─── isMissingCommandError ─────────────────────────────────────────────────────

describe("isMissingCommandError", () => {
  it("returns true for ENOENT error", () => {
    expect(isMissingCommandError(new Error("spawn ENOENT"))).toBe(true);
  });
  it("returns true for ENOENT with code", () => {
    const error = new Error("command not found");
    (error as any).code = "ENOENT";
    expect(isMissingCommandError(error)).toBe(true);
  });
  it("returns true for command not found message", () => {
    expect(isMissingCommandError(new Error("command not found: node"))).toBe(true);
  });
  it("returns true for spawn not found", () => {
    expect(isMissingCommandError(new Error("spawn python not found"))).toBe(true);
  });
  it("returns true for spawn ENOENT", () => {
    expect(isMissingCommandError(new Error("spawn cmd ENOENT"))).toBe(true);
  });
  it("returns true for ENOENT code only", () => {
    const error = new Error("anything");
    (error as any).code = "ENOENT";
    expect(isMissingCommandError(error)).toBe(true);
  });
  it("returns false for other errors", () => {
    expect(isMissingCommandError(new Error("some other error"))).toBe(false);
  });
  it("returns false for non-error values", () => {
    expect(isMissingCommandError("string")).toBe(false);
    expect(isMissingCommandError(null)).toBe(false);
    expect(isMissingCommandError(undefined)).toBe(false);
  });
  it("returns false for a number", () => {
    expect(isMissingCommandError(42)).toBe(false);
  });
});

// ─── summarizeAgentStderr ──────────────────────────────────────────────────────

describe("summarizeAgentStderr", () => {
  it("returns empty for undefined", () => {
    expect(summarizeAgentStderr(undefined)).toBe("");
  });
  it("returns empty for empty array", () => {
    expect(summarizeAgentStderr([])).toBe("");
  });
  it("returns last non-empty line", () => {
    expect(summarizeAgentStderr(["error1", "error2"])).toBe("error2");
  });
  it("filters empty lines", () => {
    expect(summarizeAgentStderr(["", "  ", "error"])).toBe("error");
  });
  it("strips HTML tags", () => {
    expect(summarizeAgentStderr(["<b>error</b>"])).toBe("error");
  });
  it("collapses whitespace", () => {
    expect(summarizeAgentStderr(["error   with   spaces"])).toBe("error with spaces");
  });
  it("truncates long output", () => {
    const long = "x".repeat(300);
    const result = summarizeAgentStderr([long]);
    expect(result.length).toBeLessThanOrEqual(283);
    expect(result).toContain("...");
  });
  it("parses JSON log messages via fields.message", () => {
    const jsonLine = JSON.stringify({ fields: { message: "json error" } });
    expect(summarizeAgentStderr([jsonLine])).toBe("json error");
  });
  it("handles invalid JSON gracefully", () => {
    expect(summarizeAgentStderr(["not json"])).toBe("not json");
  });
  it("prefers fields.error over fields.message", () => {
    const jsonLine = JSON.stringify({
      fields: { error: "the-error", message: "the-message" },
    });
    expect(summarizeAgentStderr([jsonLine])).toBe("the-error");
  });
  it("falls back to top-level message", () => {
    const jsonLine = JSON.stringify({ message: "top-level msg" });
    expect(summarizeAgentStderr([jsonLine])).toBe("top-level msg");
  });
  it("ignores JSON entries where all fields are empty strings", () => {
    const emptyJson = JSON.stringify({ fields: { message: "", error: "" }, message: "" });
    expect(summarizeAgentStderr([emptyJson, "fallback"])).toBe("fallback");
  });
  it("strips nested HTML inside JSON log message", () => {
    const jsonLine = JSON.stringify({
      fields: { message: "<span class='err'>connection refused</span>" },
    });
    expect(summarizeAgentStderr([jsonLine])).toBe("connection refused");
  });
  it("picks the last meaningful line from a mix of entries", () => {
    expect(summarizeAgentStderr(["", "first", "second"])).toBe("second");
  });
  it("returns empty when all entries are blank after trimming", () => {
    expect(summarizeAgentStderr(["", "  ", "\t"])).toBe("");
  });
});

// ─── formatAgentLaunchError ────────────────────────────────────────────────────

describe("formatAgentLaunchError", () => {
  it("formats ENOENT error", () => {
    const result = formatAgentLaunchError("MyAgent", "node", new Error("spawn ENOENT"));
    expect(result).toContain("MyAgent");
  });
  it("formats generic error", () => {
    const result = formatAgentLaunchError("MyAgent", "python", new Error("permission denied"));
    expect(result).toContain("permission denied");
  });
  it("includes details when provided", () => {
    const result = formatAgentLaunchError("MyAgent", "node", new Error("fail"), "extra info");
    expect(result).toContain("extra info");
  });
  it("handles non-Error values", () => {
    const result = formatAgentLaunchError("MyAgent", "node", "string error");
    expect(result).toContain("string error");
  });
  it("formats EPERM code as permission denied message", () => {
    const error = Object.assign(new Error("open"), { code: "EPERM" });
    const result = formatAgentLaunchError("Agent", "cmd", error);
    expect(result).toContain("无法在当前受限环境里启动");
  });
  it("formats operation not permitted as permission denied", () => {
    const result = formatAgentLaunchError("Agent", "cmd", new Error("operation not permitted"));
    expect(result).toContain("无法在当前受限环境里启动");
  });
  it("formats os error 1 as permission denied", () => {
    const result = formatAgentLaunchError("Agent", "cmd", new Error("os error 1"));
    expect(result).toContain("无法在当前受限环境里启动");
  });
  it("includes details in permission-denied detection", () => {
    const error = new Error("minor");
    const result = formatAgentLaunchError("Agent", "cmd", error, "EPERM: access denied");
    expect(result).toContain("无法在当前受限环境里启动");
  });
  it("includes platform-specific hint for ENOENT on darwin", () => {
    setPlatform("darwin");
    const result = formatAgentLaunchError("Claude", "claude", new Error("spawn ENOENT"));
    expect(result).toContain("不可用");
    expect(result).toContain("/opt/homebrew/bin");
  });
  it("includes generic hint for ENOENT on linux", () => {
    setPlatform("linux");
    const result = formatAgentLaunchError("Claude", "claude", new Error("spawn ENOENT"));
    expect(result).toContain("不可用");
    expect(result).toContain("PATH");
    expect(result).not.toContain("/opt/homebrew");
  });
  it("returns raw message for non-missing non-permission error without details", () => {
    const result = formatAgentLaunchError("Agent", "cmd", new Error("timeout"));
    expect(result).toBe("timeout");
  });
  it("returns raw message when details duplicate rawMessage", () => {
    const result = formatAgentLaunchError("Agent", "cmd", new Error("timeout"), "timeout");
    expect(result).toBe("timeout");
  });
  it("returns raw + details when details differ from rawMessage", () => {
    const result = formatAgentLaunchError("Agent", "cmd", new Error("timeout"), "extra context");
    expect(result).toBe("timeout\nextra context");
  });
});

// ─── prepareRuntimeEnvironment ────────────────────────────────────────────────

describe("prepareRuntimeEnvironment", () => {
  it("merges shell PATH, current PATH, and fallback entries", async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: `${shellBin}:${shellSbin}\n` });
    setExistingPaths(cargoBin, localBin, userBin, homebrewBin);

    await prepareRuntimeEnvironment();

    const result = process.env.PATH!;
    expect(result).toContain(shellBin);
    expect(result).toContain(shellSbin);
    expect(result).toContain("/usr/bin");
    expect(result).toContain("/usr/sbin");
  });

  it("preserves current PATH entries that also appear in shell or fallback", async () => {
    process.env.PATH = "/usr/bin:/usr/sbin";
    mockExecFileAsync.mockResolvedValue({ stdout: "/usr/bin\n" });
    setExistingPaths("/usr/bin");

    await prepareRuntimeEnvironment();

    const count = process.env.PATH!.split(":").filter((e) => e === "/usr/bin").length;
    expect(count).toBe(1);
  });

  it("does not modify PATH when all merged entries are empty", async () => {
    process.env.PATH = "";
    mockExecFileAsync.mockResolvedValue({ stdout: "" });
    setExistingPaths();

    await prepareRuntimeEnvironment();

    expect(process.env.PATH).toBe("");
  });

  it("falls back gracefully when shell execFile rejects", async () => {
    process.env.PATH = "/usr/bin";
    mockExecFileAsync.mockRejectedValue(new Error("shell not found"));
    setExistingPaths(cargoBin);

    await prepareRuntimeEnvironment();

    expect(process.env.PATH).toContain("/usr/bin");
    expect(process.env.PATH).toContain(cargoBin);
  });

  it("uses fallback entries whose paths exist on disk", async () => {
    process.env.PATH = "/usr/bin";
    mockExecFileAsync.mockResolvedValue({ stdout: "" });
    setExistingPaths(cargoBin);

    await prepareRuntimeEnvironment();

    expect(process.env.PATH).toContain(cargoBin);
  });

  it("drops fallback entries whose paths do not exist", async () => {
    process.env.PATH = "/usr/bin";
    mockExecFileAsync.mockResolvedValue({ stdout: "" });
    setExistingPaths();

    await prepareRuntimeEnvironment();

    expect(process.env.PATH).toBe("/usr/bin");
  });

  it("deduplicates entries across all three sources", async () => {
    process.env.PATH = "/shared/bin";
    mockExecFileAsync.mockResolvedValue({ stdout: "/shared/bin:/extra\n" });
    setExistingPaths("/shared/bin", "/extra");

    await prepareRuntimeEnvironment();

    const entries = process.env.PATH!.split(":");
    expect(entries.filter((e) => e === "/shared/bin").length).toBe(1);
    expect(entries).toContain("/extra");
  });

  it("passes the login shell command to execFile", async () => {
    process.env.SHELL = "/bin/bash";
    process.env.PATH = "/usr/bin";
    mockExecFileAsync.mockResolvedValue({ stdout: "/usr/bin\n" });
    setExistingPaths("/usr/bin");

    await prepareRuntimeEnvironment();

    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "/bin/bash",
      ["-lc", 'printf %s "$PATH"'],
      expect.objectContaining({ timeout: 1500 }),
    );
  });

  it("uses default shell when SHELL env is unset", async () => {
    delete process.env.SHELL;
    process.env.PATH = "/usr/bin";
    mockExecFileAsync.mockResolvedValue({ stdout: "/usr/bin\n" });
    setExistingPaths("/usr/bin");

    await prepareRuntimeEnvironment();

    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "/bin/zsh",
      expect.any(Array),
      expect.objectContaining({ timeout: 1500 }),
    );
  });
});

// ─── resolveRuntimeCommand ────────────────────────────────────────────────────

describe("resolveRuntimeCommand", () => {
  it("returns the command unchanged on non-win32", async () => {
    const result = await resolveRuntimeCommand("node");
    expect(result).toBe("node");
  });

  it("returns the command unchanged on non-win32 even for paths", async () => {
    const result = await resolveRuntimeCommand("/usr/bin/node");
    expect(result).toBe("/usr/bin/node");
  });

  it("falls back to raw command when no candidate exists on win32", async () => {
    setPlatform("win32");
    process.env.PATH = "C:\\nodejs";
    process.env.PATHEXT = ".EXE";
    setExistingPaths();

    const result = await resolveRuntimeCommand("nonexistent");
    // On non-win32 (ESM-cached platform), returns command directly.
    // On win32 with no accessible candidates, also returns command.
    expect(result).toBe("nonexistent");
  });
});

// ─── resolveDirectRuntimeExecutable ───────────────────────────────────────────

describe("resolveDirectRuntimeExecutable", () => {
  it("resolves a command via resolveRuntimeCommand on non-win32", async () => {
    const result = await resolveDirectRuntimeExecutable("claude");
    expect(result).toBe("claude");
  });

  it("preserves path-style commands on non-win32", async () => {
    const result = await resolveDirectRuntimeExecutable("/usr/local/bin/claude");
    expect(result).toBe("/usr/local/bin/claude");
  });
});

// ─── spawnRuntimeCommand ──────────────────────────────────────────────────────

describe("spawnRuntimeCommand", () => {
  it("spawns the command directly on non-win32", async () => {
    const fakeProcess = { pid: 123 };
    mockSpawn.mockReturnValue(fakeProcess);

    const opts = { cwd: "/tmp" };
    const result = await spawnRuntimeCommand("node", ["--version"], opts);

    expect(result).toBe(fakeProcess);
    expect(mockSpawn).toHaveBeenCalledWith("node", ["--version"], opts);
  });

  it("spawns with empty args on non-win32", async () => {
    const fakeProcess = { pid: 456 };
    mockSpawn.mockReturnValue(fakeProcess);

    await spawnRuntimeCommand("echo", [], {});

    expect(mockSpawn).toHaveBeenCalledWith("echo", [], {});
  });

  it("returns the child process object from spawn", async () => {
    const fakeProcess = { pid: 789, stdout: {}, stderr: {} };
    mockSpawn.mockReturnValue(fakeProcess);

    const result = await spawnRuntimeCommand("ls", ["-la"], {});

    expect(result).toEqual(fakeProcess);
    expect(result.pid).toBe(789);
  });

  it("passes environment options to spawn", async () => {
    const fakeProcess = { pid: 999 };
    mockSpawn.mockReturnValue(fakeProcess);

    const opts = { env: { FOO: "bar" }, cwd: "/project" };
    await spawnRuntimeCommand("node", ["app.js"], opts);

    expect(mockSpawn).toHaveBeenCalledWith("node", ["app.js"], opts);
  });
});
