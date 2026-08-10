import { expect, test } from "@playwright/test";

test("root serves the landing and its primary action enters the app namespace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Do edital aberto ao estudo de hoje." })).toBeVisible();
  await page.getByRole("link", { name: "Criar meu projeto", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole("button", { name: "Entrar ou Criar Conta" })).toBeVisible();
});
