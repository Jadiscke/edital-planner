import { useEffect, useRef, useState } from "react";

import { API_URL } from "../config.ts";
import { useGetProcessingJobQuery, useGetVerticalizationQuery, useListProjectsQuery, useUploadEditalMutation } from "../state.ts";
import type { ProcessingJob, VerticalizationTree } from "../state.ts";

interface TestEdital {
  readonly id: string;
  readonly label: string;
  readonly filename: string;
  readonly organization: string;
  readonly structure: string;
  readonly sourceUrl: string;
}

const STATUS_COPY = {
  pending: "Edital recebido. Aguardando processamento.",
  processing: "Verificando e organizando o edital…",
  completed: "Edital verticalizado com evidência.",
  needs_review: "Revisão humana necessária.",
  failed_recoverable: "Processamento interrompido. Tente enviar novamente.",
  failed_invalid_output: "A extração não passou pela validação. Nenhuma árvore foi publicada.",
} as const;
const PROCESSING_JOB_STORAGE_PREFIX = "planejador:v1:processing-job";

function jobStatusCopy(job: ProcessingJob): string {
  if (job.errorCode === "provider_timeout") return "O provedor excedeu o tempo limite. Nenhuma repetição automática foi cobrada; inicie um novo processamento quando quiser tentar novamente.";
  return STATUS_COPY[job.status];
}

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

function forgetJobId(projectId: string): void {
  try {
    globalThis.localStorage?.removeItem(`${PROCESSING_JOB_STORAGE_PREFIX}:${projectId}`);
  } catch {
    // A missing browser storage entry does not prevent a fresh upload.
  }
}

