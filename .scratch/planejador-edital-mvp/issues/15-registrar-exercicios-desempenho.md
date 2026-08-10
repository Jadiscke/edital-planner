Status: ready-for-agent

# Registrar exercícios e calcular desempenho

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir concluir uma tarefa de exercícios registrando quantidades e tempo e calcular métricas observáveis por matéria, tópico e subtópico.

## Acceptance criteria

- [ ] O formulário registra total, corretas, incorretas, anuladas, em branco, tempo, fonte, dificuldade e observações.
- [ ] Contagens inconsistentes são rejeitadas antes da persistência.
- [ ] Taxa de acerto, omissão, questões por hora e tempo médio por questão seguem fórmulas documentadas.
- [ ] Reenvio idempotente não duplica sessão nem métricas.
- [ ] Testes de domínio, PostgreSQL, contrato e Playwright verificam entrada, validação e resultados exibidos.

## Blocked by

- [`12-executar-tarefa-sessao.md`](12-executar-tarefa-sessao.md)

