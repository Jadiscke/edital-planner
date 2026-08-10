Status: ready-for-agent

# Arquivar e duplicar projeto preservando isolamento

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir que o candidato arquive um projeto sem apagar seu histórico e crie uma duplicata independente com origem rastreável. A ação deve atravessar interface, API, domínio, banco e auditoria.

## Acceptance criteria

- [ ] Arquivar remove o projeto das listas ativas e o mantém consultável na área de arquivados.
- [ ] Duplicar cria um novo projeto ativo com identificador próprio e referência auditável à origem.
- [ ] Alterações futuras na duplicata não modificam o projeto original.
- [ ] Usuários de outro tenant não conseguem arquivar nem duplicar o projeto.
- [ ] Testes de integração e Playwright comprovam os comportamentos usando banco real e interfaces públicas.

## Blocked by

- [`02-conta-primeiro-projeto.md`](02-conta-primeiro-projeto.md)

