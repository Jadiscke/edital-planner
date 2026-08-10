import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the marketing site builds to static HTML", () => {
  const result = spawnSync("pnpm", ["build"], {
    cwd: appRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: "1",
      PUBLIC_SIGNUP_URL: "/criar-conta",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(resolve(appRoot, "dist/index.html")), true);
});

test("the static output publishes complete search and sharing metadata", () => {
  const html = readFileSync(resolve(appRoot, "dist/index.html"), "utf8");

  assert.match(html, /<title>Planejador de Editais \| Do edital ao estudo de hoje<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/planejadordeeditais\.com\.br\/"/);
  assert.match(html, /<meta property="og:title" content="[^"]+"/);
  assert.match(html, /<meta property="og:description" content="[^"]+"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/planejadordeeditais\.com\.br\/"/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?[^\"]+(?:&|&amp;)display=swap/);
  assert.equal(existsSync(resolve(appRoot, "dist/robots.txt")), true);
  assert.equal(existsSync(resolve(appRoot, "dist/sitemap-0.xml")), true);
  assert.equal(existsSync(resolve(appRoot, "dist/favicon.svg")), true);
});

test("the selected landing is the only production design and has no prototype remnants", () => {
  const html = readFileSync(resolve(appRoot, "dist/index.html"), "utf8");

  assert.match(html, /<nav[^>]+aria-label="Navegação principal"/);
  for (const section of ["beneficios", "como-funciona", "privacidade", "planos"]) {
    assert.match(html, new RegExp(`<section[^>]+id="${section}"`));
    assert.match(html, new RegExp(`href="#${section}"`));
  }

  const signupLinks = html.match(/href="\/criar-conta"/g) ?? [];
  assert.ok(signupLinks.length >= 3, "the landing should repeat its configured signup action at useful decision points");
  assert.doesNotMatch(html, /href="https?:\/\/[^\"]+\/criar-conta"/);
  assert.doesNotMatch(html, /data-variant|data-key|variant-[abc]|prototype-switcher|URLSearchParams|Mesa de estudos|Mapa de cobertura/i);
  assert.doesNotMatch(html, /Sem cartão|1 edital|>Essencial<|>Pro<|Recomendado/i);
  assert.match(html, /Catálogo em definição/);
  assert.match(html, /<footer[\s>]/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
});
