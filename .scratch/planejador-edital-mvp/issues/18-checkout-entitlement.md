Status: ready-for-agent

# Contratar plano e receber entitlement

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Entregar a jornada de seleção de plano, checkout hospedado e concessão determinística de entitlement após confirmação reconciliada do provedor. A fatia inclui catálogo, interface, porta de pagamentos, webhook, fila, banco e autorização.

## Acceptance criteria

- [ ] A interface mostra versão do plano, preço, periodicidade, limites, renovação e condições antes do checkout.
- [ ] O checkout usa provedor externo sem armazenar número completo de cartão ou código de segurança.
- [ ] Webhook válido e estado confirmado concedem exatamente uma vez os entitlements contratados.
- [ ] Webhook inválido, repetido ou fora da tolerância não altera acesso.
- [ ] O backend bloqueia recurso restrito sem entitlement mesmo que a UI seja manipulada.
- [ ] Testes de contrato do provedor executam sandbox real; integrações locais usam PostgreSQL e Redis reais, sem mocks.

## Blocked by

- [`02-conta-primeiro-projeto.md`](02-conta-primeiro-projeto.md)

