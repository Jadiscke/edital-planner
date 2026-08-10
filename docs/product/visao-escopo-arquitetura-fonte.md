# Projeto — Plataforma de Verticalização de Editais e Mapeamento de Materiais

## Documento de visão, escopo funcional e arquitetura inicial

Versão 0.7 | Status: Concepção | Data: 16 de julho de 2026

# 1\. Resumo executivo

O projeto propõe uma aplicação web que recebe o edital de um concurso público, interpreta o documento com um LLM multimodal e transforma o conteúdo programático em uma estrutura verticalizada de matérias, tópicos e subtópicos. Essa estrutura será persistida em banco de dados e se tornará a referência central do conteúdo que precisa ser estudado.  
Na etapa seguinte, a plataforma analisará os índices de PDFs de cursos já relacionados ao concurso — inicialmente materiais do Estratégia Concursos — para identificar os assuntos de cada PDF e as páginas indicadas. O sistema relacionará essas referências aos subtópicos do edital, formando uma matriz rastreável entre o que é cobrado e onde estudar.  
O produto deverá mostrar evidências, confiança e status de revisão para cada associação, permitindo identificar cobertura, lacunas e possíveis conflitos.  
Além do mapeamento, a plataforma permitirá que o usuário selecione um edital verticalizado já existente ou envie um novo edital. Para o edital escolhido, o usuário cadastrará os materiais de estudo e enviará somente os índices desses materiais, com seus tópicos e intervalos de páginas. A plataforma gerará o conjunto completo de tarefas necessário para cobrir o edital e o distribuirá em um planejamento semanal, conforme as horas disponíveis por semana e a duração escolhida para cada tarefa. Cada subtópico poderá gerar uma ou várias tarefas de teoria, seguidas de revisão e exercícios. As tarefas poderão ser executadas com Pomodoro, cronômetro contínuo ou registro manual, produzindo dados de tempo, páginas, exercícios e desempenho. Ao final de cada semana, essas informações recalibrarão a velocidade por matéria, as estimativas futuras e os indicadores individuais. Comparações com outros usuários serão feitas somente por estatísticas agregadas, anônimas e organizadas em grupos comparáveis. Após concluir o planejamento, o usuário poderá criar um novo plano para o mesmo edital, escolhendo incluir ou não novas tarefas de teoria.

A operação deverá incorporar segurança e privacidade desde a concepção, conformidade com a LGPD, controles de acesso, proteção de arquivos, segurança específica para LLMs, monitoramento, resposta a incidentes e continuidade. A monetização será realizada por planos e assinaturas recorrentes integrados a um provedor de pagamentos, com checkout tokenizado ou hospedado, webhooks seguros e direitos de acesso controlados por entitlements versionados.

# 2\. Problema

Editais são extensos, pouco padronizados e apresentam diferentes níveis de granularidade. Hoje, o candidato precisa interpretar manualmente as disciplinas, desdobrar os assuntos e procurar em vários PDFs onde cada item está explicado. Esse trabalho consome tempo, gera inconsistências e dificulta saber se todo o edital está coberto.

# 3\. Objetivos

## Objetivo principal

Criar uma aplicação web que converta editais e índices de materiais em uma base estruturada de matérias, subtópicos, materiais e páginas e utilize essa base para gerar planejamentos semanais personalizados, rastreáveis e adaptados à disponibilidade do usuário.

## Objetivos específicos

• Receber editais em PDF, inclusive documentos digitalizados ou com estrutura visual complexa.  
• Extrair concurso, cargo, área, disciplinas e conteúdo programático.  
• Verticalizar o edital em matéria, tópico e subtópico, preservando a redação original.  
• Registrar página, trecho de origem e nível de confiança de cada item.  
• Receber arquivos ou imagens das páginas de índice dos materiais, sem exigir o envio do PDF completo.  
• Extrair títulos, hierarquia e intervalos de páginas dos materiais.  
• Relacionar automaticamente itens do índice aos subtópicos do edital.  
• Permitir revisão, correção, aprovação e rejeição das sugestões.  
• Gerar indicadores de cobertura e conteúdos sem material correspondente.

* Gerar uma ou várias tarefas de teoria para cada subtópico, a partir dos intervalos de páginas relacionados.  
* Dimensionar as tarefas de teoria utilizando sempre páginas por hora.  
* Criar uma tarefa de revisão e uma tarefa de exercícios para cada subtópico, somente após a conclusão de todas as suas tarefas de teoria.  
* Organizar todas as tarefas em semanas sucessivas, conforme a duração escolhida e as horas semanais disponíveis.  
* Executar tarefas por Pomodoro, cronômetro contínuo ou registro manual de tempo.  
* Medir velocidade de teoria por matéria, desempenho em exercícios, aderência ao plano e percentual estudado do edital.  
* Comparar o desempenho do usuário com grupos anônimos e comparáveis da plataforma.  
* Operar a plataforma com segurança por padrão, conformidade com a LGPD, governança de dados e resposta a incidentes.  
* Oferecer planos de assinatura, cobrança recorrente e diferenciação de funcionalidades e limites por entitlements.  
* Integrar pagamentos sem armazenar dados completos de cartão e com controles contra fraude, replay e cobrança duplicada.

# 4\. Escopo do MVP

## Incluído

• Autenticação e criação de projeto por concurso.  
• Upload e versionamento do edital.  
• Extração multimodal e editor da árvore verticalizada.  
• Cadastro dos materiais e upload somente de seus arquivos ou imagens de índice.  
• Extração dos itens do índice e páginas indicadas.  
• Sugestão de associações com confiança e justificativa.  
• Fila de revisão humana.  
• Visão de cobertura por matéria e subtópico.  
• Exportação em CSV ou JSON.  
• Histórico básico de processamento e alterações.

## Planejamento de tarefas

* Manter uma tabela de relação entre cada subtópico aprovado e os intervalos de páginas dos materiais.  
* Gerar uma ou várias tarefas sequenciais de teoria por subtópico, cobrindo integralmente todos os intervalos relacionados.  
* Dimensionar cada tarefa de teoria exclusivamente por páginas por hora, duração-alvo e limites dos tópicos, sem limitar a quantidade de tarefas necessárias por subtópico.  
* Criar uma tarefa de revisão e uma tarefa de exercícios para cada subtópico, liberadas somente após a conclusão de todas as tarefas de teoria correspondentes.  
* Gerar o planejamento completo com teoria, revisão e exercícios e distribuí-lo em semanas sucessivas.  
* Permitir que o usuário crie um novo planejamento após a conclusão, incluindo ou não tarefas de teoria.  
* Calcular capacidade semanal e previsão de conclusão com base nas horas disponíveis.  
* Oferecer Pomodoro configurável e cronômetro contínuo dentro de cada tarefa.  
* Registrar tempo ativo, pausas, duração total, páginas concluídas e conclusão parcial.  
* Registrar quantidade de questões, acertos, erros, anuladas e tempo gasto em exercícios.  
* Gerar fechamento semanal com estatísticas, tendências e recalibração das tarefas futuras.  
* Exibir painéis individuais e comparações anônimas por matéria, edital e perfil de estudo.

## Segurança, privacidade e monetização

• Autenticação segura, verificação de e-mail, recuperação de conta, gestão de sessões e papéis.  
• Autorização no servidor e isolamento entre usuários, projetos e organizações.  
• Criptografia, gestão de segredos, auditoria, monitoramento, backups e resposta a incidentes.  
• Upload seguro com validação, quarentena, antimalware e processamento isolado.  
• Inventário de dados, bases legais, Aviso de Privacidade, Termos de Uso e canal do encarregado.  
• Fluxos para acesso, correção, exportação, revogação, cancelamento e exclusão de dados.  
• Integração com provedor de pagamento por checkout hospedado ou tokenizado.  
• Assinaturas recorrentes, planos, preços, entitlements, quotas, cancelamento e portal de cobrança.  
• Webhooks assinados, idempotência, reconciliação e tratamento de inadimplência e reembolso.

## Fora do MVP

• Leitura e resumo integral de todos os PDFs.  
• Distribuição pública de materiais protegidos.  
• Agenda fixa por dia da semana e integração automática com calendários externos.  
• Banco de questões, simulados ou aplicativos móveis nativos.  
• Automação de login, compra ou download em plataformas de terceiros.

# 5\. Fluxo funcional

1\. O usuário faz login e acessa a área de planejamentos.  
2\. O usuário seleciona um edital verticalizado já existente ou escolhe cadastrar um novo edital.  
3\. No caso de um novo edital, o usuário envia o PDF e o sistema separa e classifica as páginas relevantes.  
4\. O LLM multimodal extrai a estrutura do conteúdo programático.  
5\. O usuário revisa e aprova a verticalização.  
6\. O usuário cadastra os materiais relacionados ao edital e envia somente o arquivo ou as imagens do índice de cada material, sem necessidade de enviar o PDF completo.  
7\. O sistema extrai do índice os títulos, subtópicos do material e intervalos de páginas que poderão ser estudados.  
8\. O mecanismo de correspondência relaciona os itens aos subtópicos do edital.  
9\. O usuário revisa itens de baixa confiança.  
10\. A plataforma apresenta cobertura, lacunas e referências de páginas.  
11\. O usuário informa quantas horas estudará por semana, sua velocidade em páginas por hora e a duração das tarefas, escolhendo opções como 15, 30, 45, 60 ou 90 minutos.  
12\. O sistema calcula páginas por tarefa, quantidade total de tarefas, capacidade semanal e número estimado de semanas para concluir o edital.  
13\. O sistema gera o backlog completo de tarefas necessárias para concluir o edital, incluindo todas as tarefas de teoria, revisão e exercícios.  
14\. O sistema distribui o backlog em Semana 1, Semana 2, Semana 3 e assim sucessivamente, sem ultrapassar a capacidade semanal configurada.  
15\. Dentro de cada semana, o sistema respeita as dependências teoria 1 → teoria N → revisão → exercícios e intercala as matérias.  
16\. O usuário executa cada tarefa usando Pomodoro configurável, cronômetro contínuo ou registro manual.  
17\. Ao encerrar uma tarefa de teoria, o usuário confirma o intervalo de páginas efetivamente estudado, o tempo ativo, as pausas e o grau de dificuldade percebido.  
18\. Ao encerrar uma tarefa de exercícios, o usuário registra quantidade de questões, acertos, erros, anuladas, questões em branco e tempo total.  
19\. No fechamento de cada semana, o sistema calcula velocidade real em páginas por hora por matéria, aderência ao plano, desempenho em exercícios e evolução do usuário.  
20\. As novas médias recalibram somente as tarefas e semanas futuras, preservando tarefas concluídas e os dados históricos.  
21\. Tarefas não concluídas são transferidas para a semana seguinte, e as semanas futuras são recalculadas sem apagar o histórico.  
22\. Após concluir o planejamento, o usuário pode gerar um novo plano para o mesmo edital e escolher se ele terá teoria, revisão e exercícios ou somente revisão e exercícios.  
23\. O usuário seleciona um plano ou inicia uma avaliação, visualizando preço, limites, renovação e condições.  
24\. A contratação é concluída em checkout hospedado ou tokenizado pelo provedor de pagamento.  
25\. O sistema confirma o estado no provedor, processa o webhook de forma idempotente e concede os entitlements.  
26\. A aplicação valida entitlements e quotas no servidor antes de cada funcionalidade restrita.  
27\. O usuário pode consultar cobrança, faturas ou recibos, método de pagamento, renovação e cancelar a assinatura.  
28\. Alterações de pagamento, upgrade, downgrade, inadimplência, reembolso ou chargeback atualizam o acesso sem apagar dados indevidamente.  
29\. O usuário pode consultar informações de privacidade, consentimentos, histórico de aceitações e solicitar acesso, correção, exportação ou exclusão de dados.

