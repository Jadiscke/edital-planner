# Issue tracker: Local Markdown

Issues e PRDs deste repositório são arquivos Markdown armazenados em `.scratch/`.

## Convenções

- Uma funcionalidade por diretório: `.scratch/<feature-slug>/`
- O PRD fica em `.scratch/<feature-slug>/PRD.md`
- Issues de implementação ficam em `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- A numeração começa em `01`
- O estado de triagem é registrado em uma linha `Status:` no início da issue
- Comentários e histórico são adicionados ao final, sob `## Comments`

## Conclusão de uma issue

`completed` é o estado terminal de entrega e não um papel de triagem. Uma issue só recebe `Status: completed` quando todos os critérios de aceite estão marcados, a verificação relevante está registrada em `## Comments` e a implementação integra a branch padrão. Até esse momento, ela conserva um dos cinco estados canônicos de triagem.

O comentário de conclusão deve informar data, branch ou commit, testes executados e eventuais limites conhecidos. Issues desbloqueadas pela entrega permanecem em `ready-for-agent`; a ordem recomendada de execução é mantida no PRD pai.

## Publicar no rastreador

Quando uma skill solicitar a publicação de um PRD ou issue, criar o arquivo correspondente em `.scratch/<feature-slug>/`.

## Consultar um ticket

Ler o arquivo indicado pelo caminho ou número fornecido pelo usuário.
