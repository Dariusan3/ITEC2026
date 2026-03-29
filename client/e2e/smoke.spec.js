const { test, expect } = require("@playwright/test");

test.beforeEach(({}, testInfo) => {
  if (process.env.SKIP_E2E === "1") testInfo.skip();
});

test("shell editor — hash room se încarcă", async ({ page }) => {
  await page.goto("/#/e2e-smoke");
  await expect(page.locator('text=iTECIFY').first()).toBeVisible({
    timeout: 15_000,
  });
});