# 6\. Pipeline do edital

## Ingestão e preparação

• Validar arquivo, tamanho, integridade e presença de senha.  
• Calcular hash para evitar processamento duplicado.  
• Identificar páginas com texto nativo, imagem ou conteúdo misto.  
• Renderizar páginas e classificar conteúdo programático, anexos e retificações.

## Extração e verticalização

• Enviar texto e imagem ao modelo multimodal.  
• Exigir saída estruturada validada por JSON Schema.  
• Separar disciplinas, tópicos e subtópicos.  
• Preservar texto original e nome normalizado.  
• Registrar página, evidência, confiança, prompt e versão do modelo.  
• Marcar ambiguidades e impedir aprovação automática em divergências relevantes.

# 7\. Pipeline dos materiais

• Aceitar PDF contendo somente o índice, fotografia ou captura de tela das páginas de índice.  
• Detectar e organizar as páginas do índice automaticamente, permitindo correção e seleção manual.  
• Extrair título, nível hierárquico, página inicial e página final inferida.  
• Armazenar a página indicada para o material e a página de origem dentro do arquivo de índice enviado.  
• Permitir configurar ou detectar deslocamento de paginação.

# 8\. Mecanismo de correspondência

A associação deve combinar normalização de texto, regras por matéria, embeddings, recuperação semântica e classificação por LLM. O sistema não deve retornar apenas uma resposta: deverá apresentar justificativa e evidências.

## Tipos de relação

• Direta: o item do índice corresponde claramente ao subtópico.  
• Parcial: o material cobre apenas parte do subtópico.  
• Abrangente: um item cobre vários subtópicos.  
• Composta: vários itens, em conjunto, cobrem um subtópico.  
• Contextual: material útil como fundamento, sem correspondência literal.  
• Sem correspondência ou revisão necessária.

# 9\. Requisitos funcionais principais

• RF-01 — Criar, editar, arquivar e duplicar projetos.  
• RF-02 — Fazer upload e versionar editais e índices de materiais.  
• RF-03 — Editar matérias, tópicos e subtópicos em árvore.  
• RF-04 — Exibir a evidência documental de cada item extraído.  
• RF-05 — Suportar relacionamentos muitos-para-muitos.  
• RF-06 — Aprovar, rejeitar ou editar associações.  
• RF-07 — Exibir cobertura, lacunas e itens não associados.  
• RF-08 — Reprocessar documentos com nova versão de prompt ou modelo.  
• RF-09 — Manter trilha de auditoria.  
• RF-10 — Exportar os dados aprovados.

## Planejamento de tarefas

* RF-11 — Gerar tarefas a partir de subtópicos aprovados e associações com materiais.  
* RF-12 — Manter uma tabela de relação entre subtópico, PDF, item de índice e intervalo de páginas aprovado.  
* RF-13 — Estimar tarefas de teoria utilizando sempre páginas por hora.  
* RF-14 — Registrar duração-alvo das tarefas, horas semanais e páginas por hora do usuário.  
* RF-15 — Calcular páginas por tarefa e dividir os intervalos relacionados em quantos blocos sequenciais forem necessários.  
* RF-16 — Gerar uma ou várias tarefas de teoria por subtópico, cada uma com descrição, PDF, páginas, matéria, tópico, subtópico, número do bloco e total de blocos.  
* RF-17 — Criar uma tarefa lógica de revisão para cada subtópico somente após todas as tarefas de teoria correspondentes.  
* RF-18 — Criar uma tarefa lógica de exercícios para cada subtópico após a revisão.  
* RF-19 — Impedir a quebra da ordem teoria → revisão → exercícios.  
* RF-20 — Gerar um planejamento composto por semanas sucessivas e manter a ordem global das tarefas.  
* RF-21 — Calcular a capacidade semanal, a quantidade de tarefas por semana e a previsão de conclusão do planejamento.  
* RF-22 — Permitir a criação de um novo planejamento após a conclusão, com opção de incluir ou excluir tarefas de teoria.  
* RF-23 — Recalcular tarefas futuras sem apagar histórico, tempos realizados ou ajustes manuais.  
* RF-24 — Permitir que um subtópico possua múltiplas relações com intervalos de páginas, inclusive em PDFs diferentes.  
* RF-25 — Calcular automaticamente a quantidade total de tarefas de teoria necessárias por subtópico.  
* RF-26 — Encadear as tarefas de teoria do mesmo subtópico em ordem de páginas e impedir lacunas ou sobreposição não justificada.  
* RF-27 — Liberar a revisão apenas quando a cobertura teórica do subtópico atingir 100% das páginas relacionadas e todas as tarefas de teoria estiverem concluídas.  
* RF-28 — Permitir que o usuário selecione um edital verticalizado existente no catálogo da plataforma.  
* RF-29 — Permitir o cadastro e a verticalização de um novo edital.  
* RF-30 — Permitir o cadastro de materiais por meio do envio somente de seus índices, sem exigir o PDF completo.  
* RF-31 — Oferecer durações de tarefa de 15, 30, 45, 60 e 90 minutos, registrando a opção escolhida no planejamento.  
* RF-32 — Gerar o backlog completo de tarefas necessário para concluir o edital antes de distribuí-lo nas semanas.  
* RF-33 — Distribuir automaticamente as tarefas em semanas sequenciais respeitando o limite de minutos disponíveis por semana.  
* RF-34 — Transferir tarefas não concluídas para a semana seguinte e recalcular somente as semanas futuras.  
* RF-35 — Exibir progresso da semana atual, progresso acumulado e previsão atualizada de conclusão.  
* RF-36 — Versionar planejamentos sucessivos do mesmo usuário para o mesmo edital e preservar o histórico de cada execução.  
* RF-37 — Permitir iniciar uma tarefa em modo Pomodoro ou cronômetro contínuo.  
* RF-38 — Permitir configurar duração do foco, pausa curta, pausa longa e quantidade de ciclos do Pomodoro.  
* RF-39 — Permitir pausar, retomar, encerrar e descartar uma sessão, registrando os respectivos eventos.  
* RF-40 — Permitir registrar manualmente o tempo realizado quando a tarefa for executada fora da plataforma.  
* RF-41 — Registrar separadamente tempo ativo de estudo, tempo de pausa e tempo total decorrido.  
* RF-42 — Registrar páginas planejadas, páginas efetivamente concluídas e motivo de conclusão parcial.  
* RF-43 — Calcular páginas por hora realizadas em cada tarefa de teoria e consolidar médias por matéria, tópico, subtópico, material e período.  
* RF-44 — Gerar um fechamento semanal com médias, tendências, aderência, carga planejada e carga realizada.  
* RF-45 — Atualizar a velocidade de páginas por hora usada nas tarefas futuras com base no histórico do usuário por matéria.  
* RF-46 — Registrar, nas tarefas de exercícios, questões realizadas, corretas, incorretas, anuladas, em branco e tempo gasto.  
* RF-47 — Calcular taxa de acerto, questões por hora, tempo médio por questão e evolução por matéria, tópico e subtópico.  
* RF-48 — Exibir percentual do edital coberto por teoria, revisão e exercícios, separadamente e de forma consolidada.  
* RF-49 — Exibir painéis de desempenho, velocidade, consistência, produtividade e previsão de conclusão.  
* RF-50 — Comparar métricas individuais com coortes anônimas de usuários equivalentes, exibindo média, mediana, faixa e percentil.  
* RF-51 — Permitir que o usuário aceite ou recuse o uso de seus dados em comparações agregadas.  
* RF-52 — Impedir a exibição de comparações quando a coorte não possuir quantidade mínima de usuários ou puder permitir reidentificação.  
* RF-53 — Manter histórico das médias utilizadas em cada versão do planejamento e explicar alterações de estimativa.  
* RF-54 — Permitir exportar o histórico de sessões, tempos, páginas, exercícios e métricas do usuário.

## Segurança, privacidade, pagamentos e planos