export function EditalUpload({ onVerticalization }: { onVerticalization?: (tree: VerticalizationTree) => void }) {
  const { data: projects = [] } = useListProjectsQuery();
  const project = projects[0];
  const [file, setFile] = useState<File>();
  const [processingMode, setProcessingMode] = useState<"fixture" | "full">("fixture");
  const [testEditals, setTestEditals] = useState<TestEdital[]>([]);
  const [selectedTestEditalId, setSelectedTestEditalId] = useState("");
  const [isLoadingTestEdital, setIsLoadingTestEdital] = useState(false);
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
  const jobErrorStatus = (job.error as { status?: unknown } | undefined)?.status;
  const hasPollingError = jobId.length > 0 && job.isError && jobErrorStatus !== 404;
  const statusRef = useRef<HTMLParagraphElement>(null);
  const verticalization = useGetVerticalizationQuery(job.data?.documentVersionId ?? "", { skip: job.data?.status !== "completed" });

  useEffect(() => {
    const restoredJobId = project ? storedJobId(project.id) : "";
    setJobId(restoredJobId);
    setShouldPoll(restoredJobId.length > 0);
  }, [project?.id]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    void fetch(`${API_URL}/development/test-editals`, { credentials: "include", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<TestEdital[]> : [])
      .then((editals) => {
        setTestEditals(editals);
        setSelectedTestEditalId((current) => current || editals[0]?.id || "");
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setTestEditals([]); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!job.data) return;
    setMessage(jobStatusCopy(job.data));
    setIsError(job.data.status === "failed_recoverable" || job.data.status === "failed_invalid_output");
    setShouldPoll(job.data.status === "pending" || job.data.status === "processing");
  }, [job.data]);
  useEffect(() => {
    const responseStatus = (job.error as { status?: unknown } | undefined)?.status;
    if (!project || !job.isError || responseStatus !== 404) return;
    forgetJobId(project.id);
    setJobId("");
    setShouldPoll(false);
    setIsError(true);
    setMessage("O processamento anterior não está mais disponível. Envie o PDF novamente para iniciar uma nova tentativa.");
  }, [job.error, job.isError, project]);
  useEffect(() => {
    const responseStatus = (job.error as { status?: unknown } | undefined)?.status;
    if (!jobId || !job.isError || responseStatus === 404) return;
    setShouldPoll(false);
    setIsError(true);
    setMessage("Não foi possível atualizar o andamento. Seu edital continua registrado; apenas não conseguimos consultar o status agora. Verifique sua conexão e tente novamente.");
  }, [job.error, job.isError, jobId]);
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
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}:${processingMode}`;
    const previousAttemptFailed = job.data?.status === "failed_recoverable" || job.data?.status === "failed_invalid_output";
    if (idempotency.current?.fingerprint !== fingerprint || previousAttemptFailed) idempotency.current = { fingerprint, key: crypto.randomUUID() };
    setIsError(false);
    setMessage("Enviando edital…");
    try {
      const accepted = await upload({ projectId: project.id, file, idempotencyKey: idempotency.current.key, processingMode }).unwrap();
      setJobId(accepted.job.id);
      setShouldPoll(accepted.job.status === "pending" || accepted.job.status === "processing");
      rememberJobId(project.id, accepted.job.id);
      setMessage(jobStatusCopy(accepted.job));
    } catch (reason) {
      const response = reason as { data?: { message?: string } };
      setIsError(true);
      setMessage(response.data?.message ?? "Não foi possível enviar o edital. Tente novamente.");
    }
  };

  const loadTestEdital = async () => {
    const edital = testEditals.find((candidate) => candidate.id === selectedTestEditalId);
    if (!edital) return;
    setIsLoadingTestEdital(true);
    setIsError(false);
    setMessage("Carregando edital de teste…");
    try {
      const response = await fetch(`${API_URL}/development/test-editals/${edital.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("test edital unavailable");
      const bytes = await response.blob();
      setFile(new File([bytes], edital.filename, { type: "application/pdf", lastModified: 0 }));
      setProcessingMode("full");
      setMessage("Edital de teste carregado. O processamento completo foi selecionado.");
    } catch {
      setIsError(true);
      setMessage("Não foi possível carregar o edital de teste local.");
    } finally {
      setIsLoadingTestEdital(false);
    }
  };

  const selectedTestEdital = testEditals.find((candidate) => candidate.id === selectedTestEditalId);

  return (
    <section className="edital-upload" aria-labelledby="edital-upload-title">
      <div>
        <p className="upload-kicker">Documento Oficial</p>
        <h2 id="edital-upload-title">Anexar Edital</h2>
        <p>PDF sem senha, com até 5&nbsp;MB. O original fica privado e versionado.</p>
      </div>
      {import.meta.env.DEV ? <fieldset className="processing-mode">
        <legend>Como processar neste ambiente local?</legend>
        <label>
          <input type="radio" name="processing-mode" value="fixture" checked={processingMode === "fixture"} onChange={() => setProcessingMode("fixture")} />
          <span><strong>Usar Fixture de Teste</strong><small>Resposta rápida e determinística para desenvolver a interface.</small></span>
        </label>
        <label>
          <input type="radio" name="processing-mode" value="full" checked={processingMode === "full"} onChange={() => setProcessingMode("full")} />
          <span><strong>Processar Edital Completo</strong><small>PDFs digitais são processados localmente, sem custo; apenas PDFs escaneados usam a IA.</small></span>
        </label>
      </fieldset> : null}
      {import.meta.env.DEV && testEditals.length > 0 ? <section className="test-edital-picker" aria-labelledby="test-edital-title">
        <div>
          <strong id="test-edital-title">Biblioteca de editais oficiais</strong>
          <small>Escolha um caso real para testar o parser local sem procurar o arquivo no computador.</small>
        </div>
        <label htmlFor="test-edital">Edital oficial para teste</label>
        <select id="test-edital" name="test-edital" value={selectedTestEditalId} onChange={(event) => setSelectedTestEditalId(event.target.value)}>
          {testEditals.map((edital) => <option key={edital.id} value={edital.id}>{edital.label}</option>)}
        </select>
        {selectedTestEdital ? <p><strong>{selectedTestEdital.organization}</strong><span>{selectedTestEdital.structure}</span><a href={selectedTestEdital.sourceUrl} target="_blank" rel="noreferrer">Ver fonte oficial</a></p> : null}
        <button type="button" className="test-edital-action" disabled={isLoadingTestEdital} onClick={() => { void loadTestEdital(); }}>
          {isLoadingTestEdital ? "Carregando…" : "Usar edital de teste"}
        </button>
      </section> : null}
      <label className="file-picker-label" htmlFor="edital-file">Arquivo do edital em PDF</label>
      <div className="file-picker">
        <input
          className="file-input"
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
        <label className="file-trigger" htmlFor="edital-file">Selecionar PDF</label>
        <strong>{file?.name ?? "Nenhum arquivo selecionado"}</strong>
      </div>
      {!hasPollingError ? <button className="upload-action" type="button" disabled={uploadState.isLoading} onClick={() => { void submit(); }}>
        {uploadState.isLoading ? "Enviando…" : job.data?.status === "failed_recoverable" || job.data?.status === "failed_invalid_output" ? "Tentar Novo Processamento" : processingMode === "full" ? "Enviar Edital Completo" : "Enviar Edital"}
      </button> : null}
      <div className={hasPollingError ? "upload-feedback upload-feedback--recovery" : "upload-feedback"}>
        <p ref={statusRef} tabIndex={-1} className="upload-status" role={isError ? "alert" : "status"} aria-live="polite">{message}</p>
      {hasPollingError ? (
        <button
          type="button"
          className="status-retry-action"
          onClick={() => {
            setIsError(false);
            setMessage("Atualizando andamento…");
            void job.refetch();
          }}
        >
          Tentar Atualizar Status
        </button>
      ) : null}
      </div>
      {job.data?.status === "needs_review" ? <aside className="review-notice" aria-labelledby="review-notice-title">
        <h3 id="review-notice-title">Revisão humana necessária</h3>
        <ul>
          {job.data.reviewReasons?.includes("low_evidence") ? <li>Há itens com evidência abaixo do limite configurado.</li> : null}
          {job.data.reviewReasons?.includes("cost_limit_exceeded") ? <li>O custo ficou acima do limite configurado.</li> : null}
          {job.data.reviewReasons?.includes("cost_unavailable") ? <li>O provedor não informou o custo da execução.</li> : null}
        </ul>
        <small>Conteúdo gerado por IA não equivale a aprovação. Confira as evidências antes de usar a árvore.</small>
      </aside> : null}
      {job.data ? <small className="job-correlation">Correlação: <span translate="no">{job.data.correlationId}</span></small> : null}
    </section>
  );
}
