import type { VerticalizationResult } from "./contracts.ts";

type VerticalizationSubject = VerticalizationResult["subjects"][number];
type VerticalizationTopic = VerticalizationSubject["topics"][number];
type VerticalizationSubtopic = VerticalizationTopic["subtopics"][number];
type ExamOption = VerticalizationResult["examOptions"][number];
type ExamOptionKind = ExamOption["kind"];

interface PageText {
  readonly page: number;
  readonly text: string;
}

interface SubjectBlock {
  readonly body: string;
  readonly examOptionIds: readonly string[];
  readonly page: number;
  readonly title: string;
}

interface NumberedItem {
  readonly level: "topic" | "subtopic";
  readonly name: string;
  readonly number: string;
  readonly page: number;
  readonly parentNumber: string | null;
}

function clean(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function comparable(value: string): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function syllabusAnnex(source: string): string {
  const heading = /^#*\s*ANEXO\s+[IVXLCDM]+\s*[–-]\s*(?:CONTE[ÚU]DOS? PROGRAM[ÁA]TICOS?|OBJETOS? DE AVALIA[ÇC][ÃA]O)\s*$/im.exec(source);
  const start = heading?.index ?? -1;
  if (start < 0 || !heading) return source;
  const pageMarker = source.lastIndexOf("### Page ", start);
  const sliceStart = pageMarker >= 0 ? pageMarker : start;
  const rest = source.slice(sliceStart);
  const afterHeading = start - sliceStart + heading[0].length;
  const nextAnnex = rest.slice(afterHeading).search(/^#*\s*ANEXO\s+[IVXLCDM]+\b.*$/im);
  return nextAnnex < 0 ? rest : rest.slice(0, afterHeading + nextAnnex);
}

const OPTION_KIND_BY_LABEL: Readonly<Record<string, ExamOptionKind>> = {
  "area": "area",
  "analista": "enfase",
  "area de atuacao": "area_atuacao",
  "bloco tematico": "bloco_tematico",
  "cargo": "cargo",
  "codigo de opcao": "codigo_opcao",
  "eixo tematico": "eixo_tematico",
  "emprego": "emprego",
  "emprego publico": "emprego",
  "enfase": "enfase",
  "especialidade": "especialidade",
  "funcao": "funcao",
  "opcao": "opcao",
  "opcao de cargo": "opcao",
  "perfil": "perfil",
  "perfil profissional": "perfil",
  "posto de trabalho": "posto_trabalho",
};

function slug(value: string): string {
  return comparable(value).replace(/\s+/g, "-");
}

function pageBefore(source: string, index: number): number {
  const markers = [...source.slice(0, index).matchAll(/^### Page (\d+)$/gm)];
  return Number(markers.at(-1)?.[1] ?? 1);
}

function splitExamOptions(source: string) {
  const labelPattern = "ÁREA DE ATUAÇÃO|PERFIL PROFISSIONAL|POSTO DE TRABALHO|CÓDIGO DE OPÇÃO|OPÇÃO DE CARGO|BLOCO TEMÁTICO|EIXO TEMÁTICO|EMPREGO PÚBLICO|ESPECIALIDADE|ÊNFASE|EMPREGO|FUNÇÃO|PERFIL|CARGO|ÁREA|OPÇÃO|ANALISTA";
  const pattern = new RegExp(`^#*\\s*(${labelPattern})(?:\\s+(?:N[º°.]?\\s*)?([A-Z0-9][A-Z0-9./-]*))?\\s*[:–-]\\s*([^\\n]+)$`, "gim");
  const matches = [...source.matchAll(pattern)];
  return {
    common: source.slice(0, matches[0]?.index ?? source.length),
    options: matches.map((match, index) => {
      const rawLabel = clean(match[1] ?? "");
      const code = match[2] ? clean(match[2]) : null;
      const title = clean(match[3]?.replace(/:$/, "") ?? "");
      const kind = OPTION_KIND_BY_LABEL[comparable(rawLabel)] ?? "opcao";
      const label = `${comparable(rawLabel) === "analista" ? "ÊNFASE" : rawLabel.toUpperCase()}${code ? ` ${code}` : ""}`;
      const id = `${kind}-${code ? `${slug(code)}-` : ""}${slug(title)}`;
      return {
        id,
        kind,
        label,
        name: title,
        code,
        evidence: evidence(pageBefore(source, match.index ?? 0), clean(match[0])),
        text: source.slice(
        (match.index ?? 0) + match[0].length,
        matches[index + 1]?.index ?? source.length,
      ),
      };
    }),
  };
}

function optionScore(title: string, hints: { readonly area?: string | undefined; readonly role?: string | undefined }): number {
  const normalizedTitle = comparable(title);
  const normalizedArea = comparable(hints.area ?? "");
  if (normalizedArea && (normalizedTitle.includes(normalizedArea) || normalizedArea.includes(normalizedTitle))) {
    return 1_000;
  }
  const generic = new Set(["analista", "tecnologia", "informacao", "perfil", "cargo", "de", "da", "do", "e", "ti"]);
  const hintTokens = new Set(comparable(`${hints.area ?? ""} ${hints.role ?? ""}`).split(" ").filter((token) => token.length > 2 && !generic.has(token)));
  return normalizedTitle.split(" ").reduce((score, token) => score + (hintTokens.has(token) ? 1 : 0), 0);
}

function selectExamOption<T extends { readonly name: string }>(options: readonly T[], hints: { readonly area?: string | undefined; readonly role?: string | undefined }): T | undefined {
  const ranked = options
    .map((option) => ({ option, score: optionScore(option.name, hints) }))
    .sort((left, right) => right.score - left.score);
  if (!ranked[0] || ranked[0].score === 0 || ranked[0].score === ranked[1]?.score) return undefined;
  return ranked[0].option;
}

function isSubjectHeading(line: string): boolean {
  const value = clean(line);
  if (!value || /^(?:M[ÓO]DULO|PERFIL|ANEXO)\b/i.test(value)) return false;
  if (/^(?:CIVIL|EL[ÉE]TRICA|MEC[ÂA]NICA)\s+1\b/.test(value)) return true;
  if (/^\d+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ /(),'-]+\s+\d+\.\d+\b/.test(value)) return true;
  return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ()/.,'–\-]+:\s*/.test(value);
}

function headingName(line: string): string {
  const value = clean(line);
  const discipline = value.match(/^(CIVIL|EL[ÉE]TRICA|MEC[ÂA]NICA)\b/);
  const numbered = value.match(/^\d+\s+(.+?)(?=\s+\d+\.\d+\b)/);
  return discipline?.[1] ?? numbered?.[1]?.trim() ?? value.replace(/:\s*[\s\S]*$/, "").trim();
}

function isModuleHeading(line: string): boolean {
  return /^M[ÓO]DULO\s+(?:[IVXLCDM]+|\d+)\s*[-–:]\s*CONHECIMENTOS\b/i.test(clean(line));
}

function splitSubjects(source: string, fallbackTitle: string, examOptionIds: readonly string[] = []): SubjectBlock[] {
  const blocks: SubjectBlock[] = [];
  let page = Number(source.match(/^### Page (\d+)$/m)?.[1] ?? 1);
  let title = fallbackTitle;
  let blockPage = page;
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) blocks.push({ title, body, page: blockPage, examOptionIds });
    lines = [];
  };

  for (const line of source.split("\n")) {
    const marker = line.match(/^### Page (\d+)$/);
    if (marker) {
      page = Number(marker[1]);
      lines.push(line);
    } else if (isModuleHeading(line)) {
      flush();
      title = fallbackTitle;
      blockPage = page;
    } else if (isSubjectHeading(line)) {
      flush();
      title = headingName(line);
      blockPage = page;
      lines = [`### Page ${page}`, line];
    } else {
      lines.push(line);
    }
  }
  flush();
  return blocks.filter((block) => !/CONTE[ÚU]DO PROGRAM[ÁA]TICO|CONHECIMENTOS (?:GERAIS|ESPEC[ÍI]FICOS)/i.test(block.title));
}

function flattenWithPages(block: SubjectBlock): { readonly text: string; pageAt(index: number): number } {
  let page = block.page;
  let text = "";
  const spans: Array<{ start: number; end: number; page: number }> = [];
  for (const line of block.body.split("\n")) {
    const marker = line.match(/^### Page (\d+)$/);
    if (marker) {
      page = Number(marker[1]);
      continue;
    }
    const value = clean(line);
    if (!value) continue;
    if (text) text += " ";
    const start = text.length;
    text += value;
    spans.push({ start, end: text.length, page });
  }
  return {
    text,
    pageAt(index) {
      return spans.find((span) => index >= span.start && index < span.end)?.page ?? block.page;
    },
  };
}

function withoutHeading(text: string, title: string): string {
  if (text.startsWith(`${title}:`)) return text.slice(title.length + 1).trim();
  if (text.startsWith(`${title} `)) return text.slice(title.length).trim();
  return text;
}

function numberedItems(block: SubjectBlock): NumberedItem[] {
  const flattened = flattenWithPages(block);
  const text = withoutHeading(flattened.text, block.title);
  const offset = flattened.text.length - text.length;
  const candidates = [...text.matchAll(/(?:^|\s|(?<=[).;:]))(\d+(?:\.\d+)*)(?:\.)?\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç“"(])/g)];
  const accepted: Array<{ number: string; start: number; level: "topic" | "subtopic"; parentNumber: string | null }> = [];
  const acceptedNumbers = new Set<string>();
  const nextChild = new Map<string, number>();
  let nextTopic = 1;

  for (const candidate of candidates) {
    const number = candidate[1] ?? "";
    const start = (candidate.index ?? 0) + candidate[0].lastIndexOf(number);
    const parts = number.split(".");
    if (parts.length === 1 && Number(number) === nextTopic) {
      accepted.push({ number, start, level: "topic", parentNumber: null });
      acceptedNumbers.add(number);
      nextChild.set(number, 1);
      nextTopic += 1;
    } else if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join(".");
      const ordinal = Number(parts.at(-1));
      const expectedOrdinal = nextChild.get(parentPath) ?? 1;
      if (acceptedNumbers.has(parentPath) && ordinal === expectedOrdinal) {
        accepted.push({ number, start, level: "subtopic", parentNumber: parts[0] ?? null });
        acceptedNumbers.add(number);
        nextChild.set(parentPath, expectedOrdinal + 1);
        nextChild.set(number, 1);
      }
    }
  }

  return accepted.map((item, index) => {
    const nameStart = item.start + item.number.length;
    const end = accepted[index + 1]?.start ?? text.length;
    return {
      ...item,
      name: clean(text.slice(nameStart, end)).replace(/^[.]\s*/, "").replace(/[.;,]$/, ""),
      page: flattened.pageAt(offset + item.start),
    };
  }).filter((item) => item.name);
}

function evidence(page: number, text: string) {
  return [{ page, text, boundingBox: null }];
}

function granularSentences(value: string): string[] {
  return value
    .split(/(?<=[a-záéíóúâêôãõç)])\.\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
    .map(clean)
    .filter(Boolean);
}

function toSubject(block: SubjectBlock): VerticalizationSubject {
  const items = numberedItems(block);
  const topics: VerticalizationTopic[] = [];
  const topicsByNumber = new Map<string, VerticalizationTopic>();
  for (const item of items) {
    if (item.level === "topic") {
      const [topicName = item.name, ...sentenceSubtopics] = granularSentences(item.name);
      const topic: VerticalizationTopic = {
        originalName: topicName,
        normalizedName: topicName,
        confidence: 0.96,
        evidence: evidence(item.page, `${item.number} ${topicName}`),
        subtopics: sentenceSubtopics.map((name) => ({
          originalName: name,
          normalizedName: name,
          confidence: 0.9,
          evidence: evidence(item.page, name),
        })),
      };
      topics.push(topic);
      topicsByNumber.set(item.number, topic);
    } else {
      const parent = item.parentNumber ? topicsByNumber.get(item.parentNumber) : undefined;
      if (parent) {
        (parent.subtopics as VerticalizationSubtopic[]).push({
          originalName: item.name,
          normalizedName: item.name,
          confidence: 0.94,
          evidence: evidence(item.page, `${item.number} ${item.name}`),
        });
      }
    }
  }

  if (topics.length === 0) {
    const flattened = flattenWithPages(block);
    const name = clean(withoutHeading(flattened.text, block.title));
    if (name) {
      topics.push({
        originalName: name,
        normalizedName: name,
        confidence: 0.8,
        evidence: evidence(block.page, name),
        subtopics: [],
      });
    }
  }

  return {
    originalName: block.title,
    normalizedName: clean(block.title),
    confidence: 0.98,
    evidence: evidence(block.page, block.title),
    examOptionIds: [...block.examOptionIds],
    topics,
  };
}

export function verticalizeParsedPdf(input: {
  readonly contestHints?: {
    readonly name?: string | undefined;
    readonly role?: string | undefined;
    readonly area?: string | undefined;
  };
  readonly documentVersionId: string;
  readonly extractedText: string;
}): VerticalizationResult {
  const annex = syllabusAnnex(input.extractedText);
  const { common, options } = splitExamOptions(annex);
  const selectedOption = selectExamOption(options, input.contestHints ?? {});
  const commonSubjects = splitSubjects(common, "CONHECIMENTOS GERAIS");
  const specificSubjects = options.flatMap((option) => splitSubjects(option.text, option.name, [option.id]));
  const subjects = [...commonSubjects, ...specificSubjects].map(toSubject).filter((subject) => subject.topics.length > 0);
  if (subjects.length === 0) throw new Error("O conteúdo programático não pôde ser estruturado localmente.");

  return {
    documentVersionId: input.documentVersionId,
    contest: {
      name: input.contestHints?.name ?? "Concurso não identificado",
      role: input.contestHints?.role ?? "Cargo não identificado",
      area: input.contestHints?.area ?? selectedOption?.name ?? "Área não identificada",
    },
    examOptions: options.map(({ text: _text, ...option }) => option),
    subjects,
    warnings: [
      "Árvore gerada do texto integral do PDF por parser determinístico; revise a hierarquia e as evidências antes de aprovar.",
    ],
  };
}