* RF-55 — Manter catálogo versionado de produtos, planos, preços, limites e entitlements.  
* RF-56 — Integrar checkout hospedado ou tokenizado de provedor de pagamentos.  
* RF-57 — Suportar assinatura recorrente mensal ou anual, teste gratuito, cupons e datas de renovação.  
* RF-58 — Manter estados explícitos de assinatura, incluindo avaliação, ativa, pendente, tolerância, suspensa e cancelada.  
* RF-59 — Validar assinatura, timestamp, idempotência e proteção contra replay em webhooks.  
* RF-60 — Processar eventos de pagamento por fila, com retentativas, dead-letter e reconciliação.  
* RF-61 — Disponibilizar portal para método de pagamento, faturas ou recibos, plano, renovação e cancelamento.  
* RF-62 — Suportar upgrade, downgrade, rateio, agendamento de mudança, reativação e migração de plano.  
* RF-63 — Registrar e tratar reembolsos, cobranças duplicadas, disputas e chargebacks.  
* RF-64 — Registrar moeda, impostos, descontos, competência e documentos fiscais ou equivalentes.  
* RF-65 — Liberar funcionalidades e quotas por entitlements validados no backend.  
* RF-66 — Permitir gestão administrativa de catálogo e concessões manuais com auditoria e prazo.  
* RF-67 — Exigir verificação de e-mail e suportar MFA ou passkeys.  
* RF-68 — Permitir visualizar, revogar e encerrar sessões e dispositivos.  
* RF-69 — Implementar papéis e permissões com menor privilégio e segregação de funções.  
* RF-70 — Impedir acesso horizontal ou vertical entre usuários, projetos e organizações.  
* RF-71 — Validar, colocar em quarentena e analisar uploads antes do processamento.  
* RF-72 — Criptografar dados em trânsito, em repouso e em backups.  
* RF-73 — Armazenar e rotacionar segredos em serviço dedicado.  
* RF-74 — Auditar autenticação, permissões, acesso de suporte, exportação, exclusão, pagamentos e mudanças de plano.  
* RF-75 — Aplicar rate limiting, quotas, proteção contra força bruta, bots e abuso econômico.  
* RF-76 — Aplicar validação de entrada, cabeçalhos de segurança, políticas de CORS, CSRF e CSP.  
* RF-77 — Manter inventário e classificação de dados pessoais e confidenciais.  
* RF-78 — Vincular cada tratamento a finalidade, base legal e período de retenção.  
* RF-79 — Versionar Aviso de Privacidade, Termos de Uso, Política de Cookies e condições comerciais.  
* RF-80 — Disponibilizar portal ou canal para exercício dos direitos dos titulares.  
* RF-81 — Executar retenção, anonimização, bloqueio e exclusão de acordo com política e obrigação legal.  
* RF-82 — Permitir exportação dos dados do usuário em formato estruturado quando aplicável.  
* RF-83 — Manter canal do encarregado e protocolos de atendimento a titulares e à ANPD.  
* RF-84 — Registrar RIPD, avaliação de legítimo interesse e aprovações de privacidade quando aplicável.  
* RF-85 — Cadastrar operadores, suboperadores, contratos e avaliações de segurança.  
* RF-86 — Registrar transferências internacionais e o mecanismo jurídico utilizado.  
* RF-87 — Registrar incidentes, avaliar risco relevante e apoiar comunicação regulatória.  
* RF-88 — Aplicar privacidade e segurança por padrão em novas funcionalidades.  
* RF-89 — Exigir opt-in separado e anonimização para benchmarking entre usuários.  
* RF-90 — Integrar SAST, DAST, SCA, detecção de segredos e SBOM ao ciclo de desenvolvimento.  
* RF-91 — Registrar vulnerabilidades, testes de invasão, prazos de correção e aceitação de risco.  
* RF-92 — Automatizar backups e registrar testes periódicos de restauração.  
* RF-93 — Tratar conteúdo enviado ao LLM como não confiável e validar suas saídas antes de ações.  
* RF-94 — Detectar eventos suspeitos e gerar alertas de segurança, fraude, abuso e cobrança.

# 10\. Requisitos não funcionais

• Segurança: arquivos privados, controle de acesso e criptografia.  
• Confiabilidade: processamento assíncrono, idempotência e retentativas.  
• Observabilidade: métricas de custo, latência, erros e qualidade.  
• Portabilidade: abstração do provedor de LLM.  
• Usabilidade: revisão lado a lado entre documento e dados extraídos.  
• Privacidade: retenção configurável, exclusão de arquivos e dados derivados, consentimento específico para benchmarking e possibilidade de revogação.  
• Proteção estatística: comparações somente com dados agregados, pseudonimizados e coortes com tamanho mínimo.  
• Qualidade dos dados: distinguir tempo medido automaticamente, tempo informado manualmente e registros estimados.  
• Explicabilidade: mostrar quais dados alteraram a velocidade calculada, as tarefas futuras e a previsão de conclusão.  
• Acessibilidade: navegação por teclado, contraste e leitores de tela.  
• Segurança por padrão: recursos novos iniciam com acesso mínimo, coleta mínima e compartilhamento desativado.  
• Verificação: requisitos técnicos de segurança deverão ser testáveis e alinhados ao OWASP ASVS 5.0 e, para componentes de IA, ao OWASP LLMSVS.  
• Pagamentos: reduzir o escopo PCI DSS utilizando checkout hospedado ou tokenização e nunca armazenar código de segurança ou número completo de cartão.  
• Identidade: suportar MFA, sessões revogáveis, recuperação segura e proteção contra força bruta.  
• Autorização: validar todas as permissões no servidor e testar isolamento horizontal e vertical.  
• Criptografia: usar protocolos modernos em trânsito e criptografia gerenciada em repouso, inclusive em backups.  
• Segredos: armazenar credenciais em cofre, com rotação e acesso mínimo.  
• Privacidade: adotar privacy by design, minimização, retenção definida, exclusão verificável e rastreabilidade de bases legais.  
• LGPD: manter canal do encarregado, registro de operações, contratos com operadores, direitos dos titulares e processo de incidentes.  
• Resiliência: definir SLO, RTO e RPO, testar restauração e suportar degradação controlada de fornecedores.  
• Auditabilidade: eventos críticos devem ser imutáveis ou protegidos contra alteração, correlacionáveis e exportáveis para auditoria.  
• Qualidade operacional: mudanças em produção devem ser rastreáveis, revisadas, reversíveis e segregadas por ambiente.  
• Segurança da cadeia de software: manter SBOM, assinaturas ou verificação de artefatos e varredura contínua de dependências.  
• Conformidade de consumo: apresentar condições comerciais claras, facilitar atendimento, cancelamento e reembolso.

# 11\. Arquitetura proposta

• Frontend web para upload, revisão, cobertura e administração.  
• API de aplicação para autenticação, domínio e permissões.  
• Armazenamento de objetos para PDFs e imagens.  
• Fila de processamento e workers de extração.  
• Serviço de normalização e validação de esquemas.  
• Serviço de embeddings, busca semântica e correspondência.  
• Banco principal e camada de auditoria e observabilidade.

## Serviço de planejamento

A arquitetura deverá incluir um serviço de planejamento responsável por consultar as relações aprovadas entre subtópicos e intervalos de páginas, gerar o backlog completo de tarefas, calcular a capacidade semanal, distribuir tarefas em semanas sucessivas, respeitar dependências, transportar pendências para semanas futuras, recalcular previsões e criar novos planejamentos com ou sem teoria após a conclusão do plano anterior.

## Serviço de execução e telemetria

A arquitetura deverá incluir um serviço de execução responsável por Pomodoro, cronômetro contínuo, lançamentos manuais, eventos de pausa e retomada, encerramento de sessões, páginas efetivamente estudadas e resultados de exercícios. Os eventos deverão ser persistidos de forma idempotente para suportar perda de conexão e sincronização posterior.

## Serviço de métricas e benchmarking

Um serviço analítico deverá consolidar métricas individuais e semanais, manter séries históricas, recalibrar velocidades por matéria e produzir comparações com coortes anônimas. Os dados comparativos deverão ser calculados em agregados protegidos, com consentimento, tamanho mínimo de amostra e controles contra reidentificação.

## Serviço de identidade e acesso

Um serviço de identidade deverá centralizar cadastro, verificação de e-mail, autenticação, MFA ou passkeys, recuperação de conta, sessões, dispositivos, papéis, permissões e revogação. A autorização de domínio permanecerá nos serviços de negócio e será validada no servidor.

## 

## Serviço de cobrança e entitlements

Um serviço de billing deverá manter catálogo versionado de produtos e preços, clientes, assinaturas, faturas, pagamentos, reembolsos, disputas e estados de cobrança. Um componente separado de entitlements converterá o estado comercial em direitos e quotas consumíveis pela aplicação.

## 

## Integração com provedor de pagamentos

A integração deverá usar checkout hospedado ou tokenizado, portal do cliente e APIs do provedor. Webhooks serão recebidos em endpoint dedicado, autenticados, armazenados, processados por fila, reconciliados e aplicados de modo idempotente.

## 

## Serviço de privacidade e governança

Um serviço ou módulo de privacidade deverá manter inventário de dados, bases legais, consentimentos, versões de avisos, solicitações de titulares, retenção, exclusão, operadores, transferências internacionais, RIPDs e evidências de atendimento.

## 

## Operações de segurança

A arquitetura deverá incluir trilha de auditoria, centralização de logs, alertas, gestão de vulnerabilidades, gestão de segredos, segurança de uploads, resposta a incidentes, backups e testes de recuperação. A separação entre ambientes e contas de nuvem deverá reduzir o impacto de credenciais comprometidas.

## 

## Banco de dados

A decisão entre SQL e NoSQL permanece aberta. Para o MVP, PostgreSQL é uma opção forte por causa dos relacionamentos, auditoria e versionamento. Ele também pode armazenar JSON de respostas intermediárias e vetores por extensão, reduzindo a complexidade operacional inicial.

# 12\. Modelo de dados inicial

• User e Project.  
• ExamNotice, DocumentVersion e DocumentPage.  
• Subject e SyllabusNode, com hierarquia pai-filho.  
• SourceEvidence para página e trecho de origem.  
• StudyMaterial, MaterialVersion, IndexPage e IndexItem.  
• Mapping e MappingReview.  
• ProcessingJob, ModelRun e AuditEvent.

