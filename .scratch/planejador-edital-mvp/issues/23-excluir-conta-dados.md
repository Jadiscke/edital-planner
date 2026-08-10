Status: ready-for-agent

# Excluir conta sem reutilização residual

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Executar exclusão de conta como processo auditável e idempotente, eliminando, anonimizando, bloqueando ou retendo cada dado conforme política explícita e impedindo reutilização durante todo o processo.

## Acceptance criteria

- [ ] A UI explica efeitos e retenções e exige autenticação reforçada antes da confirmação.
- [ ] O job revoga sessões e acesso, processa banco, objetos, índices, filas e sistemas analíticos aplicáveis.
- [ ] Cada item termina como excluído, anonimizado, bloqueado ou retido com fundamento e prazo.
- [ ] Repetir o pedido não restaura nem duplica operações e o usuário não volta a autenticar.
- [ ] Testes de integração usam dados e armazenamento reais de teste e verificam o resultado pelas interfaces públicas e Playwright.

## Blocked by

- [`22-exportar-dados-usuario.md`](22-exportar-dados-usuario.md)

