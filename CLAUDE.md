# ArchFlow — visualizador de arquitetura

Editor local-first de diagramas de arquitetura com dois diferenciais: **waypoints manuais em
arestas ortogonais** (estilo draw.io) e **animação de fluxos apresentável** (estilo Syncitect).
Puramente visual — sem simulação, sem backend, sem cloud real. Melhorias mapeadas:
`docs/2026-08-06-melhorias-encontradas.md`. Contexto estratégico: `PRODUCT.md`; sistema visual:
`DESIGN.md`.

> **Diagramas reais não entram no repositório.** O seed é fictício; qualquer diagrama de projeto
> fica em `private/` (gitignorado) e é carregado pelo botão "Importar".

## Comandos

```bash
npm run dev        # dev server em http://localhost:5183
npm run build      # tsc -b + vite build → dist/
npx tsc -b         # só typecheck
```

Stack: Vite 8 · React 19 · TypeScript · @xyflow/react 12 · zustand 5 + zundo 2 (undo/redo) ·
js-yaml. Fontes self-hosted via @fontsource (Inter Variable + JetBrains Mono).

## Arquitetura (src/)

```
model/types.ts        Tipos do domínio: ArchNode/GroupNode/OrthoEdge (React Flow Node/Edge
                      tipados), FlowDef {id, name, color, edgeIds[]}, TYPE_COLORS por ArchType.
model/yaml.ts         Formato de arquivo (Doc) ↔ estado do store. docToStore/storeToDoc,
                      docToYaml/yamlToDoc (validação tolerante), orderNodes (pais antes de filhos
                      — obrigatório para o React Flow com parentId).
model/seed.ts         Diagrama de exemplo carregado na primeira execução: "Plataforma de Pedidos",
                      arquitetura FICTÍCIA (checkout → filas → workers → externos). Serve de
                      vitrine: exercita raias aninhadas, dobras manuais, 4 fluxos e o modo
                      automático (setas no sentido do dado ⇒ clicar no Web App cascateia tudo).
                      Nunca colocar diagrama de projeto real aqui. Ao trocar o seed, bumpar
                      STORAGE_KEY / HISTORY_KEY em store.ts, senão quem já usou vê o antigo.
store/store.ts        Zustand + zundo. Estado rastreado no histórico: {meta, nodes, edges, flows}.
                      Estado de UI fora do histórico: activeFlowId ('__all__' = todos), playing,
                      speed, presentation, pickingFlowId, guides. Autosave debounced (600ms) em
                      localStorage 'archflow.doc.v1'. Em dev, window.__afStore expõe o store.
canvas/FlowCanvas.tsx Config do ReactFlow + guias de alinhamento (snap ±6px) + reparent on drop
                      (centro do nó dentro do grupo mais profundo) + gestos de histórico.
canvas/edges/ortho.ts Roteador ortogonal puro (sem DOM): routePoints (S→waypoints→T com dobras
                      automáticas), roundedPath, dragSegment (arrasta segmento perpendicular,
                      "assando" cantos automáticos em waypoints — comportamento draw.io).
canvas/edges/OrthoEdgeView.tsx  Custom edge: path com id af-path-<edgeId> (usado pela animação e
                      testes), alças de waypoint (quadrado) e segmento (círculo), arraste com
                      pointer capture, badges de hop, label via EdgeLabelRenderer.
canvas/FlowAnimation.tsx  Pacotes: rAF imperativo (sem re-render), getPointAtLength sobre os
                      paths af-path-*, um pacote por fluxo ativo, 170px/s × speed.
canvas/geometry.ts    absPosition/absRect (cadeia de pais), deepestGroupAt, withDescendants.
export/exporter.ts    SVG standalone (mesmo roteador + glifos; dash CSS + pacote SMIL
                      animateMotion com keyPoints para pausa entre ciclos) e PNG 2× via canvas.
panels/               Toolbar (import/export/undo/apresentar), FlowsPanel (lista + editor
                      acordeão + transporte), PropertiesPanel (flutuante, seleção única/múltipla),
                      NodePalette (click = centro, drag = posição), PresentBar, Menu, toast.
icons/glyphs.tsx      Biblioteca de glifos 24×24 stroke (sqs, sns, lambda, s3, apigw…) — fonte
                      única usada na UI E no export SVG.
styles/global.css     Todos os tokens (OKLCH) e estilos. Ver DESIGN.md.
```

