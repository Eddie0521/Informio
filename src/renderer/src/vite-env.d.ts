/// <reference types="vite/client" />

import type { InformioApi } from "../../preload/index";

declare global {
  interface Window {
    informio: InformioApi;
  }
}
