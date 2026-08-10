# ADR 0001 — Stack tecnológica inicial

Status: Aceito  
Data: 2026-07-23

> Atualização: o acesso direto a fornecedores e os modelos codificados nesta decisão foram substituídos pelo gateway único configurável do [ADR 0002](0002-openrouter-como-gateway-de-ia.md).

## Contexto

O produto combina uma landing page pública, uma aplicação autenticada, processamento documental multimodal, planejamento transacional, jobs demorados e integrações de assinatura. A equipe prefere Node.js no backend e React com Vite no frontend. A arquitetura deve preservar rastreabilidade, isolamento, replay e controle de custo de IA.

## Decisão

### Organização do repositório

- Monorepo TypeScript com `pnpm workspaces` e Turborepo.
- `apps/marketing`: Astro em modo estático, com componentes React apenas onde houver interação.
- `apps/web`: React, TypeScript e Vite para a aplicação autenticada.
- `apps/api`: Node.js 24 LTS, NestJS e adaptador Fastify.
- `apps/worker`: workers Node.js compartilhando casos de uso e contratos com a API.
- `packages/domain`, `packages/contracts`, `packages/ui`, `packages/config` e `packages/ai`.

### Frontend e estado

- React Router para rotas da aplicação.
- Redux Toolkit como store previsível para estado síncrono complexo que cruza telas, como revisão em lote, seleção de árvore e rascunho de planejamento.
- RTK Query para todo estado remoto: consultas, cache, invalidação, mutations, optimistic updates e estados de carregamento.
- Context API apenas para dependências e valores globais de baixa frequência, como tema, cliente de telemetria e sessão exposta pela camada de autenticação.
- React Hook Form e Zod para formulários e validação.
- Tailwind CSS com tokens próprios e componentes acessíveis baseados em Radix Primitives.

Redux Toolkit e RTK Query formam uma única camada de estado, com DevTools, middleware e rastreabilidade comuns. Dados normalizados do servidor não serão duplicados em slices. Se um fluxo exigir máquinas de estados explícitas, concorrência ou transições auditáveis no cliente, a equipe avaliará XState para esse fluxo, não como store global.

### Backend e contratos

- API REST modular em NestJS/Fastify, descrita por OpenAPI.
- Zod nos limites externos e contratos TypeScript gerados ou compartilhados sem importar entidades do domínio no frontend.
- PostgreSQL como fonte de verdade; Drizzle ORM e migrações SQL revisáveis.
- `pgvector` para similaridade sem introduzir um banco vetorial separado no MVP.
- Redis e BullMQ para filas, retentativas, backoff, agendamento e workers horizontais.
- Armazenamento de objetos compatível com S3 para originais, derivados e exports.
- Webhooks transacionais com inbox/outbox, idempotência e reconciliação.
- Provedor OIDC gerenciado, com Auth0 como baseline do MVP; autorização de recursos e entitlements permanecem no backend.
- Stripe Checkout, Billing e Customer Portal atrás de uma porta de pagamentos; entitlements permanecem no domínio local.

### Processamento documental

- Detecção de tipo, hash, antivírus e quarentena antes do parsing.
- PDF.js para texto e estrutura de PDFs digitais.
- OCR especializado apenas para páginas sem camada textual ou com baixa qualidade.
- Schemas versionados para edital, índice, evidência, associação e resultado de avaliação.
- Cada chamada de IA registra fornecedor, modelo, versão de prompt, tokens, custo, latência e resultado de validação.

### Estratégia de IA e custo

O sistema usa um roteador próprio, com adaptadores por fornecedor:

1. Extração determinística local sempre que possível.
2. Mistral OCR 4 somente para páginas escaneadas ou de layout difícil.
3. `deepseek-v4-flash` como modelo padrão de alto volume para classificar, estruturar e associar o texto já extraído, condicionado ao benchmark do corpus brasileiro.
4. GPT-5.6 Luna como fallback para falha do provedor, baixa confiança, reparo de saída estruturada e casos que exijam entrada visual.
5. `text-embedding-3-small` para embeddings iniciais; matching final combina similaridade, regras e evidência, nunca apenas distância vetorial.
6. Revisão humana quando os gates de confiança, evidência, custo ou validação falharem.

DeepSeek V4 Flash recebe texto normalizado, não substitui o parser nem o OCR. Aliases de modelos não são gravados como única referência de auditoria; usar o identificador explícito `deepseek-v4-flash`, pois os aliases legados `deepseek-chat` e `deepseek-reasoner` têm descontinuação anunciada. Cada job captura o identificador resolvido e a configuração usada. Modelos só entram em produção após avaliação offline no corpus anotado, custo por documento e taxa de revisão.

O envio de documentos ao DeepSeek fica bloqueado até aprovação de DPA, retenção, região de processamento, subprocessadores e procedimento de exclusão compatíveis com a LGPD. O adaptador envia apenas o recorte mínimo necessário, preferencialmente sem dados pessoais; quando a política não permitir o envio, o roteador usa Luna ou encaminha para revisão humana.

## Matriz de custos de referência

Valores em USD consultados em 2026-07-23. Preços por 1 milhão de tokens, salvo indicação.