* StudyPlan, StudyPlanVersion, StudyCycle, StudyWeek, WeeklyTaskAllocation, CycleItem e StudyTask.  
* StudyProfile, WeeklyStudyCapacity, PageRate e TaskExecutionLog.  
* SyllabusMaterialRange, que representa a tabela de relação entre subtópico, PDF, item de índice e intervalo de páginas.  
* TaskMaterialSlice, que registra o recorte exato de páginas usado por cada tarefa de teoria.  
* TaskMaterialReference, TaskSyllabusLink, TaskDependency, TaskStatusHistory e TaskGenerationRun.  
* TaskExecutionSession, TimerEvent, PomodoroConfiguration, ManualTimeEntry e TaskCompletionRecord.  
* ExerciseResult, ExerciseAttemptSummary e QuestionPerformanceAggregate.  
* SubjectReadingRate, WeeklyPerformanceSnapshot, UserMetricSeries e StudyForecastSnapshot.  
* BenchmarkConsent, BenchmarkCohort, CohortMetricAggregate e MetricPrivacyRule.  
* Identity, UserCredential, AuthenticationFactor, UserSession, TrustedDevice, Role, Permission e RoleAssignment.  
* SecurityEvent, AuditLog, AccessReview, SupportAccessGrant e AdministrativeAction.  
* Product, Plan, Price, PlanVersion, Entitlement, PlanEntitlement, FeatureFlag e UsageQuota.  
* BillingCustomer, Subscription, SubscriptionItem, Invoice, Payment, PaymentAttempt, Refund, Dispute e CreditBalance.  
* PaymentProviderEvent, WebhookReceipt, ReconciliationRun e BillingAdjustment.  
* PrivacyNoticeVersion, TermsVersion, UserAcceptance, ConsentRecord, LegalBasisRecord e ProcessingPurpose.  
* DataInventoryItem, ProcessingActivity, RetentionPolicy, DeletionRequest, DataSubjectRequest e DataExportJob.  
* Vendor, Subprocessor, DataProcessingAgreement, InternationalTransferRecord e TransferSafeguard.  
* SecurityIncident, PersonalDataIncidentAssessment, IncidentNotification, Vulnerability, SecurityTest e RiskAcceptance.  
* BackupRun, RestoreTest, RecoveryPlan e BusinessContinuityEvent.

# 13\. Estratégia de IA e qualidade

• Separar extração, normalização e correspondência em chamadas distintas.  
• Usar esquemas de saída e prompts versionados.  
• Roteamento de modelos por custo e complexidade.  
• Criar conjunto de avaliação com editais e índices anotados.  
• Medir precisão das matérias, subtópicos, páginas e associações.  
• Não permitir páginas, títulos ou itens inventados.  
• Manter evidência visual e textual para auditoria.

# 14\. Segurança e direitos de uso

• Processar somente materiais legitimamente fornecidos pelo usuário.  
• Não redistribuir publicamente materiais protegidos por direitos autorais.  
• Exibir referências internas de páginas, sem criar cópias públicas.  
• Informar os provedores de IA e políticas de retenção aplicáveis.  
• Permitir exclusão dos arquivos originais e dos dados derivados.  
• Evitar conteúdo sensível desnecessário em logs.

## Segurança da aplicação

• Aplicar autenticação forte, autorização no servidor, menor privilégio, segregação de funções e isolamento entre usuários e organizações.  
• Criptografar dados em trânsito e em repouso, proteger chaves e segredos e limitar acesso a produção.  
• Validar uploads, executar antimalware, usar quarentena e processar documentos em ambiente isolado.  
• Adotar SSDLC, modelagem de ameaças, revisão de código, testes automatizados, SBOM e gestão de vulnerabilidades.  
• Proteger APIs contra abuso, força bruta, injeção, XSS, CSRF, SSRF, falhas de CORS e negação de serviço.  
• Manter logs de auditoria, alertas, plano de resposta, backups e testes de restauração.

# 

## LGPD e governança de dados

• Mapear dados, finalidades, bases legais, operadores, transferências, retenção e medidas de segurança.  
• Aplicar minimização, necessidade, transparência, prevenção, não discriminação e prestação de contas.  
• Disponibilizar Aviso de Privacidade, canal do encarregado e fluxos para direitos dos titulares.  
• Registrar consentimentos, versões de políticas, solicitações, incidentes e decisões de retenção ou eliminação.  
• Realizar RIPD e avaliação de legítimo interesse quando aplicável.  
• Formalizar contratos com operadores e mecanismos válidos para transferências internacionais.

# 

## Pagamentos, planos e consumo

• Utilizar checkout hospedado ou tokenizado e não armazenar dados completos de cartão.  
• Validar webhooks, idempotência, replay, ordem de eventos e reconciliação financeira.  
• Exibir preço, periodicidade, renovação, limites, cancelamento, reembolso e condições de uso de forma clara.  
• Permitir cancelamento simples, confirmação durável e tratamento do direito de arrependimento conforme a legislação aplicável.  
• Separar plano, preço, assinatura, pagamento e entitlement para evitar liberação indevida de acesso.

# 15\. Critérios de aceite do MVP

• O usuário envia um edital e recebe uma árvore editável de matérias e subtópicos.  
• Cada item extraído possui evidência de origem ou indicação de ausência.  
• O usuário adiciona um material e seleciona páginas de índice.  
• O sistema extrai títulos e páginas com resultado revisável.  
• O sistema sugere associações com confiança e justificativa.  
• O usuário aprova, rejeita ou substitui as associações.  
• A visão de cobertura mostra itens cobertos e não cobertos.  
• Os dados aprovados podem ser exportados.  
• Falhas podem ser reexecutadas e ficam registradas.

* O sistema mantém relações aprovadas entre subtópicos e intervalos de páginas e gera uma ou várias tarefas de teoria para cada subtópico.  
* A quantidade de tarefas e de páginas por tarefa é calculada sempre pela velocidade em páginas por hora, pela duração-alvo e pelo total de páginas relacionadas ao subtópico.  
* Para cada subtópico são criadas uma tarefa de revisão e uma tarefa de exercícios, liberadas somente após a conclusão de todos os blocos de teoria.  
* O sistema respeita a dependência teoria → revisão → exercícios e distribui as tarefas em semanas sucessivas, intercalando as matérias.  
* A disponibilidade semanal determina a capacidade de cada semana e a previsão de conclusão de todo o planejamento.  
* Após concluir o planejamento, o usuário pode criar um novo plano para o mesmo edital, escolhendo incluir teoria ou trabalhar somente com revisão e exercícios.  
* Mudanças de configuração recalculam apenas tarefas futuras e preservam o histórico concluído.  
* O usuário consegue executar uma tarefa por Pomodoro ou cronômetro, pausar, retomar e finalizar a sessão.  
* O usuário consegue informar manualmente o tempo quando estudar fora da plataforma.  
* O sistema registra tempo ativo, pausas, páginas realizadas e conclusão parcial sem perder o intervalo restante.  
* O fechamento semanal calcula páginas por hora por matéria e utiliza a nova média apenas nas tarefas futuras.  
* Tarefas de exercícios registram questões feitas, acertos, erros, anuladas, em branco e tempo gasto.  
* O painel mostra cobertura do edital, tempo estudado, velocidade, aderência, taxa de acerto e previsão de conclusão.  
* Comparações com outros usuários são anônimas, dependem de consentimento e não aparecem em grupos com amostra insuficiente.  
* O acesso a dados de outro usuário, projeto ou organização é negado mesmo com alteração manual de identificadores.  
* Ações administrativas exigem papel adequado, são auditadas e podem exigir reautenticação.  
* O checkout não transmite nem armazena dados completos de cartão nos sistemas da plataforma.  
* Webhooks inválidos, repetidos ou fora de ordem não alteram indevidamente assinatura, pagamento ou acesso.  
* Upgrade, downgrade, cancelamento, inadimplência, reembolso e chargeback produzem estados previsíveis e auditáveis.  
* O usuário consegue consultar plano, renovação, faturas ou recibos, método de pagamento e cancelar a renovação.  
* Funcionalidades pagas são liberadas por entitlements validados no servidor.  
* O usuário consegue acessar canal de privacidade e exercer direitos previstos na LGPD com protocolo e histórico.  
* A exclusão de conta respeita retenções legais, bloqueia reutilização e alcança sistemas derivados conforme a política publicada.  
* Uploads suspeitos são bloqueados ou colocados em quarentena antes do processamento.  
* Logs não expõem senhas, tokens, dados completos de pagamento ou conteúdo sensível desnecessário.  
* Backups são restaurados com sucesso em teste documentado.  
* O plano de resposta a incidentes é testado e registra critérios de comunicação à ANPD e aos titulares.  
* Testes automatizados de segurança e análise de dependências integram o pipeline de entrega.  
* Um teste de invasão independente ou tecnicamente segregado é concluído antes da liberação comercial.

# 16\. Riscos e mitigação

• Formatação inconsistente — combinar texto, visão, heurísticas e revisão.  
• Índices incompletos — armazenar paginação física e impressa e permitir ajuste.  
• Associações incorretas — exigir evidência, confiança e revisão humana.  
• Custos de LLM — usar cache, processamento incremental e roteamento de modelos.  
• Dependência de fornecedor — abstrair provedores.  
• Alterações no edital — versionar e comparar documentos.  
• Direitos autorais — limitar o processamento a materiais autorizados.  
• Falsa sensação de cobertura — diferenciar relação direta, parcial e contextual.

* Ritmos diferentes de leitura — permitir páginas por hora configuráveis, registrar tempo real e recalcular somente tarefas futuras.  
* Dados de cronômetro incompletos ou inflados — separar tempo ativo, pausas, registros manuais e valores atípicos; permitir correção auditada.  
* Comparações injustas entre usuários — formar coortes por matéria, experiência, duração de tarefa e quantidade mínima de dados.  
* Risco de exposição de dados pessoais — usar consentimento, agregação, pseudonimização, limiar mínimo de amostra e direito de exclusão.  
* Excesso de métricas sem utilidade — priorizar indicadores que alterem decisões de planejamento e mostrar definições claras.

• Sequestro de conta — oferecer MFA ou passkeys, alertas, limitação de tentativas, recuperação segura e revogação de sessões.  
• Falha de isolamento entre usuários — aplicar autorização no servidor, testes de acesso horizontal e contexto de locatário em banco, cache, filas e objetos.  
• Upload malicioso — usar quarentena, validação real de tipo, antimalware, sandbox e URLs temporárias.  
• Prompt injection ou saída insegura do LLM — isolar conteúdo, limitar ferramentas, validar esquemas e exigir confirmação para ações persistentes.  
• Vazamento de segredos — usar cofre, rotação, detecção automatizada e proibir credenciais em logs e repositórios.  
• Webhook forjado, repetido ou fora de ordem — validar assinatura, timestamp, idempotência, replay e reconciliação com o provedor.  
• Cobrança duplicada ou acesso incorreto — separar eventos financeiros de entitlements e manter máquina de estados auditável.  
• Inadimplência e chargebacks — aplicar tolerância, comunicação, suspensão progressiva, fila de disputas e reconciliação.  
• Descumprimento da LGPD — manter inventário, bases legais, direitos dos titulares, retenção, RIPD, contratos e governança.  
• Incidente não comunicado no prazo — manter classificação, responsáveis, modelos e exercício periódico de resposta.  
• Indisponibilidade de fornecedor — usar circuit breaker, retentativas limitadas, filas e plano de substituição.  
• Exclusão irreversível indevida — bloquear novas criações antes de apagar dados e exigir confirmação reforçada para exclusões.  
• Mudança de plano inconsistente — versionar catálogo, preços e entitlements e testar migrações.  
• Dependências vulneráveis — manter SBOM, varredura contínua e prazos de correção por severidade.

