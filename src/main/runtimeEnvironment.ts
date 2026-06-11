import { execFile, spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import log from "electron-log";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const splitPathEntries = (value: string | undefined | null) =>
  (value ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

const uniqueEntries = (entries: string[]) => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });
};

const existingEntries = async (entries: string[]) => {
  const existing: string[] = [];
  for (const entry of uniqueEntries(entries)) {
    try {
      await access(entry, constants.F_OK);
      existing.push(entry);
    } catch {
      // Skip entries that do not exist on this machine.
    }
  }
  return existing;
};

const fallbackPathEntries = () => {
  if (process.platform === "darwin") {
    return [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      "/Applications/Codex.app/Contents/Resources",
      join(homedir(), ".cargo", "bin"),
      join(homedir(), ".local", "bin"),
      join(homedir(), "bin")
    ];
  }

  if (process.platform === "linux") {
    return ["/usr/local/bin", "/usr/local/sbin", join(homedir(), ".local", "bin"), join(homedir(), ".cargo", "bin"), join(homedir(), "bin")];
  }

  if (process.platform === "win32") {
    return [
      join(homedir(), "AppData", "Roaming", "npm"),
      join(homedir(), "AppData", "Local", "Microsoft", "WindowsApps"),
      process.env.ProgramFiles ? join(process.env.ProgramFiles, "nodejs") : "",
      process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"], "nodejs") : ""
    ].filter(Boolean);
  }

  return [];
};

const parseShellPath = (stdout: string) => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const candidate = [...lines].reverse().find((line) => line.includes(delimiter)) ?? lines[lines.length - 1];
  return splitPathEntries(candidate);
};

const readLoginShellPath = async () => {
  if (process.platform !== "darwin" && process.platform !== "linux") return [];
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");

  try {
    const { stdout } = await execFileAsync(shell, ["-lc", 'printf %s "$PATH"'], {
      timeout: 1500,
      maxBuffer: 64 * 1024,
      env: {
        ...process.env,
        TERM: "dumb"
      }
    });
    return parseShellPath(stdout);
  } catch (error) {
    log.warn("Failed to read login shell PATH:", error);
    return [];
  }
};

export const prepareRuntimeEnvironment = async () => {
  const [shellEntries, fallbackEntries] = await Promise.all([readLoginShellPath(), existingEntries(fallbackPathEntries())]);
  const merged = uniqueEntries([...shellEntries, ...splitPathEntries(process.env.PATH), ...fallbackEntries]);
  if (merged.length) process.env.PATH = merged.join(delimiter);
};

const windowsExecutableExtensions = () => {
  const preferred = [".cmd", ".exe", ".bat", ".com", ".ps1"];
  const fromEnv = (process.env.PATHEXT || "")
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return uniqueEntries([...preferred, ...fromEnv, ""]);
};

const commandHasPath = (command: string) =>
  command.includes("/") || command.includes("\\") || isAbsolute(command);

const executableCandidates = (command: string) => {
  if (process.platform !== "win32") return [command];
  const trimmed = command.trim();
  const extensions = extname(trimmed) ? [""] : windowsExecutableExtensions();
  const directories = commandHasPath(trimmed) ? [""] : splitPathEntries(process.env.PATH);
  return directories.flatMap((directory) =>
    extensions.map((extension) => directory ? join(directory, `${trimmed}${extension}`) : `${trimmed}${extension}`)
  );
};

export const resolveRuntimeCommand = async (command: string) => {
  if (process.platform !== "win32") return command;
  for (const candidate of executableCandidates(command)) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      // Try the next PATHEXT/PATH candidate.
    }
  }
  return command;
};

const resolveWindowsShimExecutable = async (command: string) => {
  const extension = extname(command).toLowerCase();
  if (process.platform !== "win32" || (extension !== ".cmd" && extension !== ".bat")) return command;
  try {
    const body = await readFile(command, "utf8");
    const shimDir = dirname(command);
    const matches = Array.from(body.matchAll(/"([^"]+?\.exe)"|(\S+?\.exe)(?=\s|$)/gi));
    for (const match of matches) {
      const raw = (match[1] ?? match[2] ?? "").replace(/%dp0%/gi, `${shimDir}\\`);
      if (!raw || raw.includes("%")) continue;
      try {
        await access(raw, constants.F_OK);
        return raw;
      } catch {
        // Try the next executable mentioned by the shim.
      }
    }
  } catch (error) {
    log.warn("Failed to read Windows shim executable:", error);
    return command;
  }
  return command;
};

