import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      exclude: [
        "src/main/openCodeSdk.ts",
        "src/main/claudeAgentSdk.ts",
        "src/main/codexAppServer.ts",
        "src/main/index.ts",
        "src/main/auto-update.ts",
        "src/renderer/src/demoApi.ts",
        "src/renderer/src/i18n/**",
        "e2e/**",
        "node_modules/**",
        "**/*.test.ts",
        "**/*.d.ts"
      ]
    }
  }
});
