# Product

## Register

product

## Users

Engenheiros e arquitetos de software donos de sistemas distribuídos. Usam a ferramenta em dois contextos:

1. **Edição** (mesa, monitor grande): desenham e corrigem diagramas de arquitetura — nós, raias, arestas com dobras manuais — com precisão de draw.io.
2. **Apresentação** (sala de reunião, telão/projetor, luz baixa): mostram ao time *por onde as coisas passam* — fluxos de mensagens animados atravessando filas, APIs, workers e sistemas externos.

O job-to-be-done: transformar um diagrama estático em uma história animada e bonita que o time entende em segundos.

## Product Purpose

Arch Flow Visualizer é um editor local-first de diagramas de arquitetura com dois diferenciais que nenhuma ferramenta de mercado junta:

1. **Roteamento manual de arestas** — waypoints arrastáveis em linhas ortogonais, igual draw.io (Syncitect não tem).
2. **Animação de fluxos apresentável** — pacotes percorrendo o caminho exato desenhado, hop a hop, com o resto esmaecido (draw.io não tem a estética).

Sucesso = abrir a ferramenta em tela cheia numa reunião e o diagrama parecer um produto de verdade, não um rascunho de engenharia. Puramente visual: sem simulação, sem backend, sem AWS real.

## Brand Personality

**Mission-control noturno.** Três palavras: preciso, cinematográfico, calmo. Cena física: sala de reunião com luz baixa, diagrama projetado no telão — fundo quase preto, linhas de dados vivas cruzando a noite como tráfego aéreo. A estética serve à leitura do fluxo, nunca compete com ela.

## Anti-references

- **draw.io / Lucidchart no modo claro**: visual utilitário de "ferramenta de escritório", chrome pesado, toolbars densas. A edição pode ser densa; a apresentação jamais.
- **Dashboards SaaS genéricos**: hero-metrics, cards idênticos, glassmorphism decorativo.
- **Excalidraw**: o traço hand-drawn é charmoso mas o oposto da precisão ortogonal que este produto vende.

## Design Principles

1. **O diagrama é o palco.** Chrome de UI recua (painéis escuros, discretos, colapsáveis); a cor vive nos nós e fluxos. Modo apresentação = só canvas.
2. **Precisão é sensação, não só feature.** Snap, guias, ângulos retos, cantos arredondados consistentes — cada pixel comunica "isto está sob controle".
3. **Movimento conta a história, nunca decora.** A única animação contínua é a dos fluxos (o produto). Todo o resto é transição de estado 150–250ms.
4. **Familiaridade ganha.** Atalhos, seleção, arraste e conexão se comportam como draw.io/Figma. Nada de affordances inventadas.
5. **O arquivo é do usuário.** YAML legível, diff-ável em git, exportável. Nada preso na ferramenta.

## Accessibility & Inclusion

- Alvo WCAG AA no chrome da UI (texto ≥4.5:1 sobre os painéis escuros).
- Cores de fluxo nunca são o único canal: fluxo ativo também tem nome no painel, rótulos nas arestas e animação direcional.
- `prefers-reduced-motion`: animação de pacotes vira realce estático do caminho (traço contínuo destacado, sem movimento).
- Controles de teclado: delete, undo/redo (Ctrl+Z/Y), setas para nudge, Esc para desselecionar.
