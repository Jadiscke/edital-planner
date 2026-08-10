Status: ready-for-agent

# Executar tarefa com temporizador ou registro manual

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir iniciar uma tarefa por Pomodoro, cronômetro contínuo ou registro manual e manter uma sessão durável com eventos de início, pausa, retomada, encerramento e descarte.

## Acceptance criteria

- [ ] O usuário inicia tarefa nos três modos permitidos e vê o tempo ativo, pausado e decorrido.
- [ ] Recarregar ou reconectar recupera a sessão sem duplicar tempo nem eventos.
- [ ] Eventos repetidos com a mesma idempotência produzem um único efeito.
- [ ] Transições inválidas são rejeitadas e explicadas na interface.
- [ ] Testes usam relógio controlado real do domínio, PostgreSQL, contrato e Playwright; não simulam colaboradores internos.

## Blocked by

- [`11-distribuir-backlog-semanas.md`](11-distribuir-backlog-semanas.md)

