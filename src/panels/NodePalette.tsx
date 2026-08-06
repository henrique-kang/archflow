import { useReactFlow } from '@xyflow/react'
import { absRect } from '../canvas/geometry'
import { Glyph } from '../icons/glyphs'
import { IcGroup } from '../icons/ui'
import { ARCH_TYPES, TYPE_COLORS } from '../model/types'
import { useStore } from '../store/store'

/** Paleta flutuante: clique adiciona em espaço livre; arrastar solta na posição. */
export function NodePalette() {
  const { screenToFlowPosition } = useReactFlow()

  /** Centro da viewport, deslocado em espiral até achar espaço sem sobrepor nós. */
  const freePos = () => {
    const el = document.querySelector('.af-canvas-wrap')
    const r = el?.getBoundingClientRect()
    const center = screenToFlowPosition({
      x: (r?.left ?? 0) + (r?.width ?? window.innerWidth) / 2,
      y: (r?.top ?? 0) + (r?.height ?? window.innerHeight) / 2,
    })
    const nodes = useStore.getState().nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const rects = nodes.filter((n) => n.type === 'arch').map((n) => absRect(n, byId))
    const W = 180
    const H = 52
    const overlaps = (p: { x: number; y: number }) =>
      rects.some(
        (rc) => p.x - W / 2 < rc.x + rc.w && p.x + W / 2 > rc.x && p.y - H / 2 < rc.y + rc.h && p.y + H / 2 > rc.y,
      )
    if (!overlaps(center)) return center
    for (let ring = 1; ring <= 6; ring++) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2
        const cand = { x: center.x + Math.cos(ang) * ring * 56, y: center.y + Math.sin(ang) * ring * 56 }
        if (!overlaps(cand)) return cand
      }
    }
    return center
  }

  return (
    <div className="af-palette" role="toolbar" aria-label="Adicionar componentes">
      {ARCH_TYPES.map((t) => (
        <button
          key={t.id}
          className="af-btn"
          style={{ color: TYPE_COLORS[t.id] }}
          title={`${t.label} — clique ou arraste para o canvas`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/archflow', t.id)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          onClick={() => {
            const p = freePos()
            useStore.getState().addArchNode(t.id, { x: p.x - 85, y: p.y - 24 })
          }}
        >
          <Glyph icon={t.defaultIcon} size={17} />
        </button>
      ))}
      <hr />
      <button
        className="af-btn"
        title="Grupo (raia) — clique ou arraste para o canvas"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/archflow', 'group')
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => {
          const p = freePos()
          useStore.getState().addGroup({ x: p.x - 160, y: p.y - 110 })
        }}
      >
        <IcGroup size={17} />
      </button>
    </div>
  )
}
