Status: ready-for-agent

# Investigar e repetir ProcessingJob

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir que um operador autorizado localize um job, veja configuração e custos não sensíveis e execute replay controlado usando a mesma entrada versionada, sem duplicar efeitos.

## Acceptance criteria

- [ ] O operador pesquisa por usuário, projeto, documento, estado e correlação.
- [ ] A tela exibe modelo resolvido, prompt versionado, tokens, custo, latência, tentativas e erro sanitizado.
- [ ] Replay exige autorização, justificativa e chave idempotente e cria execução vinculada à original.
- [ ] Segredos, documento integral e prompt sensível não aparecem em logs ou respostas administrativas.
- [ ] Testes de autorização, PostgreSQL, Redis, worker e Playwright comprovam investigação e replay por interfaces públicas.

## Blocked by

- [`04-upload-edital-processing-job.md`](04-upload-edital-processing-job.md)
- [`06-fallback-openrouter-revisao-humana.md`](06-fallback-openrouter-revisao-humana.md)

