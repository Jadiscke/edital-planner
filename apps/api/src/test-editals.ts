import { readFile } from "node:fs/promises";

export interface TestEditalSummary {
  readonly id: string;
  readonly label: string;
  readonly filename: string;
  readonly organization: string;
  readonly structure: string;
  readonly sourceUrl: string;
}

export interface TestEditalCatalog {
  list(): readonly TestEditalSummary[];
  load(id: string): Promise<Buffer | undefined>;
}

const TEST_EDITALS = [
  {
    id: "dataprev-2026",
    label: "DATAPREV 2026 — Edital Retificado",
    filename: "edital-retificado-dataprev.pdf",
    organization: "DATAPREV",
    structure: "Módulos I e II, conhecimentos comuns e específicos para 13 perfis",
    sourceUrl: "https://portaldtp.dataprev.gov.br/central-de-conteudos/noticias/dataprev-abre-concurso-publico-para-212-vagas-e-formacao-de-cadastro-de-reserva",
  },
  {
    id: "cpnu-2024-bloco-7",
    label: "CPNU 2024 — Bloco 7",
    filename: "cpnu-2024-bloco-7.pdf",
    organization: "Ministério da Gestão e da Inovação",
    structure: "Múltiplos órgãos, cargos, especialidades e eixos temáticos",
    sourceUrl: "https://www.gov.br/gestao/pt-br/concursonacional/editais/edital-cpnu-bloco-7-10jan2024.pdf/view",
  },
  {
    id: "bndes-2024",
    label: "BNDES 2024 — Seleção Pública",
    filename: "bndes-2024-edital-retificado.pdf",
    organization: "BNDES",
    structure: "Cargo de Analista com várias ênfases e conteúdos transversais",
    sourceUrl: "https://www.bndes.gov.br/wps/portal/site/home/quem-somos/trabalhar-no-bndes/concursos-selecao-publica-2024",
  },
  {
    id: "petrobras-2023",
    label: "Petrobras 2023 — Nível Técnico",
    filename: "petrobras-2023-edital-abertura.pdf",
    organization: "Petrobras",
    structure: "Cargo técnico com ênfases, blocos de conhecimento e polos",
    sourceUrl: "https://petrobras.com.br/pt/quem-somos/concursos",
  },
] as const satisfies readonly TestEditalSummary[];

export function createDevelopmentTestEditalCatalog(directory: URL): TestEditalCatalog {
  const byId = new Map<string, TestEditalSummary>(TEST_EDITALS.map((edital) => [edital.id, edital]));
  return {
    list: () => TEST_EDITALS,
    async load(id) {
      const edital = byId.get(id);
      if (!edital) return undefined;
      return readFile(new URL(edital.filename, directory));
    },
  };
}
