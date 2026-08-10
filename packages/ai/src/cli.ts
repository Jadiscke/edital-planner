#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { AiConfigurationError } from "./config.ts";
import {
  OpenRouterHttpError,
  OpenRouterResponseError,
} from "./openrouter.ts";
import { createAiService } from "./service.ts";

type Command =
  | "check"
  | "verticalize"
  | "extract-index"
  | "associate";

async function readJsonInput(path: string | undefined): Promise<unknown> {
  if (!path) {
    throw new Error("Informe o caminho de um arquivo JSON de entrada.");
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const [commandValue, inputPath] = process.argv.slice(2);
  const command = commandValue as Command | undefined;
  const service = createAiService(process.env);

  switch (command) {
    case "check":
      return service.checkConfiguration();
    case "verticalize":
      return service.verticalizeEdital(
        (await readJsonInput(inputPath)) as Parameters<
          typeof service.verticalizeEdital
        >[0],
      );
    case "extract-index":
      return service.extractMaterialIndex(
        (await readJsonInput(inputPath)) as Parameters<
          typeof service.extractMaterialIndex
        >[0],
      );
    case "associate":
      return service.suggestAssociations(
        (await readJsonInput(inputPath)) as Parameters<
          typeof service.suggestAssociations
        >[0],
      );
    default:
      throw new Error(
        "Comando inválido. Use: check, verticalize, extract-index ou associate.",
      );
  }
}

try {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error instanceof AiConfigurationError) {
    process.stderr.write(`${error.message}\n`);
  } else if (error instanceof OpenRouterHttpError) {
    process.stderr.write(`${error.message}\n`);
  } else if (error instanceof OpenRouterResponseError) {
    process.stderr.write(`${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Falha desconhecida na operação de IA.\n");
  }
  process.exitCode = 1;
}

