import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";

const appRoot = resolve(import.meta.dirname, "..");
const contentTypes = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain" };
let server;
let browser;
let baseUrl;

before(async () => {
  const build = spawnSync("pnpm", ["build"], {
    cwd: appRoot,
    encoding: "utf8",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", PUBLIC_SIGNUP_URL: "" },
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const requestedFile = pathname === "/" ? "index.html" : pathname.slice(1);
    try {
      const body = await readFile(resolve(appRoot, "dist", requestedFile));
      response.writeHead(200, { "content-type": contentTypes[extname(requestedFile)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolveClosed) => server?.close(resolveClosed));
});

test("keyboard entry and semantic landmarks are exposed on the selected landing", async () => {
  const page = await browser.newPage();
  await page.goto(baseUrl);
  assert.equal(await page.getByRole("main").count(), 1);
  assert.equal(await page.getByRole("contentinfo").count(), 1);
  assert.equal(await page.locator("main h1").count(), 1);
  assert.equal(await page.locator("[data-variant], [data-key], .prototype-switcher").count(), 0);
  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  await navigation.waitFor();
  await page.getByRole("complementary", { name: "Exemplo do caminho entre o edital e uma tarefa de estudo" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Criar meu projeto", exact: true }).first().getAttribute("href"), "/app/");

  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("skip-link")), true);
  assert.equal(await page.locator(".skip-link").getAttribute("href"), "#inicio");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "inicio");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Organizar meu primeiro edital");

  for (const name of ["Benefícios", "Como funciona", "Privacidade", "Planos"]) {
    const link = navigation.getByRole("link", { name });
    await link.focus();
    assert.equal(await link.evaluate((element) => element.matches(":focus-visible")), true);
  }

  const rationale = page.getByText("Por que esta tarefa agora?", { exact: true });
  await rationale.focus();
  await rationale.press("Enter");
  await page.getByText("Ela vem depois do conceito de crédito tributário, cabe nos 45 minutos de hoje e libera a próxima revisão.", { exact: true }).waitFor();

  await page.goto(`${baseUrl}/?variant=B`);
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Do edital aberto ao estudo de hoje.");
  assert.equal(await page.locator("[data-variant], [data-key], .prototype-switcher").count(), 0);
  await page.close();
});

test("privacy copy meets WCAG AA contrast", async () => {
  const page = await browser.newPage();
  const checks = [".a-privacy .eyebrow", ".a-privacy .privacy-statement > p:last-child"];

  for (const selector of checks) {
    await page.goto(baseUrl);
    const ratio = await page.locator(selector).evaluate((element) => {
      const parse = (value) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      const luminance = (rgb) => {
        const channels = rgb.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const style = getComputedStyle(element);
      const foreground = luminance(parse(style.color));
      const background = luminance(parse(getComputedStyle(element.closest("section")).backgroundColor));
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    assert.ok(ratio >= 4.5, `${selector} contrast was ${ratio.toFixed(2)}:1`);
  }

  await page.close();
});

test("the selected landing fits a mobile viewport and keeps signup links configurable", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(baseUrl);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "landing overflows the mobile viewport");
  const signup = page.locator('a[href="/app/"]').first();
  await signup.waitFor();
  assert.equal(await signup.getAttribute("href"), "/app/");

  assert.equal(await page.locator(".prototype-switcher, [data-variant], [data-key]").count(), 0);
  await page.close();
});
