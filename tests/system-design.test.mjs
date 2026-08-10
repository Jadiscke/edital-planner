import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../docs/system-design/", import.meta.url);

async function read(name) {
  return readFile(new URL(name, root), "utf8");
}

test("system design exposes a semantic, navigable architecture document", async () => {
  const html = await read("index.html");

  assert.match(html, /<html lang="pt-BR"/);
  assert.match(html, /href="#arquitetura"/);
  assert.match(html, /id="conteudo-principal"/);
  assert.match(html, /OpenRouter/);
  assert.match(html, /Modelos configuráveis/);
  assert.match(html, /Redux Toolkit/);
  assert.match(html, /RTK Query/);
});

test("system design presents the complete decision path and accessible controls", async () => {
  const html = await read("index.html");

  for (const id of [
    "objetivos",
    "arquitetura",
    "processamento",
    "contratos",
    "consistencia",
    "seguranca",
    "prontidao",
    "alternativas",
    "proximos-passos",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /<label[^>]+for="section-search"/);
  assert.match(html, /aria-label="Alternar tema"/);
  assert.match(html, /aria-label="Imprimir system design"/);
  assert.match(html, /OPENROUTER_PRIMARY_MODEL/);
  assert.match(html, /revisão humana/i);
  assert.match(html, /ProcessingJob/);
  assert.match(html, /LGPD/);
});

test("section search ignores accents and finds architecture vocabulary", async () => {
  const script = await read("app.js");
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(script, context);
  const { getMatchingSectionIds } = context.SystemDesign;
  const sections = [
    { id: "seguranca", text: "Segurança e privacidade LGPD" },
    { id: "arquitetura", text: "Arquitetura proposta Node.js" },
  ];

  assert.deepEqual(getMatchingSectionIds("seguranca", sections), ["seguranca"]);
  assert.deepEqual(getMatchingSectionIds("node", sections), ["arquitetura"]);
  assert.deepEqual(getMatchingSectionIds("", sections), ["seguranca", "arquitetura"]);
});

test("visual system supports focus, responsive layouts, reduced motion and print", async () => {
  const css = await read("styles.css");

  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width:/);
  assert.match(css, /@media print/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /outline:\s*none/);
});
