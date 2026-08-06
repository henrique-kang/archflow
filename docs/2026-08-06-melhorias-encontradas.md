# Melhorias encontradas testando o ArchFlow como usuário — 2026-08-06

> **Status (v2, mesma data):** TODOS os itens 1–18 abaixo foram implementados na rodada v2,
> junto com as correções de ancoragem reportadas pelo usuário (arrasto de segmento que
> "congelava" após a primeira dobra — pointer capture movido para o path de interação —,
> normalização draw-io-like pós-gesto com limpeza automática quando a forma volta à rota
> automática, dobra por duplo-clique, menu de contexto com "Limpar dobras") e os novos
> recursos pedidos: **modo Automático** (segue as setas sem configurar fluxo), **highlight
> dos nós à passagem do pacote** (estilo Syncitect), **bloquear elementos** e **trazer para
> frente / enviar para trás**. Mantido abaixo como registro histórico.

Anotações da sessão de teste completo (fluxo inteiro + criação manual de 2 fluxos novos:
**Reprocesso DLQ** — 2 nós novos, 3 arestas novas, criado 100% pela UI — e **Jornada do
Pedido** — 7 hops sobre arestas existentes, com reordenação). Nada abaixo bloqueia o uso;
está ordenado por impacto percebido.

## Roteamento e arestas

1. **Fan-in/fan-out no mesmo lado do nó.** Várias arestas de retorno que entram no mesmo lado de
   um nó convergem num único ponto de ancoragem e se sobrepõem no trecho final. O draw.io espalha
   pontos de conexão ao longo do lado. Sugestão: distribuir ancoragens automaticamente quando N
   arestas usam o mesmo handle (offset de ±12px por aresta).
2. **Colisão de rótulos em corredores densos.** Os três "consome" no corredor esquerdo ficam
   próximos/encavalados em zoom baixo. Sugestão: rótulo arrastável ao longo da aresta (posição
   persistida como fração 0–1 no YAML) — resolve também o caso de rótulo sobre badge de hop.
3. **Simplificação pós-arrasto de segmento.** Dobrar um segmento "assa" também os cantos do stub
   automático — um jog simples vira 3 waypoints. Fundir segmentos menores que ~12px após o gesto
   deixaria o caminho (e o YAML) mais limpo.
4. **Realce da raia alvo durante o arraste.** Ao arrastar um nó para dentro de um grupo, nada
   indica que ele será adotado — no teste, soltei um worker 20px abaixo da raia e ele ficou órfão
   sem aviso. Acender a borda do grupo candidato durante o drag resolveria.

## Fluxos e animação

5. **Duração normalizada por fluxo.** Pacote a 170px/s: o fluxo Retorno (9 hops) leva ~39s por
   ciclo em 1×. Alternativa: duração-alvo por ciclo (~10s) escalando a velocidade pelo
   comprimento total, mantendo o slider como multiplicador.
6. **Cores de fluxo novas ignoram similaridade.** O primeiro fluxo criado ganhou verde `#4caf50`
   com o fluxo Pedido já verde `#2e7d32`. Escolher a cor livre mais distante em hue das já usadas.
7. **Reordenar hops por arrasto.** Botões ↑/↓ funcionam, mas drag-and-drop na lista do editor
   seria bem mais rápido para fluxos longos.
8. **Modo passo a passo na apresentação.** Além do ciclo contínuo, avançar hop a hop com
   setas/clique (estilo IcePanel) daria controle narrativo em reunião. Teclas 1–9 para trocar de
   fluxo direto na apresentação também.
9. **Multi-seleção de arestas → "adicionar ao fluxo"** em lote (hoje é um clique por hop, na ordem
   — bom para precisão, lento para fluxos longos).

## Editor

10. **Clique na paleta solta o nó no centro da viewport**, que pode cair sobre nós existentes;
    procurar o espaço livre mais próximo (ou sempre incentivar o arrastar-e-soltar, que já
    funciona com posição exata).
11. **Edição inline do rótulo** (duplo-clique no nó/aresta) além do painel de propriedades.
12. **Cor personalizada usa o color-picker nativo** — funcional, mas destoa do tema dark; um
    popover próprio com a paleta + hex manteria a linguagem.

## Persistência e export

13. **YAML: chave `y` sai citada** (`'y': 120`) porque `y` é booleano no YAML 1.1 — válido, mas
    suja o diff. Emitir `pos: {x: 40, y: 120}` em flow-style ou usar chaves `px/py`.
14. **PNG não embute as fontes** — o SVG rasterizado cai para Segoe UI (métricas próximas, mas
    não pixel-perfect com o app). Opção "embutir fontes (data-URI)" no export resolveria.
15. **Export SVG poderia oferecer "todos os fluxos animados"** mesmo sem fluxo ativo no app
    (hoje é WYSIWYG da visão atual — sem fluxo ativo sai estático).

## Menores

16. Onboarding de primeira execução (tour de 3 passos: selecionar aresta → dobrar linha → animar fluxo).
17. Atalho para "Apresentar" (ex.: `F5`/`Ctrl+.`) e para "enquadrar" (`Shift+1` estilo Figma).
18. Autosave é um slot único de localStorage — um histórico de N versões (ou export automático
    periódico) protegeria contra perda acidental. Duas abas abertas ainda se sobrescrevem em
    silêncio (ouvir o evento `storage` e avisar seria o próximo passo).

## Corrigido durante a própria sessão de teste

- Alças de waypoint/segmento não recebiam eventos (herança de `pointer-events` do SVG do React Flow).
- Canvas sem altura na primeira renderização (`.af-canvas-wrap`).
- Loop de selector no painel de propriedades (`getSnapshot should be cached`).
- Dois editores de fluxo abertos ao mesmo tempo confundiam a edição → agora acordeão (um por vez)
  e o editor do fluxo recém-criado abre sozinho.
- Entrar em apresentação não re-enquadrava o diagrama → agora dá `fitView` ao entrar.
- Esmaecimento ajustado de 15% para 22% (spec pedia ~25%).

## Corrigido após code review (agente revisor)

- **Import YAML endurecido**: tipo/ícone/lados validados contra os valores conhecidos, posições e
  tamanhos exigem números finitos, waypoints inválidos descartados, ids coagidos a string e
  deduplicados, cores só `#rrggbb` (elimina também injeção de markup no SVG exportado). Testado
  com 3 arquivos hostis — sem crash, sem crash-loop de autosave.
- **Gesto de aresta interrompido** (alt-tab, cancelamento do browser, elemento remontado) deixava
  o histórico pausado para sempre → listener global de `pointerup`/`pointercancel` encerra o
  gesto de onde quer que o ponteiro solte, inclusive no unmount.
- **Reparent após arraste criava entrada extra de undo** → agora o gesto inteiro (mover + trocar
  de grupo) é um único Ctrl+Z.
- **Reconectar aresta preservava waypoints absolutos** do destino antigo (rota absurda) → dobras
  zeradas ao reconectar.
- **ErrorBoundary** com recuperação explícita ("Recarregar" / "Restaurar exemplo") — antes,
  qualquer erro de render virava tela branca permanente por causa do autosave.
- Autosave ganha flush em `pagehide`/`visibilitychange` (fechar a aba dentro da janela de 600ms
  não perde mais a última edição).
- Cache de paths da animação é podado quando arestas são removidas (leak de `SVGPathElement`).
- `prefers-reduced-motion` agora é reativo (listener), não só lido no boot.
- Arrasto de segmento classifica orientação pelo eixo dominante — robusto a waypoints levemente
  desalinhados vindos de arquivo.