## Decisões e armadilhas importantes

- **Waypoints são coordenadas absolutas do canvas** (não relativas aos nós). Mover um nó NÃO move
  as dobras da aresta (comportamento draw.io). Persistem no YAML por aresta.
- **Handles**: um handle por lado com ids `l|r|t|b`, `type="source"` + `ConnectionMode.Loose`.
  `sourceHandle/targetHandle` da aresta guardam o lado (= `fromSide/toSide` no YAML).
- **Pointer events em SVG**: o React Flow restringe pointer-events na camada de arestas — alças
  customizadas precisam de `pointer-events: all` (classes `.af-wp`, `.af-seg-handle`) e
  `stopPropagation` no pointerdown para não iniciar pan/seleção.
- **Histórico durante gestos**: o primeiro change de um drag é gravado e ENTÃO o zundo é pausado
  (`temporal.pause()`); o change final (dragging/resizing false) aplica e retoma. Assim undo volta
  ao estado pré-gesto em um passo. O mesmo padrão vale para arrasto de waypoint/segmento
  (pauseHistory/resumeHistory em OrthoEdgeView). A igualdade do histórico usa uma projeção que
  ignora selected/dragging/measured (proj() em store.ts).
- **Ordem dos nós**: React Flow exige pai antes do filho no array. Qualquer mutação de parentId
  deve passar por `orderNodes`. Grupos têm `zIndex: -1` para ficarem atrás das arestas.
- **Exclusão em cascata**: onNodesChange intercepta removes, expande para descendentes, remove
  arestas conectadas e limpa `flows.edgeIds` (idem onEdgesChange).
- **Cores do usuário** (fluxos/nós/arestas) passam por `onDark()` só no render — o valor
  armazenado nunca muda. Badge de hop decide texto claro/escuro por luminância (`inkOn`).
- **fitView** não roda sozinho ao trocar de modo — apresentar chama fitView manualmente (120ms
  após colapsar painéis).
- js-yaml 5: sem `quotingType` nas DumpOptions; a chave `y` sai citada (`'y':`) — cosmético.
- **Import YAML é hostil por padrão**: yamlToDoc valida tipo/ícone/lados contra os valores
  conhecidos, exige números finitos em pos/size/waypoints, coage ids a string, deduplica e só
  aceita cores `#rrggbb` (também protege o SVG exportado contra injeção de atributo). Ao mexer no
  formato, manter esse rigor — o doc importado é autosalvo, e um doc inválido viraria crash-loop
  (o AppErrorBoundary em src/AppErrorBoundary.tsx é a última defesa, com "Restaurar exemplo").
- Gestos de aresta têm rede de segurança: listener global de pointerup/pointercancel (capture)
  encerra o arrasto e retoma o histórico mesmo com perda de captura/unmount.
- **Pointer capture dos gestos de aresta vive no PATH DE INTERAÇÃO** (interactionRef), nunca nas
  alças: as alças de segmento somem do DOM no meio do gesto (segmentos < 28px são filtrados) e o
  capture morreria com elas — foi um bug real difícil de achar. Não "simplificar" isso.
- **normalizeWaypoints** (ortho.ts) roda ao fim de cada gesto: alinha às âncoras (±6px), funde
  colineares, colapsa jogs < 10px e LIMPA os waypoints quando a forma equivale à rota automática.
  É o que mantém o comportamento draw.io saudável — mudanças na rota devem manter a idempotência
  (rotear waypoints "assados" reproduz a mesma polilinha).
- **Conexão flutuante** (`finishEdgeGesture` no store): ao fechar um gesto de aresta, dobras
  dentro/rentes aos nós são descartadas e os LADOS de entrada/saída se re-adaptam à direção de
  chegada (`sideFacing` em geometry.ts) — arrastar a linha para baixo do alvo faz a seta migrar
  para a base da caixa, como no draw.io. Tudo dentro do pause de histórico → 1 undo por gesto.
