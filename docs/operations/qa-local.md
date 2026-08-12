# QA local da aplicação

Este runbook reproduz o ambiente usado para validar a aplicação completa em `http://127.0.0.1:4173/app/`.

## Topologia

| Serviço | Endereço | Comando |
| --- | --- | --- |
| API de QA | `http://127.0.0.1:3001` | `pnpm --filter @planejador/api dev:test` |
| Aplicação React | `http://127.0.0.1:4174` | `pnpm dev:web` |
| Landing e proxy `/app/` | `http://127.0.0.1:4173` | `pnpm --filter @planejador/marketing dev` |

O servidor `dev:test` oferece login OIDC simulado apenas em desenvolvimento, catálogo local de editais oficiais e repositórios em memória por padrão. Reiniciar a API apaga sessões, projetos, documentos, jobs, verticalizações e materiais desse ambiente.

## Configuração do OpenRouter

Crie `.env` a partir de `.env.example` e configure, no mínimo:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_PRIMARY_MODEL=deepseek/deepseek-v4-flash-0731
OPENROUTER_FALLBACK_MODELS=openai/gpt-5.6-luna
OPENROUTER_ZDR=true
OPENROUTER_DATA_COLLECTION=deny
LOCAL_PDF_PARSING_APPROVED=true
OPENROUTER_DOCUMENT_TRANSFER_APPROVED=true
```

Os dois últimos valores são consentimentos do ambiente, não defaults de produção. O primeiro libera parsing local de PDFs digitais. O segundo libera transferência ao OpenRouter quando imagem, PDF escaneado ou fallback remoto exigir inferência.

Em uma worktree, o `.env` não é copiado pelo Git. Inicie a API apontando explicitamente para o arquivo do checkout principal quando a worktree não possuir seu próprio arquivo:

```bash
node --env-file=/caminho/para/planejador-edital/.env --import tsx apps/api/src/test-main.ts
```

Valide a configuração sem imprimir a chave:

```bash
pnpm ai:check
```

Os smoke tests pagos são opt-in:

```bash
RUN_OPENROUTER_LIVE_TESTS=true \
RUN_OPENROUTER_PAID_LIVE_TESTS=true \
node --env-file=.env --test --experimental-strip-types \
  packages/ai/test/openrouter.live.test.ts
```

## Roteiro de QA

### Edital completo

1. Entre pelo login local e crie um projeto.
2. Marque **Processar Edital Completo**.
3. Use um edital oficial do catálogo ou selecione um PDF.
4. Envie e observe o estado **Verificando e organizando o edital…**.
5. Confirme **Edital verticalizado com evidência.**.
6. Confira opções de prova, hierarquia, confiança e margem de evidência.

PDFs digitais tentam primeiro o parser determinístico local, sem custo de modelo. PDFs sem camada de texto podem usar o parser remoto configurado.

### Índice de material

1. Cadastre título e edição do material.
2. Escolha **Enviar PDFs ou Imagens**.
3. Selecione somente páginas de sumário.
4. Clique em **Preparar Arquivo(s)**.
5. Durante o job, confirme o loader, o nome do arquivo e o progresso do lote.
6. Revise títulos, hierarquia e intervalos; então salve ou aprove a versão.
7. Recarregue a página e confirme que material e última versão reaparecem.

O navegador sempre limpa a seleção do arquivo após reload. Isso não significa perda do material ou das versões já persistidas.

## Diagnóstico rápido

| Sintoma | Verificação | Correção |
| --- | --- | --- |
| Toda operação completa falha imediatamente | Boot da API informa `.env not found` | Reinicie a API com `--env-file` explícito |
| Configuração existe, mas documento é bloqueado antes da inferência | Confira os dois consentimentos de parsing/transferência | Habilite somente no ambiente autorizado |
| Imagem falha, mas smoke test textual passa | Pode ser saída multimodal inválida ou imagem sem índice reconhecível | Reenvie a fonte e execute o smoke multimodal com fixture conhecida |
| Chrome e navegador do Codex mostram dados diferentes | São sessões e estados de navegador separados | Faça login no navegador usado para o QA |
| Material volta ao formulário após reload | API antiga sem listagem de materiais ou frontend desatualizado | Reinicie API e frontend a partir da branch consolidada |

Use a correlação exibida na interface para localizar o job. Não registre chaves, conteúdo privado ou base64 em logs.

## Qualidade antes do merge

```bash
pnpm test
pnpm typecheck
git diff --check
```

Quando Docker estiver disponível, a suíte da API também cobre PostgreSQL, Redis/BullMQ e armazenamento S3 compatível por Testcontainers.

