import { configureStore } from "@reduxjs/toolkit";
import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import { API_URL } from "./config.ts";

export interface Project {
  id: string;
  concurso: string;
  cargo: string;
  area: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
  archivedAt?: string;
  sourceProjectId?: string;
}

export interface ProjectDraft {
  concurso: string;
  cargo: string;
  area: string;
}

export interface ProcessingJob {
  id: string;
  kind: "document_verticalization" | "material_index_extraction";
  documentVersionId?: string;
  materialId?: string;
  sourceFilename?: string;
  resultVersionId?: string;
  projectId: string;
  status: "pending" | "processing" | "completed" | "needs_review" | "failed_recoverable" | "failed_invalid_output";
  correlationId: string;
  errorCode?: string;
  reviewReasons?: ("low_evidence" | "cost_limit_exceeded" | "cost_unavailable")[];
  createdAt: string;
  updatedAt: string;
}

export interface AcceptedDocument {
  documentVersion: { id: string; projectId: string; versionNumber: number; filename: string; sha256: string; sizeBytes: number; createdAt: string };
  job: ProcessingJob;
}
export interface AcceptedMaterialIndexJob { job: ProcessingJob }
export interface MaterialIndexItem { id: string; parentId: string | null; title: string; startPage: number; endPage: number; sourcePage: number; sourceId?: string }
export interface MaterialIndexSource {
  id: string;
  sourceKind: "pdf" | "image";
  sourceFilename: string;
  pageOffset: number;
  status: "extracted" | "failed";
  errorCode?: string;
}
export interface MaterialIndexVersion { id: string; materialId: string; versionNumber: number; sourceKind: "manual" | "pdf" | "image"; sourceFilename?: string; pageOffset: number; sources: MaterialIndexSource[]; items: MaterialIndexItem[]; status: "invalid" | "in_review" | "approved"; validationIssues: string[]; createdAt: string; approvedAt?: string }
export interface Material { id: string; projectId: string; title: string; edition: string; versions: MaterialIndexVersion[]; createdAt: string; updatedAt: string }

export interface VerticalizationEvidence { page: number; text: string; boundingBox: { x: number; y: number; width: number; height: number } | null }
export interface VerticalizationNode { originalName: string; normalizedName: string; confidence: number; evidence: VerticalizationEvidence[] }
export interface VerticalizationTopic extends VerticalizationNode { subtopics: VerticalizationNode[] }
export type ExamOptionKind = "cargo" | "emprego" | "funcao" | "posto_trabalho" | "perfil" | "especialidade" | "area" | "area_atuacao" | "enfase" | "opcao" | "codigo_opcao" | "bloco_tematico" | "eixo_tematico";
export interface ExamOption { id: string; kind: ExamOptionKind; label: string; name: string; code: string | null; evidence: VerticalizationEvidence[] }
export interface VerticalizationSubject extends VerticalizationNode { examOptionIds: string[]; topics: VerticalizationTopic[] }
export interface VerticalizationTree {
  id: string; projectId: string; documentVersionId: string; documentVersionNumber: number;
  contest: { name: string; role: string; area: string }; examOptions: ExamOption[]; subjects: VerticalizationSubject[]; warnings: string[]; createdAt: string;
  execution: { requestId: string; promptVersion: string; model: string; provider: string | null; promptTokens: number; completionTokens: number; totalTokens: number; cost: number | null; latencyMs: number };
}

