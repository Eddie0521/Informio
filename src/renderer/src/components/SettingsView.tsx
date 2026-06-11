import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore, useUiStore, useAppStore } from "../stores";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import {
  Check,
  ChevronDown,
  Download,
  Github,
  Loader2,
  RefreshCw,
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
import { normalizeUiLanguage, uiLanguageToSettingsLanguage } from "../i18n";

const shortcutCategoryKey = (category: string) => {
  if (category === "查找与编辑") return "findEdit";
  if (category === "文本格式") return "formatting";
  return "windowFile";
};

const shortcutItemKey = (id: string) => id.replace(/\./g, "_");

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

export function SettingsView({
  settings,
  onChange,
  onCheckAgents,
  onCheckApiModels,
  showWindowControls
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onCheckAgents: () => void;
  onCheckApiModels: () => void;
  showWindowControls: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { connections, checkingAgents } = useAgentStore();
  const { checkingApiModels, apiCheckState } = useUiStore();
  const { appInfo } = useAppStore();
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
  const [updateCheckStatus, setUpdateCheckStatus] = useState<"idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date">("idle");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes: string } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ percent: 0, transferred: 0, total: 0 });

  // Listen for update events from main process
  useEffect(() => {
    window.informio.onUpdateAvailable(() => {});
    window.informio.onUpdateDownloaded(() => setUpdateCheckStatus("downloaded"));
    window.informio.onDownloadProgress((info) => setDownloadProgress({ percent: info.percent, transferred: info.transferred, total: info.total }));
  }, []);

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
      const firstId = shortcutRegistryById.get(id)?.id ?? id;
      setShortcutError(t("settings.shortcuts.conflictError", {
        first: t(`shortcuts.items.${shortcutItemKey(firstId)}.label`),
        second: t(`shortcuts.items.${shortcutItemKey(conflict.id)}.label`)
      }));
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
                    {t(`settings.nav.${item.id}`)}
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
              <h1 className="text-[12px] font-bold">{t("settings.title")}</h1>
            </div>
            <div className="no-drag overflow-y-auto px-10 py-7">

            {section === "appearance" && (
              <section>
                <h2 className="text-[18px] font-bold">{t("settings.appearance.language")}</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title={t("settings.appearance.language")} description={t("settings.appearance.languageDescription")}>
                    <select
                      value={normalizeUiLanguage(i18n.language || settings.language)}
                      onChange={(e) => {
                        const lang = normalizeUiLanguage(e.target.value);
                        void i18n.changeLanguage(lang);
                        localStorage.setItem("informio-language", lang);
                        onChange({ ...settings, language: uiLanguageToSettingsLanguage(lang) });
                        window.informio.setLanguage(lang);
                      }}
                      className="h-8 cursor-pointer rounded-md border bg-transparent px-2 text-[12px] text-[var(--text-main)]"
                    >
                      <option value="zh">{t("settings.appearance.chineseLanguage")}</option>
                      <option value="en">English</option>
                    </select>
                  </SettingRow>
                </div>

                <h2 className="mt-12 text-[18px] font-bold">{t("settings.appearance.theme")}</h2>
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
                      <span className="mt-2 block text-[12px] font-medium text-[var(--text-muted)]">{t(`theme.${theme.id}`)}</span>
                    </button>
                  ))}
                </div>
                {settings.appearance.theme === "custom" ? (
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 py-3">
                    <div>
                      <div className="text-[14px] font-bold text-[var(--text-main)]">{t("settings.appearance.customColor")}</div>
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                        {t("settings.appearance.customColorDesc")}
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
                          aria-label={t("settings.appearance.selectCustomColor")}
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

                <h2 className="mt-12 text-[18px] font-bold">{t("settings.appearance.font")}</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title={t("settings.appearance.chineseFont")} description={t("settings.appearance.chineseFontDesc")}>
                    <FontFamilySelect
                      value={settings.appearance.chineseFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ chineseFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                  <SettingRow title={t("settings.appearance.englishFont")} description={t("settings.appearance.englishFontDesc")}>
                    <FontFamilySelect
                      value={settings.appearance.englishFontFamily}
                      options={localFontOptions}
                      onValueChange={(value) => updateAppearance({ englishFontFamily: value })}
                      onOpenChange={(open) => {
                        if (open) void ensureLocalFontsLoaded();
                      }}
                    />
                  </SettingRow>
                  <SettingRow title={t("settings.appearance.codeFont")} description={t("settings.appearance.codeFontDesc")}>
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
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">{t("settings.appearance.loadingFonts")}</p>
                ) : null}
                {localFontsState.error ? (
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">{localFontsState.error}</p>
                ) : null}

                <h2 className="mt-12 text-[18px] font-bold">{t("settings.appearance.window")}</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title={t("settings.appearance.autoHideStatusBar")} description={t("settings.appearance.autoHideStatusBarDesc")}>
                    <Switch.Root
                      checked={settings.appearance.autoHideStatusBar}
                      onCheckedChange={(value) => updateAppearance({ autoHideStatusBar: value })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                </div>

                <h2 className="mt-12 text-[18px] font-bold">{t("settings.editor.title")}</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow title={t("settings.editor.fontSizeLabel")} description={t("settings.editor.fontSizeDesc", { size: settings.editor.fontSize })}>
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
                  <SettingRow title={t("settings.editor.contentWidthLabel")} description={t("settings.editor.contentWidthDesc", { size: settings.editor.contentWidth })}>
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

                <h2 className="mt-12 text-[18px] font-bold">{t("settings.chat.title")}</h2>
                <div className="settings-divide mt-4 divide-y">
                  <SettingRow
                    title={t("settings.chat.fontSize")}
                    description={t("settings.chat.fontSizeDesc", { size: settings.appearance.chatFontSize })}
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
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">{t("settings.agent.description")}</p>
                  </div>
                </div>

                <div className="settings-divide mt-6 divide-y">
                  <SettingRow title={t("settings.agent.enabled")} description={t("settings.agent.enabledDesc")}>
                    <Switch.Root
                      checked={settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, enabled: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title={t("settings.agent.autoStart")} description={t("settings.agent.autoStartDesc")}>
                    <Switch.Root
                      checked={settings.agentRuntime.autoStart}
                      disabled={!settings.agentRuntime.enabled}
                      onCheckedChange={(value) => onChange({ ...settings, agentRuntime: { ...settings.agentRuntime, autoStart: value } })}
                      className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)] disabled:opacity-50"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                    </Switch.Root>
                  </SettingRow>
                  <SettingRow title={t("settings.agent.conversationRetentionLimit")} description={t("settings.agent.conversationRetentionLimitDesc")}>
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
                  <SettingRow title={t("settings.agent.conversationRetentionDays")} description={t("settings.agent.conversationRetentionDaysDesc")}>
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
                    <div className="text-[13px] font-bold text-[var(--text-main)]">{t("settings.agent.workAgent")}</div>
                    <button
                      type="button"
                      onClick={onCheckAgents}
                      disabled={!settings.agentRuntime.enabled || checkingAgents}
                      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {checkingAgents ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      {t("common.detect")}
                    </button>
                  </div>
                  <p className="mb-3 text-[12px] leading-5 text-[var(--text-muted)]">{t("settings.agent.workAgentDesc")}</p>
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
                            {t(`status.connection.${status}`)}
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
                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">{t("settings.api.translationDesc")}</p>
                  </div>
                </div>

                <div className="settings-divide mt-6 divide-y">
                  <SettingRow title="Provider" description={t(`apiProvider.${apiSettings.provider}.description`)}>
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
                    <p className="text-[12px] text-[var(--text-muted)]">{t("settings.api.example", { url: defaultApiBaseUrl(apiSettings.provider) })}</p>
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
                    <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t("settings.api.translationModel")}</span>
                    <div className="flex items-center gap-2">
                      <Select.Root
                        value={apiSettings.model}
                        onValueChange={(value) => onChange({ ...settings, api: { ...apiSettings, model: value } })}
                        disabled={!apiSettings.models.length}
                      >
                        <Select.Trigger className="flex h-8 min-w-[220px] max-w-[320px] items-center justify-between gap-2 rounded-md bg-white px-3 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/45 disabled:cursor-not-allowed disabled:opacity-45">
                          <Select.Value placeholder={t("settings.api.detectModelsFirst")}>
                            <span className="block truncate text-[13px] leading-8">
                              {apiSettings.model ? modelLabel(apiSettings.models, apiSettings.model) : t("settings.api.detectModelsFirst")}
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
                        {t("common.detect")}
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-[var(--text-muted)]">{t("settings.api.detectModelsDesc")}</p>
                  {apiCheckState.message ? <p className="mt-3 text-[12px] text-emerald-700">{apiCheckState.message}</p> : null}
                  {apiCheckState.error ? <p className="mt-3 text-[12px] text-red-700">{apiCheckState.error}</p> : null}
                </div>
              </section>
            )}

            {section === "about" && (
              <section className="max-w-4xl">
                <h2 className="text-[18px] font-bold text-[var(--text-main)]">{t("settings.about.title")}</h2>
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="flex items-start gap-5">
                    <img
                      src={appInfo.iconDataUrl || appIconUrl}
                      alt="Informio"
                      className="h-18 w-18 rounded-[18px] object-cover shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                    />
                    <div className="pt-1">
                      <div className="text-[15px] font-bold text-[var(--text-main)]">{appInfo.name || "Informio"}</div>
                      <p className="mt-1 text-[13px] text-[var(--text-muted)]">{t("settings.about.version")} {appInfo.version || "-"}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 pt-1 lg:items-end">
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
                    {updateCheckStatus === "idle" || updateCheckStatus === "up-to-date" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setUpdateCheckStatus("checking");
                          setUpdateInfo(null);
                          window.informio.checkForUpdates().then((result) => {
                            if (result.available && result.version) {
                              setUpdateInfo({ version: result.version, releaseNotes: result.releaseNotes ?? "" });
                              setUpdateCheckStatus("available");
                            } else {
                              setUpdateCheckStatus("up-to-date");
                            }
                          }).catch(() => {
                            setUpdateCheckStatus("up-to-date");
                          });
                        }}
                        className="inline-flex items-center gap-2 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                      >
                        <RefreshCw size={14} />
                        <span className="border-b border-current/25 pb-0.5">
                          {updateCheckStatus === "up-to-date" ? t("settings.about.upToDate") : t("settings.about.checkUpdate")}
                        </span>
                      </button>
                    ) : updateCheckStatus === "checking" ? (
                      <span className="inline-flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                        <Loader2 size={14} className="animate-spin" />
                        {t("settings.about.checking")}
                      </span>
                    ) : updateCheckStatus === "available" && updateInfo ? (
                      <div className="flex flex-col gap-2">
                        <div className="text-[13px] text-[var(--text-main)]">
                          {t("settings.about.newVersion")} <span className="font-semibold">v{updateInfo.version}</span>
                        </div>
                        {updateInfo.releaseNotes ? (
                          <div className="max-h-32 overflow-y-auto rounded-md bg-[var(--surface-sidebar)] px-3 py-2 text-[12px] leading-5 text-[var(--text-muted)] whitespace-pre-wrap">
                            {updateInfo.releaseNotes}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setUpdateCheckStatus("downloading");
                              window.informio.downloadUpdate();
                            }}
                            className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                          >
                            <Download size={13} />
                            {t("settings.about.downloadInstall")}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setUpdateCheckStatus("idle"); setUpdateInfo(null); }}
                            className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                          >
                            {t("settings.about.later")}
                          </button>
                        </div>
                      </div>
                    ) : updateCheckStatus === "downloading" ? (
                      <div className="flex flex-col gap-1.5 min-w-48">
                        <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                          <span>{t("settings.about.downloading")}</span>
                          {downloadProgress.total > 0 ? (
                            <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
                          ) : null}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sidebar)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                            style={{ width: `${Math.round(downloadProgress.percent)}%` }}
                          />
                        </div>
                        <div className="text-right text-[11px] text-[var(--text-muted)]">{Math.round(downloadProgress.percent)}%</div>
                      </div>
                    ) : updateCheckStatus === "downloaded" ? (
                      <button
                        type="button"
                        onClick={() => window.informio.installUpdate()}
                        className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--accent)] transition-opacity hover:opacity-80"
                      >
                        <Download size={14} />
                        <span className="border-b border-current/25 pb-0.5">{t("settings.about.readyToInstall")}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            )}

            {section !== "appearance" && section !== "agent" && section !== "api" && section !== "about" && (
              <section>
                <h2 className="text-[18px] font-bold text-[var(--text-main)]">{t(`settings.nav.${section}`)}</h2>
                <div className="mt-5 divide-y">
                  {section === "editor" && (
                    <>
                      <SettingRow title={t("settings.editor.spellCheck")} description={t("settings.editor.spellCheckDesc")}>
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
	                      <SettingRow title={t("settings.editor.autoSave")} description={t("settings.editor.autoSaveDesc")}>
                        <Switch.Root
                          checked={settings.markdown.autoSave}
                          onCheckedChange={(value) => onChange({ ...settings, markdown: { ...settings.markdown, autoSave: value } })}
                          className="relative h-7 w-12 rounded-full bg-slate-300 data-[state=checked]:bg-[var(--accent)]"
                        >
                          <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
                        </Switch.Root>
                      </SettingRow>
                      <SettingRow title={t("settings.editor.indentWidth")} description={t("settings.editor.indentWidthDesc")}>
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
                      <SettingRow title={t("settings.editor.insertFile")} description={t("settings.editor.insertFileDesc")}>
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
                                  <Select.ItemText>{t("settings.editor.copyToAttachments")}</Select.ItemText>
                                </Select.Item>
                                <Select.Item value="link-original-file" className="cursor-default rounded-md px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-slate-950">
                                  <Select.ItemText>{t("settings.editor.keepOriginalPath")}</Select.ItemText>
                                </Select.Item>
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </SettingRow>
                      <div className="grid gap-2 py-5">
                        <div className="text-[15px] font-bold text-[var(--text-main)]">{t("settings.editor.defaultFolder")}</div>
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
                            {t("common.select")}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {section === "shortcuts" && (
                    <>
                      <div className="mb-5">
                        <h2 className="text-[18px] font-bold text-[var(--text-main)]">{t("settings.shortcuts.title")}</h2>
                        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-muted)]">{t("settings.shortcuts.description")}</p>
                      </div>
                      {shortcutError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">{shortcutError}</p> : null}
                      <div className="space-y-6">
                        {shortcutGroups.map((group) => (
                          <section key={group.title}>
                            <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[var(--text-muted)] uppercase">
                              {t(`shortcuts.categories.${shortcutCategoryKey(group.title)}`)}
                            </div>
                            <div className="divide-y divide-[var(--divider)] border-y border-[var(--divider)]/80">
                              {group.items.map((entry) => (
                                <SettingRow
                                  key={entry.id}
                                  title={t(`shortcuts.items.${shortcutItemKey(entry.id)}.label`)}
                                  description={t(`shortcuts.items.${shortcutItemKey(entry.id)}.description`)}
                                >
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
                      <SettingRow title={t("settings.advanced.keepMinimal")} description={t("settings.advanced.keepMinimalDesc")}>
                        <Square size={18} className="text-slate-400" />
                      </SettingRow>
                      <SettingRow title={t("settings.advanced.currentStrategy")} description={t("settings.advanced.currentStrategyDesc")}>
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
