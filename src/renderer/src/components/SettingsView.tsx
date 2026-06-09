import { useMemo, useState } from "react";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import {
  Check,
  ChevronDown,
  Github,
  Loader2,
  Square,
} from "lucide-react";
import type {
  AgentConnection,
  ApiCheckState,
  ApiProviderKind,
  AppInfo,
  AppSettings,
  LocalFontOption,
} from "../types";
import { cn } from "../lib/utils";
import { normalizeApiSettings, defaultApiBaseUrl, isBuiltinApiBaseUrl, modelLabel } from "../lib/agent";
import {
  getThemeSwatchStyle,
  isDarkColor,
  settingsNav,
  mergeFontOptions,
} from "../lib/settings-helpers";
import {
  acceleratorFromKeyboardEvent,
  acceleratorToDisplay,
  configurableShortcutEntries,
  defaultShortcutBindings,
  findShortcutConflict,
  normalizeAccelerator,
  shortcutRegistryById,
} from "../../../shared/shortcuts";
import { DEFAULT_CUSTOM_THEME_COLOR } from "../../../shared/theme";
import {
  appIconUrl,
  apiProviderOptions,
  connectionLabel,
  connectionTone,
  themeOptions,
  CHAT_PANEL_FONT_MAX,
  CHAT_PANEL_FONT_MIN,
  EDITOR_CONTENT_MAX_WIDTH,
  EDITOR_CONTENT_MIN_WIDTH,
} from "../constants";
import { SettingRow } from "./SettingRow";
import { ShortcutBindingControl } from "./ShortcutBindingControl";
import { FontFamilySelect } from "./FontFamilySelect";
import { WindowControls } from "./WindowControls";