# 17\. Roadmap sugerido

## Fase 0 — Descoberta

Selecionar editais e materiais de referência, definir os esquemas e validar uma prova de conceito multimodal.

## Fase 1 — MVP técnico

Implementar autenticação, catálogo e cadastro de editais, verticalização, cadastro de materiais por índice, associações e cobertura. Incluir configuração de minutos por tarefa, horas semanais e páginas por hora, geração do backlog completo, distribuição semanal, dependências teoria → revisão → exercícios, cronômetro contínuo, Pomodoro básico e registro manual de tempo.

## Fase 2 — Qualidade e operação

Adicionar avaliação automatizada, comparação de versões, monitoramento de custos e melhorias de UX. Implementar transporte de pendências entre semanas, fechamento semanal, velocidade por matéria, métricas de exercícios, painéis individuais, ajustes de prioridade, recálculo seguro das semanas futuras e criação de novos planejamentos com ou sem teoria.

## Fase 3 — Expansão

Adicionar novos planejamentos recorrentes de manutenção, integrações com bancos de questões, benchmarking anônimo entre usuários, percentis por coorte, detecção de tendências, acompanhamento avançado de desempenho e novas fontes de material.

## Segurança e monetização no roadmap

• Fase 0: inventário de dados, modelagem de ameaças, definição de bases legais, desenho dos planos e seleção preliminar do provedor de pagamento.  
• Fase 1: autenticação segura, autorização, isolamento de usuários, checkout hospedado, assinatura recorrente, webhooks idempotentes, entitlements, documentos jurídicos e controles mínimos LGPD.  
• Fase 2: MFA, gestão de sessões, reconciliação financeira, portal de direitos dos titulares, auditoria, monitoramento de segurança, backups testados e teste de invasão.  
• Fase 3: planos institucionais, SSO, controles empresariais, relatórios de conformidade, automação de evidências, programa de vulnerabilidades e maturidade contínua.

# 18\. Planejamento semanal por ciclo de estudos

## Objetivo funcional

A plataforma deverá transformar o edital verticalizado e os índices dos materiais relacionados em um planejamento completo, personalizado e dividido em semanas sucessivas. O sistema gerará primeiro todas as tarefas necessárias para concluir o edital e, em seguida, as distribuirá entre as semanas conforme a capacidade informada pelo usuário. No MVP, a semana representa um agrupamento de capacidade e prioridade; a distribuição fixa por dia da semana permanece opcional.

## Princípios do planejamento semanal

* O usuário informa a duração desejada de cada tarefa, em minutos.  
* O usuário informa a quantidade total de horas que deseja estudar por semana.  
* O usuário informa sua velocidade de estudo de teoria em páginas por hora.  
* O sistema mantém uma sequência global de tarefas, distribui essa sequência entre semanas e retoma a partir da primeira tarefa pendente.  
* As matérias são intercaladas conforme prioridade, peso, quantidade de conteúdo e progresso, sem quebrar a sequência obrigatória de cada subtópico.

## Configuração do usuário

* Duração-alvo de cada tarefa, em minutos.  
* Quantidade de horas disponíveis por semana.  
* Velocidade de leitura e estudo de teoria, em páginas por hora.  
* Prioridade ou peso das matérias, quando configurado.  
* Data de início e preferências de distribuição, quando informadas.

## Tabela de relação entre subtópicos e páginas dos materiais

A base deverá possuir uma tabela relacional denominada SyllabusMaterialRange, ou nome equivalente, com uma linha para cada associação aprovada entre um subtópico do edital e um intervalo de páginas de um material.  
Cada registro deverá conter, no mínimo: identificador do subtópico, identificador do PDF e de sua versão, identificador do item do índice, página inicial, página final, quantidade de páginas, ordem de cobertura, tipo de relação, confiança, status de revisão e evidência de origem.  
Um subtópico poderá possuir uma ou várias linhas nessa tabela. O mesmo intervalo poderá ser relacionado a mais de um subtópico por meio de registros distintos. As tarefas de teoria deverão ser geradas exclusivamente a partir das relações aprovadas.  
A soma dos intervalos aprovados, descontadas sobreposições justificadas, definirá o total de páginas de teoria do subtópico e sua cobertura planejada.

## 

## Dimensionamento das tarefas de teoria

* A estimativa de teoria deverá usar sempre páginas por hora. O sistema não utilizará palavras por minuto.  
* Páginas por tarefa \= páginas por hora × duração-alvo da tarefa em minutos ÷ 60\.  
* O intervalo calculado deverá ser ajustado aos limites reais dos tópicos identificados no índice do material.  
* Quando o total de páginas relacionadas a um subtópico ultrapassar a capacidade de uma tarefa, o sistema criará quantos blocos sequenciais forem necessários. Não haverá limite funcional fixo: um subtópico poderá gerar uma, duas, três, quatro, cinco, seis ou mais tarefas de teoria.  
* Quando um intervalo pequeno couber parcialmente no tempo restante, o sistema poderá agrupá-lo com outro intervalo compatível da mesma matéria, sem perder a rastreabilidade.  
* Cada tarefa de teoria deverá conter descrição, identificação do material ou PDF de referência, página inicial, página final, quantidade de páginas, matéria, tópico, subtópico, duração estimada, posição no planejamento, número do bloco, total de blocos e referência ao registro de SyllabusMaterialRange que lhe deu origem.

## Sequência obrigatória por subtópico

* Teoria: concluir, em ordem, todas as tarefas de teoria necessárias para cobrir os intervalos de páginas associados ao subtópico.  
* Revisão: revisar o subtópico somente após a conclusão da teoria correspondente.  
* Exercícios: resolver exercícios do subtópico somente após a conclusão da revisão correspondente.

A dependência lógica será teoria 1 → teoria 2 → ... → teoria N → revisão → exercícios. A revisão não poderá ser iniciada enquanto existir qualquer tarefa de teoria pendente para o subtópico.

## Tarefas de revisão

* Para cada subtópico estudado será criada uma tarefa lógica de revisão.  
* A tarefa deverá conter matéria, tópico, subtópico, todas as páginas de referência, descrição da revisão, duração-alvo e vínculo com o conjunto completo de tarefas de teoria do subtópico.  
* A revisão deverá priorizar recuperação ativa, releitura de marcações, resumos, mapas mentais ou anotações produzidas durante a teoria.  
* A tarefa de revisão será inserida no planejamento após a teoria e ficará elegível na primeira semana compatível com o intervalo mínimo configurável.  
* Se a revisão exigir mais tempo do que a duração-alvo, ela poderá ser dividida em blocos de execução, preservando uma única tarefa lógica por subtópico.

## Tarefas de exercícios

* Para cada subtópico revisado será criada uma tarefa lógica de exercícios.  
* A tarefa deverá conter matéria, tópico, subtópico, páginas de referência, descrição, duração-alvo, fonte de questões quando disponível e vínculo com a revisão.  
* A execução será dimensionada pelo tempo definido pelo usuário. O sistema poderá sugerir uma quantidade de questões quando houver histórico suficiente de tempo médio por questão.  
* Erros, acertos, questões marcadas e nível de dificuldade poderão alimentar a prioridade dos planejamentos seguintes.  
* Se os exercícios exigirem mais tempo do que a duração-alvo, a tarefa poderá ser dividida em blocos de execução.

## Primeiro planejamento — aquisição do conteúdo

* O primeiro planejamento conterá teoria, revisão e exercícios e será dividido em quantas semanas forem necessárias.  
* As matérias serão alternadas dentro de cada semana para evitar concentração excessiva em uma única disciplina.  
* A quantidade de tarefas prevista por semana será calculada pela disponibilidade semanal dividida pela duração-alvo das tarefas.  
* Quando o usuário estudar menos do que o planejado, as tarefas pendentes serão movidas para a semana seguinte. Quando estudar mais, poderá antecipar tarefas das semanas futuras.  
* Um subtópico será considerado concluído no primeiro planejamento apenas após a conclusão de todas as suas tarefas de teoria, da revisão e dos exercícios.  
* O primeiro planejamento terminará quando todos os subtópicos do edital tiverem concluído as três etapas.

## Novo planejamento após a conclusão

* Após a conclusão integral do planejamento, o sistema oferecerá a criação de um novo plano para o mesmo edital. A criação dependerá de uma ação do usuário e não será automática.  
* O usuário poderá escolher um plano com teoria, revisão e exercícios ou um plano sem teoria, composto por revisão e exercícios.  
* Quando a teoria for excluída, a ordem obrigatória será revisão → exercícios. Quando for incluída, será teoria 1 → teoria N → revisão → exercícios.  
* A prioridade poderá considerar tempo desde o último estudo, desempenho em exercícios, dificuldade informada e peso da matéria.  
* O novo planejamento poderá reutilizar a duração das tarefas, a disponibilidade semanal e as relações de páginas anteriores, permitindo alterações antes da geração.

## Fórmulas iniciais

* Páginas por tarefa de teoria \= páginas por hora × minutos por tarefa ÷ 60\.  
* Quantidade de tarefas de teoria do subtópico \= teto do total de páginas relacionadas ÷ páginas por tarefa, ajustada aos limites dos intervalos do índice.  
* Duração estimada da teoria \= quantidade de páginas ÷ páginas por hora × 60\.  
* Capacidade semanal em tarefas \= minutos disponíveis por semana ÷ duração-alvo da tarefa.  
* Quantidade estimada de semanas \= teto dos minutos totais do planejamento ÷ minutos disponíveis por semana.

## Regras de geração

