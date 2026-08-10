# PRD — Planejador de Editais MVP

Status: ready-for-agent  
Versão: 1.0  
Data: 2026-07-23  
Origem: [`docs/product/visao-escopo-arquitetura-fonte.md`](../../docs/product/visao-escopo-arquitetura-fonte.md), exportação integral do documento de visão v0.7, 16 de julho de 2026

## Resumo

Construir uma plataforma web que transforme editais e índices de materiais em uma trilha de estudo rastreável. O produto extrai e verticaliza conteúdos, sugere associações com evidência e confiança, permite revisão humana, gera planos semanais adaptativos e registra execução sem reescrever o histórico.

## Problem Statement

Candidatos gastam tempo decompondo editais pouco padronizados, localizando conteúdo em materiais e mantendo planilhas que não explicam cobertura, prioridade ou impacto de atrasos. Automação sem evidência cria outro risco: associações incorretas podem direcionar o estudo para o conteúdo errado.

## Solution

Um usuário deve conseguir criar um projeto, enviar um edital, revisar a árvore verticalizada, cadastrar índices de materiais, aprovar associações, gerar uma semana de estudo e executar a primeira tarefa com rastreabilidade de ponta a ponta.

## User Stories

1. Como candidato, quero criar uma conta, para manter meus projetos privados.
2. Como candidato, quero verificar meu e-mail, para proteger o acesso à conta.
3. Como candidato, quero recuperar meu acesso, para não perder meu planejamento.
4. Como candidato, quero encerrar sessões ativas, para reagir a um dispositivo perdido.
5. Como candidato, quero criar um projeto por concurso, para separar editais, materiais e planos.
6. Como candidato, quero arquivar um projeto, para retirar concursos antigos da rotina sem apagar o histórico.
7. Como candidato, quero excluir meus dados, para exercer meus direitos de privacidade.
8. Como candidato, quero exportar meus dados, para manter uma cópia portátil.
9. Como candidato, quero enviar um edital em PDF, para iniciar a organização do estudo.
10. Como candidato, quero entender por que um arquivo foi rejeitado, para conseguir corrigi-lo.
11. Como candidato, quero acompanhar o processamento, para saber quando posso revisar o resultado.
12. Como candidato, quero tentar novamente um processamento recuperável, para não reenviar o arquivo.
13. Como candidato, quero ver matérias, tópicos e subtópicos extraídos, para compreender o escopo da prova.
14. Como candidato, quero abrir a página e o trecho de origem, para conferir cada item extraído.
15. Como candidato, quero ver a confiança da extração, para priorizar minha revisão.
16. Como candidato, quero corrigir o texto de um item, para refletir fielmente o edital.
17. Como candidato, quero mover um item na hierarquia, para corrigir a estrutura.
18. Como candidato, quero mesclar itens duplicados, para evitar trabalho repetido.
19. Como candidato, quero rejeitar uma sugestão incorreta, para impedir que ela afete o planejamento.
20. Como candidato, quero aprovar itens em lote, para revisar editais extensos com eficiência.
21. Como candidato, quero consultar o histórico de revisão, para entender quem alterou a estrutura e por quê.
22. Como candidato, quero cadastrar um material e sua edição, para associá-lo ao edital correto.
23. Como candidato, quero importar ou digitar o índice do material, para evitar enviar a obra inteira.
24. Como candidato, quero registrar capítulos, seções e páginas, para localizar exatamente onde estudar.
25. Como candidato, quero receber sugestões de associação, para reduzir o trabalho manual.
26. Como candidato, quero ver evidência e confiança da associação, para decidir se devo aceitá-la.
27. Como candidato, quero corrigir o intervalo de páginas, para manter a associação útil.
28. Como candidato, quero rejeitar uma associação, para não estudar conteúdo inadequado.
29. Como candidato, quero ver a cobertura do edital, para identificar lacunas.
30. Como candidato, quero ver tópicos sem material, para decidir o que adquirir ou cadastrar.
31. Como candidato, quero informar minha disponibilidade semanal, para receber um plano executável.
32. Como candidato, quero definir prioridades e pesos, para refletir o concurso que estou prestando.
33. Como candidato, quero respeitar dependências entre tópicos, para estudar em uma ordem pedagógica.
34. Como candidato, quero receber tarefas de teoria, revisão e exercícios, para equilibrar o ciclo de aprendizagem.
35. Como candidato, quero ver tempo, páginas e objetivo de cada tarefa, para começar sem ambiguidade.
36. Como candidato, quero entender por que uma tarefa foi priorizada, para confiar no plano.
37. Como candidato, quero recalcular tarefas futuras após um atraso, para manter o plano realista.
38. Como candidato, quero preservar tarefas já concluídas, para que o histórico permaneça verdadeiro.
39. Como candidato, quero iniciar, pausar e retomar uma sessão, para medir meu estudo.
40. Como candidato, quero concluir parcialmente uma tarefa, para registrar progresso real.
41. Como candidato, quero informar páginas e exercícios concluídos, para melhorar projeções futuras.
42. Como candidato, quero marcar um bloqueio, para que o plano considere impedimentos.
43. Como candidato, quero ver planejado versus realizado, para ajustar expectativas.
44. Como candidato, quero ver projeções com incerteza, para não interpretar estimativas como garantia.
45. Como candidato, quero optar pelo benchmarking, para me comparar somente se eu consentir.
46. Como candidato, quero sair do benchmarking, para interromper o uso comparativo dos meus dados.
47. Como assinante, quero contratar e gerenciar meu plano, para acessar os recursos adquiridos.
48. Como assinante, quero manter acesso coerente durante reconciliações de pagamento, para não perder direitos por eventos duplicados.
49. Como operador, quero localizar um job por usuário, projeto e correlação, para investigar falhas.
50. Como operador, quero ver entrada, configuração, custo e resultado versionados, para auditar uma execução.
51. Como operador, quero repetir um job com controle e idempotência, para recuperar falhas sem duplicar efeitos.
52. Como operador, quero encaminhar baixa confiança para revisão humana, para impedir promoção insegura.
53. Como administrador, quero conceder um entitlement temporário e auditado, para resolver casos de suporte.
54. Como responsável de produto, quero comparar modelos em um corpus anotado, para selecionar qualidade e custo com evidência.
55. Como responsável financeiro, quero ver custo por documento, etapa e modelo, para controlar margem.
56. Como visitante, quero abrir uma landing rápida e indexável, para entender o produto antes de criar conta.
57. Como visitante, quero ler benefícios, funcionamento, privacidade e preços em HTML estático, para decidir com pouca latência.
58. Como usuário de tecnologia assistiva, quero navegar por teclado e leitor de tela, para usar os fluxos críticos.

