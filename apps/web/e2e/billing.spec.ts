import { expect, test } from "@playwright/test";

async function establishSession(page: import("@playwright/test").Page) {
  const response = await page.request.post("http://127.0.0.1:3001/auth/test-session", { headers: { origin: "http://127.0.0.1:4173" } });
  expect(response.status()).toBe(204);
}

test("billing states remain legible and recoverable on desktop and mobile", async ({ page }, testInfo) => {
  await establishSession(page);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/billing");
  await expect(page.getByRole("heading", { name: "Rota Pro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contratar Rota Pro" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("billing-desktop.png") });

  await page.getByRole("button", { name: "Contratar Rota Pro" }).click();
  await expect(page.getByRole("alert")).toContainText("temporariamente indisponível");
  await expect(page.getByRole("button", { name: "Contratar Rota Pro" })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Rota Pro" })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("billing-mobile.png") });
  expect(errors).toEqual([]);
});