- As alças de segmento ficam ≥24px dos terminais (os círculos `edgeupdater` de reconexão do RF,
  raio 8, ficam por cima e roubariam o clique em segmentos curtos).
- **Espalhamento de âncoras** (edges/anchors.ts): N arestas no mesmo lado de um nó ganham offsets
  ordenados pela posição da outra ponta. Usado pelo canvas E pelo exporter — manter os dois juntos.
- **Modo Automático** (`ALL_AUTO`) é dirigido a eventos: nada anima sozinho; clicar num nó chama
  `firePulse(nodeId)` (lib/graph.ts → BFS pelas setas, seguro p/ ciclos, ondas por fronteira).
  FlowAnimation anima cada pulse onda a onda e publica `pulseEdges` no store SÓ nas fronteiras de
  onda (OrthoEdgeView usa para acender a aresta); ao terminar, `endPulse`. Vários pulses
  simultâneos são suportados. O highlight dos nós é imperativo (classe `.af-hot` + CSS vars no
  DOM) — sem re-render por frame. `prefers-reduced-motion` vira realce estático de 1.8s.
- **Lock** = `node.draggable: false` (persistido como `locked:` no YAML). Os componentes de nó leem
  o estado do PRÓPRIO nó no store, não o `draggable` de NodeProps (que mistura o global do modo
  apresentação). Z-order: bringToFront/sendToBack reordenam dentro da coorte via orderNodes.
- **Step mode** (`stepIndex`): navegação hop a hop (setas na apresentação); hops futuros ganham
  `.af-semi-dim`, o pacote circula só no hop atual.
- Histórico local de versões: `archflow.history.v*` (≤12 snapshots, ≥90s entre eles), restauração
  pelo menu ⋯; evento `storage` avisa sobre outra aba editando.
- **Config e condição (nível 1, nunca simulador)**: nós têm `vars {value, source}`; arestas têm
  `when {var, equals}` comparado contra o nó de ORIGEM (lib/vars.ts). O modo automático decide em
  `pulsePhasesFrom` (lib/graph.ts): fases de lookup (round-trip visual quando a var tem `source`),
  deadEnds quando o alvo está `status: down`. Arestas dormentes ganham `.af-dormant` + chip.
- **Interpolação** `{{nome}}` (lib/vars.ts) usa `variables` do diagrama — aplicada no RENDER
  (nunca muda o valor armazenado): rótulos, payloads, notas, transform e exporter.
- **Inspetor de Pacote** (panels/InspectorCard.tsx): segue `stepIndex` ou `liveHop` (publicado
  pela animação SÓ quando o hop muda). Cenários = snapshot de variables+nodeVars+down;
  `applyScenario` é um set único (1 undo).
- **CUIDADO com selectors zustand**: retornar array/objeto NOVO por snapshot (mesmo com
  useShallow, se os ITENS são objetos novos) causa "Maximum update depth". Padrão seguro:
  selecionar referências estáveis (s.nodes) e derivar com useMemo — já mordeu duas vezes.

## Testes manuais/headless

Não há suite automatizada. A validação foi feita com **puppeteer-core + Chrome headless**
(scripts na scratchpad da sessão original): screenshot do app, arrasto de segmento (waypoints
criados + persistidos após reload), fluxos ativados, criação de 2 fluxos via UI, reordenação de
hops, undo/redo, export YAML/SVG/PNG e roundtrip de import. Padrão útil: os paths das arestas têm
id `af-path-<edgeId>`; screen coords = `DOMMatrix(getComputedStyle(.react-flow__viewport).transform)`
aplicada ao ponto do path + offset do host `.react-flow`.

## Critérios de aceite da spec (status)

1. Abrir → diagrama com raias e ícones, apresentável ✅ (seed em model/seed.ts)
2. Arrastar dobra → linha mantém caminho, inclusive após export/import YAML ✅
3. Selecionar fluxo → só ele anima, na ordem dos hops, resto esmaecido (22%) ✅
4. Nada na UI menciona envio/simulação ✅ (animação é puramente visual)
