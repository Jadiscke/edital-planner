Status: ready-for-agent

# Transferir pendências e recalibrar somente o futuro

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Fechar uma semana, transferir tarefas pendentes e recalibrar velocidade e estimativas somente para tarefas não iniciadas e semanas futuras, preservando integralmente o passado executado.

## Acceptance criteria

- [ ] O fechamento calcula velocidade observada por matéria a partir de sessões válidas.
- [ ] Pendências aparecem na semana seguinte sem alterar tarefas concluídas.
- [ ] A nova versão registra velocidade anterior, nova, amostra usada e impacto na previsão.
- [ ] Repetir o fechamento não duplica transferências nem cria nova versão sem mudança.
- [ ] Testes com dataset e relógio fixos comprovam imutabilidade histórica, integração e jornada Playwright.

## Blocked by

- [`13-conclusao-parcial-continuacao.md`](13-conclusao-parcial-continuacao.md)

