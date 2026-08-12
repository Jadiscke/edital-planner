class TextOnlyDomMatrix {
  constructor() {}
  invertSelf() { return this; }
  multiplySelf() { return this; }
  preMultiplySelf() { return this; }
  scale() { return this; }
  translate() { return this; }
}
class TextOnlyPath2D {
  addPath() {}
}
globalThis.DOMMatrix ??= TextOnlyDomMatrix;
globalThis.Path2D ??= TextOnlyPath2D;

const { getDocument, VerbosityLevel } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const minimumTextPerPage = 50;

function pageText(items) {
  const lines = [];
  let line = "";
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("str" in item)) continue;
    const value = String(item.str).trim();
    if (value) line += `${line ? " " : ""}${value}`;
    if ("hasEOL" in item && item.hasEOL) {
      if (line) lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines
    .filter((value) => !/^DATAPREV\s*\|\s*CONCURSO P[ÚU]BLICO\s+\d{4}$/i.test(value))
    .filter((value) => !/^\d{1,3}$/.test(value))
    .join("\n");
}

let loadingTask;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const bytes = Uint8Array.from(Buffer.from(input.base64, "base64"));
  if (bytes.byteLength > input.limits.maxBytes) throw new Error("SECURITY:O PDF excede o limite seguro de bytes.");
  loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
    maxImageSize: 0,
    stopAtErrors: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  const document = await loadingTask.promise;
  if (document.numPages > input.limits.maxPages) throw new Error("SECURITY:O PDF excede o limite seguro de páginas.");
  const pages = [];
  let extractedCharacters = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    if (content.items.length > input.limits.maxItemsPerPage) throw new Error("SECURITY:Uma página do PDF excede o limite seguro de objetos.");
    const text = pageText(content.items);
    extractedCharacters += text.replace(/\s/g, "").length;
    if (extractedCharacters > input.limits.maxCharacters) throw new Error("SECURITY:O PDF excede o limite seguro de texto extraído.");
    pages.push(`### Page ${pageNumber}\n\n${text}`);
    page.cleanup();
  }
  const text = extractedCharacters < document.numPages * minimumTextPerPage ? null : pages.join("\n\n");
  process.stdout.write(JSON.stringify({ text }));
} catch (error) {
  const message = error instanceof Error ? error.message : "Falha ao analisar o PDF.";
  process.stdout.write(JSON.stringify(message.startsWith("SECURITY:") ? { text: null, securityError: message.slice(9) } : { text: null }));
} finally {
  await loadingTask?.destroy();
}
