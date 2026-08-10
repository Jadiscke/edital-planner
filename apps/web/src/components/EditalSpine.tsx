import { useWatch } from "react-hook-form";

const fallback = ["Concurso", "Cargo", "Área", "Tópicos", "Plano"];

export function EditalSpine({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const values = useWatch<{ concurso: string; cargo: string; area: string }>();
  const labels = [values.concurso, values.cargo, values.area, fallback[3], fallback[4]];
  return (
    <ol className={`edital-spine edital-spine--${orientation}`} aria-label="Etapas da trilha do edital">
      {labels.map((label, index) => (
        <li key={fallback[index]} className={index < 3 && label ? "is-filled" : ""}>
          <span className="spine-node" aria-hidden="true" />
          <span>{label || fallback[index]}</span>
        </li>
      ))}
    </ol>
  );
}
