# `@planejador/ai`

Integração única de IA do Planejador de Editais. Toda inferência passa pelo OpenRouter; o pacote não contém cliente direto da DeepSeek, OpenAI, Anthropic, Mistral ou outro fornecedor.

## Interface pública

```ts
import { createAiService } from "@planejador/ai";

const ai = createAiService(process.env);

await ai.checkConfiguration();
await ai.verticalizeEdital(input);
await ai.extractMaterialIndex(input);
await ai.suggestAssociations(input);
```

As três operações retornam:

```ts
{
  data: {}, // saída validada pelo contrato Zod
  audit: {
    requestId: "gen-...",
    model: "modelo realmente usado",
    provider: "endpoint realmente usado",
    promptVersion: "verticalize-edital@1.0.0",
    durationMs: 1234,
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cachedTokens: 0,
      reasoningTokens: 0,
      cost: 0.001
    }
  }
}
```

## Configuração

Copie `.env.example` para `.env` e preencha ao menos:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_PRIMARY_MODEL=deepseek/deepseek-v4-flash-0731
OPENROUTER_FALLBACK_MODELS=openai/gpt-5.6-luna
```

O modelo é sempre um identificador do catálogo do OpenRouter. A configuração recomendada fixa a revisão DeepSeek V4 Flash 0731, em vez de seguir silenciosamente uma revisão futura.

`OPENROUTER_FALLBACK_MODELS` recebe slugs separados por vírgula. O pacote envia a lista ordenada pelo parâmetro `models`, permitindo ao próprio OpenRouter escolher o primeiro modelo disponível.

`OPENROUTER_MAX_COST_USD` limita o custo aceito por execução e `OPENROUTER_MIN_EVIDENCE_CONFIDENCE` define o piso de confiança de cada item. Resultados acima do custo, abaixo da confiança ou sem contabilização de custo seguem para revisão humana.

ZDR é habilitado por padrão e `data_collection: deny` é obrigatório. A configuração falha antes de criar um job quando uma variável necessária está ausente ou inválida.

## CLI

Diagnóstico seguro, sem mostrar a chave:

```bash
pnpm ai:check
```

Operações reais:

```bash
pnpm ai:verticalize ./entrada-verticalizacao.json
pnpm ai:extract-index ./entrada-indice.json
pnpm ai:associate ./entrada-associacao.json
```

Os comandos escrevem o resultado estruturado no stdout. Erros são sanitizados e não imprimem chave, conteúdo integral ou stack trace.

## Testes sem mocks

Testes de contratos, configuração, schemas e prompts:

```bash
pnpm test:ai
```

Contrato HTTP real com credencial deliberadamente inválida, sem custo:

```bash
RUN_OPENROUTER_LIVE_TESTS=true pnpm test:ai:live
```

Smoke test real e cobrado de verticalização:

```bash
RUN_OPENROUTER_PAID_LIVE_TESTS=true pnpm test:ai:live
```

O smoke test pago usa `OPENROUTER_API_KEY` e `OPENROUTER_PRIMARY_MODEL` do ambiente. Não existe resposta simulada ou fallback local.

## Segurança

- Conteúdo de editais e índices é tratado como não confiável nos prompts.
- Nenhuma saída é aceita sem validação Zod após a resposta estruturada.
- `provider.require_parameters` impede roteamento para endpoint sem suporte aos parâmetros exigidos.
- Imagens privadas e PDFs são enviados como data URLs; nenhum arquivo precisa ser publicado.
- API key nunca integra diagnósticos ou objetos retornados.
- Retries são limitados; OpenRouter realiza fallback entre os modelos configurados.
