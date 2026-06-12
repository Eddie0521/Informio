import type {
  ThemeName,
  ApiProviderKind,
  AgentModel,
  AgentConnection,
  AgentPermissionMode,
  AgentSessionStatus,
  AgentProcessCategory,
} from "../types";
import { DEFAULT_CUSTOM_THEME_COLOR } from "../../../shared/theme";

// --- UI meta ---

export const appIconUrl = "/icon.png";

export const themeOptions: Array<{ id: ThemeName; label: string; surface: string; accent: string }> = [
  { id: "white", label: "白色", surface: "#ffffff", accent: "#059669" },
  { id: "paper", label: "纸张", surface: "#f7f7f2", accent: "#159447" },
  { id: "night", label: "夜间", surface: "#1b2026", accent: "#5ad08a" },
  { id: "custom", label: "自定义", surface: "#ffffff", accent: DEFAULT_CUSTOM_THEME_COLOR }
];

export const apiProviderOptions: Array<{ id: ApiProviderKind; label: string; description: string }> = [
  { id: "openai-compatible", label: "OpenAI-Compatible", description: "用于兼容 OpenAI Chat Completions 的服务。" },
  { id: "anthropic", label: "Anthropic", description: "用于 Anthropic Messages API。" }
];

export const defaultApiSettings = {
  provider: "openai-compatible" as ApiProviderKind,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  models: [] as AgentModel[]
};

// --- Font fallbacks ---

export const CHINESE_FONT_FALLBACK =
  `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
export const ENGLISH_FONT_FALLBACK =
  `"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
export const CODE_FONT_FALLBACK =
  `"SF Mono", "Cascadia Mono", "Roboto Mono", ui-monospace, monospace`;

// --- Agent status/label maps ---

export const connectionTone: Record<AgentConnection["status"], string> = {
  idle: "bg-slate-300",
  connecting: "bg-amber-400",
  connected: "bg-emerald-500",
  error: "bg-red-500"
};

export const connectionLabel: Record<AgentConnection["status"], string> = {
  idle: "未检测",
  connecting: "检测中",
  connected: "可用",
  error: "不可用"
};

export const permissionModeLabel: Record<AgentPermissionMode, string> = {
  read_only: "只读",
  default: "审核权限",
  full_access: "默认权限"
};

export const agentPermissionModes: AgentPermissionMode[] = ["read_only", "default", "full_access"];

export const sessionStatusLabel: Record<AgentSessionStatus, string> = {
  idle: "空闲",
  thinking: "处理中",
  "tool-executing": "执行中",
  done: "完成",
  error: "失败"
};

export const processCategoryLabel: Record<Exclude<AgentProcessCategory, "system">, string> = {
  explore: "探索",
  search: "搜索",
  read: "读文件",
  edit: "编辑",
  command: "命令",
  approval: "审批",
  other: "步骤"
};

// --- Selection toolbar ---

export const selectionToolbarLabel = "翻译";
export const selectionToolbarSafeAreaSelector = "[data-selection-toolbar-safe-area]";

// --- Layout constants ---

export const LEFT_PANEL_MIN_WIDTH = 161;
export const LEFT_PANEL_MAX_WIDTH = 380;
export const RIGHT_PANEL_MIN_WIDTH = 240;
export const RIGHT_PANEL_MAX_WIDTH = 520;
export const EDITOR_CONTENT_MIN_WIDTH = 410;
export const EDITOR_CONTENT_MAX_WIDTH = 1100;
export const CHAT_PANEL_FONT_MIN = 10;
export const CHAT_PANEL_FONT_MAX = 18;
export const TABLE_CELL_MIN_WIDTH = 88;
export const TABLE_EDGE_COMPRESS_MIN_WIDTH = 40;
export const TABLE_CONTROL_SIZE = 24;
export const TABLE_CONTEXT_OFFSET = 12;
export const TABLE_EDGE_HIT_DISTANCE = 14;
export const TABLE_HEADER_STRIP_SIZE = 24;
export const TABLE_TOOLBAR_HEIGHT = 30;
export const TABLE_ROW_MIN_HEIGHT = 36;

// --- Crypto ---

export const INFORMIO_SECRET_TAG = "informio-secret";
export const SECRET_ITERATIONS = 210000;
export const SECRET_ALGORITHM = "aes-gcm";
export const SECRET_KDF = "pbkdf2-sha256";

// --- File extension sets ---

export const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
export const pdfExtensions = new Set(["pdf"]);
export const videoExtensions = new Set(["mp4", "mov", "webm"]);
export const audioExtensions = new Set(["mp3", "wav", "m4a", "ogg"]);
export const mediaExtensions = new Set([...videoExtensions, ...audioExtensions]);

// --- Code language aliases ---

export const codeLanguageAliases: Record<string, string> = {
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  plaintext: "plaintext",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  py: "python",
  sh: "bash",
  yml: "yaml"
};

// --- Callout ---

export const calloutTypes = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);
