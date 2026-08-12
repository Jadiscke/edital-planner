import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PdfSecurityLimits {
  readonly maxBytes?: number;
  readonly maxCharacters?: number;
  readonly maxItemsPerPage?: number;
  readonly maxPages?: number;
  readonly timeoutMs?: number;
}

export class PdfSecurityLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfSecurityLimitError";
  }
}

const defaults = {
  maxBytes: 10 * 1024 * 1024,
  maxCharacters: 8_000_000,
  maxItemsPerPage: 50_000,
  maxPages: 500,
  timeoutMs: 10_000,
} as const;

export async function extractLocalPdfText(base64: string, limits: PdfSecurityLimits = {}): Promise<string | null> {
  const resolved = { ...defaults, ...limits };
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > resolved.maxBytes) {
    throw new PdfSecurityLimitError(`O PDF excede o limite seguro de ${resolved.maxBytes} bytes.`);
  }

  const workerPath = fileURLToPath(new URL("./pdf-text-worker.mjs", import.meta.url));
  const pdfJsEntry = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfJsRoot = dirname(dirname(dirname(pdfJsEntry)));
  const localPdfJsPath = join(dirname(dirname(workerPath)), "node_modules", "pdfjs-dist");
  const child = spawn(process.execPath, [
    "--permission",
    "--max-old-space-size=192",
    `--allow-fs-read=${dirname(workerPath)}`,
    `--allow-fs-read=${localPdfJsPath}`,
    `--allow-fs-read=${pdfJsRoot}`,
    workerPath,
  ], {
    env: {},
    stdio: ["pipe", "pipe", "pipe"],
  });

  return new Promise<string | null>((resolve, reject) => {
    let output = "";
    let errorOutput = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new PdfSecurityLimitError("O parsing do PDF excedeu o limite seguro de tempo.")));
    }, resolved.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.on("data", (chunk: string) => { errorOutput += chunk; });
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => {
      if (code !== 0) return reject(new PdfSecurityLimitError(`O parser isolado do PDF falhou: ${errorOutput.trim() || `código ${code}`}`));
      try {
        const result = JSON.parse(output) as { text: string | null; securityError?: string };
        if (result.securityError) return reject(new PdfSecurityLimitError(result.securityError));
        resolve(result.text);
      } catch {
        reject(new PdfSecurityLimitError("O parser isolado do PDF retornou uma resposta inválida."));
      }
    }));
    child.stdin.end(JSON.stringify({ base64, limits: resolved }));
  });
}
