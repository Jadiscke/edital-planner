import { expect, test } from "@playwright/test";

test("candidate registers, corrects and approves a manual material index", async ({ page }) => {
  expect((await page.request.post("http://127.0.0.1:3001/auth/test-session", { headers: { origin: "http://127.0.0.1:4173" } })).status()).toBe(204);
  await page.goto("/app/");
  await page.getByLabel("Concurso").fill("TRF"); await page.getByLabel("Cargo").fill("Analista"); await page.getByLabel("Área").fill("Judiciária"); await page.getByRole("button", { name: "Criar Minha Trilha" }).click();
  await page.getByLabel("Título do Material").fill("Manual de Direito Administrativo"); await page.getByLabel("Edição").fill("2ª edição"); await page.getByRole("button", { name: "Cadastrar Material" }).click();
  await page.getByRole("button", { name: "Digitar Índice" }).click(); await page.getByLabel("Texto do Item 1").fill("Administração Pública"); await page.getByLabel("Página Inicial do Item 1").fill("10"); await page.getByLabel("Página Final do Item 1").fill("24");
  await page.getByRole("button", { name: "Preparar Revisão" }).click(); await expect(page.getByText("Versão 1 pronta para sua revisão.")).toBeVisible();
  await page.getByLabel("Texto do Item 1").fill("Organização Administrativa"); await page.getByRole("button", { name: "Salvar Correções" }).click(); await page.getByRole("button", { name: "Aprovar Versão 2" }).click();
  await expect(page.getByText("Índice aprovado e auditado.")).toBeVisible();
});
