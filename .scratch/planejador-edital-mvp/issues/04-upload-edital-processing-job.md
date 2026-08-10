Status: ready-for-agent

# Enviar edital e acompanhar ProcessingJob

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Entregar a jornada em que o candidato envia um edital, acompanha sua validação e processamento e recebe um resultado claro de aceitação ou rejeição. A fatia inclui upload, armazenamento privado, versão de documento, fila, worker, API de status e interface.

## Acceptance criteria

- [ ] Um PDF válido cria uma única versão imutável de documento, um objeto privado e um `ProcessingJob` observável.
- [ ] Reenvio idempotente do mesmo arquivo e chave não duplica versão, objeto ou job.
- [ ] Arquivo inválido, protegido ou acima do limite é rejeitado antes de qualquer inferência e a UI explica o motivo.
- [ ] O status sobrevive a recarregamento e converge entre pendente, processando, concluído ou falho recuperável.
- [ ] Testes usam PostgreSQL, Redis, armazenamento compatível com S3 e worker reais em ambiente de teste; nenhuma resposta externa é mockada.
- [ ] Playwright comprova upload, acompanhamento e rejeição pela interface.

## Blocked by

- [`02-conta-primeiro-projeto.md`](02-conta-primeiro-projeto.md)

