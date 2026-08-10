Status: ready-for-agent

# Escalar modelos do OpenRouter até revisão humana

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Executar inferências por OpenRouter com modelo primário e fallbacks configurados por ambiente, exigindo políticas de dados e encaminhando resultados inseguros para revisão humana. A interface deve explicar o estado sem expor prompts ou credenciais.

## Acceptance criteria

- [ ] Configuração ausente ou inválida falha antes de enfileirar inferência e informa quais variáveis são necessárias.
- [ ] O request usa os modelos na ordem configurada, `data_collection: deny`, ZDR quando habilitado e saída estruturada estrita.
- [ ] O modelo efetivamente usado e a contabilização retornada pelo OpenRouter ficam registrados.
- [ ] Timeout, resposta inválida, baixa evidência ou limite de custo terminam em estado recuperável ou revisão humana, nunca em aprovação silenciosa.
- [ ] Testes sem mocks verificam configuração, transições e validação por interfaces públicas; teste live verifica uma chamada real quando as credenciais existem.
- [ ] A UI apresenta conclusão, necessidade de revisão ou falha recuperável com correlação do job.

## Blocked by

- [`05-verticalizar-edital-evidencia.md`](05-verticalizar-edital-evidencia.md)

