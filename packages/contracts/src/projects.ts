import { z, type ZodError } from "zod";

const requiredText = (field: "concurso" | "cargo" | "area", label: string) =>
  z.string({ error: `Informe ${label}.` }).trim().min(1, `Informe ${label}.`).max(120, `${label[0]?.toUpperCase()}${label.slice(1)} deve ter no máximo 120 caracteres.`).refine(
    (value) => value.length >= 2,
    { message: `Informe ${label} com pelo menos 2 caracteres.`, path: [field] },
  );

export const createProjectSchema = z.object({
  concurso: requiredText("concurso", "o concurso"),
  cargo: requiredText("cargo", "o cargo"),
  area: requiredText("area", "a área"),
});

export const updateProjectSchema = createProjectSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "Informe ao menos um campo para atualizar.",
);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createMaterialSchema = z.object({
  title: z.string().trim().min(2, "Informe o título do material.").max(180),
  edition: z.string().trim().min(1, "Informe a edição.").max(80),
});
export const materialIndexItemSchema = z.object({
  id: z.string().trim().min(1).max(80), parentId: z.string().trim().min(1).max(80).nullable(),
  title: z.string().trim().min(1, "Informe o texto do item.").max(300),
  startPage: z.number().int().positive(), endPage: z.number().int().positive(), sourcePage: z.number().int().positive(),
  sourceId: z.uuid().optional(),
});
export const importMaterialIndexSchema = z.object({
  sourceKind: z.enum(["manual", "pdf", "image"]),
  sourceFilename: z.string().trim().min(1).max(180).optional(),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]).optional(),
  base64: z.string().max(8_000_000).optional(),
  pageOffset: z.number().int().min(-10_000).max(10_000),
  items: z.array(materialIndexItemSchema).max(500).optional(),
  basedOnVersionId: z.uuid().optional(),
}).superRefine((value, context) => {
  if (value.sourceKind === "manual" && !value.items?.length) context.addIssue({ code: "custom", path: ["items"], message: "Digite ao menos um item." });
  if (value.sourceKind !== "manual" && (!value.base64 || !value.mimeType || !value.sourceFilename)) context.addIssue({ code: "custom", path: ["base64"], message: "Envie somente as páginas do índice." });
});
export const reviseMaterialIndexSchema = z.object({
  pageOffset: z.number().int().min(-10_000).max(10_000), items: z.array(materialIndexItemSchema).min(1).max(500),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type ImportMaterialIndexInput = z.infer<typeof importMaterialIndexSchema>;

export function toFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && fields[field] === undefined) fields[field] = issue.message;
  }
  return fields;
}