## Implementation Decisions

- Monorepo TypeScript com aplicações separadas para marketing estático, produto, API e workers.
- Astro gera a landing; React e Vite implementam a aplicação autenticada.
- RTK Query é a fonte de estado remoto. Redux Toolkit atende fluxos síncronos complexos. Context API fornece dependências globais simples.
- Node.js 24 LTS, NestJS/Fastify e OpenAPI implementam a API modular.
- PostgreSQL é a fonte de verdade; Drizzle gerencia schema e migrações; pgvector atende similaridade inicial.
- Redis e BullMQ executam jobs com retentativas, backoff, agendamento e escala horizontal.
- Objetos ficam em armazenamento privado compatível com S3.
- Auth0 inicia identidade por OIDC; Stripe fica atrás de uma porta de pagamentos.
- `ProcessingJob` captura entrada, idempotência, configuração, resultado, métricas e custo.
- O roteador de IA prefere parsing local, usa OCR seletivo e escala modelos conforme validação, evidência e confiança.
- Toda promoção de saída passa por schema versionado e pela política de revisão aplicável.

## Personas

### Candidato

Organiza um ou mais concursos, revisa sugestões, define disponibilidade e executa tarefas.

### Operador

Investiga jobs, custos e falhas, executa replay controlado e atende solicitações de privacidade.

### Administrador

Gerencia planos, entitlements, limites e acessos administrativos auditados.

## Escopo funcional

### 1. Identidade, consentimento e projetos

- Cadastro, login, logout, recuperação e verificação de e-mail.
- Sessões revogáveis e MFA conforme política de risco.
- Consentimentos versionados e preferências de privacidade.
- Criação, edição, arquivamento e exclusão de projetos.
- Isolamento de dados por usuário e organização.

### 2. Ingestão segura de documentos

- Upload de PDF com limites de tipo e tamanho.
- Hash, quarentena, varredura antimalware e armazenamento privado.
- Versões imutáveis do documento e metadados de origem.
- Status observável de processamento, cancelamento seguro e retentativa autorizada.
- Rejeição explicável de arquivos inválidos ou protegidos.

### 3. Verticalização de edital

- Extração de matérias, tópicos e subtópicos em schema versionado.
- Preservação de página, trecho e coordenadas quando disponíveis.
- Confiança por campo e avisos de baixa qualidade.
- Editor hierárquico para aceitar, corrigir, mover, mesclar e rejeitar itens.
- Histórico de versões e decisões de revisão.
- Exportação da estrutura aprovada.

