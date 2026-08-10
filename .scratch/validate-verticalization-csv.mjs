import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Workbook } from "@oai/artifact-tool";

const root = path.resolve(import.meta.dirname, "..");
const csvPath = path.join(
  root,
  "output/csv/verticalizacao-edital-retificado-dataprev.csv",
);
const previewPath = path.join(root, "output/csv/verticalizacao-preview.png");
const csvText = await readFile(csvPath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Verticalização" });
const sheet = workbook.worksheets.getItem("Verticalização");
const used = sheet.getUsedRange(true);
const values = used.values;
const headers = values[0];
const records = values.slice(1).map((row) =>
  Object.fromEntries(headers.map((header, index) => [header, row[index]])),
);
const ids = new Set(records.map((record) => record.item_id));
const duplicateIds = records.length - ids.size;
const missingParents = records.filter(
  (record) => record.parent_item_id && !ids.has(record.parent_item_id),
);
const invalidPages = records.filter(
  (record) =>
    !Number.isInteger(Number(record.evidence_page)) ||
    Number(record.evidence_page) < 27 ||
    Number(record.evidence_page) > 45,
);
const missingRequired = records.filter((record) =>
  [
    "document_version_id",
    "contest_name",
    "profile_number",
    "role",
    "item_id",
    "level",
    "original_name",
    "normalized_name",
    "hierarchy_path",
    "confidence",
    "evidence_page",
    "evidence_text",
    "review_status",
  ].some((field) => record[field] == null || record[field] === ""),
);
const countsByLevel = records.reduce((result, record) => {
  result[record.level] = (result[record.level] ?? 0) + 1;
  return result;
}, {});
const profileNumbers = [...new Set(records.map((record) => Number(record.profile_number)))].sort(
  (a, b) => a - b,
);
const summary = await workbook.inspect({
  kind: "workbook,sheet,region",
  sheetId: "Verticalização",
  range: "A1:X12",
  maxChars: 8000,
  tableMaxRows: 12,
  tableMaxCols: 24,
  tableMaxCellChars: 120,
});
const formulas = await workbook.inspect({
  kind: "formula",
  sheetId: "Verticalização",
  range: "A1:X1455",
  maxChars: 2000,
  options: { maxResults: 20 },
});

sheet.getRange("A1:X20").format.wrapText = true;
sheet.getRange("A1:X1").format.font = { bold: true, color: "#FFFFFF" };
sheet.getRange("A1:X1").format.fill = "#1F4E78";
const preview = await workbook.render({
  sheetName: "Verticalização",
  range: "A1:M20",
  scale: 0.8,
  format: "png",
});
await mkdir(path.dirname(previewPath), { recursive: true });
await writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

process.stdout.write(
  `${JSON.stringify({
    usedRange: used.address,
    rowCount: records.length,
    columnCount: headers.length,
    profileNumbers,
    countsByLevel,
    duplicateIds,
    missingParents: missingParents.length,
    invalidPages: invalidPages.length,
    missingRequired: missingRequired.length,
    summary: summary.ndjson,
    formulas: formulas.ndjson,
    previewPath,
  }, null, 2)}\n`,
);
