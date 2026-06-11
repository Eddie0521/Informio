import React from "react";
import ReactDOM from "react-dom/client";
import log from "electron-log/renderer";
import { I18nextProvider } from "react-i18next";
import i18n, { normalizeUiLanguage } from "./i18n";
import { App } from "./App";
import { installDemoApi } from "./demoApi";
import "./styles.css";

// Keep every renderer window in sync when another window changes language.
window.informio.onLanguageChanged((lang) => {
  const nextLanguage = normalizeUiLanguage(lang);
  localStorage.setItem("informio-language", nextLanguage);
  if (!i18n.language.startsWith(nextLanguage)) void i18n.changeLanguage(nextLanguage);
});

// Expose electron-log to renderer console
Object.assign(console, log.functions);

if (import.meta.env.DEV && !window.informio) {
  installDemoApi();
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (!window.informio) {
  root.render(
    <div className="grid h-screen place-items-center bg-slate-50 px-6 text-center text-sm font-semibold text-slate-600">
      Informio API did not load. Restart npm run dev so Electron can reload the preload bridge.
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </React.StrictMode>
  );
}