* As tarefas deverão ser geradas somente a partir de registros aprovados na tabela de relação entre subtópicos e intervalos de páginas dos materiais.  
* Cada página relacionada deverá aparecer em pelo menos uma tarefa de teoria do subtópico, salvo exclusão manual justificada.  
* A geração deverá detectar lacunas, duplicidades e sobreposições entre blocos antes de publicar o planejamento.  
* Mudanças na duração-alvo, nas horas semanais ou nas páginas por hora deverão permitir recalcular tarefas e semanas futuras sem alterar o histórico concluído.  
* A regeneração do plano deverá preservar tarefas concluídas, tempos registrados e decisões manuais do usuário.  
* Tarefas compartilhadas poderão atender mais de um subtópico quando as mesmas páginas cobrirem conteúdos relacionados.

O sistema deverá exibir o motivo da ordem, da duração e das páginas escolhidas para cada tarefa.

# 19\. Decisões em aberto

• Banco relacional, documental ou híbrido.  
• Provedores e modelos para cada etapa.  
• Política de aprovação automática.  
• Limites de tamanho, páginas e custo por projeto.  
• Política de retenção dos materiais.  
• Modelo de permissões e colaboração.  
• Escopo jurídico para materiais de terceiros.

* Velocidade padrão em páginas por hora para novos usuários.  
* Duração-alvo das tarefas, regras de arredondamento de páginas e tratamento da última tarefa menor de um subtópico.  
* Intervalo mínimo para liberar revisões no planejamento semanal.  
* Forma de obter exercícios e sugerir quantidade de questões.  
* Critérios de prioridade entre matérias e subtópicos.

• Provedor de pagamento, meios aceitos, moeda, cobrança mensal ou anual e estratégia de contingência.  
• Nomes, preços, limites e benefícios de cada plano.  
• Política de teste gratuito, período de tolerância, inadimplência, cancelamento, reembolso e chargeback.  
• Regra de upgrade, downgrade, rateio e tratamento de dados acima do limite.  
• Regime tributário e integração para emissão de notas fiscais ou documentos equivalentes.  
• Requisitos mínimos de MFA, passkeys, gestão de sessões e acesso administrativo.  
• Metas de disponibilidade, RTO, RPO e retenção de backups.  
• Política de retenção e exclusão após cancelamento da assinatura.  
• Critério para permitir cadastro de menores e controles adicionais, caso aplicável.  
• Países e provedores autorizados para transferência internacional de dados.  
• Nível-alvo de verificação OWASP ASVS e frequência de testes de invasão.

# 20\. Próximos passos

1\. Selecionar dois editais reais e cinco índices de materiais para o conjunto inicial.  
2\. Definir o JSON Schema da verticalização e do índice.  
3\. Criar uma base de referência anotada manualmente.  
4\. Comparar modelos em precisão, custo e latência.  
5\. Definir a stack inicial e o backlog priorizado.  
6\. Desenhar as telas de revisão e cobertura.  
7\. Validar riscos jurídicos e termos de uso.  
8\. Definir as entidades de plano, versão do plano, semana, alocação semanal, tarefa, dependências, SyllabusMaterialRange e TaskMaterialSlice.  
9\. Calibrar páginas por hora e regras de arredondamento usando índices e materiais de referência.  
10\. Prototipar as telas de catálogo de editais, configuração do plano, semana atual, próximas semanas, progresso e previsão de conclusão.  
11\. Validar a geração de múltiplas tarefas de teoria por subtópico e o bloqueio da revisão até a cobertura integral das páginas.  
12\. Testar a conclusão do planejamento e a criação manual de um novo plano com ou sem teoria.  
13\. Prototipar Pomodoro, cronômetro contínuo, pausas, retomadas e registro manual de tempo.  
14\. Definir fórmulas de páginas por hora por matéria, tratamento de valores atípicos e regra de recalibração semanal.  
15\. Definir o modelo de registro de exercícios e os indicadores de desempenho.  
16\. Definir consentimento, coortes mínimas, anonimização e regras de benchmarking.

17\. Definir a matriz inicial de planos, limites, preços, teste gratuito e regras de upgrade, downgrade e cancelamento.  
18\. Selecionar o provedor de pagamentos e validar checkout hospedado, tokenização, assinaturas, webhooks e portal do cliente.  
19\. Criar catálogo versionado de produtos, preços, entitlements e quotas.  
20\. Implementar autenticação reforçada, MFA, recuperação segura, gestão de sessões e papéis administrativos.  
21\. Produzir inventário de dados, registro de operações, bases legais, política de retenção e fluxo de direitos dos titulares.  
22\. Elaborar Aviso de Privacidade, Termos de Uso, Política de Cookies, condições comerciais e contratos com operadores.  
23\. Definir canal do encarregado, processo de incidentes e critérios para comunicação à ANPD e titulares.  
24\. Implantar SSDLC, SAST, DAST, SCA, detecção de segredos, SBOM e política de correção de vulnerabilidades.  
25\. Testar isolamento entre usuários e organizações, uploads maliciosos, prompt injection e autorização em todas as APIs.  
26\. Definir RTO, RPO, backups, restauração e plano de continuidade.  
27\. Executar teste de invasão e simulação de incidente antes da liberação comercial.  
28\. Validar reconciliação financeira, reembolsos, chargebacks, notas ou recibos e relatórios de receita.

# 21\. Jornada do usuário

## Entrada e autenticação

O usuário acessa a plataforma, realiza o login e visualiza seus planejamentos em andamento, planejamentos concluídos e a opção de criar um novo planejamento.

## Seleção ou cadastro do edital

Ao iniciar um novo planejamento, o usuário poderá selecionar um edital verticalizado já existente no catálogo da plataforma ou cadastrar um novo edital. Quando cadastrar um novo edital, deverá enviar o PDF, acompanhar a verticalização e revisar matérias, tópicos e subtópicos antes de continuar.

## Cadastro dos materiais por índice

Depois de selecionar o edital, o usuário cadastra os materiais que utilizará. No MVP, não será necessário enviar o PDF completo do curso: o usuário enviará somente o arquivo, fotografia ou captura das páginas de índice. Para cada material, o sistema armazenará identificação, disciplina, aula ou módulo, tópicos do índice e intervalos de páginas.  
O sistema relacionará os itens do índice aos subtópicos do edital. O usuário poderá revisar e corrigir essas relações antes da geração das tarefas.

## Configuração do planejamento

O usuário informará a quantidade de horas que pretende estudar por semana, sua velocidade em páginas por hora e a duração desejada das tarefas. A interface oferecerá inicialmente tarefas de 15, 30, 45, 60 ou 90 minutos.

## Geração do backlog completo

Antes de montar as semanas, o sistema gerará todas as tarefas necessárias para concluir o edital. O backlog conterá as múltiplas tarefas de teoria necessárias para cada subtópico, seguidas pelas respectivas tarefas de revisão e exercícios, preservando todas as dependências.

## Distribuição semana a semana

A capacidade semanal em minutos será calculada multiplicando as horas semanais por 60\. O sistema preencherá a Semana 1 até atingir essa capacidade, continuará na Semana 2 e repetirá o processo até distribuir todo o backlog. O resultado mostrará a quantidade total de semanas, a carga planejada de cada semana e a previsão de conclusão.  
No MVP, o cronograma semanal será uma lista ordenada de tarefas atribuídas à semana. A distribuição dessas tarefas em dias e horários específicos poderá ser adicionada posteriormente.

## Execução e replanejamento

Durante a execução, o usuário visualizará a semana atual e abrirá a tarefa que deseja realizar. Poderá iniciar um Pomodoro, usar um cronômetro contínuo ou registrar posteriormente o tempo gasto. A plataforma armazenará tempo ativo, pausas, ciclos concluídos, páginas efetivamente estudadas e status de conclusão. Em exercícios, o usuário registrará a quantidade de questões e os resultados. Tarefas poderão ser marcadas como concluídas, parcialmente concluídas ou não realizadas. Pendências serão transportadas para a semana seguinte, e somente as semanas futuras serão recalculadas. Tarefas concluídas e registros históricos permanecerão preservados.

No fechamento semanal, o sistema apresentará um resumo com horas planejadas e realizadas, aderência, páginas estudadas, páginas por hora por matéria, questões realizadas, taxa de acerto, percentual do edital estudado, evolução e previsão atualizada de conclusão. O usuário poderá revisar dados incompletos antes da recalibração.

## Conclusão e novo planejamento

Quando todas as tarefas forem concluídas, o planejamento será encerrado. O usuário poderá então gerar um novo planejamento para o mesmo edital. Nessa etapa, escolherá entre incluir novamente teoria, revisão e exercícios ou criar um plano somente com revisão e exercícios. Cada novo planejamento será versionado e manterá vínculo com o edital, os materiais e o histórico anterior.

# 22\. Execução, telemetria e inteligência de desempenho

## Modos de execução da tarefa

Cada tarefa poderá ser executada em um dos seguintes modos: Pomodoro, cronômetro contínuo ou registro manual. O modo escolhido não alterará a natureza da tarefa; ele definirá como o tempo e as interrupções serão capturados.

No modo Pomodoro, o usuário poderá configurar duração do foco, pausa curta, pausa longa, quantidade de ciclos e comportamento dos alertas. Uma tarefa de 60 ou 90 minutos poderá conter vários ciclos de foco. A tarefa somente será concluída quando o usuário confirmar o resultado, mesmo que o temporizador tenha terminado.

No modo cronômetro contínuo, o usuário poderá iniciar, pausar, retomar e encerrar livremente. O sistema registrará o tempo ativo separadamente do tempo pausado e do tempo total decorrido.

No registro manual, o usuário informará o tempo ativo realizado, a data da execução e, opcionalmente, pausas e observações. Esses registros serão identificados como manuais para fins de qualidade estatística.

## Conclusão de tarefas de teoria

Ao concluir uma tarefa de teoria, o sistema deverá solicitar ou inferir os seguintes dados: páginas inicialmente planejadas, página inicial efetivamente estudada, página final efetivamente estudada, páginas concluídas, tempo ativo, tempo de pausa, dificuldade percebida e status de conclusão.

A velocidade observada será calculada por:  
Páginas por hora observadas \= páginas efetivamente concluídas ÷ minutos ativos × 60\.

Quando a tarefa for parcialmente concluída, o intervalo restante deverá gerar uma continuação vinculada à tarefa original, sem contar as páginas como estudadas duas vezes.

## Recalibração semanal da velocidade

