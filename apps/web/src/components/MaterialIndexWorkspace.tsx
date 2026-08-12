import { useEffect, useMemo, useRef, useState } from "react";
import { useApproveMaterialIndexMutation, useCreateMaterialMutation, useImportMaterialIndexMutation, useLazyGetMaterialQuery, useLazyGetProcessingJobQuery, useListMaterialsQuery, useListProjectsQuery, useReviseMaterialIndexMutation, type AcceptedMaterialIndexJob, type Material, type MaterialIndexItem, type MaterialIndexVersion, type ProcessingJob } from "../state.ts";

const emptyItem = (number: number): MaterialIndexItem => ({ id: `item-${number}`, parentId: null, title: "", startPage: 1, endPage: 1, sourcePage: 1 });
function message(reason: unknown) { return (reason as { data?: { message?: string } })?.data?.message ?? "Não foi possível concluir. Revise os dados e tente novamente."; }
async function base64(file: File) { const bytes = new Uint8Array(await new Response(file).arrayBuffer()); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

export function MaterialIndexWorkspace() {
  const { data: projects = [] } = useListProjectsQuery(); const project = projects[0];
  const { data: savedMaterials = [] } = useListMaterialsQuery(project?.id ?? "", { skip: !project });
  const [create, creating] = useCreateMaterialMutation(); const [importIndex, importing] = useImportMaterialIndexMutation(); const [revise, revising] = useReviseMaterialIndexMutation(); const [approve, approving] = useApproveMaterialIndexMutation();
  const [getJob] = useLazyGetProcessingJobQuery(); const [getMaterial] = useLazyGetMaterialQuery();
  const [title, setTitle] = useState(""); const [edition, setEdition] = useState(""); const [material, setMaterial] = useState<Material>();
  const [mode, setMode] = useState<"manual" | "file">(); const [files, setFiles] = useState<File[]>([]); const [items, setItems] = useState<MaterialIndexItem[]>([emptyItem(1)]); const [offset, setOffset] = useState(0); const [version, setVersion] = useState<MaterialIndexVersion>(); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  const [processing, setProcessing] = useState<{ filename: string; current: number; total: number; phase: "sending" | "pending" | "processing" }>();
  const feedback = useRef<HTMLParagraphElement>(null);
  const sources = version?.sources ?? [];
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  useEffect(() => {
    const saved = savedMaterials[0];
    if (!material && saved) {
      const latestVersion = (saved.versions ?? []).at(-1);
      setMaterial(saved);
      setVersion(latestVersion);
      if (latestVersion) setMode(latestVersion.sourceKind === "manual" ? "manual" : "file");
      setStatus(latestVersion ? `Versão ${latestVersion.versionNumber} restaurada para revisão.` : "Material restaurado. Escolha como informar o índice.");
    }
  }, [material, savedMaterials]);
  useEffect(() => { if (version) { setItems(version.items); setOffset(version.pageOffset); } }, [version]);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  useEffect(() => { const protect = (event: BeforeUnloadEvent) => { if ((title || edition || material || files.length > 0) && version?.status !== "approved") event.preventDefault(); }; window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect); }, [title, edition, files.length, material, version?.status]);
  if (!project) return null;
  const register = async () => { setError(""); if (!title.trim() || !edition.trim()) { setError("Informe título e edição do material."); return; } try { setMaterial(await create({ projectId: project.id, title, edition, idempotencyKey: crypto.randomUUID() }).unwrap()); setStatus("Material cadastrado. Escolha como informar o índice."); } catch (reason) { setError(message(reason)); } };
  const waitForJob = async (accepted: AcceptedMaterialIndexJob): Promise<ProcessingJob> => {
    let job = accepted.job;
    while (job.status === "pending" || job.status === "processing") {
      const phase = job.status === "pending" ? "pending" : "processing";
      setProcessing((current) => current ? { ...current, phase } : current);
      await new Promise((resolve) => setTimeout(resolve, 250));
      job = await getJob(job.id, false).unwrap();
    }
    return job;
  };
  const prepare = async () => { if (!material) return; setError(""); try {
    if (mode === "manual") {
      const next = await importIndex({ materialId: material.id, idempotencyKey: crypto.randomUUID(), body: { sourceKind: "manual", pageOffset: offset, items } }).unwrap() as MaterialIndexVersion;
      setVersion(next); setStatus(next.status === "invalid" ? "A extração precisa de correções antes da aprovação." : `Versão ${next.versionNumber} pronta para sua revisão.`); return;
    }
    if (files.length === 0) { setError("Selecione somente as páginas do índice em PDF ou imagem."); return; }
    let accumulated = version;
    for (const [index, file] of files.entries()) {
      setProcessing({ filename: file.name, current: index + 1, total: files.length, phase: "sending" });
      setStatus(`Extraindo arquivo ${index + 1} de ${files.length}: ${file.name}…`);
      const accepted = await importIndex({ materialId: material.id, idempotencyKey: crypto.randomUUID(), body: {
        sourceKind: file.type === "application/pdf" ? "pdf" : "image", sourceFilename: file.name, mimeType: file.type,
        base64: await base64(file), pageOffset: offset, ...(accumulated ? { basedOnVersionId: accumulated.id } : {}),
      } }).unwrap() as AcceptedMaterialIndexJob;
      const job = await waitForJob(accepted);
      if (!job.resultVersionId) throw new Error(job.errorCode ?? "processing_failed");
      const refreshed = await getMaterial(material.id, false).unwrap();
      accumulated = refreshed.versions.find((candidate) => candidate.id === job.resultVersionId);
      if (!accumulated) throw new Error("result_version_missing");
    }
    if (!accumulated) return;
    const accumulatedSources = accumulated.sources ?? [];
    const failed = accumulatedSources.filter((source) => source.status === "failed").length;
    setVersion(accumulated); setFiles([]);
    setStatus(failed > 0 ? `${accumulatedSources.length} arquivos reunidos; ${failed} precisam ser reenviados.` : `${accumulatedSources.length} ${accumulatedSources.length === 1 ? "arquivo reunido" : "arquivos reunidos"} para revisão.`);
  } catch (reason) { setError(message(reason)); } finally { setProcessing(undefined); } };
  const save = async () => { if (!material || !version) return; setError(""); try { const next = await revise({ materialId: material.id, versionId: version.id, idempotencyKey: crypto.randomUUID(), pageOffset: offset, items }).unwrap(); setVersion(next); setStatus(`Correções salvas na versão ${next.versionNumber}.`); } catch (reason) { setError(message(reason)); } };
  const publish = async () => { if (!material || !version) return; setError(""); try { const next = await approve({ materialId: material.id, versionId: version.id, idempotencyKey: crypto.randomUUID() }).unwrap(); setVersion(next); setStatus("Índice aprovado e auditado."); } catch (reason) { setError(message(reason)); } };
  const update = (index: number, field: keyof MaterialIndexItem, value: string) => setItems((current) => current.map((item, position) => position === index ? { ...item, [field]: ["startPage", "endPage", "sourcePage"].includes(field) ? Number(value) : field === "parentId" ? value || null : value } : item));
  return <section className="material-lab" aria-labelledby="material-title">
    <header><p className="eyebrow">Biblioteca de Estudo</p><h2 id="material-title">Transforme só o índice em mapa de páginas.</h2><p>Cadastre a edição e envie somente as páginas do sumário — nunca a obra completa. Toda sugestão espera sua revisão.</p></header>
    {!material ? <div className="material-register">
      <label htmlFor="material-name">Título do Material</label><input id="material-name" name="material-name" autoComplete="off" placeholder="Ex.: Manual de Direito Administrativo…" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor="material-edition">Edição</label><input id="material-edition" name="material-edition" autoComplete="off" placeholder="Ex.: 33ª edição…" value={edition} onChange={(event) => setEdition(event.target.value)} />
      <button type="button" className="primary-action" disabled={creating.isLoading} onClick={() => void register()}>{creating.isLoading ? "Cadastrando…" : "Cadastrar Material"}</button>
    </div> : <div className="index-workbench">
      <div className="material-identity"><span>{material.edition}</span><strong>{material.title}</strong></div>
      {!mode ? <div className="source-choices"><button type="button" onClick={() => setMode("manual")}>Digitar Índice</button><button type="button" onClick={() => setMode("file")}>Enviar PDFs ou Imagens</button></div> : null}
      {mode === "file" ? <div className="index-file"><label htmlFor="index-pages">Arquivos de índice em PDF, fotografia ou captura</label><input className="file-input" id="index-pages" name="index-pages" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><label className="file-trigger" htmlFor="index-pages">Selecionar Vários Arquivos</label><small>Até 5&nbsp;MB por arquivo. Selecione somente páginas de sumário; os arquivos serão processados um de cada vez.</small>{files.length > 0 ? <ol className="index-file-list" aria-label="Arquivos selecionados">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{file.type === "application/pdf" ? "PDF" : "Imagem"}</span><strong>{file.name}</strong><button type="button" aria-label={`Remover ${file.name}`} onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}>Remover</button></li>)}</ol> : null}</div> : null}
      {processing ? <section className="index-processing" role="status" aria-live="polite" aria-atomic="true">
        <span className="index-processing-spinner" aria-hidden="true" />
        <div><small>Arquivo {processing.current} de {processing.total}</small><h3>Extração em andamento</h3><strong>{processing.filename}</strong><p>{processing.phase === "sending" ? "Enviando as páginas com segurança…" : processing.phase === "pending" ? "Na fila de processamento…" : "Lendo capítulos e intervalos de páginas…"}</p></div>
      </section> : null}
      {mode ? <div className="index-ruler">
        <label className="offset-label" htmlFor="page-offset">Deslocamento de Paginação</label><input id="page-offset" name="page-offset" type="number" inputMode="numeric" value={offset} onChange={(event) => setOffset(Number(event.target.value))} />
        {sources.length > 0 ? <section className="index-sources" aria-labelledby="index-sources-title"><header><div><p className="eyebrow">Dossiê de Origem</p><h3 id="index-sources-title">Arquivos do Material</h3></div><span>{sources.length} {sources.length === 1 ? "fonte" : "fontes"}</span></header><ol>{sources.map((source) => <li key={source.id} data-status={source.status}><span>{source.sourceKind === "pdf" ? "PDF" : "Imagem"}</span><strong>{source.sourceFilename}</strong><small>{source.status === "extracted" ? "Índice extraído" : "Falha na extração"}</small></li>)}</ol></section> : null}
        {(mode === "manual" || version) ? <div className="index-items" aria-label="Itens revisáveis do índice">{items.map((item, index) => <fieldset key={item.id}><legend>Item {index + 1}</legend>
          {item.sourceId ? <small className="item-source">Origem: {sourceById.get(item.sourceId)?.sourceFilename ?? "arquivo não identificado"}</small> : null}
          <label htmlFor={`item-title-${index}`}>Texto do Item {index + 1}</label><input id={`item-title-${index}`} name={`item-title-${index}`} autoComplete="off" value={item.title} onChange={(event) => update(index, "title", event.target.value)} />
          <label htmlFor={`item-parent-${index}`}>Item Superior</label><select id={`item-parent-${index}`} name={`item-parent-${index}`} value={item.parentId ?? ""} onChange={(event) => update(index, "parentId", event.target.value)}><option value="">Nível principal</option>{items.slice(0, index).map((candidate, parent) => <option key={candidate.id} value={candidate.id}>Item {parent + 1}: {candidate.title || "sem título"}</option>)}</select>
          {(["startPage", "endPage", "sourcePage"] as const).map((field) => { const labels = { startPage: "Página Inicial", endPage: "Página Final", sourcePage: "Página de Origem" }; return <label className="page-field" key={field}>{labels[field]} do Item {index + 1}<input name={`${field}-${index}`} aria-label={`${labels[field]} do Item ${index + 1}`} type="number" inputMode="numeric" min="1" value={item[field]} onChange={(event) => update(index, field, event.target.value)} /></label>; })}
        </fieldset>)}</div> : null}
        {mode === "manual" && !version ? <button className="quiet-action" type="button" onClick={() => setItems((current) => [...current, emptyItem(current.length + 1)])}>Adicionar Item</button> : null}
        {mode === "file" && files.length > 0 ? <button type="button" className="primary-action" disabled={importing.isLoading || Boolean(processing)} onClick={() => void prepare()}>{processing ? `Processando ${processing.current} de ${processing.total}…` : importing.isLoading ? "Enviando…" : `Preparar ${files.length} ${files.length === 1 ? "Arquivo" : "Arquivos"}`}</button> : null}
        {mode === "manual" && !version ? <button type="button" className="primary-action" disabled={importing.isLoading} onClick={() => void prepare()}>{importing.isLoading ? "Preparando…" : "Preparar Revisão"}</button> : null}
        {version && version.status !== "approved" ? <div className="review-actions"><button type="button" className="quiet-action" disabled={revising.isLoading} onClick={() => void save()}>{revising.isLoading ? "Salvando…" : "Salvar Correções"}</button><button type="button" className="primary-action" disabled={approving.isLoading || version.status === "invalid"} onClick={() => void publish()}>{approving.isLoading ? "Aprovando…" : `Aprovar Versão ${version.versionNumber}`}</button></div> : null}
      </div> : null}
    </div>}
    <p ref={feedback} tabIndex={-1} className="material-status" role={error ? "alert" : "status"} aria-live="polite">{error || status}</p>
  </section>;
}
