Status: ready-for-agent

# Distribuir o backlog em semanas

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Distribuir o backlog completo em semanas sucessivas sem exceder a capacidade, mantendo dependências e intercalando matérias. A UI deve explicar capacidade, previsão e ordem das tarefas.

## Acceptance criteria

- [ ] Nenhuma semana excede os minutos disponíveis configurados.
- [ ] A ordem teoria 1 até N, revisão e exercícios nunca é invertida.
- [ ] A distribuição é determinística para plano, relógio e configuração iguais.
- [ ] A interface exibe semana atual, semanas futuras, capacidade usada e previsão de conclusão.
- [ ] Testes de domínio, persistência, contrato e Playwright verificam a mesma distribuição observável.

## Blocked by

- [`10-configurar-gerar-backlog.md`](10-configurar-gerar-backlog.md)

