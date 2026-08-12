# Matriz local de editais

PDFs públicos usados para validar extração de texto e verticalização contra estruturas diferentes. As cópias foram conferidas em 11 de agosto de 2026; o catálogo disponível na interface local é definido em `apps/api/src/test-editals.ts`.

| Arquivo | Caso exercitado | Fonte oficial | SHA-256 |
| --- | --- | --- | --- |
| `cpnu-2024-bloco-7.pdf` | Múltiplos órgãos, cargos, especialidades e cinco eixos temáticos | [Ministério da Gestão e da Inovação](https://www.gov.br/gestao/pt-br/concursonacional/editais/edital-cpnu-bloco-7-10jan2024.pdf/view) | `7229073bba239f6623e25cbc675de6546a12961f8b8406d43c8640538991e119` |
| `bndes-2024-edital-retificado.pdf` | Cargo de Analista com treze ênfases e conhecimentos transversais | [BNDES](https://www.bndes.gov.br/wps/portal/site/home/quem-somos/trabalhar-no-bndes/concursos-selecao-publica-2024) | `fb88d5fd65a256d4576ccd9823f60eac99261d7e9509336d348e41d9f95312f5` |
| `petrobras-2023-edital-abertura.pdf` | Cargo técnico com ênfases, blocos internos e polos de trabalho | [Petrobras](https://petrobras.com.br/pt/quem-somos/concursos) | `d67994909172130aea200aacd07253550d8a5597482fa62de9530fcb6205b368` |
| `edital-retificado-dataprev.pdf` | Módulos I e II, conhecimentos comuns e específicos para 13 perfis | [Portal DATAPREV](https://portaldtp.dataprev.gov.br/central-de-conteudos/noticias/dataprev-abre-concurso-publico-para-212-vagas-e-formacao-de-cadastro-de-reserva) | `cbb5d3f9e23a814e066ad459f9f83a17c1b12eb415f7d1df620bf96749db472f` |

Os testes não dependem de rede: os documentos ficam versionados no repositório e cada PDF novo deve manter menos de 5 MB, possuir camada de texto e entrar no teste de matriz em `packages/ai/test/pdf-verticalization-staging.test.ts`.
