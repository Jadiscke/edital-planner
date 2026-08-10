import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { createProjectSchema, type CreateProjectInput } from "@planejador/contracts";
import { useCreateProjectMutation, useListProjectsQuery } from "../state.ts";

function Provider({ children }: { children: ReactNode }) {
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { concurso: "", cargo: "", area: "" },
    mode: "onSubmit",
  });
  const [createProject, request] = useCreateProjectMutation();
  const [success, setSuccess] = useState("");
  const pendingIdempotency = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [form.formState.isDirty]);
  const submit = form.handleSubmit(async (input) => {
    setSuccess("");
    const fingerprint = JSON.stringify(input);
    if (pendingIdempotency.current?.fingerprint !== fingerprint) {
      pendingIdempotency.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      await createProject({ body: input, idempotencyKey: pendingIdempotency.current.key }).unwrap();
      pendingIdempotency.current = undefined;
      setSuccess("Projeto criado. Sua trilha já está salva.");
      form.reset();
    } catch (reason) {
      const response = reason as { data?: { fieldErrors?: Record<string, string> } };
      let shouldFocus = true;
      for (const [field, message] of Object.entries(response.data?.fieldErrors ?? {})) {
        if (field === "concurso" || field === "cargo" || field === "area") {
          form.setError(field, { message }, { shouldFocus });
          shouldFocus = false;
        }
      }
      if (!response.data?.fieldErrors) form.setError("root", { message: "Não foi possível criar o projeto. Tente novamente." });
    }
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate data-submitting={request.isLoading || undefined}>
        {children}
        <p className="creation-success" role="status" aria-live="polite">{success}</p>
      </form>
    </FormProvider>
  );
}

function Field({ name, label, example }: { name: keyof CreateProjectInput; label: string; example: string }) {
  const { register, formState } = useFormContext<CreateProjectInput>();
  const error = formState.errors[name]?.message;
  const errorId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        {...register(name)}
        id={name}
        name={name}
        type="text"
        autoComplete="off"
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errorId : undefined}
        placeholder={`Ex.: ${example}…`}
      />
      <p id={errorId} className="field-error" aria-live="polite">{error ?? "\u00a0"}</p>
    </div>
  );
}

function Submit({ children = "Criar Minha Trilha" }: { children?: ReactNode }) {
  const { formState } = useFormContext<CreateProjectInput>();
  return <button className="primary-action" type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? "Criando…" : children}</button>;
}

function Status() {
  const { formState } = useFormContext<CreateProjectInput>();
  const summary = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (formState.errors.root) summary.current?.focus(); }, [formState.errors.root]);
  return <p ref={summary} tabIndex={-1} className="form-status" role={formState.errors.root ? "alert" : "status"} aria-live="polite">{formState.errors.root?.message ?? "Seus dados ficam vinculados apenas à sua conta."}</p>;
}

function ProjectShelf() {
  const { data = [], isLoading, isError } = useListProjectsQuery();
  if (isLoading) return <p role="status">Carregando Projetos…</p>;
  if (isError) return <p role="alert">Não foi possível carregar seus projetos. Atualize a página.</p>;
  if (data.length === 0) return <p className="empty-projects">Seu primeiro projeto aparecerá aqui.</p>;
  return (
    <ul className="project-shelf" aria-label="Seus projetos">
      {data.map((project) => (
        <li key={project.id}>
          <span>{project.concurso}</span>
          <strong>{project.cargo}</strong>
          <small>{project.area}</small>
        </li>
      ))}
    </ul>
  );
}

export const ProjectComposer = { Provider, Field, Submit, Status, ProjectShelf };
