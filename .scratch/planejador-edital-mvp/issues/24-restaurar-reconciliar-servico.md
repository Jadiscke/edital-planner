Status: ready-for-agent

# Restaurar o serviço e reconciliar o estado

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Entregar uma restauração ensaiável que recupere banco, objetos e filas críticas e permita ao operador reconciliar jobs, pagamentos e entitlements até um estado consistente observável.

## Acceptance criteria

- [ ] Um ambiente de teste é restaurado a partir de backup criptografado sem depender do ambiente original.
- [ ] Jobs pendentes podem ser retomados ou repetidos sem duplicar efeitos.
- [ ] Assinaturas e entitlements são reconciliados com o provedor e divergências ficam em fila operacional.
- [ ] A interface operacional mostra instante do backup, RPO observado, duração, divergências e resultado da reconciliação.
- [ ] Um teste automatizado de desastre executa backup, perda controlada, restauração e verificações pelas APIs públicas.

## Blocked by

- [`19-ciclo-cobranca-acesso.md`](19-ciclo-cobranca-acesso.md)
- [`20-investigar-repetir-processing-job.md`](20-investigar-repetir-processing-job.md)
- [`23-excluir-conta-dados.md`](23-excluir-conta-dados.md)

