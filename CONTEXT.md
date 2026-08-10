# Planejador de Editais — contexto de domínio

## Propósito

O Planejador de Editais ajuda candidatos a transformar editais e índices de materiais em uma trilha de estudo rastreável. O sistema verticaliza o conteúdo, associa cada tópico às páginas que o cobrem, permite revisão humana e gera planos semanais adaptativos sem apagar o histórico executado.

## Princípios do domínio

- Evidência antes de automação: toda sugestão de IA referencia a versão e a localização da fonte.
- Aprovação é explícita: saída de IA não se torna verdade funcional sem validação de esquema e a política de revisão aplicável.
- O passado é imutável: recalcular um plano altera apenas tarefas futuras.
- Entitlements são determinísticos: IA nunca decide acesso, cobrança, retenção ou autorização.
- Falhas são recuperáveis: jobs são idempotentes, versionados e passíveis de replay.

## Glossário

### Edital

Documento oficial que define matérias, tópicos, regras e datas de um concurso.

### Versão de documento

Snapshot imutável do arquivo e dos metadados usados por um processamento.

### Verticalização

Transformação do conteúdo programático em uma árvore normalizada de matérias, tópicos e subtópicos.

### Evidência

Trecho, página, coordenada ou referência verificável que sustenta uma extração ou associação.

### Confiança

Estimativa calibrada da qualidade de uma sugestão automática. Não substitui evidência nem aprovação.

### Índice de material

Lista estruturada de capítulos, seções e intervalos de páginas informada pelo usuário, sem ingestão integral obrigatória da obra.

### Associação

Relação revisável entre um item verticalizado e uma ou mais partes do material.

### Cobertura

Medida de quanto do edital possui associação aprovada com material de estudo.

### Plano

Versão de uma distribuição de estudo baseada em disponibilidade, prioridades, dependências e histórico.

### Tarefa

Unidade executável de teoria, revisão ou exercícios vinculada a uma versão do plano.

### Sessão

Registro de execução de uma tarefa, incluindo tempo, progresso, páginas e resultados informados.

### ProcessingJob

Contrato durável de uma operação assíncrona, com entrada versionada, idempotência, configuração, resultado, custo e estado.

### Entitlement

Direito efetivo concedido ao usuário por plano, assinatura, promoção ou operação administrativa auditada.

### Revisão humana

Decisão de aceitar, corrigir ou rejeitar uma sugestão, preservando autor, momento, versão e justificativa aplicável.

## Contextos funcionais

- Identidade e acesso
- Projetos e documentos
- Verticalização e evidências
- Materiais, associações e cobertura
- Planejamento e execução
- Métricas e benchmarking
- Assinaturas e entitlements
- Privacidade, auditoria e operação

## Documentos de decisão

- `docs/adr/0001-stack-tecnologica-inicial.md`
- `docs/adr/0002-openrouter-como-gateway-de-ia.md`
- `docs/adr/0003-landing-na-raiz-e-aplicacao-em-app.md`
- `docs/security/technology-vulnerability-review.md`
- `docs/system-design/index.html`
