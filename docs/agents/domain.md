# Domain Docs

Este projeto usa documentação de domínio com contexto único.

## Antes de explorar

- Ler `CONTEXT.md` na raiz.
- Ler os ADRs relevantes em `docs/adr/`.
- Se algum desses arquivos ainda não existir, prosseguir normalmente.

## Estrutura

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── agents/
└── src/
```

## Vocabulário

Ao nomear conceitos em código, testes, PRDs, issues ou decisões arquiteturais, usar os termos definidos em `CONTEXT.md`.

Se um conceito necessário ainda não estiver no glossário, registrar a lacuna sem criar sinônimos incompatíveis.

## Conflitos arquiteturais

Se uma proposta contradizer um ADR existente, indicar explicitamente o conflito em vez de substituir silenciosamente a decisão.