### 4. Materiais e associação

- Cadastro manual e importação do índice de um material.
- Capítulos, seções, intervalos de páginas e metadados da edição.
- Sugestões de associação entre edital e índice.
- Evidência, explicação curta e confiança por associação.
- Aprovação, correção e rejeição em lote ou individual.
- Cobertura por matéria, tópico e projeto.
- Sinalização de lacunas, conflitos e material não utilizado.

### 5. Planejamento adaptativo

- Cadastro de disponibilidade semanal e duração alvo.
- Prioridades, pesos, dependências e restrições.
- Geração de backlog e plano semanal versionado.
- Tarefas de teoria, revisão e exercícios.
- Estimativas de páginas, tempo e objetivo.
- Replanejamento apenas de tarefas futuras.
- Explicação das mudanças e preservação do histórico executado.

### 6. Execução

- Agenda semanal e fila da próxima tarefa.
- Iniciar, pausar, retomar e concluir sessão.
- Registro manual de tempo, páginas e exercícios.
- Conclusão parcial, bloqueio e justificativa.
- Atualização de progresso e projeção após eventos idempotentes.
- Funcionamento degradado seguro para temporizadores locais.

### 7. Métricas e benchmarking

- Progresso, cobertura, tempo planejado versus realizado e ritmo.
- Projeções com faixa de incerteza, sem promessas de aprovação.
- Benchmarking apenas por opt-in e grupos agregados protegidos.
- Exclusão de usuários de amostras insuficientes.
- Explicação da origem e janela temporal das métricas.

### 8. Assinaturas e entitlements

- Checkout, assinatura, portal de cobrança e cancelamento.
- Webhooks idempotentes e reconciliação.
- Entitlements calculados no servidor.
- Grace period e estados de pagamento explícitos.
- Operações administrativas temporárias e auditadas.

### 9. Privacidade, auditoria e operação

- Exportação, retenção, bloqueio e exclusão de dados.
- Trilhas de auditoria para revisões, acessos, jobs e ações administrativas.
- Painel operacional para filas, falhas, latência, qualidade e custo.
- Replay usa a entrada e a configuração versionadas.
- Logs não contêm arquivos, prompts sensíveis, tokens ou dados pessoais desnecessários.

## Requisitos de IA

- Gateway único OpenRouter atrás da interface própria `@planejador/ai`; não existem clientes diretos de fornecedores.
- Parsing local antes de OCR ou LLM.
- OCR seletivo por página.
- O modelo primário e os fallbacks são slugs do OpenRouter configurados por ambiente; DeepSeek só é usado por um slug explicitamente configurado.
- OpenRouter exige `data_collection: deny`, ZDR e suporte a todos os parâmetros por padrão; documentos reais continuam bloqueados até aprovação jurídica e técnica do gateway e dos endpoints elegíveis.
- Saída estruturada validada; reparo tem orçamento limitado.
- Gating por confiança, evidência, schema, custo e política.
- Registro de modelo resolvido, prompt, tokens, custo e latência.
- Corpus anotado em português para avaliação offline.
- Promoção de modelo condicionada a qualidade mínima e custo máximo por documento.
- Fallback não pode promover automaticamente conteúdo que exige revisão.

## Stack aprovada

A decisão detalhada está em `docs/adr/0001-stack-tecnologica-inicial.md`.

- Landing: Astro estático com ilhas React.
- Aplicação: React, TypeScript e Vite.
- Estado: Redux Toolkit e RTK Query; Context API apenas para dependências simples.
- API: Node.js 24 LTS, NestJS/Fastify e OpenAPI.
- Dados: PostgreSQL, Drizzle e pgvector.
- Jobs: Redis e BullMQ.
- Arquivos: armazenamento compatível com S3.
- IA: extração local, OCR seletivo e `@planejador/ai` via OpenRouter, com modelo primário e fallbacks configurados por ambiente.

## Requisitos não funcionais

### Segurança

- Autorização no servidor para toda operação.
- Proteção contra acesso horizontal e vertical.
- Segredos em cofre gerenciado e rotação por ambiente.
- Criptografia em trânsito e em repouso.
- Uploads privados, URLs temporárias e proteção contra malware.

### Confiabilidade

- Idempotência para jobs, sessões, webhooks e exclusões.
- Retentativas limitadas com backoff e fila de falhas.
- Outbox/inbox para efeitos externos relevantes.
- Backup, restauração e replay testados.
- Última versão aprovada permanece disponível quando a IA falha.

