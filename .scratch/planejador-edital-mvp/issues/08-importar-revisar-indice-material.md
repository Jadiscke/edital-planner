Status: ready-for-agent

# Importar e revisar índice de material

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir cadastrar um material e extrair seu índice a partir de PDF, fotografia, captura de tela ou entrada manual, sem exigir a obra completa. A fatia inclui upload seguro, inferência via OpenRouter, schema, editor, persistência e auditoria.

## Acceptance criteria

- [ ] O usuário cadastra material e edição e envia somente páginas de índice ou digita os itens manualmente.
- [ ] A extração retorna hierarquia, página inicial, página final inferida, página de origem e deslocamento de paginação.
- [ ] A interface permite corrigir texto, hierarquia, páginas e deslocamento antes da aprovação.
- [ ] Saída inválida não é promovida e fica disponível para correção ou reprocessamento.
- [ ] Testes usam fixtures reais e teste live opcional com OpenRouter real, sem respostas mockadas.
- [ ] Playwright comprova cadastro, extração, correção e aprovação.

## Blocked by

- [`02-conta-primeiro-projeto.md`](02-conta-primeiro-projeto.md)

