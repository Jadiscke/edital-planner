import { useMemo, useState } from "react";

import type { VerticalizationEvidence, VerticalizationNode, VerticalizationTree as Tree } from "../state.ts";

interface SelectedEvidence extends VerticalizationNode { level: "Matéria" | "Tópico" | "Subtópico" }

function Confidence({ value }: { value: number }) {
  return <span className="confidence">Confiança estimada: {new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(value)}</span>;
}

function EvidenceButton({ node, level, selected, onSelect }: { node: VerticalizationNode; level: SelectedEvidence["level"]; selected: boolean; onSelect: (item: SelectedEvidence) => void }) {
  return (
    <button type="button" className={selected ? "tree-item is-selected" : "tree-item"} aria-pressed={selected} aria-controls="evidence-margin" onClick={() => onSelect({ ...node, level })}>
      <span>{node.normalizedName}</span><Confidence value={node.confidence} />
    </button>
  );
}

export function VerticalizationTree({ tree }: { tree: Tree }) {
  const initial = useMemo<SelectedEvidence>(() => ({ ...tree.subjects[0]!, level: "Matéria" }), [tree]);
  const [selected, setSelected] = useState(initial);
  const selectedKey = `${selected.level}:${selected.originalName}`;
  const evidence: VerticalizationEvidence[] = selected.evidence;

  return (
    <section className="verticalization" aria-labelledby="verticalization-title">
      <header className="verticalization-heading">
        <div><p className="upload-kicker">Versão {tree.documentVersionNumber} · extração automática</p><h2 id="verticalization-title">Árvore do edital</h2></div>
        <p>Escolha um item para conferir o trecho literal que o sustenta.</p>
      </header>
      <div className="verticalization-grid">
        <nav className="syllabus-tree" aria-label="Matérias, tópicos e subtópicos do edital">
          <ul>
            {tree.subjects.map((subject) => (
              <li key={subject.originalName}>
                <EvidenceButton node={subject} level="Matéria" selected={selectedKey === `Matéria:${subject.originalName}`} onSelect={setSelected} />
                {subject.topics.length ? <ul>{subject.topics.map((topic) => (
                  <li key={topic.originalName}>
                    <EvidenceButton node={topic} level="Tópico" selected={selectedKey === `Tópico:${topic.originalName}`} onSelect={setSelected} />
                    {topic.subtopics.length ? <ul>{topic.subtopics.map((subtopic) => (
                      <li key={subtopic.originalName}><EvidenceButton node={subtopic} level="Subtópico" selected={selectedKey === `Subtópico:${subtopic.originalName}`} onSelect={setSelected} /></li>
                    ))}</ul> : null}
                  </li>
                ))}</ul> : null}
              </li>
            ))}
          </ul>
        </nav>
        <aside id="evidence-margin" className="evidence-margin" aria-live="polite">
          <p className="evidence-level">{selected.level}</p>
          <h3>Margem de evidência</h3>
          <p className="selected-original">{selected.originalName}</p>
          <Confidence value={selected.confidence} />
          <p className="confidence-note">Estimativa do modelo; confira a fonte antes de usar este item.</p>
          {evidence.map((item, index) => (
            <figure key={`${item.page}:${index}`}>
              <figcaption>Página {item.page}</figcaption>
              <blockquote>{item.text}</blockquote>
            </figure>
          ))}
          <details className="execution-note"><summary>Rastro da extração</summary><dl>
            <div><dt>Prompt</dt><dd>{tree.execution.promptVersion}</dd></div>
            <div><dt>Modelo resolvido</dt><dd>{tree.execution.model}</dd></div>
            <div><dt>Tokens</dt><dd>{new Intl.NumberFormat("pt-BR").format(tree.execution.totalTokens)}</dd></div>
            <div><dt>Latência</dt><dd>{new Intl.NumberFormat("pt-BR").format(tree.execution.latencyMs)} ms</dd></div>
          </dl></details>
        </aside>
      </div>
    </section>
  );
}
