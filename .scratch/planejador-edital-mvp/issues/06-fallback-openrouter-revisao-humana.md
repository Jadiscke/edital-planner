Status: ready-for-agent

# Escalar modelos do OpenRouter até revisão humana

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Executar inferências por OpenRouter com modelo primário e fallbacks configurados por ambiente, exigindo políticas de dados e encaminhando resultados inseguros para revisão humana. A interface deve explicar o estado sem expor prompts ou credenciais.

## Acceptance criteria

- [ ] Configuração ausente ou inválida falha antes de enfileirar inferência e informa quais variáveis são necessárias.
- [ ] O request usa os modelos na ordem configurada, `data_collection: deny`, ZDR quando habilitado e saída estruturada estrita.
- [ ] O modelo efetivamente usado e a contabilização retornada pelo OpenRouter ficam registrados.
- [ ] Timeout, resposta inválida, baixa evidência ou limite de custo terminam em estado recuperável ou revisão humana, nunca em aprovação silenciosa.
- [ ] Testes sem mocks verificam configuração, transições e validação por interfaces públicas; teste live verifica uma chamada real quando as credenciais existem.
- [ ] A UI apresenta conclusão, necessidade de revisão ou falha recuperável com correlação do job.

## Blocked by

- [`05-verticalizar-edital-evidencia.md`](05-verticalizar-edital-evidencia.md)

## Comments

- 2026-08-15 — Implementação concluída na branch `codex/issue-06-fallback-openrouter`, commit `74343fd`. O status permanece `ready-for-agent` até a integração na branch padrão, conforme a convenção do rastreador.
- Verificações: `pnpm test` (113 aprovados, 12 ignorados por infraestrutura/flags), `pnpm typecheck`, `RUN_OPENROUTER_LIVE_TESTS=true pnpm test:ai:live` (credencial inválida rejeitada pelo endpoint real; 2 testes pagos ignorados) e inspeção visual responsiva em desktop e mobile.
- Limites conhecidos: integrações PostgreSQL/S3/Redis foram ignoradas porque a infraestrutura opcional não estava disponível; chamadas live pagas não foram executadas sem credenciais e autorização explícita de transferência.
- Aviso de IA: resultados gerados por IA são sugestões sujeitas à revisão humana e não equivalem a aprovação. Prompts, credenciais e dados sensíveis não são exibidos na interface.
- 2026-08-15 — Critérios reabertos após review independente identificar promoção prematura, divergência de observabilidade e lacunas de contabilização/testes. Permanecem abertos até nova revisão e integração na branch padrão.