Ao final de cada semana, o sistema calculará a velocidade do usuário por matéria. A média deverá priorizar sessões recentes e válidas, podendo utilizar média ponderada ou mediana para reduzir o impacto de valores atípicos.

A velocidade global do usuário poderá ser exibida, mas o planejamento deverá utilizar preferencialmente a velocidade específica da matéria. Quando ainda não houver amostra suficiente para uma matéria, será usada a velocidade inicial informada pelo usuário ou uma estimativa padrão, claramente identificada.

A nova velocidade não deverá modificar tarefas concluídas. Ela será aplicada somente a tarefas ainda não iniciadas e às semanas futuras. O sistema deverá mostrar a velocidade anterior, a nova velocidade, a quantidade de sessões utilizadas e o impacto na previsão de conclusão.

## Registro de exercícios

Cada tarefa de exercícios deverá permitir registrar: quantidade total de questões, corretas, incorretas, anuladas, em branco, tempo ativo, fonte das questões, dificuldade percebida e observações.

Métricas derivadas incluirão taxa de acerto, questões por hora, tempo médio por questão, taxa de omissão, evolução da taxa de acerto, desempenho por matéria, tópico e subtópico e reincidência de erros.

Quando não houver integração com um banco de questões, o lançamento poderá ser manual. Integrações futuras poderão preencher os dados automaticamente sem alterar o modelo lógico.

## Fechamento semanal

Ao final da semana, a plataforma deverá gerar um fechamento contendo, no mínimo:  
• horas planejadas, realizadas e diferença;  
• percentual de aderência ao planejamento;  
• tarefas concluídas, parciais, adiadas e antecipadas;  
• páginas planejadas e efetivamente estudadas;  
• páginas por hora por matéria e tendência em relação às semanas anteriores;  
• questões realizadas, acertos, erros e taxa de acerto;  
• tempo de teoria, revisão e exercícios;  
• percentual do edital coberto em teoria, revisão e exercícios;  
• matérias com maior e menor velocidade;  
• matérias com melhor e pior desempenho;  
• previsão atualizada de conclusão;  
• recomendações de ajuste para a próxima semana.

## Painel de estatísticas individuais

O painel individual poderá apresentar séries históricas diárias, semanais e acumuladas. Entre as métricas previstas estão:  
• horas líquidas de estudo e horas totais;  
• quantidade de sessões e Pomodoros concluídos;  
• duração média das sessões e taxa de interrupção;  
• aderência semanal e sequência de semanas ativas;  
• páginas lidas, páginas por hora e evolução por matéria;  
• tarefas planejadas versus realizadas;  
• quantidade de questões, questões por hora e taxa de acerto;  
• desempenho por matéria, tópico e subtópico;  
• percentual do edital estudado, revisado e exercitado;  
• cobertura de materiais e páginas;  
• tempo médio até a primeira revisão;  
• atraso médio das revisões;  
• previsão de conclusão e variação da previsão;  
• distribuição do tempo entre teoria, revisão e exercícios;  
• consistência, produtividade e tendência de desempenho.

## Benchmarking entre usuários

As comparações deverão utilizar apenas dados agregados e anônimos de usuários que tenham consentido. O sistema não deverá exibir nomes, perfis individuais ou posições que permitam identificar participantes.

As coortes poderão considerar edital, matéria, experiência declarada, duração das tarefas, faixa de horas semanais e quantidade mínima de sessões válidas. O usuário poderá ser comparado por média, mediana, intervalo interquartil e percentil.

Exemplos de comparações incluem páginas por hora por matéria, taxa de acerto, questões por hora, horas estudadas por semana, aderência, percentual do edital coberto e tempo estimado para conclusão.

O sistema deverá evitar comparações entre grupos incompatíveis e não deverá produzir estatísticas para coortes pequenas. O consentimento poderá ser revogado, interrompendo o uso futuro dos dados em benchmarking.

## Princípios de qualidade e utilidade das métricas

A coleta deverá ser ampla, mas cada métrica precisa ter definição, finalidade e origem conhecidas. Métricas utilizadas para recalcular o planejamento deverão ser diferenciadas de métricas apenas informativas.

Dados automáticos, manuais, estimados e importados deverão ser identificados separadamente. Alterações manuais deverão manter trilha de auditoria. Valores extremos não deverão ser removidos silenciosamente; poderão ser desconsiderados dos cálculos mediante regra explícita, preservando o registro original.

O usuário deverá conseguir consultar, corrigir e exportar seu histórico, além de excluir dados conforme as políticas da plataforma.

# 23\. Segurança, privacidade, conformidade e monetização

## Princípios gerais

A plataforma deverá adotar segurança e privacidade desde a concepção e por padrão. Nenhuma funcionalidade comercial, administrativa ou de inteligência artificial poderá contornar os controles de autorização, isolamento de dados, rastreabilidade ou minimização. O programa de segurança deverá combinar governança, prevenção, detecção, resposta e recuperação, usando como referências a LGPD, regulamentações da ANPD, OWASP ASVS 5.0, OWASP LLMSVS, NIST CSF 2.0 e PCI DSS v4.0.1 quando aplicável ao fluxo de pagamento.

## Classificação e minimização de dados

Os dados deverão ser classificados em públicos, internos, confidenciais e restritos. Dados de autenticação, pagamento, documentos enviados, histórico de estudo e identificadores pessoais deverão receber controles proporcionais ao risco. A coleta deverá ser limitada ao necessário para cada finalidade, com campos opcionais claramente identificados e sem reutilização incompatível.

A plataforma deverá manter inventário de dados, finalidade, base legal, origem, compartilhamentos, período de retenção, local de armazenamento, operadores envolvidos e medidas de segurança. Dados usados apenas para métricas poderão ser agregados ou pseudonimizados. Dados destinados a benchmarking deverão ser anonimizados sempre que possível.

## Papéis de tratamento e bases legais

A empresa responsável pela plataforma deverá definir, para cada operação, se atua como controladora, operadora ou controladora conjunta. Cada tratamento deverá estar vinculado a uma finalidade e a uma base legal documentadas. Consentimentos deverão ser específicos, destacados, revogáveis e versionados, sem serem usados quando outra base legal for mais adequada.

O tratamento necessário para execução do contrato incluirá cadastro, autenticação, entrega das funcionalidades contratadas, cobrança, suporte e prevenção a fraude. Obrigações legais ou regulatórias poderão justificar retenções específicas. Tratamentos baseados em legítimo interesse deverão possuir avaliação documentada de necessidade, balanceamento e salvaguardas.

## Transparência e documentos jurídicos

A plataforma deverá publicar Aviso de Privacidade, Termos de Uso, Política de Cookies e condições comerciais em linguagem clara. As versões aceitas pelo usuário deverão ser registradas. Alterações materiais deverão ser comunicadas e, quando necessário, submetidas a nova aceitação.

A oferta de planos deverá mostrar preço total, periodicidade, impostos ou encargos aplicáveis, funcionalidades, limites, renovação, teste gratuito, regras de cancelamento, reembolso e eventual perda de benefícios. O fluxo de contratação eletrônica deverá facilitar atendimento, cancelamento e exercício do direito de arrependimento conforme a legislação de consumo aplicável.

## Direitos dos titulares

A conta deverá oferecer canal para confirmação de tratamento, acesso, correção, atualização, portabilidade ou exportação, anonimização, bloqueio, eliminação quando cabível, informação sobre compartilhamentos, revogação de consentimento e oposição. Solicitações deverão gerar protocolo, prazo, responsável, histórico e evidências de atendimento.

A exclusão da conta deverá informar quais dados serão eliminados, anonimizados ou conservados por obrigação legal. Processos assíncronos, backups e sistemas analíticos deverão participar da política de eliminação, com prazos técnicos documentados e bloqueio de reutilização durante a fila de exclusão.

## Encarregado e governança

Deverá existir canal público do encarregado pelo tratamento de dados pessoais ou responsável equivalente, com processo para receber comunicações de titulares e da ANPD. A organização deverá manter registro das operações de tratamento, matriz de responsabilidades, políticas internas, treinamento periódico, gestão de riscos, auditorias e plano de conformidade.

Operações de maior risco deverão ser avaliadas por Relatório de Impacto à Proteção de Dados Pessoais. Novas funcionalidades que ampliem coleta, perfilamento, comparação entre usuários, uso de IA ou compartilhamento com terceiros deverão passar por revisão de privacidade antes da liberação.

## Fornecedores e transferências internacionais

Provedores de nuvem, pagamentos, e-mail, observabilidade, armazenamento e inteligência artificial deverão ser avaliados antes da contratação e periodicamente. Os contratos deverão conter instruções de tratamento, confidencialidade, segurança, subcontratação, cooperação com direitos dos titulares, incidentes, devolução ou eliminação e auditoria.

Transferências internacionais deverão usar mecanismo válido previsto pela LGPD e pela regulamentação da ANPD, com transparência sobre países, importadores, finalidades, categorias de dados, retenção e medidas de segurança. O cadastro de suboperadores deverá permanecer atualizado.

## Autenticação e segurança de contas

O cadastro deverá exigir verificação de e-mail e proteção contra criação automatizada e abuso. A plataforma deverá suportar autenticação multifator e, quando viável, passkeys. Senhas deverão ser armazenadas somente com função de derivação resistente, parâmetros atualizados e salt individual.

Recuperação de senha, troca de e-mail e ações sensíveis deverão exigir confirmação reforçada. O usuário deverá visualizar sessões e dispositivos ativos, encerrar sessões remotamente e receber alertas de acesso suspeito. Tokens de acesso deverão ser curtos, refresh tokens rotativos e sessões revogáveis.

## Autorização e isolamento

A autorização deverá ser validada no servidor em todas as operações. Papéis administrativos, suporte, financeiro e usuário final deverão ter permissões mínimas e separação de funções. Acesso de suporte a dados do usuário deverá ser temporário, justificado, auditado e, quando apropriado, autorizado.

O isolamento entre usuários, projetos e organizações deverá ser testado contra acesso horizontal e vertical indevido. Identificadores previsíveis não poderão ser considerados controles de autorização. Consultas, caches, objetos de armazenamento, filas e índices de busca deverão carregar contexto de locatário.

## Proteção de dados e segredos

Todo tráfego deverá usar criptografia em trânsito, com configurações modernas e cabeçalhos de segurança. Dados confidenciais deverão ser criptografados em repouso com chaves gerenciadas, rotação e separação por ambiente. Backups também deverão ser criptografados.

