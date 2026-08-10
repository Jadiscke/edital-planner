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
});
export const importMaterialIndexSchema = z.object({
  sourceKind: z.enum(["manual", "pdf", "image"]),
  sourceFilename: z.string().trim().min(1).max(180).optional(),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]).optional(),
  base64: z.string().max(8_000_000).optional(),
  pageOffset: z.number().int().min(-10_000).max(10_000),
  items: z.array(materialIndexItemSchema).max(500).optional(),
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
  required: ["id", "concurso", "cargo", "area", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    concurso: { type: "string" },
    cargo: { type: "string" },
    area: { type: "string" },
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
const json = (schema: object) => ({ "application/json": { schema } });
const response = (description: string, schema?: object) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const protectedSecurity = [{ cookieSession: [] }, { oidc: [] }] as const;
const processingJobSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "documentVersionId", "projectId", "status", "correlationId", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    documentVersionId: { type: "string", format: "uuid" },
    projectId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["pending", "processing", "completed", "failed_recoverable"] },
    correlationId: { type: "string", format: "uuid" },
    errorCode: { type: "string" },
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
const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
} as const;

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
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
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
      "/projects/{projectId}/editais": {
        post: {
          operationId: "uploadEdital",
          summary: "Enviar e versionar um edital em PDF",
          security: protectedSecurity,
          parameters: [
            { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            idempotencyHeader,
            { name: "Content-Disposition", in: "header", required: false, schema: { type: "string" } },
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
          operationId: "importMaterialIndex", summary: "Importar páginas ou digitar índice para revisão", security: protectedSecurity,
          parameters: [{ name: "materialId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { required: true, content: json({ type: "object", required: ["sourceKind", "pageOffset"], properties: { sourceKind: { type: "string", enum: ["manual", "pdf", "image"] }, sourceFilename: { type: "string" }, mimeType: { type: "string", enum: ["application/pdf", "image/png", "image/jpeg", "image/webp"] }, base64: { type: "string", maxLength: 8_000_000 }, pageOffset: { type: "integer" }, items: { type: "array", maxItems: 500 } } }) },
          responses: { "201": response("Versão validada para revisão"), "400": response("Entrada inválida", errorSchema), "422": response("Arquivo ou saída inválida recuperável", errorSchema) },
        },
      },
      "/materials/{materialId}/index-versions/{versionId}/revisions": {
        post: {
          operationId: "reviseMaterialIndex", summary: "Salvar correções como nova versão", security: protectedSecurity,
          parameters: [{ name: "materialId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "201": response("Nova versão de revisão"), "400": response("Correções inválidas", errorSchema), "404": response("Material ou versão ausente", errorSchema) },
        },
      },
      "/materials/{materialId}/index-versions/{versionId}/approval": {
        post: {
          operationId: "approveMaterialIndex", summary: "Aprovar explicitamente uma versão válida", security: protectedSecurity,
          parameters: [{ name: "materialId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
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
        AcceptedDocument: acceptedDocumentSchema,
        Error: errorSchema,
      },
    },
  } as const;
}

export const projectApiDocument = createProjectApiDocument("https://identity.example.invalid/.well-known/openid-configuration");
