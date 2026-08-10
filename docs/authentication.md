# Autenticação OIDC

A aplicação usa somente padrões OIDC. Nenhum SDK de fornecedor participa da autorização de projetos.

## Configuração

- `OIDC_ISSUER`: issuer HTTPS exato publicado pelo provedor.
- `OIDC_AUDIENCE`: audience exclusiva da API.
- BFF: Authorization Code + PKCE ocorre integralmente na API. `state`, `nonce` e verifier têm vida curta no PostgreSQL; o callback valida `state`, assinatura/JWKS, issuer, audience, expiração, nonce e a correspondência de `sub` entre ID token e access token.
- Navegador: recebe apenas um identificador opaco de sessão em cookie `Secure`, `HttpOnly` e `SameSite=Lax`. Tokens OIDC nunca são enviados ao JavaScript, `localStorage` ou `sessionStorage`. A sessão sobrevive a recargas e é revogável no servidor.
- API: discovery exige `discovery.issuer` idêntico ao configurado e endpoints HTTPS. Requisições mutáveis autenticadas por cookie também exigem `Origin` na allowlist explícita.

ZITADEL é o candidato standalone recomendado e Keycloak é o candidato de fallback, mas a escolha depende de um ADR ainda pendente. O código não assume nenhum deles. Políticas de MFA/passkeys, verificação de e-mail, recuperação e proteção contra abuso serão configuradas no provedor escolhido; senhas nunca são armazenadas nesta aplicação.

O usuário local é identificado pelo par imutável `(issuer, sub)`. O claim `tenant_id` assinado é apenas o tenant solicitado: em toda requisição, o backend exige uma associação local ativa desse `(issuer, sub)` ao tenant. Um token válido nunca cria associação nem concede acesso sozinho. Leituras e alterações também são filtradas pelo tenant.

Uma autenticação nova revoga as sessões locais anteriores do mesmo `(issuer, sub)`. A sessão expira após 60 minutos absolutos e 15 minutos de inatividade. O logout atual revoga a sessão local; ele não encerra necessariamente a sessão no provedor OIDC. Até implementar RP-Initiated Logout/back-channel logout por provedor, considere esse risco em dispositivos compartilhados.

## Desenvolvimento

Use um issuer OIDC de teste com chaves próprias. Não desative validação de assinatura em nenhum ambiente. O Playwright obtém uma sessão HttpOnly por uma rota disponível apenas no processo `test-main`; ele não recebe token de desenvolvimento. Testes de OIDC assinam tokens efêmeros e cobrem nonce e correspondência de identidade.

Migrações usam `pnpm --filter @planejador/api migrate` com `DDL_DATABASE_URL` e uma role DDL separada. A API de runtime usa somente `DATABASE_URL` e nunca executa DDL durante o boot.
No boot, a API recusa uma role de runtime com privilégio `CREATE` no schema `public`. Conceda à role de runtime apenas conexão e DML nas tabelas/sequências necessárias.

`SECURITY_MODE=production` exige origins e callback HTTPS, cookies `Secure` e TLS do PostgreSQL com validação de certificado. `SECURITY_MODE=loopback-development` permite cookie e banco sem TLS somente quando origins e callback usam `localhost`, `127.0.0.1` ou `::1`.

`TRUSTED_PROXY_IPS` descreve explicitamente os endereços dos proxies reversos autorizados a fornecer `X-Forwarded-For`; use `none` quando a API recebe tráfego diretamente. O limitador aplica 10 inícios de login por minuto ao IP de cliente já resolvido por essa topologia, e o armazenamento limita cinco fluxos OIDC simultâneos por cliente.

No frontend de produção, `VITE_API_URL` deve ser HTTPS quando informado. Quando omitido, o cliente usa intencionalmente a mesma origem do site; o fallback local existe apenas em builds de desenvolvimento.
