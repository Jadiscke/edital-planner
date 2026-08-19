import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAiService } from "../src/service.ts";
import { extractLocalPdfText } from "../src/pdf-text.ts";
import { verticalizeParsedPdf } from "../src/pdf-verticalizer.ts";

test("the official local edital matrix reaches each syllabus instead of parsing the administrative notice", async () => {
  const cases = [
    {
      filename: "cpnu-2024-bloco-7.pdf",
      expectedSubject: "POLÍTICAS PÚBLICAS",
      expectedOption: "GESTÃO GOVERNAMENTAL E GOVERNANÇA PÚBLICA",
      minimumNodes: 40,
    },
    {
      filename: "bndes-2024-edital-retificado.pdf",
      expectedSubject: "LÍNGUA PORTUGUESA",
      expectedOption: "ADMINISTRAÇÃO",
      minimumNodes: 120,
    },
    {
      filename: "petrobras-2023-edital-abertura.pdf",
      expectedSubject: "LÍNGUA PORTUGUESA",
      expectedOption: "ENFERMAGEM DO TRABALHO",
      minimumNodes: 100,
    },
  ] as const;

  for (const fixture of cases) {
    const pdf = await readFile(new URL(`../../../docs/pdfs-tests/${fixture.filename}`, import.meta.url));
    const extractedText = await extractLocalPdfText(pdf.toString("base64"));
    assert.ok(extractedText, `${fixture.filename} precisa manter uma camada de texto utilizável`);
    const result = verticalizeParsedPdf({ documentVersionId: fixture.filename, extractedText });
    const subjectNames = result.subjects.map((subject) => subject.originalName);
    const nodeCount = result.subjects.reduce(
      (total, subject) => total + 1 + subject.topics.length + subject.topics.reduce((subtotal, topic) => subtotal + topic.subtopics.length, 0),
      0,
    );
    assert.ok(subjectNames.includes(fixture.expectedSubject), `${fixture.filename} não encontrou ${fixture.expectedSubject}`);
    assert.ok(result.examOptions.some((option) => option.name.includes(fixture.expectedOption)), `${fixture.filename} não encontrou a opção ${fixture.expectedOption}`);
    assert.ok(!subjectNames.includes("ATENÇÃO"), `${fixture.filename} começou antes do anexo de conteúdo`);
    assert.ok(nodeCount >= fixture.minimumNodes, `${fixture.filename} gerou só ${nodeCount} nós`);
  }
});

