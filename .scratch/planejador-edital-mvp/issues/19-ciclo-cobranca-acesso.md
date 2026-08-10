Status: ready-for-agent

# Atualizar acesso após eventos de cobrança

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Manter assinatura e acesso coerentes diante de upgrade, downgrade, inadimplência, tolerância, cancelamento, reembolso e eventos fora de ordem, sem apagar dados acima do novo limite.

## Acceptance criteria

- [ ] Cada evento converge para um estado explícito de assinatura e conjunto versionado de entitlements.
- [ ] Eventos duplicados ou fora de ordem não revertem estado mais recente nem concedem acesso duas vezes.
- [ ] Downgrade bloqueia novas criações acima do limite sem excluir dados existentes.
- [ ] A UI informa estado, data efetiva, direitos atuais e próxima mudança.
- [ ] Testes usam sandbox real do provedor para contratos e banco/fila reais para convergência e Playwright.

## Blocked by

- [`18-checkout-entitlement.md`](18-checkout-entitlement.md)

