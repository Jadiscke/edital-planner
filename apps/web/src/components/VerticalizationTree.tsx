import { useMemo, useState } from "react";

import type { VerticalizationEvidence, VerticalizationNode, VerticalizationTree as Tree } from "../state.ts";

interface SelectedEvidence extends VerticalizationNode {
  level: "Matéria" | "Tópico" | "Subtópico";
  selectionKey: string;
}

function Confidence({ value }: { value: number }) {
  return <span className="confidence">Confiança estimada: {new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(value)}</span>;
}

function EvidenceButton({ node, level, itemKey, selected, onSelect }: { node: VerticalizationNode; level: SelectedEvidence["level"]; itemKey: string; selected: boolean; onSelect: (item: SelectedEvidence) => void }) {
  return (
    <button type="button" className={selected ? "tree-item is-selected" : "tree-item"} aria-pressed={selected} aria-controls="evidence-margin" onClick={() => onSelect({ ...node, level, selectionKey: itemKey })}>
      <span>{node.normalizedName}</span><Confidence value={node.confidence} />
    </button>
  );
}

function subjectSelectionKey(subject: Tree["subjects"][number], index: number): string {
  return `subject:${index}:${subject.originalName}:${(subject.examOptionIds ?? []).join(",")}`;
}

export function VerticalizationTree({ tree }: { tree: Tree }) {
  const initial = useMemo<SelectedEvidence>(() => ({ ...tree.subjects[0]!, level: "Matéria", selectionKey: subjectSelectionKey(tree.subjects[0]!, 0) }), [tree]);
  const [selected, setSelected] = useState(initial);
  const [selectedOptionId, setSelectedOptionId] = useState("all");
  const examOptions = tree.examOptions ?? [];
  const visibleSubjects = useMemo(
    () => selectedOptionId === "all" ? tree.subjects : tree.subjects.filter((subject) => !subject.examOptionIds?.length || subject.examOptionIds.includes(selectedOptionId)),
    [selectedOptionId, tree.subjects],
  );
  const commonSubjectCount = visibleSubjects.filter((subject) => !subject.examOptionIds?.length).length;
  const specificSubjectCount = visibleSubjects.length - commonSubjectCount;
  const evidence: VerticalizationEvidence[] = selected.evidence;

  function selectExamOption(optionId: string) {
    setSelectedOptionId(optionId);
    const nextSubjects = optionId === "all" ? tree.subjects : tree.subjects.filter((subject) => !subject.examOptionIds?.length || subject.examOptionIds.includes(optionId));
    if (nextSubjects[0]) setSelected({ ...nextSubjects[0], level: "Matéria", selectionKey: subjectSelectionKey(nextSubjects[0], 0) });
  }

  return (
    <section className="verticalization" aria-labelledby="verticalization-title">
      <header className="verticalization-heading">
        <div><p className="upload-kicker">Versão {tree.documentVersionNumber} · extração automática</p><h2 id="verticalization-title">Árvore do edital</h2></div>
        <p>Escolha a prova e confira somente as matérias comuns e específicas dessa opção.</p>
      </header>
      {examOptions.length > 1 ? <div className="exam-option-filter">
        <label htmlFor="exam-option">Prova ou cargo</label>
        <select id="exam-option" name="examOption" autoComplete="off" value={selectedOptionId} onChange={(event) => selectExamOption(event.target.value)}>
          <option value="all">Todas as opções do edital</option>
          {examOptions.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.name}</option>)}
        </select>
        <p aria-live="polite">{visibleSubjects.length} {visibleSubjects.length === 1 ? "matéria" : "matérias"}: {commonSubjectCount} {commonSubjectCount === 1 ? "comum" : "comuns"} + {specificSubjectCount} {specificSubjectCount === 1 ? "específica" : "específicas"}</p>
      </div> : null}
      <div className="verticalization-grid">
        <nav className="syllabus-tree" aria-label="Matérias, tópicos e subtópicos do edital">
          <ul>
            {visibleSubjects.map((subject, subjectIndex) => {
              const subjectKey = subjectSelectionKey(subject, subjectIndex);
              return <li key={subjectKey}>
                <EvidenceButton node={subject} level="Matéria" itemKey={subjectKey} selected={selected.selectionKey === subjectKey} onSelect={setSelected} />
                {subject.topics.length ? <ul>{subject.topics.map((topic, topicIndex) => {
                  const topicKey = `${subjectKey}:topic:${topicIndex}:${topic.originalName}`;
                  return <li key={topicKey}>
                    <EvidenceButton node={topic} level="Tópico" itemKey={topicKey} selected={selected.selectionKey === topicKey} onSelect={setSelected} />
                    {topic.subtopics.length ? <ul>{topic.subtopics.map((subtopic, subtopicIndex) => {
                      const subtopicKey = `${topicKey}:subtopic:${subtopicIndex}:${subtopic.originalName}`;
                      return <li key={subtopicKey}><EvidenceButton node={subtopic} level="Subtópico" itemKey={subtopicKey} selected={selected.selectionKey === subtopicKey} onSelect={setSelected} /></li>;
                    })}</ul> : null}
                  </li>;
                })}</ul> : null}
              </li>;
            })}
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
