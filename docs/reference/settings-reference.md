# Settings Reference

Complete schema reference for `AppSettings`. All fields live in the application's persistent store and are accessible through **Settings** (`Cmd+,` / `Ctrl+,`).

---

## agentRuntime

Controls the built-in agent runtime lifecycle and conversation retention.

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable or disable the agent runtime entirely. |
| `autoStart` | `boolean` | `true` | Automatically start the agent runtime when the application launches. |
| `conversationRetentionLimit` | `number` | `5` | Maximum number of conversations to keep per agent. Clamped to 1–200. |
| `conversationRetentionDays` | `number` | `30` | Days before a conversation is eligible for automatic cleanup. Clamped to 1–3650. |

---

## api

Configuration for the OpenAI-compatible or Anthropic API used by built-in features such as translation and inline completion.

| Field | Type | Default | Description |
|---|---|---|---|
| `provider` | `'openai-compatible' \| 'anthropic'` | `'openai-compatible'` | API protocol to use. |
| `baseUrl` | `string` | `'https://api.openai.com/v1'` | Base URL of the API endpoint. |
| `apiKey` | `string` | `''` | API key for authentication. Stored locally; never transmitted except to `baseUrl`. |
| `model` | `string` | `''` | Default model ID to use for requests. |
| `models` | `AgentModel[]` | `[]` | Cached list of available models detected from the endpoint. Each entry has `id: string` and optional `label?: string`. |

---

## appearance

Visual and layout preferences.

| Field | Type | Default | Description |
|---|---|---|---|
| `theme` | `ThemeName` | `'paper'` | Active theme. One of `'paper'`, `'white'`, `'night'`, `'custom'`. |
| `customThemeColor` | `string` | *(platform default)* | Accent color used when `theme` is `'custom'`. |
| `chineseFontFamily` | `string` | *(platform default)* | Font family for Chinese text in the editor. |
| `englishFontFamily` | `string` | *(platform default)* | Font family for Latin text in the editor. |
| `codeFontFamily` | `string` | *(platform default)* | Font family for inline code and code blocks. |
| `showTitleInWindow` | `boolean` | `true` | Display the document title in the window title bar. |
| `autoHideStatusBar` | `boolean` | `false` | Automatically hide the status bar when not hovered. |
| `chatFontSize` | `number` | `13` | Font size (px) for the agent chat panel. Clamped to 10–18. |
| `leftPanel` | `PanelMode` | `'expanded'` | Initial state of the left sidebar. `'expanded'` or `'collapsed'`. |
| `rightPanel` | `PanelMode` | `'collapsed'` | Initial state of the right sidebar. `'expanded'` or `'collapsed'`. |
| `leftPanelWidth` | `number` | `248` | Width (px) of the left sidebar when expanded. |
| `rightPanelWidth` | `number` | `330` | Width (px) of the right sidebar when expanded. |

---

## editor

Core editor behavior.

| Field | Type | Default | Description |
|---|---|---|---|
| `fontSize` | `number` | `15` | Base font size (px) for the document editor. |
| `lineHeight` | `number` | `1.72` | Line height multiplier for the document editor. |
| `contentWidth` | `number` | `888` | Maximum content width (px) of the editing area. |
| `spellcheck` | `boolean` | `true` | Enable browser-native spellcheck in the editor. |
| `typewriterMode` | `boolean` | `false` | Keep the active line vertically centered in the viewport. |
| `assetImportMode` | `'copy-to-attachment' \| 'link-original-file'` | `'copy-to-attachment'` | How dragged or pasted files are handled. `'copy-to-attachment'` copies the file into the project's attachment folder; `'link-original-file'` keeps a reference to the original path. |

---

## markdown

Markdown-specific editing and export settings.

| Field | Type | Default | Description |
|---|---|---|---|
| `autoSave` | `boolean` | `true` | Automatically save Markdown documents after edits. |
| `tabSize` | `number` | `2` | Number of spaces per indentation level. |
| `exportFormat` | `'markdown' \| 'html'` | `'markdown'` | Default format when exporting a document. |

---

## shortcuts

Keyboard shortcut configuration.

| Field | Type | Default | Description |
|---|---|---|---|
| `quickFolder` | `string` | *(system quick-access path)* | Folder used by the Quick Capture window for new notes. |
| `bindings` | `Record<string, string>` | *(all defaults)* | Map of shortcut ID to Electron accelerator string. Overrides the built-in default for each entry. See [Shortcuts Reference](./shortcuts-reference.md) for the full list of IDs and defaults. |

---

## language

| Field | Type | Default | Description |
|---|---|---|---|
| `language` | `'zh-CN' \| 'en-US'` | `'zh-CN'` | Application UI language. |

---

## agents

Array of configured agent providers. Each entry:

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | — | Unique identifier (e.g. `'codex'`, `'claude-code'`, `'opencode'`). |
| `name` | `string` | — | Display name shown in the agent panel. |
| `transport` | `AgentTransport` | — | Communication protocol. One of `'codex-app-server'`, `'claude-agent-sdk'`, `'opencode-sdk'`. |
| `command` | `string` | — | CLI command to launch the agent process. |
| `args` | `string[]` | `[]` | Arguments passed to `command`. |
| `cwd` | `string?` | — | Working directory for the agent process. Defaults to the project root. |
| `enabled` | `boolean` | `true` | Whether this agent appears in the agent selector. |
| `model` | `string?` | — | Default model override for this agent. |
| `models` | `AgentModel[]?` | — | Available models for this agent. |
| `runtimeSupportsResume` | `boolean?` | — | Whether the runtime supports resuming a prior conversation thread. |
| `runtimePermissionModes` | `AgentPermissionMode[]?` | — | Supported permission modes: `'read_only'`, `'default'`, `'full_access'`. |
| `description` | `string` | — | Short description shown in the agent selector tooltip. |

### Built-in agents

| ID | Name | Transport | Command |
|---|---|---|---|
| `claude-code` | Claude Code | `claude-agent-sdk` | `claude` |
| `codex` | Codex CLI | `codex-app-server` | `codex app-server --listen stdio://` |
| `opencode` | Opencode | `opencode-sdk` | `opencode` |

---

## Top-level fields

| Field | Type | Default | Description |
|---|---|---|---|
| `activeAgentId` | `string` | `'codex'` | ID of the agent selected as the primary agent. |
| `toolbarAgentId` | `string` | `'codex'` | ID of the agent pinned to the toolbar quick-access slot. |
