import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { createProjectSchema, type CreateProjectInput } from "@planejador/contracts";
import { useArchiveProjectMutation, useCreateProjectMutation, useDuplicateProjectMutation, useListProjectsQuery, type Project } from "../state.ts";

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
  const [status, setStatus] = useState<Project["status"]>(() => new URLSearchParams(window.location.search).get("projects") === "archived" ? "archived" : "active");
  const [pendingArchive, setPendingArchive] = useState<Project>();
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const archiveTrigger = useRef<HTMLButtonElement | undefined>(undefined);
  const activeFilter = useRef<HTMLButtonElement>(null);
  const { data = [], isLoading, isError } = useListProjectsQuery(status);
  const [archiveProject, archiveRequest] = useArchiveProjectMutation();
  const [duplicateProject, duplicateRequest] = useDuplicateProjectMutation();
  useEffect(() => {
    if (!pendingArchive) return;
    dialog.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPendingArchive(undefined); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (archiveTrigger.current?.isConnected) archiveTrigger.current.focus();
    };
  }, [pendingArchive]);
  const chooseStatus = (next: Project["status"]) => {
    const search = new URLSearchParams(window.location.search);
    if (next === "archived") search.set("projects", "archived"); else search.delete("projects");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search.size ? `?${search}` : ""}${window.location.hash}`);
    setStatus(next);
    setMessage("");
  };
  const confirmArchive = async () => {
    if (!pendingArchive) return;
    try {
      await archiveProject(pendingArchive.id).unwrap();
      setPendingArchive(undefined);
      setMessage("Projeto arquivado. Consulte-o em Projetos Arquivados.");
      activeFilter.current?.focus();
    } catch {
      setMessage("Não foi possível arquivar o projeto. Tente novamente.");
    }
  };
  const duplicate = async (project: Project) => {
    try {
      await duplicateProject({ projectId: project.id, idempotencyKey: crypto.randomUUID() }).unwrap();
      setMessage("Duplicata criada. Ela já está em Projetos Ativos.");
    } catch {
      setMessage("Não foi possível duplicar o projeto. Tente novamente.");
    }
  };
  const controls = <div className="project-filters" role="group" aria-label="Filtrar projetos">
    <button ref={activeFilter} type="button" aria-pressed={status === "active"} onClick={() => chooseStatus("active")}>Projetos Ativos</button>
    <button type="button" aria-pressed={status === "archived"} onClick={() => chooseStatus("archived")}>Projetos Arquivados</button>
  </div>;
  if (isLoading) return <>{controls}<p role="status">Carregando Projetos…</p></>;
  if (isError) return <>{controls}<p role="alert">Não foi possível carregar seus projetos. Atualize a página.</p></>;
  return (
    <section className="project-lifecycle" aria-label="Ciclo de vida dos projetos">
      {controls}
      {data.length === 0 ? <p className="empty-projects">{status === "active" ? "Seu primeiro projeto aparecerá aqui." : "Nenhum projeto foi arquivado."}</p> :
        <ul className="project-shelf" aria-label={status === "active" ? "Projetos ativos" : "Projetos arquivados"}>
          {data.map((project) => (
            <li key={project.id}>
              <div className="project-summary">
                <span>{project.concurso}</span>
                <strong>{project.cargo}</strong>
                <small>{project.area}</small>
                {project.sourceProjectId ? <em>Cópia rastreável</em> : null}
              </div>
              <div className="project-actions">
                <button type="button" disabled={duplicateRequest.isLoading} onClick={() => void duplicate(project)} aria-label={`Duplicar ${project.concurso}`}>Duplicar</button>
                {status === "active" ? <button type="button" className="archive-action" disabled={archiveRequest.isLoading} onClick={(event) => { archiveTrigger.current = event.currentTarget; setPendingArchive(project); }} aria-label={`Arquivar ${project.concurso}`}>Arquivar</button> : null}
              </div>
            </li>
          ))}
        </ul>}
      <p className="lifecycle-status" role={message.startsWith("Não") ? "alert" : "status"} aria-live="polite">{message}</p>
      {pendingArchive ? <div className="dialog-scrim">
        <section ref={dialog} tabIndex={-1} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-dialog-title" aria-describedby="archive-dialog-description">
          <p className="sheet-label">MOVER PARA O ARQUIVO</p>
          <h3 id="archive-dialog-title">Arquivar Projeto</h3>
          <p id="archive-dialog-description"><strong>{pendingArchive.concurso}</strong> sairá dos projetos ativos, mas continuará consultável com todo o histórico.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setPendingArchive(undefined)}>Manter Ativo</button>
            <button type="button" className="confirm-archive" disabled={archiveRequest.isLoading} onClick={() => void confirmArchive()}>{archiveRequest.isLoading ? "Arquivando…" : "Confirmar Arquivamento"}</button>
          </div>
        </section>
      </div> : null}
    </section>
  );
}

export const ProjectComposer = { Provider, Field, Submit, Status, ProjectShelf };
