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
}

export interface ProjectDraft {
  concurso: string;
  cargo: string;
  area: string;
}

export interface ProcessingJob {
  id: string;
  documentVersionId: string;
  projectId: string;
  status: "pending" | "processing" | "completed" | "failed_recoverable";
  correlationId: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptedDocument {
  documentVersion: { id: string; projectId: string; versionNumber: number; filename: string; sha256: string; sizeBytes: number; createdAt: string };
  job: ProcessingJob;
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
  tagTypes: ["Project"],
  baseQuery: apiBaseQuery,
  endpoints: (build) => ({
    listProjects: build.query<Project[], void>({
      query: () => "/projects",
      providesTags: ["Project"],
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
    uploadEdital: build.mutation<AcceptedDocument, { projectId: string; file: File; idempotencyKey: string }>({
      queryFn: async ({ projectId, file, idempotencyKey }, api) => {
        try {
          const response = await fetch(`${API_URL}/projects/${projectId}/editais`, {
            method: "POST",
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
              "idempotency-key": idempotencyKey,
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
  }),
});

export const { useCreateProjectMutation, useGetProcessingJobQuery, useListProjectsQuery, useUploadEditalMutation } = projectsApi;

export function createAppStore() {
  return configureStore({
    reducer: { [projectsApi.reducerPath]: projectsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(projectsApi.middleware),
  });
}