test("a parsed PDF becomes a complete multi-option tree without a monolithic JSON completion", async () => {
  const extractedText = await readFile(
    new URL("../../../output/pdf/edital-retificado-dataprev-cloudflare-ai.md", import.meta.url),
    "utf8",
  );
  const originalFetch = globalThis.fetch;
  const requests: unknown[] = [];
  globalThis.fetch = (async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      id: "parse-request",
      model: "deepseek/deepseek-v4-flash-0731",
      provider: "DigitalOcean",
      choices: [{
        message: {
          content: "PDF analisado.",
          annotations: [{
            type: "file",
            file: {
              hash: "fixture-hash",
              name: "edital-retificado-dataprev.pdf",
              content: [{ type: "text", text: extractedText }],
            },
          }],
        },
      }],
      usage: {
        prompt_tokens: 73_568, completion_tokens: 8, total_tokens: 73_576, cost: 0.005887,
        prompt_tokens_details: { cached_tokens: 12_000, cache_write_tokens: 1_000, audio_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 3 },
        cost_details: { upstream_inference_cost: 0.0042 },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const service = createAiService({
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_PRIMARY_MODEL: "deepseek/deepseek-v4-flash-0731",
      OPENROUTER_FALLBACK_MODELS: "openai/gpt-5.6-luna",
      OPENROUTER_MAX_TOKENS: "8192",
      OPENROUTER_PDF_ENGINE: "cloudflare-ai",
      OPENROUTER_DOCUMENT_TRANSFER_APPROVED: "true",
    });
    const result = await service.verticalizeEdital({
      documentVersionId: "document-v1",
      contestHints: {
        name: "DATAPREV",
        role: "Analista de Tecnologia da Informação",
        area: "Análise de Negócios de TI",
      },
      pdf: { fileName: "edital-retificado-dataprev.pdf", base64: "JVBERi0xLjc=" },
    });

    const subjectNames = result.data.subjects.map((subject) => subject.originalName);
    const nodeCount = result.data.subjects.reduce(
      (total, subject) => total + 1 + subject.topics.length + subject.topics.reduce(
        (subtotal, topic) => subtotal + topic.subtopics.length,
        0,
      ),
      0,
    );
    assert.ok(subjectNames.includes("LÍNGUA PORTUGUESA"));
    assert.ok(subjectNames.includes("ANÁLISE DE NEGÓCIOS DE TI"));
    assert.ok(nodeCount > 80, `esperava árvore completa do perfil, recebi ${nodeCount} nós`);
    assert.equal(requests.length, 1);
    const request = requests[0] as {
      models?: unknown;
      max_completion_tokens?: unknown;
      provider?: { allow_fallbacks?: unknown };
    };
    assert.deepEqual(request.models, ["deepseek/deepseek-v4-flash-0731", "openai/gpt-5.6-luna"]);
    assert.equal(request.max_completion_tokens, 16);
    assert.equal(request.provider?.allow_fallbacks, true);
    assert.equal("response_format" in request, false);
    assert.equal(result.audit.usage.cost, 0.005887);
    assert.deepEqual(result.audit.usage, {
      promptTokens: 73_568, completionTokens: 8, totalTokens: 73_576, cost: 0.005887,
      cachedTokens: 12_000, cacheWriteTokens: 1_000, audioTokens: 0,
      reasoningTokens: 3, upstreamInferenceCost: 0.0042,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a digital PDF with a text layer becomes a complete tree without calling OpenRouter", async () => {
  const pdf = await readFile(
    new URL("../../../docs/pdfs-tests/edital-retificado-dataprev.pdf", import.meta.url),
  );
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("OpenRouter não deveria ser chamado para PDF digital");
  }) as typeof fetch;

  try {
    const service = createAiService({
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_PRIMARY_MODEL: "deepseek/deepseek-v4-flash-0731",
      OPENROUTER_FALLBACK_MODELS: "openai/gpt-5.6-luna",
      OPENROUTER_PDF_ENGINE: "cloudflare-ai",
      LOCAL_PDF_PARSING_APPROVED: "true",
    });
    const result = await service.verticalizeEdital({
      documentVersionId: "document-v1",
      contestHints: {
        name: "DATAPREV",
        role: "Analista de Tecnologia da Informação",
        area: "Análise de Negócios de TI",
      },
      pdf: { fileName: "edital-retificado-dataprev.pdf", base64: pdf.toString("base64") },
    });
    const nodes = result.data.subjects.reduce(
      (total, subject) => total + 1 + subject.topics.length + subject.topics.reduce(
        (subtotal, topic) => subtotal + topic.subtopics.length,
        0,
      ),
      0,
    );

    assert.equal(calls, 0);
    assert.ok(nodes > 80, `esperava árvore completa do PDF digital, recebi ${nodes} nós`);
    assert.equal(result.data.examOptions.length, 13);
    assert.deepEqual(result.data.examOptions[0], {
      id: "perfil-1-analise-de-negocios-de-ti",
      kind: "perfil",
      label: "PERFIL 1",
      name: "ANÁLISE DE NEGÓCIOS DE TI",
      code: "1",
      evidence: [{ page: 27, text: "PERFIL 1: ANÁLISE DE NEGÓCIOS DE TI:", boundingBox: null }],
    });
    assert.deepEqual(
      result.data.subjects.find((subject) => subject.originalName === "LÍNGUA PORTUGUESA")?.examOptionIds,
      [],
    );
    assert.deepEqual(
      result.data.subjects.find((subject) => subject.originalName === "ANÁLISE DE NEGÓCIOS DE TI")?.examOptionIds,
      ["perfil-1-analise-de-negocios-de-ti"],
    );
    assert.equal(result.audit.model, "deterministic-local-parser");
    assert.equal(result.audit.usage.cost, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("module headings delimit sections instead of leaking into the previous syllabus item", async () => {
  const pdf = await readFile(new URL("../../../docs/pdfs-tests/edital-retificado-dataprev.pdf", import.meta.url));
  const extractedText = await extractLocalPdfText(pdf.toString("base64"));
  assert.ok(extractedText);
  const result = verticalizeParsedPdf({ documentVersionId: "document-modules", extractedText });
  const legislation = result.subjects.find((subject) =>
    subject.originalName === "LEGISLAÇÃO ACERCA DE SEGURANÇA DA INFORMAÇÃO E PROTEÇÃO DE DADOS" &&
    subject.examOptionIds.length === 0,
  );
  const lgpd = legislation?.topics.find((topic) => topic.originalName.includes("Lei nº 13.709/2018"));

  assert.equal(
    lgpd?.originalName,
    "Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD): capítulos I, II, III, IV, VII, VIII e IX",
  );
  const allNames = result.subjects.flatMap((subject) => [
    subject.originalName,
    ...subject.topics.flatMap((topic) => [topic.originalName, ...topic.subtopics.map((subtopic) => subtopic.originalName)]),
  ]);
  assert.ok(allNames.every((name) => !/M[ÓO]DULO\s+[IVXLCDM]+\s*[-–]/i.test(name)));
});

test("third- and fourth-level numbering becomes separate subtopics in the Advocacia profile", async () => {
  const pdf = await readFile(new URL("../../../docs/pdfs-tests/edital-retificado-dataprev.pdf", import.meta.url));
  const extractedText = await extractLocalPdfText(pdf.toString("base64"));
  assert.ok(extractedText);
  const result = verticalizeParsedPdf({ documentVersionId: "document-advocacia", extractedText });
  const advocacia = result.examOptions.find((option) => option.name === "ADVOCACIA");
  const scopedSubject = (name: string) => result.subjects.find((subject) =>
    subject.originalName === name && subject.examOptionIds.includes(advocacia?.id ?? ""),
  );
  const publicAgents = scopedSubject("DIREITO ADMINISTRATIVO")?.topics.find((topic) => topic.originalName === "Agentes públicos");
  const judiciary = scopedSubject("DIREITO CONSTITUCIONAL")?.topics.find((topic) => topic.originalName === "Poder Judiciário");

  assert.deepEqual(publicAgents?.subtopics.slice(0, 8).map((subtopic) => subtopic.originalName), [
    "Conceito",
    "Espécies",
    "Cargo, emprego e função pública",
    "Provimento",
    "Vacância",
    "Efetividade, estabilidade e vitaliciedade",
    "Remuneração",
    "Direitos e deveres",
  ]);
  assert.deepEqual(judiciary?.subtopics.map((subtopic) => subtopic.originalName), [
    "Disposições gerais",
    "Órgãos do poder judiciário",
    "Organização, composição e competências",
    "Regime de precatórios",
  ]);
});

test("validated fourth-level numbering is flattened without merging its text", () => {
  const result = verticalizeParsedPdf({
    documentVersionId: "document-fourth-level",
    extractedText: `### Page 1
ANEXO I – CONTEÚDO PROGRAMÁTICO
DIREITO ADMINISTRATIVO: 1 Agentes públicos. 1.1 Cargo público. 1.1.1 Provimento. 1.1.1.1 Nomeação. 1.1.1.2 Posse. 1.1.2 Vacância.`,
  });

  assert.deepEqual(result.subjects[0]?.topics[0]?.subtopics.map((subtopic) => subtopic.originalName), [
    "Cargo público",
    "Provimento",
    "Nomeação",
    "Posse",
    "Vacância",
  ]);
});

test("recognized edital labels become selectable exam options", async () => {
  const result = (await import("../src/pdf-verticalizer.ts")).verticalizeParsedPdf({
    documentVersionId: "document-labels",
    extractedText: `### Page 1
ANEXO I – CONTEÚDO PROGRAMÁTICO
CONHECIMENTOS GERAIS:
LÍNGUA PORTUGUESA: 1 Interpretação de textos.
### Page 2
CARGO 101 – ANALISTA ADMINISTRATIVO
ADMINISTRAÇÃO PÚBLICA: 1 Organização administrativa.
### Page 3
ÊNFASE: TECNOLOGIA DA INFORMAÇÃO
TECNOLOGIA DA INFORMAÇÃO: 1 Redes de computadores.
### Page 4
ÁREA DE ATUAÇÃO: AUDITORIA
AUDITORIA: 1 Normas de auditoria.
### Page 5
CÓDIGO DE OPÇÃO 404 – REGULAÇÃO
REGULAÇÃO: 1 Agências reguladoras.`,
  });

  assert.deepEqual(
    result.examOptions.map(({ kind, label, name, code }) => ({ kind, label, name, code })),
    [
      { kind: "cargo", label: "CARGO 101", name: "ANALISTA ADMINISTRATIVO", code: "101" },
      { kind: "enfase", label: "ÊNFASE", name: "TECNOLOGIA DA INFORMAÇÃO", code: null },
      { kind: "area_atuacao", label: "ÁREA DE ATUAÇÃO", name: "AUDITORIA", code: null },
      { kind: "codigo_opcao", label: "CÓDIGO DE OPÇÃO 404", name: "REGULAÇÃO", code: "404" },
    ],
  );
  assert.deepEqual(result.subjects[0]?.examOptionIds, []);
  assert.deepEqual(result.subjects[1]?.examOptionIds, [result.examOptions[0]?.id]);
  assert.deepEqual(result.subjects[4]?.examOptionIds, [result.examOptions[3]?.id]);
});

test("numbers attached to sentence punctuation still delimit management topics", async () => {
  const extractedText = await readFile(
    new URL("../../../output/pdf/edital-retificado-dataprev-cloudflare-ai.md", import.meta.url),
    "utf8",
  );
  const result = (await import("../src/pdf-verticalizer.ts")).verticalizeParsedPdf({
    documentVersionId: "document-granularity",
    extractedText,
  });
  const profile = result.examOptions.find((option) => option.code === "6");
  const management = result.subjects.find((subject) =>
    subject.originalName === "GESTÃO E GOVERNANÇA DE TECNOLOGIA DA INFORMAÇÃO" &&
    subject.examOptionIds.includes(profile?.id ?? ""),
  );

  assert.deepEqual(management?.topics.slice(0, 5).map((topic) => topic.originalName), [
    "Gerenciamento de projetos (PMBOK 7ª edição)",
    "Processos, grupos de processos e área de conhecimento",
    "Gestão de riscos",
    "Gerenciamento de serviços (ITIL v4)",
    "Governança de TI (COBIT 2019)",
  ]);
  assert.deepEqual(
    management?.topics.find((topic) => topic.originalName === "Gerenciamento de serviços (ITIL v4)")?.subtopics.map((subtopic) => subtopic.originalName),
    ["Conceitos básicos, disciplinas, estrutura e objetivos"],
  );
  assert.deepEqual(
    management?.topics.find((topic) => topic.originalName === "Governança de TI (COBIT 2019)")?.subtopics.map((subtopic) => subtopic.originalName),
    ["Conceitos básicos, estrutura e objetivos"],
  );
});

test("unnumbered sentences inside one edital item become granular subtopics", async () => {
  const extractedText = await readFile(
    new URL("../../../output/pdf/edital-retificado-dataprev-cloudflare-ai.md", import.meta.url),
    "utf8",
  );
  const result = (await import("../src/pdf-verticalizer.ts")).verticalizeParsedPdf({
    documentVersionId: "document-sentence-granularity",
    extractedText,
  });
  const profile = result.examOptions.find((option) => option.code === "6");
  const scopedSubject = (name: string) => result.subjects.find((subject) =>
    subject.originalName === name && subject.examOptionIds.includes(profile?.id ?? ""),
  );
  const support = scopedSubject("SUPORTE E INFRAESTRUTURA");
  const servers = support?.topics.find((topic) => topic.originalName.startsWith("Noções de Servidores"));
  const networks = scopedSubject("REDES DE COMPUTADORES");
  const interconnection = networks?.topics.find((topic) => topic.originalName.startsWith("Elementos de interconexão"));

  assert.equal(servers?.originalName, "Noções de Servidores de páginas em HTML: Nginx e Apache");
  assert.deepEqual(servers?.subtopics.map((subtopic) => subtopic.originalName), [
    "Conceito de servidores de armazenamento orientado a objetos (object store): S3",
  ]);
  assert.equal(interconnection?.originalName, "Elementos de interconexão de redes de computadores (hubs repetidores, switches, roteadores)");
  assert.deepEqual(interconnection?.subtopics.map((subtopic) => subtopic.originalName), ["VLANs", "Cabeamento estruturado"]);
  assert.equal(
    networks?.topics.find((topic) => topic.originalName.includes("IEEE"))?.originalName,
    "Noções dos padrões IEEE 802.1, IEEE 802.3, IEEE 802.11 a/b/g/n/ac",
  );
});
