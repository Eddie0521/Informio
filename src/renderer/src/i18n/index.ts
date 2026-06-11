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

export default i18n;
