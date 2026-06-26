import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

export type UiLanguage = "zh" | "en";
export type SettingsLanguage = "zh-CN" | "en-US";

export const normalizeUiLanguage = (value?: string | null): UiLanguage => {
  return value?.toLowerCase().startsWith("en") ? "en" : "zh";
};

export const uiLanguageToSettingsLanguage = (value: UiLanguage): SettingsLanguage =>
  value === "en" ? "en-US" : "zh-CN";

export const settingsLanguageToUiLanguage = (value?: string | null): UiLanguage =>
  normalizeUiLanguage(value);

const savedLang = normalizeUiLanguage(localStorage.getItem("informio-language"));

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en }
  },
  lng: savedLang,
  fallbackLng: "zh",
  supportedLngs: ["zh", "en"],
  interpolation: {
    escapeValue: false
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(["./locales/zh.json", "./locales/en.json"], async () => {
    const [{ default: nextZh }, { default: nextEn }] = await Promise.all([
      import("./locales/zh.json"),
      import("./locales/en.json")
    ]);
    i18n.addResourceBundle("zh", "translation", nextZh, true, true);
    i18n.addResourceBundle("en", "translation", nextEn, true, true);
  });
}

export default i18n;
