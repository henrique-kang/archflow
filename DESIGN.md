# Design — ArchFlow

Sistema visual do ArchFlow. Registro: **product** (a UI serve à tarefa; o diagrama é o palco).

## Tema

Dark-only, "mission-control noturno": sala de reunião com luz baixa, diagrama projetado no telão.
Neutros com **chroma 0** (sem tint); toda a cor vive nos nós, grupos e fluxos.

## Cores

Tokens em OKLCH, definidos em `src/styles/global.css`:

| Token | Valor | Uso |
|---|---|---|
| `--bg-canvas` | `oklch(0.115 0 0)` | fundo do canvas |
| `--bg-panel` | `oklch(0.165 0 0)` | painéis laterais/topbar |
| `--bg-raised` | `oklch(0.21 0 0)` | menus, superfícies elevadas |
| `--bg-input` | `oklch(0.135 0 0)` | campos |
| `--border` / `--border-soft` | `oklch(0.29 / 0.235 0 0)` | bordas |
| `--ink` | `oklch(0.93 0 0)` | texto primário |
| `--ink-muted` | `oklch(0.74 0 0)` | texto secundário (≥4.5:1 sobre painéis) |
| `--ink-faint` | `oklch(0.58 0 0)` | dicas/valores, só texto grande ou não-essencial |
| `--accent` | `oklch(0.75 0.08 230)` | seleção, foco, botão primário (azul-cobalto calmo) |
| `--danger` | `oklch(0.68 0.15 25)` | ações destrutivas |
| `--edge` | `oklch(0.5 0 0)` | arestas neutras |

**Cores semânticas por tipo de nó** (`TYPE_COLORS` em `src/model/types.ts`), dessaturadas para dark,
inspiradas nas categorias AWS: service azul `#6ea8dc`, queue rosa `#d873a8` (SQS), gateway roxo
`#a78bdf`, client ciano `#5fb8c9`, storage verde `#7fb069`, function laranja `#e0985a` (Lambda),
external/generic cinza-azulado.

**Cores de fluxo** são dados do usuário (YAML). O render passa toda cor de usuário por
`onDark()` (`src/lib/utils.ts`), que eleva a luminância mínima para leitura sobre o fundo escuro
sem alterar o valor armazenado.

## Tipografia

- UI: **Inter Variable** (via `@fontsource-variable/inter`), 13px base, títulos 640, rótulos de nó 12.5px/550.
- Identificadores técnicos (rótulos com `_`, labels de aresta): **JetBrains Mono** 10.5px — heurística `isMonoLabel` em `ArchNodeView.tsx`.
- Escala apertada (1.125): produto denso, sem headings fluid/clamp.

## Componentes

- **Nó**: card `oklch(0.185)` r10, borda 1px na cor do tipo @42%, chip de ícone 30px @14% da cor, glifo stroke 1.75 da biblioteca `src/icons/glyphs.tsx` (24×24, terminações redondas). Selecionado: anel `--accent`.
- **Grupo/raia**: retângulo r12, fill cor@5.5%, borda cor@34%, título 11.5/640 com dot na cor. Redimensionável (NodeResizer), aninhável.
- **Aresta**: ortogonal, cantos arredondados r8, seta `context` na cor do stroke. Tracejada = assíncrono (via fila). Selecionada: alças — quadrados = waypoints (arrastar move, duplo-clique remove), círculos = pega de segmento (arrastar dobra).
- **Fluxo ativo**: stroke 2.2 na cor do fluxo + glow (`drop-shadow`), dash animado (`af-dash-run`), pacote de 12px com glow percorrendo o caminho hop a hop, badges numerados; resto a 22% de opacidade.
- Botões: ghost por padrão, `is-primary` accent (texto escuro), `is-outline`, `is-danger`. Foco: `outline` accent visível.

## Motion

- Transições de estado 130–220ms, `--ease-out` (`cubic-bezier(0.22,1,0.36,1)`). Sem entrance orquestrado.
- A única animação contínua é a dos fluxos (é o produto): dash 0.55s/speed + pacote a 170px/s × speed (0.5–4×).
- `prefers-reduced-motion`: dash vira traço estático; pacotes não renderizam (caminho fica só realçado + badges).

## Z-scale

`--z-canvas-overlay: 5` (paleta, props, guias) → `--z-panel: 10` → `--z-dropdown: 30` → `--z-presentbar: 40` → `--z-toast: 60`.

## Vozes proibidas aqui

Glassmorphism decorativo, side-stripes, gradient text, cards idênticos em grid, hero-metrics.
Backdrop-blur só na barra de apresentação (flutuante sobre canvas vivo — propósito real).
