# ArchFlow

Visualizador de arquitetura **bonito e apresentável**: editor de diagramas com raias, roteamento
manual de arestas ortogonais (waypoints arrastáveis, estilo draw.io) e **fluxos animados** —
pacotes percorrendo o caminho exato desenhado, hop a hop, com o resto do diagrama esmaecido
(estilo Syncitect). Local-first: tudo roda no navegador, persistência em YAML + localStorage.

![Modo apresentação com o fluxo Pagamento animado](docs/screenshots/apresentacao.png)
<sup>Modo apresentação: o fluxo Pagamento animado hop a hop, o resto do diagrama esmaecido.</sup>

## Rodando

```bash
npm install
npm run dev     # http://localhost:5183
```

Na primeira abertura carrega o diagrama de exemplo — **Plataforma de Pedidos**, uma arquitetura
fictícia de checkout (clientes → API → filas → workers → serviços externos) que exercita todos os
recursos da ferramenta. Para voltar a ele depois de editar: menu ⋯ → "Recarregar diagrama de
exemplo".

## Uso essencial

- **Editar**: arraste nós; conecte arrastando da borda de um nó; painel direito edita o item
  selecionado. Duplo-clique renomeia. Botão direito abre o menu de contexto (bloquear, trazer
  para frente/enviar para trás, excluir). `Ctrl+Z`/`Ctrl+Y` desfaz/refaz; `Ctrl+L` bloqueia;
  `Delete` exclui; setas movem (Shift = 1px). Ao arrastar um nó, a raia que vai recebê-lo acende.
- **Dobrar linhas** (estilo draw.io): selecione uma aresta e arraste um segmento — a dobra vira
  waypoint persistente. Duplo-clique na linha adiciona dobra; nos quadrados, remove. Arrastar a
  linha de volta à rota natural limpa as dobras sozinho; botão direito → "Limpar dobras" também.
  O rótulo da aresta é arrastável ao longo da linha.
- **Fluxos**: painel esquerdo. Selecionar um fluxo anima só o caminho dele, na ordem dos hops,
  com highlight nos nós à passagem do pacote. "Todos os fluxos" anima tudo; **"Automático"** é
  interativo: **clique num nó para disparar um evento**, que cascateia seguindo as setas a
  partir dali (ramificações incluídas) — sem configurar nada; vários eventos podem correr ao
  mesmo tempo. Velocidade 0.5×–4×, `Espaço` pausa. Para criar fluxos: `+` → "Adicionar hops"
  (clique nas arestas) ou "Seguir setas" para autocompletar o caminho. Hops reordenam por arrasto,
  e o mesmo editor tem **Excluir fluxo** (as arestas do diagrama continuam intactas).
- **Apresentar** (`F5` ou `Ctrl+.`): tela cheia, só canvas + seletor de fluxos. Teclas `1–9`
  trocam de fluxo, `0` = todos, `A` = automático; `←`/`→` navegam hop a hop (modo passo a
  passo). `Esc` sai. `Shift+1` enquadra o diagrama.
- **Config e condições** (estilo Packet Tracer, sem simulação): um nó pode ter flags de config
  (ex.: `usa_gateway_b`) — opcionalmente "buscadas" de outro nó, com round-trip visual — e as
  arestas de saída podem depender delas (`[var = valor]` no canvas; caminho dormente fica
  apagado). Alterne a flag pelo switch no painel ou pelo botão direito e dispare o evento de novo
  para ver o outro caminho. Nós podem ser marcados **fora do ar**: o evento morre neles com ✕.
  **Fluxos com variantes**: um fluxo pode carregar os dois ramos de uma decisão (ex.: Gateway A
  e B) — a config escolhe qual variante flui, renumerando os hops e esmaecendo o ramo inativo
  (o editor marca com ↷). Se um hop dormente não tem alternativa, a animação **para nele com ⚠**
  e o inspetor explica o porquê, em vez de fingir que o caminho acontece.
- **Inspetor de Pacote** (👁 no transporte, na apresentação ou clicando no pacote): mostra, hop a
  hop, o que o nó de destino faz com a mensagem, o payload de exemplo (antes/depois) e a nota da
  etapa. **Variáveis** do diagrama (`{{pedido}}`) interpolam em rótulos, payloads e notas;
  **cenários** salvam/aplicam conjuntos de variáveis, configs e estados de uma vez.
- **Arquivos**: Exportar → YAML (versionável em git), SVG animado (fontes embutidas; visão atual
  ou todos os fluxos) ou PNG 2×. Importar aceita o mesmo YAML. Menu ⋯ guarda um histórico local
  de versões para restaurar.

## O diagrama de exemplo

![Editor com o diagrama de exemplo](docs/screenshots/editor.png)

**Plataforma de Pedidos** é uma arquitetura fictícia, feita só para exercitar a ferramenta: dois
clientes entram por um API Gateway (com sessão em Redis), os pedidos viram mensagens em filas,
workers processam, reservam estoque, pagamentos vão a gateways externos e o que falha cai numa
DLQ com reprocessamento. São 24 nós em 7 raias aninhadas, 27 arestas e **6 fluxos prontos** —
Login, Checkout, Reserva de Estoque, Pagamento, Notificação e Retry/DLQ.

Três decisões por config para brincar: o Worker Pagamento escolhe **Gateway A ou B** por flag
buscada do Postgres, o Worker Notificação escolhe **e-mail ou SMS** por um enum local, e o
Worker Retry decide entre **reenfileirar ou descartar e alertar**. Os 4 cenários prontos
(Padrão, Contingência com Gateway A fora, Notificação por SMS e Black Friday) trocam tudo de
uma vez — inclusive as variáveis: o bucket `recibos_{{ambiente}}` vira `recibos_black-friday`.

Como as setas seguem o sentido do dado, ele também é uma boa demonstração do **modo Automático**:
clique no `Web App` e o evento cascateia por doze fases — com direito à consulta de config no
Postgres — até os provedores externos.

![Modo automático: evento disparado por clique](docs/screenshots/modo-automatico.png)

> Seus diagramas reais não precisam (e não devem) morar aqui: mantenha-os fora do repositório e
> abra pelo botão **Importar**. A pasta `private/` já vem no `.gitignore` para isso.

## Documentação

- `CLAUDE.md` — arquitetura do código e decisões técnicas
- `docs/2026-08-06-melhorias-encontradas.md` — backlog de melhorias mapeado em teste real
- `docs/2026-08-07-proposta-configuracao-de-envio.md` — proposta: variáveis, arestas condicionais e inspetor de pacote
- `PRODUCT.md` / `DESIGN.md` — contexto de produto e sistema visual