| Serviço | Entrada | Saída | Uso proposto |
|---|---:|---:|---|
| DeepSeek V4 Flash — cache miss | US$ 0,14 | US$ 0,28 | Padrão para texto extraído |
| DeepSeek V4 Flash — cache hit | US$ 0,0028 | US$ 0,28 | Reprocessamento com prefixo reutilizado |
| GPT-5.6 Luna | US$ 1,00 | US$ 6,00 | Fallback, reparo e entrada visual |
| Claude Haiku 4.5 | US$ 1,00 | US$ 5,00 | Candidato alternativo em avaliação |
| text-embedding-3-small | US$ 0,02 | — | Embeddings |
| Mistral OCR 4 | US$ 4 / 1.000 páginas | — | OCR seletivo |

Exemplo comparável com 1 milhão de tokens de entrada e 100 mil de saída: DeepSeek V4 Flash custa aproximadamente US$ 0,168 em cache miss ou US$ 0,0308 com toda a entrada em cache hit; GPT-5.6 Luna custa aproximadamente US$ 1,60. Isso não inclui OCR, armazenamento, impostos, câmbio ou ferramentas.

## Qualidade e operação

- Vitest para unidades e contratos; React Testing Library para componentes.
- Testcontainers para PostgreSQL e Redis em integrações.
- Playwright para jornadas críticas.
- MSW para simular a API no frontend.
- OpenTelemetry para traces e métricas; Sentry para erros da aplicação.
- Logs estruturados com correlação por request, job e tenant, sem conteúdo sensível.
- Docker para ambientes reproduzíveis; CI no GitHub Actions quando houver remoto.

## Landing page

A landing é um artefato independente e estático. Astro gera HTML por padrão, permite sitemap e hidrata apenas as ilhas React necessárias. A aplicação autenticada permanece em React/Vite e pode ser hospedada como assets estáticos separados da API.

## Consequências

### Positivas

- TypeScript de ponta a ponta e menor custo de contexto entre frontend, API e workers.
- Landing rápida e indexável sem introduzir SSR obrigatório na aplicação.
- Estado remoto e local têm responsabilidades separadas.
- Redux Toolkit e RTK Query reduzem a quantidade de bibliotecas e oferecem uma trilha única de inspeção para fluxos complexos.
- A maior parte dos jobs usa opções econômicas, com escalada mensurável.
- PostgreSQL concentra dados relacionais, auditoria e vetores no MVP.

### Custos e riscos

- Astro cria uma segunda aplicação frontend, embora reutilize React e componentes do monorepo.
- Redis adiciona infraestrutura operacional.
- OIDC gerenciado adiciona custo e dependência externa, mas reduz a superfície de autenticação operada pela equipe.
- Preços e versões de modelos mudam; a matriz é referência, não constante de produto.
- A qualidade em editais brasileiros precisa ser comprovada por avaliação própria.
- DeepSeek exige validação jurídica e de privacidade antes de receber documentos reais.

## Alternativas rejeitadas

- Uma única SPA Vite para marketing e produto: é implantável estaticamente, mas aumenta o trabalho de prerenderização e SEO da landing.
- TanStack Query com Zustand: separa bem estado remoto e local e é uma alternativa tecnicamente válida, mas mantém dois ecossistemas de estado; o MVP prioriza a instrumentação unificada de Redux Toolkit e RTK Query.
- Context API para todo o estado: mistura cache remoto, UI e fluxos complexos, ampliando rerenders e acoplamento.
- Microserviços desde o início: custo operacional sem evidência de necessidade.
- Um único provedor/modelo de IA: piora resiliência, negociação e controle de custo.
- Banco vetorial dedicado no MVP: `pgvector` atende a primeira escala com menos componentes.
- Better Auth self-hosted: o histórico recente de advisories e correções em autorização, SSRF, 2FA e billing torna o risco operacional desproporcional para o MVP.

## Pisos de segurança

- Node.js 24.18.0 ou posterior na linha LTS.
- Vite 8.0.5 ou posterior.
- Fastify 5.8.3 ou posterior compatível com NestJS.
- Drizzle ORM 0.45.2; não usar beta/RC no MVP.
- PostgreSQL 18.4 ou 17.10.
- pgvector 0.8.2 ou posterior.
- Redis em uma linha corrigida pelo advisory de maio de 2026; preferir serviço gerenciado.
- PDF.js atual com `isEvalSupported: false` e execução isolada.

A análise completa e os controles obrigatórios estão em `docs/security/technology-vulnerability-review.md`.

## Fontes primárias

- [Node.js releases](https://nodejs.org/en/blog/release)
- [Vite — build e deploy estático](https://vite.dev/guide/static-deploy)
- [Astro — integrações oficiais](https://docs.astro.build/en/guides/integrations/)
- [Redux Toolkit](https://redux-toolkit.js.org/introduction/getting-started)
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [Drizzle e pgvector](https://orm.drizzle.team/docs/extensions)
- [BullMQ](https://bullmq.io/)
- [OpenAI models](https://developers.openai.com/api/docs/models)
- [OpenAI embeddings](https://developers.openai.com/api/docs/models/text-embedding-3-small)
- [DeepSeek V4 Preview](https://api-docs.deepseek.com/news/news260424/)
- [DeepSeek models and pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Mistral model selection](https://docs.mistral.ai/models/model-selection-guide)
