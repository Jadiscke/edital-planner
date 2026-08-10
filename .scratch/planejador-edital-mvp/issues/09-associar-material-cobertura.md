Status: ready-for-agent

# Associar material e visualizar cobertura

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Sugerir associações revisáveis entre itens aprovados do edital e intervalos aprovados dos materiais, mostrando tipo de relação, evidência, justificativa, confiança, cobertura e lacunas. A fatia atravessa inferência OpenRouter, regras, banco, API e revisão na UI.

## Acceptance criteria

- [ ] O sistema sugere relações direta, parcial, abrangente, composta, contextual ou sem correspondência.
- [ ] Cada sugestão mostra itens de origem, páginas, justificativa e confiança antes de qualquer aprovação.
- [ ] Aceitar, corrigir ou rejeitar atualiza cobertura e lacunas de forma determinística.
- [ ] Relacionamentos muitos-para-muitos e múltiplos PDFs são preservados sem duplicar páginas.
- [ ] Testes cobrem schema, regras, PostgreSQL, contrato e Playwright; inferência live usa OpenRouter real quando configurada.

## Blocked by

- [`07-revisar-aprovar-verticalizacao.md`](07-revisar-aprovar-verticalizacao.md)
- [`08-importar-revisar-indice-material.md`](08-importar-revisar-indice-material.md)

