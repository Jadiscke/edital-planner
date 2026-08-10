Status: ready-for-agent

# Configurar e gerar o backlog completo

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Permitir configurar horas semanais, páginas por hora e duração-alvo e gerar todo o backlog versionado necessário para cobrir as associações aprovadas, incluindo teoria, revisão e exercícios.

## Acceptance criteria

- [ ] O usuário escolhe duração de 15, 30, 45, 60 ou 90 minutos e informa horas semanais e velocidade inicial.
- [ ] Intervalos aprovados são divididos em blocos sequenciais de teoria sem lacunas ou sobreposições injustificadas.
- [ ] Revisão depende de toda a teoria e exercícios dependem da revisão.
- [ ] O resultado informa páginas, material, matéria, tópico, subtópico, número e total de blocos.
- [ ] Testes de domínio usam relógio e entradas fixas; integração, contrato e Playwright verificam configuração até backlog persistido.

## Blocked by

- [`09-associar-material-cobertura.md`](09-associar-material-cobertura.md)