### Desempenho

- Landing servida estaticamente por CDN.
- Interações comuns da aplicação não dependem de jobs longos.
- Paginação e consultas indexadas nas árvores, tarefas e auditorias.
- Orçamento de latência e custo por classe de job.

### Acessibilidade

- Navegação por teclado, foco visível, landmarks e nomes acessíveis.
- Contraste e estados não dependem apenas de cor.
- Fluxos críticos testados com leitor de tela.

### LGPD

- Minimização, finalidade, base legal e retenção documentadas.
- Consentimento versionado quando aplicável.
- Exportação e exclusão com evidência operacional.
- Benchmarking desativado por padrão.

## Testing Decisions

O usuário confirmou em 2026-07-23 os seguintes seams:

1. **Upload → ProcessingJob**: arquivo válido cria uma única versão e um job idempotente; arquivo inválido não chama dependências externas.
2. **Documento → árvore verticalizada**: fixtures anotadas verificam schema, evidência, confiança e comportamento de baixa qualidade.
3. **Índice → associações**: matching retorna sugestões revisáveis e nunca promove saída inválida.
4. **Revisão → versão aprovada**: aceitar, corrigir e rejeitar preservam histórico e autoria.
5. **Plano → tarefas**: regras de dependência, disponibilidade e prioridade geram uma semana determinística para relógio e seed fixos.
6. **Execução → recalibração futura**: eventos repetidos não duplicam progresso e tarefas concluídas nunca são reescritas.
7. **Webhook → entitlement**: eventos repetidos ou fora de ordem convergem para o estado correto.
8. **Tenant e privacidade**: testes negativos provam isolamento; exportação e exclusão cobrem arquivos, dados e auditoria permitida.
9. **IA → fallback humano**: timeout, schema inválido, baixa evidência e estouro de orçamento terminam em estado revisável.
10. **Landing estática**: build sem servidor, metadados, sitemap, performance e acessibilidade são verificáveis em CI.

Testes devem observar contratos e comportamento externo, sem acoplar-se a detalhes internos. Vitest cobre domínio e contratos; Testcontainers cobre PostgreSQL, Redis, filas e idempotência; React Testing Library cobre interações; Playwright cobre jornadas; fixtures anotadas cobrem qualidade de IA. Como o repositório ainda não possui implementação, não há testes anteriores a reutilizar.

## Critérios de sucesso do MVP

- Dois editais anotados atravessam o fluxo de verticalização com evidência verificável.
- Cinco índices de materiais atravessam matching e revisão.
- Nenhum teste de isolamento permite acesso cruzado.
- Jobs podem ser repetidos sem duplicar efeitos.
- Um candidato completa a jornada do projeto à primeira sessão.
- Custo e qualidade são medidos por documento, modelo e etapa.
- Restore e replay são demonstrados antes do piloto.

## Out of Scope

- Aplicativos móveis nativos.
- Banco próprio de questões e simulados completos.
- Upload integral e redistribuição de cursos protegidos.
- Automação de plataformas de terceiros sem autorização.
- Agenda fixa por dia ou sincronização automática de calendários no MVP.
- Microserviços independentes antes de evidência operacional.

## Rollout

1. Dry-run interno com corpus anotado e sem promoção automática.
2. Tracer bullet: edital → árvore → revisão.
3. Índices → matching → cobertura.
4. Planejamento → execução em piloto restrito.
5. Billing e operação comercial após gates de segurança, LGPD, restore e custo.

## Questões para decisões posteriores

- Limiares de confiança por campo e por etapa.
- Metas finais de disponibilidade, RTO e RPO.
- Planos, preços, limites, reembolso e grace period.
- Regiões autorizadas para armazenamento e inferência.
- Política mínima de MFA e acesso de suporte.
- Regras editoriais e legais para materiais de terceiros.

## Further Notes

- A exportação integral da fonte, sua revisão do Google Docs e seu hash de integridade estão registrados em `docs/product/README.md`.
- A matriz de preços de IA é uma fotografia de 2026-07-23 e deve ser revalidada antes de contratação ou promoção de modelos.
- A arquitetura detalhada e navegável está em `docs/system-design/index.html`; decisões tecnológicas e fontes estão no ADR 0001.
- Pisos de versões e gates de segurança estão em `docs/security/technology-vulnerability-review.md`.
- O primeiro incremento deve ser um tracer bullet demonstrável de edital para árvore revisável, não uma camada horizontal de infraestrutura.
