import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installDemoApi } from "./demoApi";
import "./styles.css";

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
      <App />
    </React.StrictMode>
  );
}