const textProperty = { type: "string", minLength: 2, maxLength: 120 } as const;
const projectInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["concurso", "cargo", "area"],
  properties: { concurso: textProperty, cargo: textProperty, area: textProperty },
} as const;
const updateInputSchema = {
  ...projectInputSchema,
  required: [],
  minProperties: 1,
} as const;
const projectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "concurso", "cargo", "area", "status", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    concurso: { type: "string" },
    cargo: { type: "string" },
    area: { type: "string" },
    status: { type: "string", enum: ["active", "archived"] },
    archivedAt: { type: "string", format: "date-time" },
    sourceProjectId: { type: "string", format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;
const errorSchema = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string" },
    fieldErrors: { type: "object", additionalProperties: { type: "string" } },
  },
} as const;
const aiConfigurationErrorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "variables"],
  properties: {
    code: { type: "string", const: "ai_configuration_invalid" },
    message: { type: "string" },
    variables: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
  },
} as const;
const json = (schema: object) => ({ "application/json": { schema } });
const response = (description: string, schema?: object) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const protectedSecurity = [{ cookieSession: [] }, { oidc: [] }] as const;
const processingJobSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "projectId", "status", "correlationId", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    kind: { type: "string", enum: ["document_verticalization", "material_index_extraction"] },
    documentVersionId: { type: "string", format: "uuid" },
    materialId: { type: "string", format: "uuid" },
    sourceFilename: { type: "string" },
    resultVersionId: { type: "string", format: "uuid" },
    projectId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["pending", "processing", "completed", "needs_review", "failed_recoverable", "failed_invalid_output"] },
    correlationId: { type: "string", format: "uuid" },
    errorCode: { type: "string" },
    reviewReasons: {
      type: "array",
      items: { type: "string", enum: ["low_evidence", "cost_limit_exceeded", "cost_unavailable"] },
      uniqueItems: true,
    },
    inference: {
      type: "object", additionalProperties: false,
      required: ["requestId", "model", "provider", "promptVersion", "durationMs", "usage"],
      properties: {
        requestId: { type: "string" }, model: { type: "string" }, provider: { type: ["string", "null"] },
        promptVersion: { type: "string" }, durationMs: { type: "integer", minimum: 0 },
        usage: {
          type: "object", additionalProperties: false,
          required: ["promptTokens", "completionTokens", "totalTokens", "cachedTokens", "reasoningTokens", "cost"],
          properties: {
            promptTokens: { type: "integer", minimum: 0 }, completionTokens: { type: "integer", minimum: 0 },
            totalTokens: { type: "integer", minimum: 0 }, cachedTokens: { type: "integer", minimum: 0 },
            cacheWriteTokens: { type: "integer", minimum: 0 }, audioTokens: { type: "integer", minimum: 0 },
            reasoningTokens: { type: "integer", minimum: 0 }, cost: { type: ["number", "null"], minimum: 0 },
            upstreamInferenceCost: { type: ["number", "null"], minimum: 0 },
          },
        },
      },
    },
    reviewSuggestion: { $ref: "#/components/schemas/VerticalizationSuggestion" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;
const documentVersionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "projectId", "versionNumber", "filename", "sha256", "sizeBytes", "createdAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    projectId: { type: "string", format: "uuid" },
    versionNumber: { type: "integer", minimum: 1 },
    filename: { type: "string" },
    sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
    sizeBytes: { type: "integer", minimum: 1, maximum: 5 * 1024 * 1024 },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;
const acceptedDocumentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documentVersion", "job"],
  properties: {
    documentVersion: { $ref: "#/components/schemas/DocumentVersion" },
    job: { $ref: "#/components/schemas/ProcessingJob" },
  },
} as const;
const evidenceSchema = {
  type: "object", additionalProperties: false, required: ["page", "text", "boundingBox"],
  properties: { page: { type: "integer", minimum: 1 }, text: { type: "string", minLength: 1 },
    boundingBox: { oneOf: [{ type: "null" }, { type: "object", required: ["x", "y", "width", "height"],
      properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } }] } },
} as const;
const extractedNodeProperties = {
  originalName: { type: "string", minLength: 1 }, normalizedName: { type: "string", minLength: 1 },
  confidence: { type: "number", minimum: 0, maximum: 1 },
  evidence: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/VerticalizationEvidence" } },
} as const;
const verticalizationTreeSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "projectId", "documentVersionId", "documentVersionNumber", "contest", "examOptions", "subjects", "warnings", "execution", "createdAt"],
  properties: {
    id: { type: "string", format: "uuid" }, projectId: { type: "string", format: "uuid" },
    documentVersionId: { type: "string", format: "uuid" }, documentVersionNumber: { type: "integer", minimum: 1 },
    contest: { type: "object", required: ["name", "role", "area"], properties: { name: { type: "string" }, role: { type: "string" }, area: { type: "string" } } },
    examOptions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "kind", "label", "name", "code", "evidence"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["cargo", "emprego", "funcao", "posto_trabalho", "perfil", "especialidade", "area", "area_atuacao", "enfase", "opcao", "codigo_opcao", "bloco_tematico", "eixo_tematico"] },
          label: { type: "string" }, name: { type: "string" }, code: { type: ["string", "null"] },
          evidence: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/VerticalizationEvidence" } },
        },
      },
    },
    subjects: {
      type: "array", minItems: 1,
      items: {
        type: "object", required: ["originalName", "normalizedName", "confidence", "evidence", "examOptionIds", "topics"],
        properties: {
          ...extractedNodeProperties,
          examOptionIds: { type: "array", items: { type: "string" } },
          topics: {
            type: "array",
            items: {
              type: "object", required: ["originalName", "normalizedName", "confidence", "evidence", "subtopics"],
              properties: {
                ...extractedNodeProperties,
                subtopics: {
                  type: "array",
                  items: { type: "object", required: ["originalName", "normalizedName", "confidence", "evidence"], properties: extractedNodeProperties },
                },
              },
            },
          },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    execution: { type: "object", required: ["requestId", "promptVersion", "model", "provider", "promptTokens", "completionTokens", "totalTokens", "cachedTokens", "reasoningTokens", "cost", "latencyMs"],
      properties: { requestId: { type: "string" }, promptVersion: { type: "string" }, model: { type: "string" }, provider: { type: ["string", "null"] },
        promptTokens: { type: "integer" }, completionTokens: { type: "integer" }, totalTokens: { type: "integer" }, cachedTokens: { type: "integer" },
        cacheWriteTokens: { type: "integer" }, audioTokens: { type: "integer" }, reasoningTokens: { type: "integer" },
        cost: { type: ["number", "null"] }, upstreamInferenceCost: { type: ["number", "null"] }, latencyMs: { type: "integer" } } },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;
const verticalizationSuggestionSchema = {
  type: "object", additionalProperties: false,
  required: ["documentVersionId", "contest", "examOptions", "subjects", "warnings"],
  properties: {
    documentVersionId: verticalizationTreeSchema.properties.documentVersionId,
    contest: verticalizationTreeSchema.properties.contest,
    examOptions: verticalizationTreeSchema.properties.examOptions,
    subjects: verticalizationTreeSchema.properties.subjects,
    warnings: verticalizationTreeSchema.properties.warnings,
  },
} as const;
const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
} as const;
const projectIdParameter = { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } } as const;

export function createProjectApiDocument(openIdConnectUrl: string) {
  return {
    openapi: "3.1.0",
    info: { title: "Planejador de Editais API", version: "0.1.0" },
    paths: {
      "/auth/session": {
        get: {
          operationId: "getSession",
          summary: "Consultar a sessão BFF",
          responses: { "200": response("Estado da sessão", {
            type: "object",
            required: ["authenticated"],
            properties: { authenticated: { type: "boolean" }, expiresAt: { type: "string", format: "date-time" } },
          }) },
        },
      },
      "/auth/login": {
        get: {
          operationId: "beginLogin",
          summary: "Iniciar Authorization Code + PKCE",
          parameters: [{ name: "returnTo", in: "query", schema: { type: "string", format: "uri" } }],
          responses: {
            "302": response("Redirecionamento para o provedor OIDC"),
            "400": response("Destino de retorno ausente ou inválido", errorSchema),
            "429": response("Limite de tentativas ou de fluxos de login ativos excedido", errorSchema),
          },
        },
      },
      "/auth/callback": {
        get: {
          operationId: "completeLogin",
          summary: "Validar callback OIDC e criar sessão HttpOnly",
          parameters: [
            { name: "code", in: "query", required: true, schema: { type: "string" } },
            { name: "state", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "302": response("Sessão criada e redirecionada ao app"),
            "400": response("Parâmetros obrigatórios ou cookie de fluxo ausentes", errorSchema),
            "401": response("Estado, resposta ou tokens do provedor não puderam ser validados", errorSchema),
            "403": response("Identidade sem associação local ativa ao tenant solicitado", errorSchema),
          },
        },
      },
      "/auth/logout": {
        post: {
          operationId: "logout",
          summary: "Revogar a sessão atual",
          security: [{ cookieSession: [] }],
          responses: { "204": response("Sessão revogada"), "403": response("Origem não permitida", errorSchema) },
        },
      },
      "/projects": {
        get: {
          operationId: "listProjects",
          summary: "Listar projetos do tenant autenticado",
          security: protectedSecurity,
          parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["active", "archived"], default: "active" } }],
          responses: {
            "200": response("Projetos autorizados", { type: "array", items: projectSchema }),
            "401": response("Sessão ou token inválido", errorSchema),
          },
        },
        post: {
          operationId: "createProject",
          summary: "Criar um projeto uma única vez",
          security: protectedSecurity,
          parameters: [idempotencyHeader],
          requestBody: { required: true, content: json(projectInputSchema) },
          responses: {
            "201": response("Projeto criado ou criação idempotente recuperada", projectSchema),
            "400": response("Dados inválidos", errorSchema),
            "401": response("Sessão ou token inválido", errorSchema),
            "403": response("Origem não permitida", errorSchema),
          },
        },
      },
      "/projects/{projectId}": {
        patch: {
          operationId: "updateProject",
          summary: "Atualizar um projeto autorizado",
          security: protectedSecurity,
          parameters: [projectIdParameter],
          requestBody: { required: true, content: json(updateInputSchema) },
          responses: {
            "200": response("Projeto atualizado", projectSchema),
            "400": response("Dados inválidos", errorSchema),
            "401": response("Sessão ou token inválido", errorSchema),
            "403": response("Origem não permitida", errorSchema),
            "404": response("Projeto ausente ou pertencente a outro tenant", errorSchema),
          },
        },
      },
      "/projects/{projectId}/archive": {
        post: {
          operationId: "archiveProject",
          summary: "Arquivar um projeto sem apagar seu histórico",
          security: protectedSecurity,
          parameters: [projectIdParameter],
          responses: {
            "200": response("Projeto arquivado", projectSchema),
            "401": response("Sessão ou token inválido", errorSchema),
            "403": response("Origem não permitida", errorSchema),
            "404": response("Projeto ausente ou pertencente a outro tenant", errorSchema),
          },
        },
      },
      "/projects/{projectId}/duplicates": {
        post: {
          operationId: "duplicateProject",
          summary: "Duplicar um projeto com origem rastreável",
          security: protectedSecurity,
          parameters: [projectIdParameter, idempotencyHeader],
          responses: {
            "201": response("Duplicata ativa criada ou recuperada de forma idempotente", projectSchema),
            "400": response("Chave de idempotência inválida", errorSchema),
            "401": response("Sessão ou token inválido", errorSchema),
            "403": response("Origem não permitida", errorSchema),
            "404": response("Projeto ausente ou pertencente a outro tenant", errorSchema),
          },
        },
      },
      "/projects/{projectId}/editais": {
        post: {
          operationId: "uploadEdital",
          summary: "Enviar e versionar um edital em PDF",
          security: protectedSecurity,
          parameters: [
            projectIdParameter,
            idempotencyHeader,
            { name: "Content-Disposition", in: "header", required: false, schema: { type: "string" } },
            { name: "X-Processing-Mode", in: "header", required: false, description: "Seleção exclusiva do ambiente local entre fixture determinística e processamento integral.", schema: { type: "string", enum: ["fixture", "full"], default: "full" } },
          ],
          requestBody: {
            required: true,
            content: { "application/pdf": { schema: { type: "string", format: "binary", maxLength: 5 * 1024 * 1024 } } },
          },
          responses: {
            "201": response("Versão e ProcessingJob criados, ou upload idempotente recuperado", acceptedDocumentSchema),
            "400": response("Chave de idempotência inválida", errorSchema),
            "401": response("Sessão ou token inválido", errorSchema),
            "403": response("Origem não permitida", errorSchema),
            "404": response("Projeto ausente ou pertencente a outro tenant", errorSchema),
            "422": response("PDF inválido, protegido ou acima do limite", errorSchema),
            "503": response("Configuração de IA ausente ou inválida", aiConfigurationErrorSchema),
          },
        },
      },
      "/projects/{projectId}/materials": {
        post: {
          operationId: "createMaterial", summary: "Cadastrar material e edição", security: protectedSecurity,
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, idempotencyHeader],
          requestBody: { required: true, content: json({ type: "object", additionalProperties: false, required: ["title", "edition"], properties: { title: { type: "string", minLength: 2, maxLength: 180 }, edition: { type: "string", minLength: 1, maxLength: 80 } } }) },
          responses: { "201": response("Material cadastrado"), "400": response("Dados inválidos", errorSchema), "404": response("Projeto ausente", errorSchema) },
        },
      },
      "/materials/{materialId}/index-versions": {
        post: {
          operationId: "importMaterialIndex", summary: "Importar um ou mais conjuntos de páginas de índice para revisão", security: protectedSecurity,
          parameters: [{ name: "materialId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, idempotencyHeader],
          requestBody: { required: true, content: json({ type: "object", required: ["sourceKind", "pageOffset"], properties: { sourceKind: { type: "string", enum: ["manual", "pdf", "image"] }, sourceFilename: { type: "string" }, mimeType: { type: "string", enum: ["application/pdf", "image/png", "image/jpeg", "image/webp"] }, base64: { type: "string", maxLength: 8_000_000 }, pageOffset: { type: "integer" }, basedOnVersionId: { type: "string", format: "uuid", description: "Versão anterior à qual esta nova fonte será anexada cumulativamente." }, items: { type: "array", maxItems: 500 } } }) },
          responses: {
            "201": response("Versão manual validada para revisão"),
            "202": response("Extração automática aceita como ProcessingJob", { type: "object", required: ["job"], properties: { job: { $ref: "#/components/schemas/ProcessingJob" } } }),
            "400": response("Entrada inválida", errorSchema),
            "422": response("Arquivo ou saída inválida recuperável", errorSchema),
            "503": response("Configuração de IA inválida ou extração indisponível", aiConfigurationErrorSchema),
          },
        },
      },
      "/materials/{materialId}/index-versions/{versionId}/revisions": {
        post: {
          operationId: "reviseMaterialIndex", summary: "Salvar correções como nova versão", security: protectedSecurity,
          parameters: [{ name: "materialId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, idempotencyHeader],
          responses: { "201": response("Nova versão de revisão"), "400": response("Correções inválidas", errorSchema), "404": response("Material ou versão ausente", errorSchema) },
        },
      },
      "/materials/{materialId}/index-versions/{versionId}/approval": {
        post: {
          operationId: "approveMaterialIndex", summary: "Aprovar explicitamente uma versão válida", security: protectedSecurity,
          parameters: [{ name: "materialId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, idempotencyHeader],
          responses: { "201": response("Versão aprovada"), "404": response("Material ou versão ausente", errorSchema), "422": response("Versão inválida não promovida", errorSchema) },
        },
      },
      "/processing-jobs/{jobId}": {
        get: {
          operationId: "getProcessingJob",
          summary: "Consultar o processamento de um edital",
          security: protectedSecurity,
          parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            "200": response("Estado durável do processamento", { $ref: "#/components/schemas/ProcessingJob" }),
            "401": response("Sessão ou token inválido", errorSchema),
            "404": response("Processamento ausente ou pertencente a outro tenant", errorSchema),
          },
        },
      },
      "/document-versions/{documentVersionId}/verticalization": {
        get: {
          operationId: "getVerticalization", summary: "Consultar a árvore verticalizada e suas evidências", security: protectedSecurity,
          parameters: [{ name: "documentVersionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            "200": response("Árvore validada e rastreável", { $ref: "#/components/schemas/VerticalizationTree" }),
            "401": response("Sessão ou token inválido", errorSchema),
            "404": response("Verticalização ausente ou pertencente a outro tenant", errorSchema),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieSession: { type: "apiKey", in: "cookie", name: "planejador_session", description: "Sessão BFF opaca, Secure, HttpOnly e SameSite=Lax." },
        oidc: { type: "openIdConnect", openIdConnectUrl, description: "Token de API para clientes não-browser; issuer e audience são fixos." },
      },
      schemas: {
        CreateProjectInput: projectInputSchema,
        UpdateProjectInput: updateInputSchema,
        Project: projectSchema,
        DocumentVersion: documentVersionSchema,
        ProcessingJob: processingJobSchema,
        VerticalizationSuggestion: verticalizationSuggestionSchema,
        AcceptedDocument: acceptedDocumentSchema,
        VerticalizationEvidence: evidenceSchema,
        VerticalizationTree: verticalizationTreeSchema,
        Error: errorSchema,
      },
    },
  } as const;
}

export const projectApiDocument = createProjectApiDocument("https://identity.example.invalid/.well-known/openid-configuration");
