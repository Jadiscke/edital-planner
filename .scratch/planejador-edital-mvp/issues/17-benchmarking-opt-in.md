Status: ready-for-agent

# Comparar coorte anônima mediante opt-in

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir que o usuário autorize benchmarking e veja apenas estatísticas agregadas de uma coorte comparável que satisfaça os limites de anonimização. A fatia inclui consentimento, agregação, API e visualização.

## Acceptance criteria

- [ ] Benchmarking permanece desativado até opt-in específico e versionado.
- [ ] A revogação interrompe o uso futuro dos dados do usuário.
- [ ] Coortes abaixo do limite ou com risco de reidentificação não retornam estatísticas.
- [ ] A UI mostra critérios da coorte, tamanho elegível, média, mediana, faixa e percentil sem expor indivíduos.
- [ ] Testes com datasets fixos cobrem inclusão, exclusão, revogação, limiar, API e Playwright.

## Blocked by

- [`16-painel-individual-previsao.md`](16-painel-individual-previsao.md)

