Status: ready-for-agent

# Criar conta e primeiro projeto

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir que um candidato autenticado crie seu primeiro projeto de concurso e o recupere após nova sessão. A fatia inclui tela, contrato HTTP, autorização, regras de domínio, persistência e auditoria mínima.

## Acceptance criteria

- [ ] Um usuário autenticado cria um projeto informando concurso, cargo e área e o vê na lista após recarregar a aplicação.
- [ ] O contrato rejeita dados inválidos com erros por campo exibidos na interface.
- [ ] Um usuário não consegue consultar ou alterar projeto pertencente a outro tenant.
- [ ] A criação repetida com a mesma chave de idempotência não duplica o projeto.
- [ ] Testes cobrem domínio, contrato OpenAPI, PostgreSQL real em container e jornada Playwright da tela até a leitura persistida.

## Blocked by

None - can start immediately