export const resolveDirectRuntimeExecutable = async (command: string) =>
  resolveWindowsShimExecutable(await resolveRuntimeCommand(command));

const quoteWindowsArgument = (value: string) => {
  if (!value) return "\"\"";
  if (!/[\s"&^<>|()]/.test(value)) return value;
  return `"${value.replace(/(["^&<>|])/g, "^$1")}"`;
};

const windowsShellLine = (command: string, args: string[]) =>
  [quoteWindowsArgument(command), ...args.map(quoteWindowsArgument)].join(" ");

export const spawnRuntimeCommand = async (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
): Promise<ChildProcessWithoutNullStreams> => {
  if (process.platform !== "win32") {
    return spawn(command, args, options);
  }

  const resolved = await resolveRuntimeCommand(command);
  const extension = extname(resolved).toLowerCase();
  if (extension === ".cmd" || extension === ".bat" || !extension) {
    return spawn("cmd.exe", ["/d", "/s", "/c", windowsShellLine(resolved, args)], options);
  }
  if (extension === ".ps1") {
    return spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved, ...args], options);
  }
  return spawn(resolved, args, options);
};

export const isMissingCommandError = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "ENOENT"
    || /\bENOENT\b/i.test(message)
    || /command not found/i.test(message)
    || /spawn .* not found/i.test(message)
    || /spawn .* ENOENT/i.test(message)
  );
};

const isPermissionDeniedError = (message: string, code?: string) =>
  code === "EPERM"
  || /operation not permitted/i.test(message)
  || /\bos error 1\b/i.test(message)
  || /\bEPERM\b/i.test(message);

const extractJsonLogMessage = (value: string) => {
  try {
    const parsed = JSON.parse(value) as {
      message?: unknown;
      fields?: { message?: unknown; error?: unknown };
    };
    const fields = parsed.fields ?? {};
    const candidates = [fields.error, fields.message, parsed.message]
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return candidates[0] ?? "";
  } catch {
    return "";
  }
};

export const summarizeAgentStderr = (stderr: string[] | undefined) => {
  if (!stderr?.length) return "";
  for (const entry of [...stderr].reverse()) {
    const jsonMessage = extractJsonLogMessage(entry);
    const candidate = (jsonMessage || entry).trim();
    if (!candidate) continue;
    const singleLine = candidate
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!singleLine) continue;
    return singleLine.length > 280 ? `${singleLine.slice(0, 280)}...` : singleLine;
  }
  return "";
};

export const formatAgentLaunchError = (agentName: string, command: string, error: unknown, details?: string) => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = [rawMessage, details].filter(Boolean).join("\n");
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (isPermissionDeniedError(message, code)) {
    return `${agentName} 无法在当前受限环境里启动。系统拒绝了命令 ${command} 的运行或它需要的本地控制通道。\n建议：如果你是从受限沙箱、代理终端或其他受控环境里启动 Informio，请改用普通 Terminal / Applications 启动；如果只是想先进入编辑器，可在设置 → Agent 里关闭 Auto Start。`;
  }
  if (!isMissingCommandError(error)) return details && details !== rawMessage ? `${rawMessage}\n${details}` : rawMessage;

  const base = `${agentName} 不可用：未找到命令 ${command}。`;
  if (process.platform === "darwin") {
    return `${base} 如果你是从 Finder 或 Applications 启动 Informio，通常是系统没有把终端 PATH 传给应用。请确认它安装在 /opt/homebrew/bin、/usr/local/bin 或 ~/.cargo/bin，然后重启 Informio。`;
  }
  return `${base} 请确认该命令已安装，并且当前 PATH 能找到它。`;
};