interface ApiRequest {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

const apiBaseQuery: BaseQueryFn<string | ApiRequest> = async (request, api) => {
  const details = typeof request === "string" ? { url: request } : request;
  try {
    const response = await fetch(`${API_URL}${details.url}`, {
      method: details.method ?? "GET",
      headers: {
        ...(details.body === undefined ? {} : { "content-type": "application/json" }),
        ...details.headers,
      },
      ...(details.body === undefined ? {} : { body: JSON.stringify(details.body) }),
      signal: api.signal,
      credentials: "include",
    });
    const data = await response.json();
    return response.ok ? { data } : { error: { status: response.status, data } };
  } catch (error) {
    return { error: { status: "FETCH_ERROR", error: error instanceof Error ? error.message : "Request failed" } };
  }
};

export const projectsApi = createApi({
  reducerPath: "projectsApi",
  tagTypes: ["Project", "Material"],
  baseQuery: apiBaseQuery,
  endpoints: (build) => ({
    listProjects: build.query<Project[], Project["status"] | void>({
      query: (status = "active") => status === "archived" ? "/projects?status=archived" : "/projects",
      providesTags: ["Project"],
    }),
    archiveProject: build.mutation<Project, string>({
      query: (projectId) => ({ url: `/projects/${projectId}/archive`, method: "POST" }),
      invalidatesTags: ["Project"],
    }),
    duplicateProject: build.mutation<Project, { projectId: string; idempotencyKey: string }>({
      query: ({ projectId, idempotencyKey }) => ({
        url: `/projects/${projectId}/duplicates`, method: "POST", headers: { "Idempotency-Key": idempotencyKey },
      }),
      invalidatesTags: ["Project"],
    }),
    createProject: build.mutation<Project, { body: ProjectDraft; idempotencyKey: string }>({
      query: ({ body, idempotencyKey }) => ({
        url: "/projects",
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
      invalidatesTags: ["Project"],
    }),
    uploadEdital: build.mutation<AcceptedDocument, { projectId: string; file: File; idempotencyKey: string; processingMode: "fixture" | "full" }>({
      queryFn: async ({ projectId, file, idempotencyKey, processingMode }, api) => {
        try {
          const response = await fetch(`${API_URL}/projects/${projectId}/editais`, {
            method: "POST",
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
              "idempotency-key": idempotencyKey,
              "x-processing-mode": processingMode,
            },
            body: await new Response(file).arrayBuffer(),
            signal: api.signal,
            credentials: "include",
          });
          const data = await response.json();
          return response.ok ? { data } : { error: { status: response.status, data } };
        } catch (error) {
          return { error: { status: "FETCH_ERROR", error: error instanceof Error ? error.message : "Request failed" } };
        }
      },
    }),
    getProcessingJob: build.query<ProcessingJob, string>({
      query: (jobId) => `/processing-jobs/${jobId}`,
    }),
    getMaterial: build.query<Material, string>({
      query: (materialId) => `/materials/${materialId}`,
    }),
    listMaterials: build.query<Material[], string>({
      query: (projectId) => `/projects/${projectId}/materials`,
      providesTags: ["Material"],
    }),
    getVerticalization: build.query<VerticalizationTree, string>({
      query: (documentVersionId) => `/document-versions/${documentVersionId}/verticalization`,
    }),
    createMaterial: build.mutation<Material, { projectId: string; title: string; edition: string; idempotencyKey: string }>({
      query: ({ projectId, title, edition, idempotencyKey }) => ({ url: `/projects/${projectId}/materials`, method: "POST", body: { title, edition }, headers: { "Idempotency-Key": idempotencyKey } }),
      invalidatesTags: ["Material"],
    }),
    importMaterialIndex: build.mutation<MaterialIndexVersion | AcceptedMaterialIndexJob, { materialId: string; idempotencyKey: string; body: Record<string, unknown> }>({
      query: ({ materialId, idempotencyKey, body }) => ({ url: `/materials/${materialId}/index-versions`, method: "POST", body, headers: { "Idempotency-Key": idempotencyKey } }),
    }),
    reviseMaterialIndex: build.mutation<MaterialIndexVersion, { materialId: string; versionId: string; idempotencyKey: string; pageOffset: number; items: MaterialIndexItem[] }>({
      query: ({ materialId, versionId, idempotencyKey, ...body }) => ({ url: `/materials/${materialId}/index-versions/${versionId}/revisions`, method: "POST", body, headers: { "Idempotency-Key": idempotencyKey } }),
    }),
    approveMaterialIndex: build.mutation<MaterialIndexVersion, { materialId: string; versionId: string; idempotencyKey: string }>({
      query: ({ materialId, versionId, idempotencyKey }) => ({ url: `/materials/${materialId}/index-versions/${versionId}/approval`, method: "POST", headers: { "Idempotency-Key": idempotencyKey } }),
    }),
  }),
});

export const {
  useArchiveProjectMutation,
  useApproveMaterialIndexMutation,
  useCreateMaterialMutation,
  useCreateProjectMutation,
  useDuplicateProjectMutation,
  useGetProcessingJobQuery,
  useLazyGetMaterialQuery,
  useLazyGetProcessingJobQuery,
  useGetVerticalizationQuery,
  useImportMaterialIndexMutation,
  useListMaterialsQuery,
  useListProjectsQuery,
  useReviseMaterialIndexMutation,
  useUploadEditalMutation,
} = projectsApi;

export function createAppStore() {
  return configureStore({
    reducer: { [projectsApi.reducerPath]: projectsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(projectsApi.middleware),
  });
}
