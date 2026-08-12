import { expect, test, type Page } from "@playwright/test";

async function createProject(page: Page) {
  const session = await page.request.post("http://127.0.0.1:3001/auth/test-session", {
    headers: { origin: "http://127.0.0.1:4173" },
  });
  expect(session.status()).toBe(204);
  await page.goto("/app/");
  await page.getByLabel("Concurso").fill("DATAPREV");
  await page.getByLabel("Cargo").fill("Analista");
  await page.getByLabel("Área").fill("Tecnologia");
  await page.getByRole("button", { name: "Criar Minha Trilha" }).click();
  await expect(page.getByText("Projeto criado. Sua trilha já está salva.")).toBeVisible();
}

test("candidate uploads a valid PDF, follows processing and recovers status after reload", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await createProject(page);
  await page.getByLabel("Arquivo do edital em PDF").setInputFiles({
    name: "edital-dataprev.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"),
  });
  await page.getByRole("button", { name: "Enviar Edital" }).click();

  await expect(page.getByText("Edital verticalizado com evidência.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Árvore do edital" })).toBeVisible();
  await page.getByRole("button", { name: /Língua Portuguesa/ }).click();
  await expect(page.getByText("LÍNGUA PORTUGUESA: compreensão e interpretação de textos.")).toBeVisible();
  await expect(page.getByText("Página 14")).toBeVisible();
  const desktop = await page.screenshot({ fullPage: true, path: testInfo.outputPath("verticalization-evidence-desktop.png") });
  await testInfo.attach("verticalization-evidence-desktop", { body: desktop, contentType: "image/png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await expect(page.getByRole("heading", { name: "Margem de evidência" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Edital verticalizado com evidência.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Árvore do edital" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("candidate receives actionable guidance for a protected PDF", async ({ page }) => {
  await createProject(page);
  await page.getByLabel("Arquivo do edital em PDF").setInputFiles({
    name: "edital-protegido.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF"),
  });
  await page.getByRole("button", { name: "Enviar Edital" }).click();

  await expect(page.getByRole("alert")).toHaveText("Remova a senha do PDF e envie novamente.");
  await expect(page.getByText("DATAPREV")).toBeVisible();
});
