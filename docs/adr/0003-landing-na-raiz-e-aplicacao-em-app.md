# ADR 0003 — Landing na raiz e aplicação em `/app/*`

Status: Aceito
Data: 2026-08-10

## Contexto

O produto possui duas experiências web com responsabilidades diferentes: o site público de marketing e a aplicação autenticada. Sem uma fronteira de URL explícita, links de aquisição, callbacks de autenticação, ambientes de QA e regras de publicação podem enviar usuários para a experiência errada ou permitir que uma sessão termine na landing page.

## Decisão

O mesmo domínio público segue esta convenção:

- `/` e as demais rotas públicas pertencem à landing page;
- `/app` é normalizado para `/app/`;
- `/app/*` pertence exclusivamente à aplicação do produto;
- todos os links que iniciam a jornada do produto apontam para `/app/` ou uma rota descendente;
- destinos de retorno de autenticação (`returnTo`) são aceitos apenas quando usam uma origem permitida e permanecem em `/app/*`;
- ambientes locais, QA e produção preservam a mesma topologia de caminhos.

No desenvolvimento local, o Astro serve a landing em `http://127.0.0.1:4173/` e encaminha `/app/*` para o Vite em `http://127.0.0.1:4174/app/`. A API continua separada em `http://127.0.0.1:3001`. Essas portas são detalhes do ambiente local; a fronteira estável é a estrutura `/` e `/app/*`.

## Testes

- um teste de jornada verifica que `/` renderiza a landing e que sua ação principal entra em `/app/`;
- os fluxos Playwright da aplicação começam em `/app/`;
- testes HTTP rejeitam retornos de autenticação para `/` e aceitam retornos sob `/app/*`;
- a configuração de build do Vite usa `/app/` como caminho-base.

## Consequências

### Positivas

- separação previsível entre aquisição pública e uso autenticado;
- URLs consistentes entre desenvolvimento, QA e produção;
- menor risco de redirects autenticados terminarem no conteúdo público;
- publicação por proxy reverso ou CDN pode rotear as duas experiências pelo caminho.

### Custos e riscos

- a infraestrutura de hospedagem precisa encaminhar `/app/*` para o artefato da aplicação e as rotas públicas para a landing;
- links, assets, callbacks e testes devem respeitar o caminho-base `/app/`;
- novas rotas públicas não podem ocupar o namespace `/app/*`.

## Aplicação

Esta decisão é uma convenção permanente do projeto. Qualquer exceção exige um ADR que substitua explicitamente esta decisão.
