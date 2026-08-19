Status: ready-for-agent

# Contratar plano e receber entitlement

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Entregar a jornada de seleção de plano, checkout hospedado e concessão determinística de entitlement após confirmação reconciliada do provedor. A fatia inclui catálogo, interface, porta de pagamentos, webhook, fila, banco e autorização.

## Acceptance criteria

- [ ] A interface mostra versão do plano, preço, periodicidade, limites, renovação e condições antes do checkout.
- [ ] O checkout usa provedor externo sem armazenar número completo de cartão ou código de segurança.
- [ ] Webhook válido e estado confirmado concedem exatamente uma vez os entitlements contratados.
- [ ] Webhook inválido, repetido ou fora da tolerância não altera acesso.
- [ ] O backend bloqueia recurso restrito sem entitlement mesmo que a UI seja manipulada.
- [ ] Testes de contrato do provedor executam sandbox real; integrações locais usam PostgreSQL e Redis reais, sem mocks.

## Blocked by

- [`02-conta-primeiro-projeto.md`](02-conta-primeiro-projeto.md)

## Comments

- 2026-08-15 — Implementação assistida por IA preparada na branch `codex/issue-18-checkout-entitlement`, sem commit, push ou merge. Verificações locais: `pnpm test` (48 testes base/domínio/contratos, 44 API e 22 web aprovados; 3 OpenRouter e 11 integrações/API opt-in ignorados), `pnpm typecheck`, `pnpm --filter @planejador/web build`, `git diff --check` e QA visual real em Chromium desktop/mobile. Limites conhecidos: o contrato Stripe sandbox não executou por ausência de `STRIPE_SECRET_KEY`/Price de teste; a integração PostgreSQL + Redis real não executou porque Docker está indisponível neste host. Ambos permanecem testes opt-in, sem respostas artificiais do provedor. A issue conserva `ready-for-agent` e critérios abertos porque essas verificações externas e a integração na branch padrão ainda não ocorreram.
- 2026-08-15 — Findings de review corrigidos com inbox PostgreSQL anterior ao ACK, recuperação de fila, snapshot imutável de Price/quantidade/versão/capabilities, tenant imutável, estados Stripe completos, idempotência namespaced e UX explícita com polling limitado. Verificações: `pnpm test` (50 testes base aprovados e 3 OpenRouter ignorados; 52 API aprovados e 12 opt-in ignorados; 24 web aprovados), `pnpm typecheck`, build web, `git diff --check` e Chromium real em 1440×1000/390×844 sem overflow nem erros de console. A conta Stripe conectada foi validada somente em leitura; sandbox e PostgreSQL/Redis reais continuam não executados neste host por ausência das variáveis opt-in e de Docker, portanto o status e os critérios permanecem abertos.
- 2026-08-18 — Remediação pós-review adicionou Zod estrito no checkout e em todas as respostas de billing consumidas pela aplicação, validação de JSON externo do Stripe, OpenAPI exato, preferência documentada por chave restrita `rk_test_`, termos sem promessa de cancelamento por autoatendimento e serialização distribuída por assinatura durante `consultar Stripe → reconciliar entitlement`, impedindo estado antigo atrasado de vencer. O teste Testcontainers agora percorre Redis → worker → PostgreSQL. Verificações locais: `pnpm test`, `pnpm typecheck`, build web, `git diff --check`, Playwright em Chromium 1440×1000/390×844 sem overflow/erros e revisão visual independente sem bloqueador material. Os contratos reais Stripe e PostgreSQL/Redis continuam pendentes porque não houve autorização/credenciais para criar Checkout Session no sandbox e o Docker está indisponível; a branch continua sem commit/merge e a issue permanece `ready-for-agent` com critérios abertos.
