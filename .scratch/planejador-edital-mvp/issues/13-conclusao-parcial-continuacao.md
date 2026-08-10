Status: ready-for-agent

# Concluir parcialmente e criar continuação

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Registrar páginas efetivamente estudadas e, quando a tarefa for parcial, criar continuação ligada à tarefa original sem contar páginas duas vezes nem liberar dependências prematuramente.

## Acceptance criteria

- [ ] A conclusão registra intervalo planejado, intervalo realizado, dificuldade, tempo ativo, pausas e motivo da parcialidade.
- [ ] A continuação cobre exatamente o intervalo restante e referencia a tarefa original.
- [ ] Páginas concluídas não são contadas novamente e a revisão permanece bloqueada até cobertura teórica integral.
- [ ] A interface atualiza progresso e apresenta a continuação na ordem correta.
- [ ] Testes de domínio, integração, contrato e Playwright exercitam conclusão total, parcial e repetida.

## Blocked by

- [`12-executar-tarefa-sessao.md`](12-executar-tarefa-sessao.md)

