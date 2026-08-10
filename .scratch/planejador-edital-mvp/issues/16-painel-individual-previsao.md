Status: ready-for-agent

# Exibir painel individual e previsão explicável

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Apresentar ao candidato séries e resumos de execução, cobertura, aderência, velocidade, exercícios e previsão, sempre indicando origem, janela temporal e natureza observada ou estimada.

## Acceptance criteria

- [ ] O painel mostra horas, sessões, páginas, velocidade, exercícios, acerto, aderência e cobertura por teoria, revisão e exercícios.
- [ ] Cada métrica informa período, origem e se é observada, manual, importada ou estimada.
- [ ] A previsão mostra variação desde a versão anterior e não promete aprovação.
- [ ] Amostras vazias ou insuficientes exibem estado explícito sem valores inventados.
- [ ] Testes de agregação usam dataset fixo; API e Playwright comprovam valores e estados exibidos.

## Blocked by

- [`14-transferir-recalibrar-futuro.md`](14-transferir-recalibrar-futuro.md)
- [`15-registrar-exercicios-desempenho.md`](15-registrar-exercicios-desempenho.md)

