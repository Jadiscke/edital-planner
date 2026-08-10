Status: ready-for-agent

# Verticalizar edital com evidência verificável

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Transformar uma versão processada do edital em árvore de matérias, tópicos e subtópicos, sempre preservando texto original, localização, confiança, prompt e modelo resolvido. A fatia inclui worker de IA via OpenRouter, validação de schema, persistência, API e árvore na interface.

## Acceptance criteria

- [ ] Um edital processado produz árvore validada com matéria, tópico, subtópico e evidência por item.
- [ ] A interface abre a página ou trecho que sustenta cada item e apresenta a confiança sem tratá-la como aprovação.
- [ ] Saída que não satisfaz o schema não é promovida à árvore funcional.
- [ ] O resultado registra versão do documento, prompt, modelo resolvido, tokens, custo e latência.
- [ ] Testes determinísticos cobrem parsing e validação com fixtures reais versionadas; o teste live chama o OpenRouter somente com credenciais reais e nunca usa resposta mockada.
- [ ] A jornada Playwright parte do documento concluído e termina na árvore consultável.

## Blocked by

- [`04-upload-edital-processing-job.md`](04-upload-edital-processing-job.md)

