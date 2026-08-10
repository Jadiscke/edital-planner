import { useEffect, useRef, useState } from "react";
import { useApproveMaterialIndexMutation, useCreateMaterialMutation, useImportMaterialIndexMutation, useListProjectsQuery, useReviseMaterialIndexMutation, type Material, type MaterialIndexItem, type MaterialIndexVersion } from "../state.ts";

const emptyItem = (number: number): MaterialIndexItem => ({ id: `item-${number}`, parentId: null, title: "", startPage: 1, endPage: 1, sourcePage: 1 });
function message(reason: unknown) { return (reason as { data?: { message?: string } })?.data?.message ?? "Não foi possível concluir. Revise os dados e tente novamente."; }
async function base64(file: File) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

export function MaterialIndexWorkspace() {
  const { data: projects = [] } = useListProjectsQuery(); const project = projects[0];
  const [create, creating] = useCreateMaterialMutation(); const [importIndex, importing] = useImportMaterialIndexMutation(); const [revise, revising] = useReviseMaterialIndexMutation(); const [approve, approving] = useApproveMaterialIndexMutation();
  const [title, setTitle] = useState(""); const [edition, setEdition] = useState(""); const [material, setMaterial] = useState<Material>();
  const [mode, setMode] = useState<"manual" | "file">(); const [file, setFile] = useState<File>(); const [items, setItems] = useState<MaterialIndexItem[]>([emptyItem(1)]); const [offset, setOffset] = useState(0); const [version, setVersion] = useState<MaterialIndexVersion>(); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (version) { setItems(version.items); setOffset(version.pageOffset); } }, [version]);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  useEffect(() => { const protect = (event: BeforeUnloadEvent) => { if ((title || edition || material) && version?.status !== "approved") event.preventDefault(); }; window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect); }, [title, edition, material, version?.status]);
  if (!project) return null;
  const register = async () => { setError(""); if (!title.trim() || !edition.trim()) { setError("Informe título e edição do material."); return; } try { setMaterial(await create({ projectId: project.id, title, edition, idempotencyKey: crypto.randomUUID() }).unwrap()); setStatus("Material cadastrado. Escolha como informar o índice."); } catch (reason) { setError(message(reason)); } };
  const prepare = async () => { if (!material) return; setError(""); try {
    const body = mode === "manual" ? { sourceKind: "manual", pageOffset: offset, items } : file ? { sourceKind: file.type === "application/pdf" ? "pdf" : "image", sourceFilename: file.name, mimeType: file.type, base64: await base64(file), pageOffset: offset } : undefined;
    if (!body) { setError("Selecione somente as páginas do índice em PDF ou imagem."); return; }
    const next = await importIndex({ materialId: material.id, body }).unwrap(); setVersion(next); setStatus(next.status === "invalid" ? "A extração precisa de correções antes da aprovação." : `Versão ${next.versionNumber} pronta para sua revisão.`);
  } catch (reason) { setError(message(reason)); } };
  const save = async () => { if (!material || !version) return; setError(""); try { const next = await revise({ materialId: material.id, versionId: version.id, pageOffset: offset, items }).unwrap(); setVersion(next); setStatus(`Correções salvas na versão ${next.versionNumber}.`); } catch (reason) { setError(message(reason)); } };
  const publish = async () => { if (!material || !version) return; setError(""); try { const next = await approve({ materialId: material.id, versionId: version.id }).unwrap(); setVersion(next); setStatus("Índice aprovado e auditado."); } catch (reason) { setError(message(reason)); } };
  const update = (index: number, field: keyof MaterialIndexItem, value: string) => setItems((current) => current.map((item, position) => position === index ? { ...item, [field]: ["startPage", "endPage", "sourcePage"].includes(field) ? Number(value) : field === "parentId" ? value || null : value } : item));
  return <section className="material-lab" aria-labelledby="material-title">
    <header><p className="eyebrow">Biblioteca de Estudo</p><h2 id="material-title">Transforme só o índice em mapa de páginas.</h2><p>Cadastre a edição e envie somente as páginas do sumário — nunca a obra completa. Toda sugestão espera sua revisão.</p></header>
    {!material ? <div className="material-register">
      <label htmlFor="material-name">Título do Material</label><input id="material-name" name="material-name" autoComplete="off" placeholder="Ex.: Manual de Direito Administrativo…" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor="material-edition">Edição</label><input id="material-edition" name="material-edition" autoComplete="off" placeholder="Ex.: 33ª edição…" value={edition} onChange={(event) => setEdition(event.target.value)} />
      <button type="button" className="primary-action" disabled={creating.isLoading} onClick={() => void register()}>{creating.isLoading ? "Cadastrando…" : "Cadastrar Material"}</button>
    </div> : <div className="index-workbench">
      <div className="material-identity"><span>{material.edition}</span><strong>{material.title}</strong></div>
      {!mode ? <div className="source-choices"><button type="button" onClick={() => setMode("manual")}>Digitar Índice</button><button type="button" onClick={() => setMode("file")}>Enviar PDF ou Imagem</button></div> : null}
      {mode === "file" && !version ? <div className="index-file"><label htmlFor="index-pages">Páginas do índice em PDF, fotografia ou captura</label><input id="index-pages" name="index-pages" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setFile(event.target.files?.[0])} /><small>Até 5&nbsp;MB. Recorte somente as páginas do sumário.</small></div> : null}
      {mode ? <div className="index-ruler">
        <label className="offset-label" htmlFor="page-offset">Deslocamento de Paginação</label><input id="page-offset" name="page-offset" type="number" inputMode="numeric" value={offset} onChange={(event) => setOffset(Number(event.target.value))} />
        {(mode === "manual" || version) ? <div className="index-items" aria-label="Itens revisáveis do índice">{items.map((item, index) => <fieldset key={item.id}><legend>Item {index + 1}</legend>
          <label htmlFor={`item-title-${index}`}>Texto do Item {index + 1}</label><input id={`item-title-${index}`} name={`item-title-${index}`} autoComplete="off" value={item.title} onChange={(event) => update(index, "title", event.target.value)} />
          <label htmlFor={`item-parent-${index}`}>Item Superior</label><select id={`item-parent-${index}`} name={`item-parent-${index}`} value={item.parentId ?? ""} onChange={(event) => update(index, "parentId", event.target.value)}><option value="">Nível principal</option>{items.slice(0, index).map((candidate, parent) => <option key={candidate.id} value={candidate.id}>Item {parent + 1}: {candidate.title || "sem título"}</option>)}</select>
          {(["startPage", "endPage", "sourcePage"] as const).map((field) => { const labels = { startPage: "Página Inicial", endPage: "Página Final", sourcePage: "Página de Origem" }; return <label className="page-field" key={field}>{labels[field]} do Item {index + 1}<input name={`${field}-${index}`} aria-label={`${labels[field]} do Item ${index + 1}`} type="number" inputMode="numeric" min="1" value={item[field]} onChange={(event) => update(index, field, event.target.value)} /></label>; })}
        </fieldset>)}</div> : null}
        {mode === "manual" && !version ? <button className="quiet-action" type="button" onClick={() => setItems((current) => [...current, emptyItem(current.length + 1)])}>Adicionar Item</button> : null}
        {!version ? <button type="button" className="primary-action" disabled={importing.isLoading} onClick={() => void prepare()}>{importing.isLoading ? "Extraindo…" : "Preparar Revisão"}</button> : version.status !== "approved" ? <div className="review-actions"><button type="button" className="quiet-action" disabled={revising.isLoading} onClick={() => void save()}>{revising.isLoading ? "Salvando…" : "Salvar Correções"}</button><button type="button" className="primary-action" disabled={approving.isLoading || version.status === "invalid"} onClick={() => void publish()}>{approving.isLoading ? "Aprovando…" : `Aprovar Versão ${version.versionNumber}`}</button></div> : null}
      </div> : null}
    </div>}
    <p ref={feedback} tabIndex={-1} className="material-status" role={error ? "alert" : "status"} aria-live="polite">{error || status}</p>
  </section>;
}
