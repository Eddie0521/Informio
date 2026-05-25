import type { MenuCommand } from "./types.js";

export type ShortcutScope = "window" | "global";

export type ShortcutRegistryEntry = {
  id: string;
  command: MenuCommand;
  label: string;
  description: string;
  category: "窗口与文件" | "查找与编辑" | "文本格式";
  scope: ShortcutScope;
  defaultAccelerator?: string;
  configurable?: boolean;
};

export const shortcutRegistry: ShortcutRegistryEntry[] = [
  {
    id: "app.quickCapture",
    command: "app:quick-capture",
    label: "快速唤起窗口",
    description: "打开一个左右栏全折叠的空白速记窗口",
    category: "窗口与文件",
    scope: "global",
    defaultAccelerator: "Control+Space"
  },
  {
    id: "file.new",
    command: "file:new",
    label: "新建文档",
    description: "立即新建一篇 Markdown 文档",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "CommandOrControl+N"
  },
  {
    id: "window.new",
    command: "window:new",
    label: "新建窗口",
    description: "打开新的 Informio 窗口",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "Shift+CommandOrControl+N"
  },
  {
    id: "commandPalette.open",
    command: "command:open-palette",
    label: "命令面板",
    description: "搜索系统命令和文档",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "CommandOrControl+P"
  },
  {
    id: "file.open",
    command: "file:open",
    label: "快速打开",
    description: "打开文件选择器",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "CommandOrControl+O"
  },
  {
    id: "workspace.open",
    command: "workspace:open",
    label: "打开项目",
    description: "切换或载入新的项目目录",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "Shift+CommandOrControl+O"
  },
  {
    id: "file.closeTab",
    command: "file:close-tab",
    label: "关闭标签",
    description: "关闭当前文档标签",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "CommandOrControl+W"
  },
  {
    id: "window.close",
    command: "window:close",
    label: "关闭窗口",
    description: "关闭当前窗口",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "Shift+CommandOrControl+W"
  },
  {
    id: "file.save",
    command: "file:save",
    label: "保存",
    description: "保存当前文档",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "CommandOrControl+S"
  },
  {
    id: "file.saveAs",
    command: "file:save-as",
    label: "另存为",
    description: "把当前文档保存到新位置",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "Shift+CommandOrControl+S"
  },
  {
    id: "settings.open",
    command: "settings:open",
    label: "打开设置",
    description: "进入设置窗口",
    category: "窗口与文件",
    scope: "window",
    defaultAccelerator: "CommandOrControl+,"
  },
  {
    id: "edit.find",
    command: "edit:find",
    label: "查找与替换",
    description: "打开当前文档的查找替换浮窗",
    category: "查找与编辑",
    scope: "window",
    defaultAccelerator: "CommandOrControl+F"
  },
  {
    id: "edit.findNext",
    command: "edit:find-next",
    label: "查找下一个",
    description: "跳到当前查询词的下一个匹配结果",
    category: "查找与编辑",
    scope: "window",
    defaultAccelerator: "CommandOrControl+G"
  },
  {
    id: "format.bold",
    command: "format:bold",
    label: "加粗",
    description: "切换当前选区的粗体",
    category: "文本格式",
    scope: "window",
    defaultAccelerator: "CommandOrControl+B"
  },
  {
    id: "format.italic",
    command: "format:italic",
    label: "倾斜",
    description: "切换当前选区的斜体",
    category: "文本格式",
    scope: "window",
    defaultAccelerator: "CommandOrControl+I"
  },
  {
    id: "format.underline",
    command: "format:underline",
    label: "下划线",
    description: "切换当前选区的下划线",
    category: "文本格式",
    scope: "window",
    defaultAccelerator: "CommandOrControl+U"
  },
  {
    id: "format.strike",
    command: "format:strike",
    label: "删除线",
    description: "切换当前选区的删除线",
    category: "文本格式",
    scope: "window",
    defaultAccelerator: "Shift+CommandOrControl+X"
  },
  {
    id: "format.highlight",
    command: "format:highlight",
    label: "高亮",
    description: "高亮当前选区",
    category: "文本格式",
    scope: "window",
    defaultAccelerator: "Shift+CommandOrControl+M"
  }
];

export const shortcutRegistryById = new Map(shortcutRegistry.map((entry) => [entry.id, entry]));
export const configurableShortcutEntries = shortcutRegistry.filter((entry) => entry.configurable !== false);