export function SettingsView({
  settings,
  connections,
  onChange,
  onCheckAgents,
  checkingAgents,
  onCheckApiModels,
  checkingApiModels,
  apiCheckState,
  appInfo,
  showWindowControls
}: {
  settings: AppSettings;
  connections: AgentConnection[];
  onChange: (settings: AppSettings) => void;
  onCheckAgents: () => void;
  checkingAgents: boolean;
  onCheckApiModels: () => void;
  checkingApiModels: boolean;
  apiCheckState: ApiCheckState;
  appInfo: AppInfo;
  showWindowControls: boolean;
}) {
  const apiSettings = normalizeApiSettings(settings.api);
  const customThemeColor = settings.appearance.customThemeColor || DEFAULT_CUSTOM_THEME_COLOR;
  const updateAppearance = (patch: Partial<AppSettings["appearance"]>) =>
    onChange({ ...settings, appearance: { ...settings.appearance, ...patch } });
  const [recordingShortcutId, setRecordingShortcutId] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [section, setSection] = useState<(typeof settingsNav)[number]["id"]>(() => {
    const requested = window.localStorage.getItem("informio-settings-section");
    window.localStorage.removeItem("informio-settings-section");
    const normalized = requested === "markdown" ? "editor" : requested === "integrations" ? "agent" : requested;
    return settingsNav.some((item) => item.id === normalized) ? (normalized as (typeof settingsNav)[number]["id"]) : "appearance";
  });
  const [localFontsState, setLocalFontsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    fonts: LocalFontOption[];
    error?: string;
  }>({
    status: "idle",
    fonts: []
  });
  const ensureLocalFontsLoaded = async () => {
    if (localFontsState.status === "loading" || localFontsState.status === "ready") return;
    setLocalFontsState((current) => ({ ...current, status: "loading", error: undefined }));
    const result = await window.informio.listLocalFonts();
    setLocalFontsState({
      status: result.error ? "error" : "ready",
      fonts: result.fonts,
      error: result.error
    });
  };
  const localFontOptions = useMemo(
    () =>
      mergeFontOptions(
        localFontsState.fonts,
        settings.appearance.chineseFontFamily,
        settings.appearance.englishFontFamily,
        settings.appearance.codeFontFamily
      ),
    [
      localFontsState.fonts,
      settings.appearance.chineseFontFamily,
      settings.appearance.englishFontFamily,
      settings.appearance.codeFontFamily
    ]
  );
  const shortcutGroups = useMemo(() => {
    const groups = new Map<string, Array<(typeof configurableShortcutEntries)[number]>>();
    configurableShortcutEntries.forEach((entry) => {
      const items = groups.get(entry.category) ?? [];
      items.push(entry);
      groups.set(entry.category, items);
    });
    return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
  }, []);
  const updateShortcutBinding = (id: string, accelerator: string) => {
    const nextBindings = {
      ...settings.shortcuts.bindings,
      [id]: normalizeAccelerator(accelerator)
    };
    const conflict = findShortcutConflict(nextBindings, id, nextBindings[id]);
    if (conflict) {
      setShortcutError(`“${shortcutRegistryById.get(id)?.label || id}” 与 “${conflict.label}” 不能使用同一个快捷键。`);
      return;
    }
    setShortcutError(null);
    setRecordingShortcutId(null);
    onChange({ ...settings, shortcuts: { ...settings.shortcuts, bindings: nextBindings } });
  };
  const clearShortcutBinding = (id: string) => {
    const nextBindings = { ...settings.shortcuts.bindings, [id]: "" };
    setShortcutError(null);
    setRecordingShortcutId(null);
    onChange({ ...settings, shortcuts: { ...settings.shortcuts, bindings: nextBindings } });
  };
  const restoreShortcutBinding = (id: string) => {
    const fallback = defaultShortcutBindings[id];
    if (!fallback) {
      clearShortcutBinding(id);
      return;
    }
    updateShortcutBinding(id, fallback);
  };
  return (
    <div className="settings-window grid h-screen grid-cols-[246px_1fr] overflow-hidden">
          <div className="settings-sidebar drag-region border-r px-3 pb-5 pt-[50px]">
            <nav className="space-y-2">
              {settingsNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "flex h-10 w-full items-center gap-3 rounded-md px-3 text-[14px] font-bold transition-[background-color,transform,color] active:scale-[0.99]",
                      section === item.id ? "settings-nav-active" : "settings-nav-idle"
                    )}
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="settings-main flex min-w-0 flex-col overflow-hidden">
            <div className="settings-titlebar drag-region relative flex h-[42px] shrink-0 items-center justify-center border-b">
              <div className="absolute right-0 top-0 h-full">
                <WindowControls visible={showWindowControls} />
              </div>
              <h1 className="text-[12px] font-bold">设置</h1>
            </div>
            <div className="no-drag overflow-y-auto px-10 py-7">

            {section === "appearance" && (
              <section>
                <h2 className="text-[18px] font-bold">主题</h2>
                <div className="mt-4 flex flex-wrap gap-6">
                  {themeOptions.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => updateAppearance({ theme: theme.id })}
                      className="text-center transition-transform active:scale-95"
                    >
                      <span
                        className={cn(
                          "grid h-11 w-11 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]",
                          settings.appearance.theme === theme.id && "ring-2 ring-slate-400 ring-offset-4"
                        )}
                        style={getThemeSwatchStyle(theme.id, customThemeColor)}
                      >
                        {settings.appearance.theme === theme.id ? (
                          <Check
                            size={18}
                            className={theme.id === "night" || (theme.id === "custom" && isDarkColor(customThemeColor)) ? "text-white" : "text-slate-950"}
                          />
                        ) : null}
                      </span>
                      <span className="mt-2 block text-[12px] font-medium text-[var(--text-muted)]">{theme.label}</span>
                    </button>
                  ))}
                </div>
                {settings.appearance.theme === "custom" ? (
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 py-3">
                    <div>
                      <div className="text-[14px] font-bold text-[var(--text-main)]">自定义颜色</div>
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                        保持当前界面对比度，只把整体基调换成你选的颜色。
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="relative block h-11 w-11 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]">
                        <span
                          className="pointer-events-none absolute inset-0 rounded-full"
                          style={{ backgroundColor: customThemeColor }}
                        />
                        <input
                          type="color"
                          value={customThemeColor}
                          aria-label="选择自定义主题颜色"
                          onChange={(event) => updateAppearance({ theme: "custom", customThemeColor: event.target.value })}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <code className="rounded-full bg-[var(--surface-panel)] px-3 py-1 text-[12px] font-semibold tracking-[0.06em] text-[var(--text-main)] uppercase">
                        {customThemeColor}
                      </code>
                    </div>
                  </div>
                ) : null}

                <h2 className="mt-12 text-[18px] font-bold">字体</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title="中文字体" description="影响整个软件里的中文显示，包括侧栏、工具栏、设置页和编辑器正文。">
                    <FontFamilySelect
                      value={settings.appearance.chineseFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ chineseFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                  <SettingRow title="英文字体" description="影响整个软件里的英文、数字和拉丁字符显示。">
                    <FontFamilySelect
                      value={settings.appearance.englishFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ englishFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                  <SettingRow title="代码字体" description="影响代码块、源码模式，以及路径、命令、日志这类等宽信息。">
                    <FontFamilySelect
                      value={settings.appearance.codeFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ codeFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                </div>
                {localFontsState.status === "loading" ? (
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">正在读取本地字体列表……</p>
                ) : null}
                {localFontsState.error ? (
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">{localFontsState.error}</p>
                ) : null}

                <h2 className="mt-12 text-[18px] font-bold">窗口</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title="自动隐藏状态栏" description="不交互时隐藏底部统计">
                    <Switch.Root
                      checked={settings.appearance.autoHideStatusBar}
                      onCheckedChange={(value) => updateAppearance({ autoHideStatusBar: value })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                </div>

                <h2 className="mt-12 text-[18px] font-bold">编辑器</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title="编辑字号" description={`${settings.editor.fontSize}px，影响正文阅读密度`}>
                    <input
                      type="range"
                      min={12}
                      max={19}
                      value={settings.editor.fontSize}
                      onChange={(event) =>
                        onChange({ ...settings, editor: { ...settings.editor, fontSize: Number(event.target.value) } })
                      }
                    />
                  </SettingRow>
                  <SettingRow title="编辑宽度" description={`${settings.editor.contentWidth}px，控制正文列总宽度`}>
                    <input
                      type="range"
                      min={EDITOR_CONTENT_MIN_WIDTH}
                      max={EDITOR_CONTENT_MAX_WIDTH}
                      value={settings.editor.contentWidth}
                      onChange={(event) =>
                        onChange({ ...settings, editor: { ...settings.editor, contentWidth: Number(event.target.value) } })
                      }
                    />
                  </SettingRow>
                </div>

                <h2 className="mt-12 text-[18px] font-bold">对话栏</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow
                    title="对话字号"
                    description={`${settings.appearance.chatFontSize}px，影响 User、Agent 名称、用户消息、AI 回复和"已处理"这一行；执行流内部会自动小 2px`}
                  >
                    <input
                      type="range"
                      min={CHAT_PANEL_FONT_MIN}
                      max={CHAT_PANEL_FONT_MAX}
                      value={settings.appearance.chatFontSize}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          appearance: { ...settings.appearance, chatFontSize: Number(event.target.value) }
                        })
                      }
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {section === "agent" && (
              <section>
                <div className="flex items-start gap-5">
                  <div>
                    <h2 className="text-[18px] font-bold text-[var(--text-main)]">Agent</h2>
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">Informio 会用选中文本、当前文档、打开 Tab、项目文件结构作为上下文，调用本机已安装的 Agent。</p>
                  </div>
                </div>

                <div className="settings-divide mt-6 divide-y">
                  <SettingRow title="启用 Agent" description="关闭后不会启动本机 Agent，也不会发送文档上下文。">
                    <Switch.Root
                      checked={settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, enabled: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title="自动启动" description="打开应用后自动预连接全部已启用 Agent，首次切换更快。">
                    <Switch.Root
                      checked={settings.agentRuntime.autoStart}
                      disabled={!settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, autoStart: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)] disabled:opacity-50"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title="保留会话数量" description="每个 Agent 最多保留多少条历史会话。">
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={settings.agentRuntime.conversationRetentionLimit}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          agentRuntime: {
                            ...settings.agentRuntime,
                            conversationRetentionLimit: Math.max(1, Math.min(200, Number(event.target.value) || 1))
                          }
                        })
                      }
                      className="h-9 w-20 rounded-md bg-white px-3 text-center font-mono text-[13px] ring-1 ring-slate-200"
                    />
                  </SettingRow>
                  <SettingRow title="保留会话时间" description="超出这个时间的历史会话会自动清理。">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={settings.agentRuntime.conversationRetentionDays}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          agentRuntime: {
                            ...settings.agentRuntime,
                            conversationRetentionDays: Math.max(1, Math.min(3650, Number(event.target.value) || 1))
                          }
                        })
                      }
                      className="h-9 w-20 rounded-md bg-white px-3 text-center font-mono text-[13px] ring-1 ring-slate-200"
                    />
                  </SettingRow>
                </div>

                <div className="surface-card mt-6 rounded-lg p-4 shadow-[0_1px_5px_rgba(15,23,42,0.12)]">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[13px] font-bold text-[var(--text-main)]">工作 Agent</div>
                    <button
                      type="button"
                      onClick={onCheckAgents}
                      disabled={!settings.agentRuntime.enabled || checkingAgents}
                      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {checkingAgents ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      检测
                    </button>
                  </div>
                  <p className="mb-3 text-[12px] leading-5 text-[var(--text-muted)]">用于右侧工作面板，适合较重的问答、改写和上下文任务。</p>
                  <div className="divide-y divide-[var(--divider)]">
                    {settings.agents.map((agent) => {
                      const connection = connections.find((item) => item.providerId === agent.id);
                      const status = connection?.status ?? "idle";
                      const active = agent.id === settings.activeAgentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => onChange({ ...settings, activeAgentId: agent.id })}
                          className={cn(
                            "flex w-full items-center justify-between gap-4 rounded-md px-3 py-3 text-left transition-colors",
                            active ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "hover:bg-slate-500/5"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-bold text-[var(--text-main)]">{agent.name}</span>
                            {connection?.status === "error" && connection.message ? (
                              <span className="mt-1 block truncate text-[11px] text-red-600">{connection.message}</span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-[12px] font-bold text-[var(--text-muted)]">
                            <span className={cn("h-2.5 w-2.5 rounded-full", connectionTone[status])} />
                            {connectionLabel[status]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {section === "api" && (
              <section>
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h2 className="text-[18px] font-bold text-[var(--text-main)]">API</h2>
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">Markdown 和 PDF 的划词翻译都会走这里配置的接口，不再依赖 Agent runtime。</p>
                  </div>
                </div>

                <div className="settings-divide mt-6 divide-y">
                  <SettingRow title="Provider" description={apiProviderOptions.find((item) => item.id === apiSettings.provider)?.description}>
                    <Select.Root
                      value={apiSettings.provider}
                      onValueChange={(value) => {
                        const provider = value as ApiProviderKind;
                        const nextBaseUrl =
                          !apiSettings.baseUrl.trim() || isBuiltinApiBaseUrl(apiSettings.baseUrl)
                            ? defaultApiBaseUrl(provider)
                            : apiSettings.baseUrl;
                        onChange({
                          ...settings,
                          api: { ...apiSettings, provider, baseUrl: nextBaseUrl, model: "", models: [] }
                        });
                      }}
                    >
                      <Select.Trigger className="flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45">
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown size={14} className="block text-slate-400" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="z-[80] overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                          <Select.Viewport>
                            {apiProviderOptions.map((item) => (
                              <Select.Item
                                key={`api-provider-${item.id}`}
                                value={item.id}
                                className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950"
                              >
                                <Select.ItemText>{item.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </SettingRow>

                  <div className="grid gap-2 py-5">
                    <div className="text-[15px] font-bold text-[var(--text-main)]">base_url</div>
                    <input
                      value={apiSettings.baseUrl}
                      placeholder={defaultApiBaseUrl(apiSettings.provider)}
                      onChange={(event) =>
                        onChange({ ...settings, api: { ...apiSettings, baseUrl: event.target.value, model: "", models: [] } })
                      }
                      className="h-9 min-w-0 rounded-md bg-white px-3 font-mono text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                    />
                    <p className="text-[12px] text-[var(--text-muted)]">例如 {defaultApiBaseUrl(apiSettings.provider)}</p>
                  </div>

                  <div className="grid gap-2 py-5">
                    <div className="text-[15px] font-bold text-[var(--text-main)]">api_key</div>
                    <input
                      type="password"
                      value={apiSettings.apiKey}
                      placeholder="sk-..."
                      onChange={(event) => onChange({ ...settings, api: { ...apiSettings, apiKey: event.target.value } })}
                      className="h-9 min-w-0 rounded-md bg-white px-3 font-mono text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                    />
                  </div>
                </div>

                <div className="surface-card mt-6 rounded-lg p-4 shadow-[0_1px_5px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                    <span className="text-[12px] font-semibold text-[var(--text-muted)]">翻译模型</span>
                    <div className="flex items-center gap-2">
                      <Select.Root
                        value={apiSettings.model}
                        onValueChange={(value) => onChange({ ...settings, api: { ...apiSettings, model: value } })}
                        disabled={!apiSettings.models.length}
                      >
                        <Select.Trigger className="flex h-8 min-w-[220px] max-w-[320px] items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45 disabled:cursor-not-allowed disabled:opacity-45">
                          <Select.Value placeholder="先检测可用模型">
                            <span className="block truncate text-[13px] leading-8">
                              {apiSettings.model ? modelLabel(apiSettings.models, apiSettings.model) : "先检测可用模型"}
                            </span>
                          </Select.Value>
                          <Select.Icon>
                            <ChevronDown size={13} className="block text-slate-400" />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="z-[80] max-h-72 overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                            <Select.Viewport>
                              {apiSettings.models.map((model) => (
                                <Select.Item
                                  key={`api-model-${model.id}`}
                                  value={model.id}
                                  className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950"
                                >
                                  <Select.ItemText>{model.label || model.id}</Select.ItemText>
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                      <button
                        type="button"
                        onClick={onCheckApiModels}
                        disabled={checkingApiModels}
                        className="inline-flex h-8 items-center gap-2 rounded-md bg-slate-950 px-3 text-[13px] font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {checkingApiModels ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        检测
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-[var(--text-muted)]">检测会读取当前接口下可用模型，成功后即可给划词翻译单独指定一个更快的模型。</p>
                  {apiCheckState.message ? <p className="mt-3 text-[12px] text-emerald-700">{apiCheckState.message}</p> : null}
                  {apiCheckState.error ? <p className="mt-3 text-[12px] text-red-700">{apiCheckState.error}</p> : null}
                </div>
              </section>
            )}

            {section === "about" && (
              <section className="max-w-4xl">
                <h2 className="text-[18px] font-bold text-[var(--text-main)]">关于</h2>
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="flex items-start gap-5">
                    <img
                      src={appInfo.iconDataUrl || appIconUrl}
                      alt="Informio"
                      className="h-18 w-18 rounded-[18px] object-cover shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                    />
                    <div className="pt-1">
                      <div className="text-[15px] font-bold text-[var(--text-main)]">{appInfo.name || "Informio"}</div>
                      <p className="mt-1 text-[13px] text-[var(--text-muted)]">版本 {appInfo.version || "-"}</p>
                    </div>
                  </div>

                  <div className="justify-self-start pt-1 lg:justify-self-end">
                    <button
                      type="button"
                      disabled={!appInfo.githubUrl}
                      onClick={() => {
                        if (appInfo.githubUrl) window.informio.openExternal(appInfo.githubUrl);
                      }}
                      className="inline-flex items-center gap-3 text-[14px] font-semibold text-[var(--text-main)] transition-colors hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
                    >
                      <Github size={18} />
                      <span className="border-b border-current/25 pb-0.5">GitHub</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {section !== "appearance" && section !== "agent" && section !== "api" && section !== "about" && (
              <section>
                <h2 className="text-[18px] font-bold text-[var(--text-main)]">{settingsNav.find((item) => item.id === section)?.label}</h2>
                <div className="mt-5 divide-y">
                  {section === "editor" && (
                    <>
                      <SettingRow title="拼写检查" description="控制正文编辑器的系统拼写检查">
                        <Switch.Root
                          checked={settings.editor.spellcheck}
                          onCheckedChange={(value) =>
                            onChange({ ...settings, editor: { ...settings.editor, spellcheck: value } })
                          }
                          className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                        >
                          <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                        </Switch.Root>
                      </SettingRow>
	                      <SettingRow title="自动保存" description="输入后自动保存到本地应用数据">
                        <Switch.Root
                          checked={settings.markdown.autoSave}
                          onCheckedChange={(value) => onChange({ ...settings, markdown: { ...settings.markdown, autoSave: value } })}
                          className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                        >
                          <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                        </Switch.Root>
                      </SettingRow>
                      <SettingRow title="缩进宽度" description="用于 Markdown 列表与代码块">
                        <input
                          type="number"
                          min={2}
                          max={8}
                          value={settings.markdown.tabSize}
                          onChange={(event) =>
                            onChange({ ...settings, markdown: { ...settings.markdown, tabSize: Number(event.target.value) } })
                          }
                          className="h-9 w-18 rounded-md bg-white px-3 text-center font-mono text-[13px] ring-1 ring-slate-200"
                        />
                      </SettingRow>
                      <SettingRow title="插入文件" description="控制通过菜单插入图片、音频、视频和 PDF 时如何写入路径">
                        <Select.Root
                          value={settings.editor.assetImportMode}
                          onValueChange={(value) =>
                            onChange({
                              ...settings,
                              editor: { ...settings.editor, assetImportMode: value as AppSettings["editor"]["assetImportMode"] }
                            })
                          }
                        >
                          <Select.Trigger className="flex h-9 min-w-44 items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45">
                            <Select.Value />
                            <Select.Icon><ChevronDown size={14} /></Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="z-[80] overflow-hidden rounded-lg bg-white p-1 shadow-xl">
                              <Select.Viewport>
                                <Select.Item value="copy-to-attachment" className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950">
                                  <Select.ItemText>复制到 attachments</Select.ItemText>
                                </Select.Item>
                                <Select.Item value="link-original-file" className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950">
                                  <Select.ItemText>保持原路径</Select.ItemText>
                                </Select.Item>
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </SettingRow>
                      <div className="grid gap-2 py-5">
                        <div className="text-[15px] font-bold text-[var(--text-main)]">默认文件夹</div>
                        <div className="flex gap-3">
                          <input
                            value={settings.shortcuts.quickFolder}
                            onChange={(event) =>
                              onChange({ ...settings, shortcuts: { ...settings.shortcuts, quickFolder: event.target.value } })
                            }
                            className="h-9 min-w-0 flex-1 rounded-md bg-white px-3 font-mono text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const folder = await window.informio.chooseFolder();
                              if (folder) onChange({ ...settings, shortcuts: { ...settings.shortcuts, quickFolder: folder } });
                            }}
                            className="rounded-md bg-slate-950 px-3 text-[13px] font-bold text-white transition-transform active:scale-95"
                          >
                            选择
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {section === "shortcuts" && (
                    <>
                      <div className="mb-5">
                        <h2 className="text-[18px] font-bold text-[var(--text-main)]">可配置快捷键</h2>
                        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-muted)]">这里直接改当前生效的快捷键。点一下键位开始录制，冲突时会当场阻止保存。</p>
                      </div>
                      {shortcutError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">{shortcutError}</p> : null}
                      <div className="space-y-6">
                        {shortcutGroups.map((group) => (
                          <section key={group.title}>
                            <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[var(--text-muted)] uppercase">{group.title}</div>
                            <div className="divide-y divide-[var(--divider)] border-y border-[var(--divider)]/80">
                              {group.items.map((entry) => (
                                <SettingRow key={entry.id} title={entry.label} description={entry.description}>
                                  <ShortcutBindingControl
                                    value={settings.shortcuts.bindings[entry.id]}
                                    recording={recordingShortcutId === entry.id}
                                    onStartRecording={() =>
                                      setRecordingShortcutId((current) => (current === entry.id ? null : entry.id))
                                    }
                                    onCapture={(accelerator) => updateShortcutBinding(entry.id, accelerator)}
                                    onClear={() => clearShortcutBinding(entry.id)}
                                    onRestoreDefault={() => restoreShortcutBinding(entry.id)}
                                  />
                                </SettingRow>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </>
                  )}
                  {section !== "editor" && section !== "shortcuts" && (
                    <>
                      <SettingRow title="保持极简默认值" description="这一页的高级配置会在后续版本逐步展开">
                        <Square size={18} className="text-slate-400" />
                      </SettingRow>
                      <SettingRow title="当前策略" description="先保证写作主路径顺滑，再开放低频细项">
                        <Check size={18} className="text-emerald-600" />
                      </SettingRow>
                    </>
                  )}
                </div>
              </section>
            )}
            </div>
          </div>
    </div>
  );
}
