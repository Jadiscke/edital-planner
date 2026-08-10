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
  }),
});

export const { useCreateProjectMutation, useListProjectsQuery } = projectsApi;

export function createAppStore() {
  return configureStore({
    reducer: { [projectsApi.reducerPath]: projectsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(projectsApi.middleware),
  });
}
