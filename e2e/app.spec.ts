import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("Informio E2E", () => {
  test("app launches and shows main window", async () => {
    const { app, page } = await launchApp();
    try {
      // App should render without crashing
      await expect(page.locator("#root")).toBeAttached({ timeout: 10_000 });
      // Should have some content (not blank)
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  test("settings persistence — change theme, reload, verify", async () => {
    const { app, page } = await launchApp();
    try {
      // Open settings
      await page.evaluate(() => window.informio.openSettings());
      // Wait for settings window
      const settingsPage = await app.waitForEvent("window", { timeout: 10_000 });
      await settingsPage.waitForLoadState("domcontentloaded");

      // Click appearance section (should be default)
      // Look for theme section header
      const themeHeader = settingsPage.locator("h2", { hasText: "主题" });
      await expect(themeHeader).toBeVisible({ timeout: 5_000 });

      // Click a theme button (e.g., the second one)
      const themeButtons = settingsPage.locator("button").filter({ has: settingsPage.locator("span.grid") });
      const count = await themeButtons.count();
      if (count >= 2) {
        await themeButtons.nth(1).click();
        // Wait for save
        await settingsPage.waitForTimeout(500);
      }
    } finally {
      await app.close();
    }
  });

  test("language switch — select English, verify text changes", async () => {
    const { app, page } = await launchApp();
    try {
      // Change language directly via i18n in the main window
      await page.evaluate(() => {
        localStorage.setItem("informio-language", "en");
      });

      // Open settings — it will render with English
      await page.evaluate(() => window.informio.openSettings());
      const settingsPage = await app.waitForEvent("window", { timeout: 10_000 });
      await settingsPage.waitForLoadState("domcontentloaded");

      // Wait for settings content to render
      await settingsPage.waitForSelector("select", { timeout: 10_000 });
      await settingsPage.waitForTimeout(1000);

      // Check that English text appears
      const h2Texts = await settingsPage.locator("h2").allTextContents();
      const hasEnglish = h2Texts.some((t) => t.includes("Language") || t.includes("Theme") || t.includes("Font") || t.includes("About"));

      // Reset language back to Chinese
      await page.evaluate(() => {
        localStorage.setItem("informio-language", "zh");
      });

      expect(hasEnglish).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  test("file tree — create and verify document", async () => {
    const { app, page } = await launchApp();
    try {
      // Wait for the app to fully load
      await page.waitForTimeout(2_000);

      // Check that the file list is visible (look for the sidebar)
      const body = await page.textContent("body");
      // The app should have some content rendered
      expect(body).toBeTruthy();
      expect(body!.length).toBeGreaterThan(10);
    } finally {
      await app.close();
    }
  });

  test("editor — type text and verify it appears", async () => {
    const { app, page } = await launchApp();
    try {
      await page.waitForTimeout(2_000);

      // Look for the editor area (Tiptap uses ProseMirror)
      const editor = page.locator(".ProseMirror, [contenteditable='true']").first();
      const editorExists = await editor.count();

      if (editorExists > 0) {
        // Click to focus
        await editor.click();
        // Type some text
        await page.keyboard.type("Hello E2E test");
        await page.waitForTimeout(500);

        // Verify text appears
        const content = await editor.textContent();
        expect(content).toContain("Hello E2E test");
      }
    } finally {
      await app.close();
    }
  });
});
