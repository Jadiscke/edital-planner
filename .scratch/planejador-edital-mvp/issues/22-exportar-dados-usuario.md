Status: ready-for-agent

# Exportar todos os dados do usuário

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir solicitar e baixar exportação estruturada dos dados pessoais e funcionais do usuário, incluindo projetos, versões, revisões, materiais, planos, sessões, métricas, consentimentos e cobrança aplicável.

## Acceptance criteria

- [ ] A solicitação exige autenticação reforçada e cria job idempotente com protocolo e estado.
- [ ] O arquivo contém todos os domínios aplicáveis, versões e metadados necessários para interpretação.
- [ ] O download usa URL temporária vinculada ao usuário e expira no prazo configurado.
- [ ] Dados de outros tenants, segredos e dados completos de pagamento nunca aparecem.
- [ ] Testes de completude usam dataset real controlado, armazenamento real de teste, contrato e Playwright.

## Blocked by

- [`07-revisar-aprovar-verticalizacao.md`](07-revisar-aprovar-verticalizacao.md)
- [`08-importar-revisar-indice-material.md`](08-importar-revisar-indice-material.md)
- [`12-executar-tarefa-sessao.md`](12-executar-tarefa-sessao.md)
- [`15-registrar-exercicios-desempenho.md`](15-registrar-exercicios-desempenho.md)
- [`19-ciclo-cobranca-acesso.md`](19-ciclo-cobranca-acesso.md)

