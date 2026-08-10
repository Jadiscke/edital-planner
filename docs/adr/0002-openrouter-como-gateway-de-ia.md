# ADR 0002 — OpenRouter como gateway único de IA

Status: Aceito  
Data: 2026-07-23

## Contexto

O ADR 0001 definiu modelos primário e fallback, mas descreveu adaptadores diretos por fornecedor. O produto precisa trocar modelos sem redistribuir código, aplicar uma política uniforme de privacidade, usar fallback entre modelos e manter uma única fronteira de rede auditável.

## Decisão

Toda inferência de LLM passa exclusivamente pelo OpenRouter em `https://openrouter.ai/api/v1`. Não haverá cliente direto da DeepSeek, OpenAI, Anthropic, Mistral ou outro fornecedor no pacote de IA.

O pacote `@planejador/ai` expõe quatro operações:

- diagnóstico seguro de configuração;
- verticalização de edital;
- extração de índice de material;
- sugestão de associações.

Modelos são configurados por ambiente:

- `OPENROUTER_PRIMARY_MODEL` define o primeiro slug;
- `OPENROUTER_FALLBACK_MODELS` define slugs adicionais em ordem;
- um modelo DeepSeek é usado somente quando seu slug atual do OpenRouter for configurado;
- nenhum alias de fornecedor fica codificado na aplicação.

As requisições usam Chat Completions, o parâmetro `models` para fallback, JSON Schema estrito, `provider.require_parameters: true`, `provider.data_collection: deny` e ZDR por padrão. Texto, imagens privadas e PDFs entram no mesmo contrato multimodal. A resposta é validada novamente por Zod antes de retornar ao domínio.

Cada resultado registra identificador da geração, modelo e endpoint efetivamente usados, versão do prompt, tokens, custo e latência. A chave nunca integra diagnóstico, retorno, log ou mensagem de erro.

## Testes

- Contratos, inputs, prompts e JSON Schemas são verificados localmente sem mocks.
- O contrato HTTP de autenticação é exercitado contra o endpoint real usando uma credencial deliberadamente inválida e sem custo.
- Um smoke test pago opcional executa verticalização real quando o usuário configura chave e modelo.
- Não existem respostas artificiais de OpenRouter ou fornecedores no pacote.

## Privacidade e segurança

ZDR e bloqueio de endpoints que coletam dados são defaults, não garantias jurídicas suficientes. Antes de documentos reais, devem ser aprovados os termos do OpenRouter e de cada endpoint elegível, região, retenção, treinamento, subprocessadores, exclusão, resposta a incidentes e transferências internacionais.

Conteúdo documental é tratado como dado não confiável; prompts proíbem seguir instruções do documento e nenhum modelo recebe ferramentas com autoridade. Saída de IA nunca decide autorização, entitlement, pagamento, retenção nem aprovação funcional.

## Consequências

### Positivas

- uma única integração e chave por ambiente;
- troca e fallback de modelos por configuração;
- política uniforme de dados e schemas;
- auditoria de custo e modelo resolvido;
- menor acoplamento a SDKs e aliases de fornecedores.

### Custos e riscos

- OpenRouter torna-se dependência crítica adicional;
- disponibilidade e política dependem do gateway e do endpoint escolhido;
- suporte a JSON Schema e multimodalidade varia por endpoint;
- fallback pode usar modelo com custo ou comportamento diferente;
- ZDR pode reduzir o conjunto de endpoints disponíveis.

## Relação com o ADR 0001

Este ADR substitui as partes do ADR 0001 que previam adaptadores diretos e identificadores de modelo codificados. Parsing local, OCR seletivo, revisão humana, avaliação offline, orçamento e demais decisões permanecem válidos.

## Fontes

- [OpenRouter — API reference](https://openrouter.ai/docs/api/reference/overview)
- [OpenRouter — structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [OpenRouter — model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [OpenRouter — provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter — Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [OpenRouter — multimodal inputs](https://openrouter.ai/docs/guides/overview/multimodal/overview)
- [OpenRouter — usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)

