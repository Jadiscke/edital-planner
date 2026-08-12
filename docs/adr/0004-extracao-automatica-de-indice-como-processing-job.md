# ADR 0004 — Extração automática de índice como ProcessingJob

Status: Aceito  
Data: 2026-08-12

## Contexto

A importação manual de índices é síncrona e determinística, mas a extração de PDF ou imagem depende de leitura de arquivo, inferência multimodal, validação estrutural e persistência de uma nova versão. Manter a requisição HTTP aberta durante essas etapas escondia o progresso, incentivava reenvios e não oferecia uma identidade estável para consultar, auditar ou recuperar a operação.

O fluxo também precisa acumular várias fontes em uma única revisão, preservar fontes que já foram extraídas quando uma fonte posterior falha e impedir que uma repetição com a mesma chave crie versões duplicadas.

## Decisão

Toda extração automática de índice de material é representada por um `ProcessingJob` de tipo `material_index_extraction`.

- `POST /materials/:materialId/index-versions` continua síncrono para `sourceKind: manual`.
- Para PDF ou imagem, o mesmo endpoint valida e aceita o arquivo, retorna HTTP `202` com o job e não espera a inferência terminar.
- O cliente consulta `GET /processing-jobs/:jobId` até um estado terminal.
- Um job concluído aponta para `resultVersionId`; a versão é recuperada pelo material e apresentada para revisão humana.
- Estados terminais distinguem conclusão, timeout do provedor, saída inválida e falha genérica.
- Chaves de idempotência são separadas por operação e por versão-base.
- Cada versão mantém `sources`, rastreabilidade por item, auditoria de inferência e a relação com a versão anterior.

Na infraestrutura persistente, o arquivo de entrada fica em armazenamento S3 compatível, o job fica no PostgreSQL e a execução é despachada pelo BullMQ. O worker de documentos também reconhece jobs de índice e os encaminha ao processador específico. No ambiente local de QA existe uma implementação em memória com o mesmo contrato observável.

## Experiência do usuário

UX é requisito funcional. Enquanto o job estiver ativo, a interface:

- mostra arquivo atual, posição no lote e etapa (`envio`, `fila` ou `processamento`);
- anuncia mudanças com `role=status` e `aria-live=polite`;
- desabilita a ação duplicada e mantém o rótulo específico;
- respeita `prefers-reduced-motion`;
- preserva fontes concluídas e identifica fontes que precisam ser reenviadas.

Após reload, o frontend lista os materiais do projeto, restaura o material mais recente e abre sua última versão para revisão. Seleções de arquivos locais não são restauradas porque navegadores não permitem repovoar `input[type=file]`.

## Privacidade e modelos

O pacote de IA mantém o OpenRouter como gateway único conforme o ADR 0002. Dois consentimentos independentes protegem documentos:

- `LOCAL_PDF_PARSING_APPROVED=true` permite ler localmente a camada de texto de PDFs digitais;
- `OPENROUTER_DOCUMENT_TRANSFER_APPROVED=true` permite enviar ao gateway PDFs ou imagens que exigem processamento remoto.

O modelo primário e os fallbacks continuam configuráveis. A auditoria registra o modelo e o provedor efetivamente usados; falhas não expõem a chave nem o conteúdo do documento.

## Consequências

### Positivas

- requisições curtas e status consultável;
- retries idempotentes e recuperáveis;
- progresso acessível e explícito;
- rastreabilidade entre job, fonte e versão resultante;
- mesma fronteira para execução em memória e infraestrutura persistente.

### Custos e riscos

- há mais estados e componentes operacionais para observar;
- jobs e objetos órfãos exigem reconciliação futura;
- modelos multimodais podem responder com schema inválido mesmo quando o gateway está saudável;
- o ambiente local em memória perde sessões e dados ao reiniciar a API.

## Verificação

- testes de domínio para versionamento e idempotência;
- testes HTTP para aceitação assíncrona e consulta do job;
- testes PostgreSQL/S3/BullMQ para persistência e despacho;
- testes de interface para polling e loader acessível;
- smoke tests opcionais contra o OpenRouter para verticalização, índice textual e imagem.