Segredos, chaves de API e credenciais de serviços deverão permanecer em cofre de segredos, nunca em código-fonte, imagens de contêiner, logs ou respostas ao cliente. Acesso a produção deverá ser restrito, temporário quando possível e protegido por MFA.

## Segurança de arquivos e documentos

Uploads deverão validar extensão, MIME real, assinatura do arquivo, tamanho, quantidade de páginas e estrutura. Arquivos deverão entrar em quarentena, passar por análise antimalware e ser processados em ambiente isolado, sem execução de macros, scripts ou conteúdo ativo.

URLs de acesso deverão ser temporárias e vinculadas ao usuário autorizado. Nomes de arquivos não poderão determinar caminhos internos. Arquivos com senha, conteúdo corrompido, bombas de descompressão ou padrões suspeitos deverão ser recusados ou enviados para revisão.

## Segurança de IA e LLM

Editais, índices e textos enviados deverão ser tratados como conteúdo não confiável. O sistema deverá resistir a prompt injection direta e indireta, separar instruções do sistema do conteúdo do documento, limitar ferramentas disponíveis, validar saídas por esquema e impedir que o modelo autorize ações.

Segredos, credenciais, dados de pagamento e informações desnecessárias não deverão ser enviados ao provedor de IA. A seleção do provedor deverá considerar retenção, treinamento com dados do cliente, localização, suboperadores e exclusão. Respostas do modelo deverão ser verificadas antes de alterar dados persistidos ou liberar associações.

## Segurança da aplicação e do ciclo de desenvolvimento

O desenvolvimento deverá seguir um SSDLC com modelagem de ameaças, revisão de código, análise estática, análise dinâmica, composição de dependências, detecção de segredos, infraestrutura como código e testes de autorização. Dependências deverão ser inventariadas em SBOM e vulnerabilidades críticas deverão possuir prazos de correção.

Ambientes de desenvolvimento, homologação e produção deverão ser separados. Dados reais não deverão ser copiados para ambientes inferiores sem anonimização. Mudanças em produção deverão ser rastreáveis, aprovadas e reversíveis. Imagens e artefatos deverão ser assinados ou verificados.

## APIs e proteção contra abuso

APIs deverão aplicar autenticação, autorização, validação de entrada, limites de tamanho, rate limiting, quotas por plano, proteção contra força bruta e idempotência. A aplicação deverá usar políticas adequadas de CORS, CSRF, CSP, cookies seguros, SameSite, proteção contra XSS, injeção, SSRF e redirecionamentos abertos.

WAF, proteção contra bots e regras de abuso poderão ser aplicados conforme o risco. Erros não deverão revelar stack traces, consultas, chaves, dados pessoais ou detalhes internos. Operações de alto custo deverão possuir limites e filas para impedir negação de serviço econômica.

## Logs, auditoria e detecção

Eventos de autenticação, alteração de permissões, acesso administrativo, exclusão, exportação, pagamento, webhook, mudança de plano e ações sobre dados pessoais deverão ser auditados. Logs deverão evitar conteúdo sensível, ter acesso restrito, retenção definida e proteção contra alteração.

Alertas deverão detectar tentativas repetidas de acesso, elevação de privilégio, exportações incomuns, falhas de webhook, picos de consumo, uploads maliciosos e comportamento incompatível com o plano. O sistema deverá permitir correlação de eventos sem expor dados desnecessários.

## Gestão de vulnerabilidades

A aplicação deverá passar por verificações automatizadas contínuas, revisão de dependências e teste de invasão antes da produção e após mudanças relevantes. Vulnerabilidades deverão possuir severidade, responsável, prazo, evidência de correção e processo de aceitação formal de risco.

Deverá existir canal de divulgação responsável de vulnerabilidades. Segredos expostos ou vulnerabilidades ativamente exploradas deverão acionar procedimento emergencial de contenção, rotação e comunicação.

## Continuidade, backups e recuperação

A arquitetura deverá definir metas de disponibilidade, RTO e RPO. Backups deverão ser automatizados, criptografados, imutáveis quando possível e testados por restauração. A recuperação deverá incluir banco, objetos, configurações, filas críticas e registros de cobrança.

Dependências externas deverão possuir timeouts, retries limitados, circuit breakers e degradação controlada. Falhas do provedor de pagamento não poderão apagar direitos já concedidos nem gerar cobranças duplicadas.

## Resposta a incidentes

Deverá existir plano de resposta com papéis, contatos, severidade, contenção, preservação de evidências, erradicação, recuperação, comunicação e análise posterior. Todos os incidentes com dados pessoais deverão ser registrados e avaliados quanto a risco ou dano relevante.

Quando aplicável, a comunicação à ANPD e aos titulares deverá ocorrer dentro do prazo regulatório vigente, atualmente de três dias úteis para incidentes que possam acarretar risco ou dano relevante. A plataforma deverá manter modelos de comunicação, evidências da decisão e exercícios periódicos de resposta.

## Integração com pagamentos

A plataforma deverá utilizar provedor de serviços de pagamento confiável e evitar armazenar números completos de cartão, códigos de segurança ou credenciais bancárias. O checkout deverá ser hospedado ou tokenizado pelo provedor, reduzindo o escopo PCI DSS.

A integração deverá suportar criação de cliente, assinatura recorrente, cobrança mensal ou anual, período de teste, cupons, upgrades, downgrades, cancelamento, reativação, reembolso, contestação, falha de pagamento, notas ou recibos e portal do cliente, conforme as capacidades do provedor escolhido.

## Webhooks de pagamento

Todo webhook deverá ter assinatura validada, tolerância de tempo, proteção contra replay, idempotência e armazenamento do identificador do evento. Eventos poderão chegar fora de ordem e deverão ser reconciliados com o estado consultado no provedor.

O processamento deverá usar fila, retentativas com backoff e dead-letter queue. Um evento não poderá conceder acesso duas vezes, cobrar novamente ou reverter estado mais recente. Divergências deverão aparecer em fila de reconciliação administrativa.

## Estados de assinatura

A assinatura deverá possuir estados explícitos, como avaliação, ativa, pagamento pendente, período de tolerância, suspensa, cancelada ao fim do ciclo, cancelada imediatamente e encerrada. O acesso deverá derivar do estado efetivo e dos direitos concedidos, não apenas de uma resposta de checkout.

Falhas temporárias de cobrança poderão iniciar período de tolerância configurável, com comunicação ao usuário e tentativas de recuperação. Após o término, funcionalidades pagas poderão ser bloqueadas sem apagar os dados do usuário. A política de retenção após cancelamento deverá ser transparente.

## Planos, preços e direitos de acesso

Os nomes, preços e limites finais permanecerão configuráveis. Uma estrutura inicial poderá conter plano Gratuito ou Avaliação, Essencial, Pro e Institucional ou Equipe. Cada plano deverá ser composto por entitlements versionados, como quantidade de editais, materiais, processamento de páginas, histórico, exportação, estatísticas avançadas, benchmarking, colaboração e suporte.

As verificações de entitlement deverão ocorrer no backend e também orientar a interface. Feature flags não deverão substituir autorização. Alterações de catálogo deverão preservar assinaturas antigas quando necessário e registrar a versão comercial contratada.

## Mudança de plano

Upgrades poderão liberar direitos imediatamente após confirmação de pagamento. Downgrades poderão valer na próxima renovação para evitar perda inesperada. Regras de rateio, créditos, saldo, limites excedidos e recursos incompatíveis deverão ser explícitas.

Antes do downgrade, a plataforma deverá mostrar quais limites serão reduzidos e como dados acima do limite serão tratados. O sistema deverá preferir bloqueio de novas criações a exclusão automática de dados.

## Cancelamento, arrependimento e reembolso

O usuário deverá conseguir cancelar a renovação por fluxo simples e receber confirmação durável. A tela deverá informar a data final de acesso, cobranças futuras, efeitos sobre dados e possibilidade de reativação.

Pedidos de arrependimento, reembolso, cobrança duplicada ou contestação deverão gerar caso rastreável. O tratamento deverá observar a legislação de consumo, as regras do meio de pagamento e as políticas publicadas, sem criar barreiras indevidas.

## Cobrança, documentos e tributos

A plataforma deverá registrar valores, moeda, impostos, descontos, período de competência, provedor, identificadores externos e status. Recibos, notas fiscais ou documentos equivalentes deverão ser emitidos ou integrados conforme o regime tributário e a legislação aplicável.

Dados financeiros internos deverão ser reconciliados com o provedor. Relatórios de receita não deverão depender apenas de webhooks e deverão distinguir pagamento aprovado, liquidado, reembolsado, contestado e perdido.

## Administração comercial

Administradores autorizados poderão gerenciar catálogo, preços, cupons, períodos de teste, limites, tolerância e migrações. Mudanças críticas deverão exigir reautenticação, dupla aprovação quando apropriado e auditoria.

A equipe de suporte não deverá alterar pagamentos ou direitos sem permissão específica. Concessões manuais deverão ter justificativa, prazo de validade e responsável.

## Matriz inicial de planos

Plano Gratuito ou Avaliação: acesso limitado para conhecer a plataforma, com limites reduzidos de projetos, materiais, processamento e histórico.  
Plano Essencial: planejamento completo, execução por Pomodoro ou cronômetro, métricas básicas e limites adequados ao usuário individual.  
Plano Pro: estatísticas avançadas, benchmarking, exportações ampliadas, maior processamento e funcionalidades de otimização.  
Plano Institucional ou Equipe: múltiplos usuários, papéis administrativos, limites contratados, relatórios agregados, suporte e requisitos adicionais de segurança.

A matriz é uma proposta inicial. Preços, limites e nomes deverão ser administráveis sem alteração de código, com histórico de versões e comunicação transparente.

## Critérios mínimos para produção

Antes da liberação comercial, a plataforma deverá concluir modelagem de ameaças, revisão LGPD, inventário de dados, testes de autorização, teste de restauração, teste de invasão, revisão de checkout e webhooks, plano de resposta a incidentes, documentos jurídicos, canal do encarregado, fluxo de direitos dos titulares e reconciliação financeira.

A entrada em produção deverá depender de checklist com evidências e aceite dos responsáveis por produto, engenharia, segurança, privacidade, jurídico e financeiro.  
