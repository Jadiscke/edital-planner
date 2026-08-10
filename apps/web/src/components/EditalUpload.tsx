import { useEffect, useRef, useState } from "react";

import { useGetProcessingJobQuery, useGetVerticalizationQuery, useListProjectsQuery, useUploadEditalMutation } from "../state.ts";
import type { VerticalizationTree } from "../state.ts";

const STATUS_COPY = {
  pending: "Edital recebido. Aguardando processamento.",
  processing: "Verificando e organizando o edital…",
  completed: "Edital verticalizado com evidência.",
  failed_recoverable: "Processamento interrompido. Tente enviar novamente.",
  failed_invalid_output: "A extração não passou pela validação. Nenhuma árvore foi publicada.",
} as const;
const PROCESSING_JOB_STORAGE_PREFIX = "planejador:v1:processing-job";

function storedJobId(projectId: string): string {
  try {
    return globalThis.localStorage?.getItem(`${PROCESSING_JOB_STORAGE_PREFIX}:${projectId}`) ?? "";
  } catch {
    return "";
  }
}

function rememberJobId(projectId: string, jobId: string): void {
  try {
    globalThis.localStorage?.setItem(`${PROCESSING_JOB_STORAGE_PREFIX}:${projectId}`, jobId);
  } catch {
    // Status polling still works in this session when browser storage is unavailable.
  }
}

export function EditalUpload({ onVerticalization }: { onVerticalization?: (tree: VerticalizationTree) => void }) {
  const { data: projects = [] } = useListProjectsQuery();
  const project = projects[0];
  const [file, setFile] = useState<File>();
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(false);
  const [upload, uploadState] = useUploadEditalMutation();
  const idempotency = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const job = useGetProcessingJobQuery(jobId, {
    skip: jobId.length === 0,
    pollingInterval: jobId.length === 0 || !shouldPoll ? 0 : 500,
    skipPollingIfUnfocused: true,
    refetchOnMountOrArgChange: true,
  });
  const statusRef = useRef<HTMLParagraphElement>(null);
  const verticalization = useGetVerticalizationQuery(job.data?.documentVersionId ?? "", { skip: job.data?.status !== "completed" });

  useEffect(() => {
    const restoredJobId = project ? storedJobId(project.id) : "";
    setJobId(restoredJobId);
    setShouldPoll(restoredJobId.length > 0);
  }, [project?.id]);
  useEffect(() => {
    if (!job.data) return;
    setMessage(STATUS_COPY[job.data.status]);
    setIsError(job.data.status === "failed_recoverable");
    setShouldPoll(job.data.status === "pending" || job.data.status === "processing");
  }, [job.data]);
  useEffect(() => { if (isError) statusRef.current?.focus(); }, [isError, message]);
  useEffect(() => {
    if (verticalization.data?.subjects?.length) onVerticalization?.(verticalization.data);
  }, [onVerticalization, verticalization.data]);

  const submit = async () => {
    if (!project) {
      setIsError(true);
      setMessage("Crie um projeto antes de enviar o edital.");
      return;
    }
    if (!file) {
      setIsError(true);
      setMessage("Selecione um arquivo PDF para continuar.");
      return;
    }
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    if (idempotency.current?.fingerprint !== fingerprint) idempotency.current = { fingerprint, key: crypto.randomUUID() };
    setIsError(false);
    setMessage("Enviando edital…");
    try {
      const accepted = await upload({ projectId: project.id, file, idempotencyKey: idempotency.current.key }).unwrap();
      setJobId(accepted.job.id);
      setShouldPoll(accepted.job.status === "pending" || accepted.job.status === "processing");
      rememberJobId(project.id, accepted.job.id);
      setMessage(STATUS_COPY[accepted.job.status]);
    } catch (reason) {
      const response = reason as { data?: { message?: string } };
      setIsError(true);
      setMessage(response.data?.message ?? "Não foi possível enviar o edital. Tente novamente.");
    }
  };

  return (
    <section className="edital-upload" aria-labelledby="edital-upload-title">
      <div>
        <p className="upload-kicker">Documento Oficial</p>
        <h2 id="edital-upload-title">Anexar Edital</h2>
        <p>PDF sem senha, com até 5&nbsp;MB. O original fica privado e versionado.</p>
      </div>
      <label className="file-picker-label" htmlFor="edital-file">Arquivo do edital em PDF</label>
      <div className="file-picker">
        <input
          id="edital-file"
          name="edital-file"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            setFile(event.target.files?.[0]);
            setMessage("");
            setIsError(false);
          }}
        />
        <strong>{file?.name ?? "Selecionar PDF"}</strong>
      </div>
      <button className="upload-action" type="button" disabled={uploadState.isLoading} onClick={() => { void submit(); }}>
        {uploadState.isLoading ? "Enviando…" : "Enviar Edital"}
      </button>
      <p ref={statusRef} tabIndex={-1} className="upload-status" role={isError ? "alert" : "status"} aria-live="polite">{message}</p>
      {job.data ? <small className="job-correlation">Correlação: <span translate="no">{job.data.correlationId}</span></small> : null}
    </section>
  );
}
