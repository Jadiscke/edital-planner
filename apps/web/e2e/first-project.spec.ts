import { expect, test } from "@playwright/test";

async function establishSession(page: import("@playwright/test").Page) {
  const response = await page.request.post("http://127.0.0.1:3001/auth/test-session", {
    headers: { origin: "http://127.0.0.1:4173" },
  });
  expect(response.status()).toBe(204);
}

test("QA user can enter through the visible login action", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Entrar ou Criar Conta" }).click();

  await expect(page.getByText("Sessão Protegida")).toBeVisible();
});

test("candidate creates a first project and reload retrieves it", async ({ page }) => {
  await establishSession(page);
  await page.goto("/app/");
  await page.getByLabel("Concurso").fill("TRF 4ª Região");
  await page.getByLabel("Cargo").fill("Analista Judiciário");
  await page.getByLabel("Área").fill("Judiciária");
  await page.getByRole("button", { name: "Criar Minha Trilha" }).click();

  await expect(page.getByText("Analista Judiciário")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Analista Judiciário")).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("button", { name: "Entrar ou Criar Conta" })).toBeVisible();
  await expect(page.getByText(/Sessão encerrada/)).toBeVisible();
  const session = await page.request.get("http://127.0.0.1:3001/auth/session");
  expect((await session.json()).authenticated).toBe(false);
});

test("candidate archives, consults after reload, and duplicates a project", async ({ page }) => {
  await establishSession(page);
  await page.goto("/app/");
  await page.getByLabel("Concurso").fill("STJ Lifecycle");
  await page.getByLabel("Cargo").fill("Analista de Ciclo");
  await page.getByLabel("Área").fill("Administrativa");
  await page.getByRole("button", { name: "Criar Minha Trilha" }).click();
  await expect(page.getByText("Analista de Ciclo")).toBeVisible();

  await page.getByRole("button", { name: "Arquivar STJ Lifecycle" }).click();
  await expect(page.getByRole("alertdialog", { name: "Arquivar Projeto" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar Arquivamento" }).click();
  await expect(page.getByText(/Projeto arquivado/)).toBeVisible();
  await expect(page.getByText("Analista de Ciclo")).toHaveCount(0);

  await page.getByRole("button", { name: "Projetos Arquivados" }).click();
  await expect(page).toHaveURL(/projects=archived/);
  await expect(page.getByText("Analista de Ciclo")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Analista de Ciclo")).toBeVisible();
  await page.getByRole("button", { name: "Duplicar STJ Lifecycle" }).click();
  await expect(page.getByText(/Duplicata criada/)).toBeVisible();
  await page.getByRole("button", { name: "Projetos Ativos" }).click();
  await expect(page.getByText("Cópia rastreável")).toBeVisible();
});

test("the final flow fits desktop and mobile without prototype behavior or console errors", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await establishSession(page);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/?variant=C");
  const staleUrl = page.url();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  expect(page.url()).toBe(staleUrl);
  await expect(page.getByRole("button", { name: "Criar Minha Trilha" })).toBeVisible();
  await expect(page.getByLabel("Concurso")).toBeVisible();
  await expect(page.getByLabel(/alternar proposta/i)).toHaveCount(0);
  const screenshot = await page.screenshot({ fullPage: true, path: testInfo.outputPath("mesa-de-estudo-desktop.png") });
  await testInfo.attach("mesa-de-estudo-desktop", { body: screenshot, contentType: "image/png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);

  expect(errors).toEqual([]);
});
