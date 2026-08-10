Status: ready-for-agent

# Conceder entitlement administrativo temporário

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir que administrador autorizado conceda ou revogue entitlement temporário com justificativa, validade e auditoria, sem alterar o histórico comercial da assinatura.

## Acceptance criteria

- [ ] A concessão exige permissão específica, reautenticação, justificativa e data de expiração.
- [ ] O acesso efetivo combina assinatura e concessão sem modificar a assinatura do provedor.
- [ ] Expiração ou revogação remove o direito sem apagar dados do usuário.
- [ ] Suporte sem permissão financeira não consegue conceder nem revogar direitos.
- [ ] Testes de domínio, autorização, banco, contrato e Playwright cobrem concessão, expiração e revogação.

## Blocked by

- [`18-checkout-entitlement.md`](18-checkout-entitlement.md)
- [`19-ciclo-cobranca-acesso.md`](19-ciclo-cobranca-acesso.md)

