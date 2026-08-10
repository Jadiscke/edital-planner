Status: ready-for-agent

# Landing acessível e indexável

## Parent

[`../PRD.md`](../PRD.md)

## What to build

Entregar a jornada pública completa em que um visitante entende o produto, navega pelos benefícios, funcionamento, privacidade e planos e consegue iniciar o cadastro. Esta fatia atravessa apenas os layers necessários ao comportamento: Astro estático, componentes visuais e pipeline de build; não há backend artificial.

## Acceptance criteria

- [ ] O visitante navega por teclado e leitor de tela por benefícios, funcionamento, privacidade, planos e chamada para cadastro.
- [ ] O build produz HTML estático com título, descrição, canonical, Open Graph, robots e sitemap verificáveis.
- [ ] A chamada principal encaminha para a rota pública de cadastro configurada, sem URL codificada no componente.
- [ ] Testes automatizados verificam build, landmarks, nomes acessíveis, metadados, links e ausência de overflow em viewport móvel.
- [ ] O teste de jornada executa a página construída, sem substituir navegador ou DOM por mocks.

## Blocked by

None - can start immediately