const modifierOrder = ["CommandOrControl", "Command", "Control", "Alt", "Shift"] as const;
const modifierSet = new Set<string>(modifierOrder);
const specialKeyMap: Record<string, string> = {
  " ": "Space",
  spacebar: "Space",
  esc: "Escape",
  escape: "Escape",
  return: "Enter",
  enter: "Enter",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  ",": ",",
  ".": ".",
  "/": "/",
  "\\": "\\",
  "`": "`",
  "-": "-",
  "=": "="
};

const normalizeKeyToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (specialKeyMap[lower]) return specialKeyMap[lower];
  if (/^f\d{1,2}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed[0].toUpperCase() + trimmed.slice(1);
};

export const normalizeAccelerator = (value: string | undefined | null) => {
  if (!value?.trim()) return "";
  const tokens = value
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return "";
  const key = normalizeKeyToken(tokens.at(-1)!);
  if (!key || modifierSet.has(key)) return "";
  const modifiers = modifierOrder.filter((modifier) => tokens.some((token) => token.toLowerCase() === modifier.toLowerCase()));
  return [...modifiers, key].join("+");
};

export const defaultShortcutBindings = Object.fromEntries(
  configurableShortcutEntries
    .filter((entry) => entry.defaultAccelerator)
    .map((entry) => [entry.id, normalizeAccelerator(entry.defaultAccelerator)])
) as Record<string, string>;

type LegacyShortcutFields = {
  quickSave?: string;
  quickCapture?: string;
};

const legacyShortcutToCommandId: Record<keyof LegacyShortcutFields, string> = {
  quickSave: "file.save",
  quickCapture: "app.quickCapture"
};

export const normalizeShortcutBindings = (
  bindings?: Record<string, string>,
  legacy?: LegacyShortcutFields
) => {
  const normalized: Record<string, string> = {};
  const used = new Set<string>();

  configurableShortcutEntries.forEach((entry) => {
    const legacyValue = Object.entries(legacyShortcutToCommandId).find(([, commandId]) => commandId === entry.id)?.[0] as keyof LegacyShortcutFields | undefined;
    const hasExplicitBinding = Boolean(bindings) && Object.prototype.hasOwnProperty.call(bindings, entry.id);
    const rawValue = hasExplicitBinding
      ? bindings?.[entry.id]
      : (legacyValue ? legacy?.[legacyValue] : "") || defaultShortcutBindings[entry.id];
    const candidate = normalizeAccelerator(rawValue);
    if (!candidate || used.has(candidate)) return;
    normalized[entry.id] = candidate;
    used.add(candidate);
  });

  return normalized;
};

export const getShortcutAccelerator = (bindings: Record<string, string> | undefined, id: string) =>
  normalizeAccelerator(
    bindings && Object.prototype.hasOwnProperty.call(bindings, id)
      ? bindings[id]
      : defaultShortcutBindings[id]
  );

export const findShortcutConflict = (bindings: Record<string, string>, id: string, accelerator: string) => {
  const normalized = normalizeAccelerator(accelerator);
  if (!normalized) return null;
  return configurableShortcutEntries.find((entry) => entry.id !== id && normalizeAccelerator(bindings[entry.id]) === normalized) ?? null;
};

export const acceleratorToDisplay = (value: string | undefined, platform = "mac") => {
  const normalized = normalizeAccelerator(value);
  if (!normalized) return "未设置";
  return normalized
    .split("+")
    .map((token) => {
      if (token === "CommandOrControl") return platform === "mac" ? "Cmd" : "Ctrl";
      if (token === "Command") return "Cmd";
      if (token === "Control") return "Ctrl";
      if (token === "Alt") return platform === "mac" ? "Option" : "Alt";
      if (token === "Shift") return "Shift";
      if (token === "Space") return "Space";
      if (token === "Escape") return "Esc";
      return token;
    })
    .join("+");
};

const modifierOnlyKeys = new Set(["Meta", "Control", "Shift", "Alt"]);

type ShortcutKeyboardEventLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export const acceleratorFromKeyboardEvent = (event: ShortcutKeyboardEventLike) => {
  if (modifierOnlyKeys.has(event.key)) return "";
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Command");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  const key = normalizeKeyToken(event.key);
  if (!key) return "";
  return normalizeAccelerator([...modifiers, key].join("+"));
};
