import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(
  root,
  "output/pdf/edital-retificado-dataprev-cloudflare-ai.md",
);
const outputDir = path.join(root, "output/csv");
const outputPath = path.join(
  outputDir,
  "verticalizacao-edital-retificado-dataprev.csv",
);
const documentVersionId = "dataprev-edital-retificado-2026";
const contestName = "Dataprev — Concurso Público 2026";

const source = await readFile(sourcePath, "utf8");
const annex = source.match(/### Page 27\n([\s\S]*?)\n### Page 46\n/)?.[1];
if (!annex) throw new Error("Anexo I não localizado nas páginas 27–45.");

function clean(value) {
  return value
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

function splitProfiles(text) {
  const pattern = /^(?:# )?PERFIL\s+(\d+)\s*[:–-]\s*([^\n]+)$/gm;
  const matches = [...text.matchAll(pattern)];
  const common = text
    .slice(0, matches[0]?.index ?? text.length)
    .replace(/^#\s*ANEXO I[^\n]*$/m, "")
    .replace(/^.*MODULO I.*$/m, "")
    .replace(/^.*MODULO II.*$/m, "")
    .trim();
  return {
    common,
    profiles: matches.map((match, index) => ({
      number: Number(match[1]),
      title: clean(match[2].replace(/:$/, "")),
      text: text
        .slice(
          match.index + match[0].length,
          matches[index + 1]?.index ?? text.length,
        )
        .trim(),
    })),
  };
}

function isSubjectHeading(line) {
  const value = clean(line);
  if (/^(?:MODULO|PERFIL|ANEXO)\b/.test(value)) return false;
  if (/^(?:CIVIL|ELÉTRICA|MECÂNICA)\s+1\b/.test(value)) return true;
  return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ()/.,'–\-]+:\s*/.test(value);
}

function headingName(line) {
  const value = clean(line);
  if (/^(?:CIVIL|ELÉTRICA|MECÂNICA)\s+1\b/.test(value)) {
    return value.match(/^(CIVIL|ELÉTRICA|MECÂNICA)/)?.[1] ?? value;
  }
  return value.replace(/:\s*[\s\S]*$/, "").trim();
}

function splitSubjects(text, fallbackTitle) {
  const lines = text.split("\n");
  const blocks = [];
  let page = 27;
  let title = fallbackTitle;
  let buffer = [];

  function flush() {
    const body = buffer.join("\n").trim();
    if (body) blocks.push({ title, body });
    buffer = [];
  }

  for (const line of lines) {
    const marker = line.match(/^### Page (\d+)$/);
    if (marker) {
      page = Number(marker[1]);
      buffer.push(line);
      continue;
    }
    if (isSubjectHeading(line)) {
      flush();
      title = headingName(line);
      buffer = [`### Page ${page}`, line];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return blocks;
}

function flattenWithPages(body) {
  let page = 27;
  const segments = [];
  for (const line of body.split("\n")) {
    const marker = line.match(/^### Page (\d+)$/);
    if (marker) {
      page = Number(marker[1]);
      continue;
    }
    const value = clean(line);
    if (!value) continue;
    segments.push({ page, value });
  }
  let text = "";
  const spans = [];
  for (const segment of segments) {
    const start = text.length;
    text += `${text ? " " : ""}${segment.value}`;
    spans.push({ start, end: text.length, page: segment.page });
  }
  return {
    text,
    pageAt(index) {
      return spans.find((span) => index >= span.start && index < span.end)?.page ?? 27;
    },
  };
}

function removeHeading(text, title) {
  if (text.startsWith(`${title}:`)) return text.slice(title.length + 1).trim();
  if (text.startsWith(`${title} `)) return text.slice(title.length).trim();
  return text;
}

function parseNumberedItems(subject) {
  const flat = flattenWithPages(subject.body);
  const text = removeHeading(flat.text, subject.title);
  const offset = flat.text.length - text.length;
  const candidates = [...text.matchAll(/(?:^|\s)(\d+(?:\.\d+)*)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç“"(])/g)];
  const accepted = [];
  let expectedTopic = 1;
  const nextSubtopic = new Map();

  for (const candidate of candidates) {
    const number = candidate[1];
    const start = (candidate.index ?? 0) + candidate[0].length - number.length - 1;
    if (number.includes(".")) {
      const [majorValue, minorValue] = number.split(".").map(Number);
      const expectedMinor = nextSubtopic.get(majorValue) ?? 1;
      if (majorValue === expectedTopic - 1 && minorValue === expectedMinor) {
        accepted.push({ number, start, level: "subtopic", parentNumber: String(majorValue) });
        nextSubtopic.set(majorValue, expectedMinor + 1);
      }
      continue;
    }
    const value = Number(number);
    if (value === expectedTopic) {
      accepted.push({ number, start, level: "topic", parentNumber: null });
      expectedTopic += 1;
    }
  }

  return accepted.map((item, index) => {
    const nameStart = item.start + item.number.length;
    const end = accepted[index + 1]?.start ?? text.length;
    return {
      ...item,
      originalName: clean(text.slice(nameStart, end)).replace(/[.;,]$/, ""),
      page: flat.pageAt(offset + item.start),
    };
  }).filter((item) => item.originalName);
}

function csvCell(value) {
  const string = value == null ? "" : String(value);
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

const columns = [
  "document_version_id",
  "contest_name",
  "profile_number",
  "role",
  "item_id",
  "parent_item_id",
  "level",
  "original_name",
  "normalized_name",
  "hierarchy_path",
  "confidence",
  "evidence_page",
  "evidence_text",
  "bounding_box_x",
  "bounding_box_y",
  "bounding_box_width",
  "bounding_box_height",
  "review_status",
  "extraction_method",
  "ocr_engine",
  "source_file",
  "prompt_version",
  "model_resolved",
  "warnings",
];

const { common, profiles } = splitProfiles(annex);
const commonSubjects = splitSubjects(common, "CONHECIMENTOS GERAIS");
const rows = [];

for (const profile of profiles) {
  const role = `PERFIL ${profile.number}: ${profile.title}`;
  const subjects = [
    ...commonSubjects.map((subject) => ({ ...subject, module: "CONHECIMENTOS GERAIS" })),
    ...splitSubjects(profile.text, profile.title).map((subject) => ({
      ...subject,
      module: "CONHECIMENTOS ESPECÍFICOS",
    })),
  ];

  for (const [subjectIndex, subject] of subjects.entries()) {
    const flat = flattenWithPages(subject.body);
    const explicitItems = parseNumberedItems(subject);
    const subjectId = `p${String(profile.number).padStart(2, "0")}-s${String(subjectIndex + 1).padStart(2, "0")}-${slug(subject.title)}`;
    const subjectPath = `${subject.module} > ${subject.title}`;
    const common = {
      document_version_id: documentVersionId,
      contest_name: contestName,
      profile_number: profile.number,
      role,
      review_status: "pending_human_review",
      extraction_method: "deterministic_local_parser",
      ocr_engine: "cloudflare-ai",
      source_file: "docs/pdfs-tests/edital-retificado-dataprev.pdf",
      prompt_version: "",
      model_resolved: "",
      warnings: "Resultado não aprovado; validar OCR, normalização e hierarquia antes do uso funcional.",
      bounding_box_x: "",
      bounding_box_y: "",
      bounding_box_width: "",
      bounding_box_height: "",
    };
    rows.push({
      ...common,
      item_id: subjectId,
      parent_item_id: "",
      level: "subject",
      original_name: subject.title,
      normalized_name: clean(subject.title),
      hierarchy_path: subjectPath,
      confidence: "0.98",
      evidence_page: flat.pageAt(0),
      evidence_text: subject.title,
    });

    if (explicitItems.length === 0) {
      const value = clean(removeHeading(flat.text, subject.title));
      if (value) {
        const itemId = `${subjectId}-t01`;
        rows.push({
          ...common,
          item_id: itemId,
          parent_item_id: subjectId,
          level: "topic",
          original_name: value,
          normalized_name: value,
          hierarchy_path: `${subjectPath} > ${value}`,
          confidence: "0.80",
          evidence_page: flat.pageAt(0),
          evidence_text: value,
        });
      }
      continue;
    }

    const topicIds = new Map();
    for (const item of explicitItems) {
      const itemId = `${subjectId}-${item.level === "topic" ? "t" : "st"}${item.number.replaceAll(".", "-")}`;
      if (item.level === "topic") topicIds.set(item.number, itemId);
      const parentId =
        item.level === "topic" ? subjectId : (topicIds.get(item.parentNumber) ?? subjectId);
      rows.push({
        ...common,
        item_id: itemId,
        parent_item_id: parentId,
        level: item.level,
        original_name: item.originalName,
        normalized_name: item.originalName,
        hierarchy_path: `${subjectPath} > ${item.number} ${item.originalName}`,
        confidence: item.level === "topic" ? "0.96" : "0.94",
        evidence_page: item.page,
        evidence_text: `${item.number} ${item.originalName}`,
      });
    }
  }
}

await mkdir(outputDir, { recursive: true });
const csv = [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");
await writeFile(outputPath, `${csv}\n`, "utf8");

const summary = rows.reduce((result, row) => {
  result[row.level] = (result[row.level] ?? 0) + 1;
  return result;
}, {});
process.stdout.write(
  `${JSON.stringify({ outputPath, rows: rows.length, profiles: profiles.length, ...summary }, null, 2)}\n`,
);
