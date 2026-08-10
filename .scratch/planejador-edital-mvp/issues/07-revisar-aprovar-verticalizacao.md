Status: ready-for-agent

# Revisar e aprovar uma versão verticalizada

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir ao candidato aceitar, corrigir, mover, mesclar e rejeitar itens da verticalização e publicar uma versão aprovada sem apagar a sugestão original. A fatia cobre editor, comandos HTTP, regras, persistência versionada e auditoria.

## Acceptance criteria

- [ ] Cada ação do editor produz estado válido e registra autor, instante, versão e justificativa quando exigida.
- [ ] Publicar cria versão aprovada imutável e preserva sugestão e decisões anteriores.
- [ ] Comandos concorrentes contra versão obsoleta são rejeitados com conflito tratável pela interface.
- [ ] Itens rejeitados não participam de cobertura nem planejamento.
- [ ] Testes de domínio, integração PostgreSQL, contrato e Playwright exercitam todas as ações por interfaces públicas.

## Blocked by

- [`05-verticalizar-edital-evidencia.md`](05-verticalizar-edital-evidencia.md)
- [`06-fallback-openrouter-revisao-humana.md`](06-fallback-openrouter-revisao-humana.md)

