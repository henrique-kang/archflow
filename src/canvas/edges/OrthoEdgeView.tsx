import { EdgeLabelRenderer, useReactFlow, type EdgeProps, Position } from '@xyflow/react'
import { memo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { OrthoEdge, Side, XY } from '../../model/types'
import { AUTO_EDGE_COLOR } from '../../model/types'
import { onDark, withAlpha } from '../../lib/utils'
import { edgeActive, interpolate, whenLabel } from '../../lib/vars'
import { ALL_AUTO, ALL_FLOWS, pauseHistory, resumeHistory, useStore } from '../../store/store'
import { anchorShiftsCached } from './anchors'
import { markGestureEnd } from './gestureState'
import {
  alignTo,
  dragSegment,
  insertionIndex,
  nearestOnSegment,
  nearestT,
  pointAlong,
  routePoints,
  roundedPath,
  segments,
  snap,
  type RouteInput,
  type Segment,
} from './ortho'

const AUTO_COLOR = AUTO_EDGE_COLOR

function posToSide(p?: Position): Side {
  switch (p) {
    case Position.Left:
      return 'l'
    case Position.Top:
      return 't'
    case Position.Bottom:
      return 'b'
    default:
      return 'r'
  }
}

/** Luminância aproximada p/ decidir cor do texto sobre o badge. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
  return lum > 150 ? '#101318' : '#fff'
}

interface DragState {
  kind: 'wp' | 'seg' | 'label'
  index: number
  startPts: XY[]
  startFlow: XY
  orientation?: 'h' | 'v'
  moved: boolean
}

function OrthoEdgeViewInner(props: EdgeProps<OrthoEdge>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
    label,
  } = props

  const { screenToFlowPosition } = useReactFlow()
  const dragRef = useRef<DragState | null>(null)
  /** o capture vive no path de interação (estável): as alças podem sumir do DOM durante o gesto */
  const interactionRef = useRef<SVGPathElement | null>(null)

  const flowState = useStore(
    useShallow((s) => {
      const containing = s.flows.filter((f) => f.edgeIds.includes(id))
      let animColor: string | null = null
      let inActive = false
      let hopIndices: number[] = []
      if (s.activeFlowId === ALL_AUTO) {
        // modo automático interativo: só anima enquanto um evento percorre a aresta
        inActive = true
        if (s.pulseEdges.has(id)) animColor = (data?.color as string) || AUTO_COLOR
      } else if (s.activeFlowId === ALL_FLOWS) {
        const f = containing[0]
        if (f) {
          animColor = f.color
          inActive = true
        }
      } else if (s.activeFlowId) {
        const f = containing.find((f) => f.id === s.activeFlowId)
        if (f) {
          animColor = f.color
          inActive = true
          hopIndices = f.edgeIds.map((eid, i) => (eid === id ? i : -1)).filter((i) => i >= 0)
        }
      }
      const badgeFlow =
        (s.pickingFlowId && s.flows.find((f) => f.id === s.pickingFlowId)) ||
        (s.activeFlowId && s.activeFlowId !== ALL_FLOWS && s.activeFlowId !== ALL_AUTO
          ? s.flows.find((f) => f.id === s.activeFlowId)
          : null) ||
        null
      const hops = badgeFlow ? badgeFlow.edgeIds.map((eid, i) => (eid === id ? i + 1 : -1)).filter((n) => n > 0) : []
      // modo passo a passo: posição deste hop em relação ao passo atual
      let stepState: 'past' | 'current' | 'future' | null = null
      const step = s.stepIndex
      if (step !== null && hopIndices.length) {
        if (hopIndices.some((i) => i === step)) stepState = 'current'
        else if (hopIndices.some((i) => i < step)) stepState = 'past'
        else stepState = 'future'
      }
      // condição × vars do nó de origem (aresta dormente = condição não vale)
      const edge = s.edges.find((e) => e.id === id)
      const srcNode = edge ? s.nodes.find((n) => n.id === edge.source) : undefined
      const dormant = edge ? !edgeActive(edge, srcNode) : false
      return {
        dimmed: s.activeFlowId ? !inActive : false,
        animColor,
        badgeColor: badgeFlow?.color ?? null,
        hops: hops.join('·'),
        playing: s.playing,
        speed: s.speed,
        stepState,
        dormant,
        whenTag: edge ? whenLabel(edge) : null,
        labelText: label != null ? interpolate(String(label), s.variables) : null,
      }
    }),
  )

  // espalhamento de ancoragens quando várias arestas usam o mesmo lado do nó
  const shifts = useStore(
    useShallow((s) => {
      const m = anchorShiftsCached(s.edges, s.nodes).get(id)
      return { sdx: m?.s.dx ?? 0, sdy: m?.s.dy ?? 0, tdx: m?.t.dx ?? 0, tdy: m?.t.dy ?? 0 }
    }),
  )

  const waypoints = data?.waypoints ?? []
  const routeInput: RouteInput = {
    sx: sourceX + shifts.sdx,
    sy: sourceY + shifts.sdy,
    sSide: posToSide(sourcePosition),
    tx: targetX + shifts.tdx,
    ty: targetY + shifts.tdy,
    tSide: posToSide(targetPosition),
    waypoints,
  }
  const pts = routePoints(routeInput)
  const d = roundedPath(pts)
  const segs = segments(pts)

  const flowColor = flowState.animColor ? onDark(flowState.animColor) : null
  const customColor = data?.color ? onDark(data.color) : null
  const strokeCss = flowColor ?? customColor ?? (selected ? 'var(--accent)' : undefined)
  const running =
    !!flowColor && !flowState.dimmed && (flowState.stepState === null || flowState.stepState === 'current')
  const semiDim = flowState.stepState === 'future'
  const markerId = `af-arrow-${id}`

  const setWaypoints = useStore((s) => s.setWaypoints)
  const updateEdge = useStore((s) => s.updateEdge)

  // ---------- gestos de arraste ----------

  const beginDrag = (e: React.PointerEvent, state: Omit<DragState, 'startFlow' | 'moved'>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const captureHost = state.kind === 'label' ? (e.target as Element) : interactionRef.current
    try {
      ;(captureHost ?? (e.target as Element)).setPointerCapture(e.pointerId)
    } catch {
      // capture é best-effort; o listener global de pointerup fecha o gesto
    }
    dragRef.current = {
      ...state,
      startFlow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current
    if (!st) return
    e.stopPropagation()
    const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if (st.kind === 'label') {
      const first = !st.moved
      st.moved = true
      const t = nearestT(pts, cur)
      updateEdge(id, { labelT: Math.min(0.95, Math.max(0.05, t)) })
      if (first) pauseHistory()
      return
    }
    let next: XY[] | null = null
    // snap à grade + alinhamento com as âncoras dos terminais (estilo draw.io)
    const ax = [routeInput.sx, routeInput.tx]
    const ay = [routeInput.sy, routeInput.ty]
    if (st.kind === 'wp') {
      const x = alignTo(snap(cur.x), ax)
      const y = alignTo(snap(cur.y), ay)
      next = waypoints.map((p, i) => (i === st.index ? { x, y } : p))
    } else {
      const seg = st.startPts[st.index]
      const raw =
        st.orientation === 'h' ? seg.y + (cur.y - st.startFlow.y) : seg.x + (cur.x - st.startFlow.x)
      const snapped =
        st.orientation === 'h' ? alignTo(snap(raw), ay) : alignTo(snap(raw), ax)
      const delta = snapped - (st.orientation === 'h' ? seg.y : seg.x)
      next = dragSegment(st.startPts, st.index, delta)
    }
    if (next) {
      const first = !st.moved
      st.moved = true
      setWaypoints(id, next)
      if (first) pauseHistory()
    }
  }

  /** Encerra o gesto (up/cancel) — idempotente. */
  const finishDrag = () => {
    const st = dragRef.current
    dragRef.current = null
    if (!st || !st.moved) return
    markGestureEnd() // suprime o clique sintetizado logo após o arrasto
    if (st.kind === 'label') {
      resumeHistory()
      return
    }
    // fechamento draw.io: lado de conexão se adapta à direção de chegada,
    // dobras dentro dos nós somem e a forma normaliza (limpa se ≈ automática)
    useStore.getState().finishEdgeGesture(id)
    resumeHistory()
  }
  const finishRef = useRef(finishDrag)
  finishRef.current = finishDrag

  // rede de segurança: encerra o gesto de onde quer que o ponteiro solte
  useEffect(() => {
    const end = () => finishRef.current()
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    return () => {
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      finishRef.current()
    }
  }, [])

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) e.stopPropagation()
    finishDrag()
  }

  const onWaypointDoubleClick = (index: number) => {
    setWaypoints(
      id,
      waypoints.filter((_, i) => i !== index),
    )
  }

  const nearestSegmentTo = (p: XY): Segment | null => {
    let best: Segment | null = null
    let bestDist = Infinity
    for (const seg of segs) {
      const on = nearestOnSegment(seg, p)
      const dist = Math.hypot(on.x - p.x, on.y - p.y)
      if (dist < bestDist) {
        bestDist = dist
        best = seg
      }
    }
    return best
  }

  /** Arraste no corpo da linha (selecionada): move o segmento mais próximo. */
  const onPathPointerDown = (e: React.PointerEvent) => {
    if (!selected || e.button !== 0) return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const best = nearestSegmentTo(p)
    if (best) {
      beginDrag(e, { kind: 'seg', index: best.index, startPts: pts, orientation: best.orientation })
    }
  }

  /**
   * O rótulo fica sobre a linha e pode cobrir uma alça. Se houver alça sob o
   * cursor, ela vence: arrastar ali dobra a linha (o rótulo só move quando o
   * gesto começa numa parte livre dele).
   */
  const onLabelPointerDown = (e: React.PointerEvent) => {
    if (!selected || e.button !== 0) return
    const under = document.elementsFromPoint(e.clientX, e.clientY)
    const hitsHandle = (cls: string) => under.some((el) => el.classList?.contains(cls))
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if (hitsHandle('af-wp')) {
      let idx = 0
      let bestD = Infinity
      waypoints.forEach((w, i) => {
        const dist = Math.hypot(w.x - p.x, w.y - p.y)
        if (dist < bestD) {
          bestD = dist
          idx = i
        }
      })
      beginDrag(e, { kind: 'wp', index: idx, startPts: pts })
      return
    }
    if (hitsHandle('af-seg-handle')) {
      const best = nearestSegmentTo(p)
      if (best) {
        beginDrag(e, { kind: 'seg', index: best.index, startPts: pts, orientation: best.orientation })
        return
      }
    }
    beginDrag(e, { kind: 'label', index: 0, startPts: pts })
  }

  /** Duplo-clique no corpo da linha adiciona uma dobra ali (draw.io). */
  const onPathDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const seg = nearestSegmentTo(p)
    if (!seg) return
    const point = nearestOnSegment(seg, p)
    const idx = insertionIndex(pts, waypoints, seg.index)
    const next = [...waypoints]
    next.splice(idx, 0, { x: snap(point.x, 1), y: snap(point.y, 1) })
    setWaypoints(id, next)
  }

  // ---------- posições derivadas ----------

  const labelT = data?.labelT ?? 0.5
  const labelPos = pointAlong(pts, labelT)
  const badgePos = pointAlong(pts, labelT > 0.2 ? labelT - 0.15 : labelT + 0.15)

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 1 1.5 L 8.5 5 L 1 8.5 Z" style={{ fill: strokeCss ?? 'var(--edge)' }} />
        </marker>
      </defs>

      {/* camada de interação (clique/arraste/duplo-clique no corpo da linha) */}
      <path
        ref={interactionRef}
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        className="react-flow__edge-interaction"
        style={selected ? { cursor: 'move' } : undefined}
        onPointerDown={onPathPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onPathDoubleClick}
      />

      <path
        id={`af-path-${id}`}
        d={d}
        onPointerDown={onPathPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onPathDoubleClick}
        className={[
          'af-edge-path',
          flowColor ? 'is-flow is-glow' : '',
          running ? 'is-running' : '',
          running && !flowState.playing && flowState.stepState === null ? 'is-paused' : '',
          flowState.dimmed ? 'af-dim-edge' : '',
          semiDim ? 'af-semi-dim' : '',
          flowState.dormant ? 'af-dormant' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        markerEnd={`url(#${markerId})`}
        style={
          {
            stroke: strokeCss,
            strokeDasharray: !running && data?.dashed ? '7 5' : undefined,
            '--dash-dur': `${0.55 / flowState.speed}s`,
            '--flow-glow': flowColor ? withAlpha(flowState.animColor!, 0.55) : undefined,
          } as React.CSSProperties
        }
      />

      {/* alças de edição */}
      {selected && (
        <g>
          {segs
            .filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) >= 28)
            .map((s) => {
              const segLen = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
              const ux = (s.b.x - s.a.x) / segLen
              const uy = (s.b.y - s.a.y) / segLen
              // afasta a alça dos terminais: os círculos de reconexão do RF
              // ficam por cima e roubariam o clique em segmentos curtos
              const S0 = pts[0]
              const T0 = pts[pts.length - 1]
              let t = segLen / 2
              if (Math.abs(s.a.x - S0.x) < 0.5 && Math.abs(s.a.y - S0.y) < 0.5)
                t = Math.max(t, Math.min(segLen - 8, 24))
              if (Math.abs(s.b.x - T0.x) < 0.5 && Math.abs(s.b.y - T0.y) < 0.5)
                t = Math.min(t, Math.max(8, segLen - 24))
              const mx = s.a.x + ux * t
              const my = s.a.y + uy * t
              return (
                <circle
                  key={`seg-${s.index}`}
                  cx={mx}
                  cy={my}
                  r={4.5}
                  className={`af-seg-handle nodrag nopan ${s.orientation === 'h' ? 'is-h' : 'is-v'}`}
                  onPointerDown={(e) =>
                    beginDrag(e, { kind: 'seg', index: s.index, startPts: pts, orientation: s.orientation })
                  }
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
              )
            })}
          {waypoints.map((p, i) => (
            <rect
              key={`wp-${i}`}
              x={p.x - 4}
              y={p.y - 4}
              width={8}
              height={8}
              rx={1.5}
              className="af-wp nodrag nopan"
              onPointerDown={(e) => beginDrag(e, { kind: 'wp', index: i, startPts: pts })}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onWaypointDoubleClick(i)
              }}
            />
          ))}
        </g>
      )}

      <EdgeLabelRenderer>
        {label ? (
          <div
            className={[
              'af-edge-label',
              flowColor ? 'is-flow' : '',
              flowState.dimmed ? 'af-dim' : '',
              selected ? 'is-draggable nodrag nopan' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              {
                transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
                '--flow-color': flowColor ?? undefined,
                // acima do SVG da aresta selecionada (o RF eleva p/ z-index 1000)
                ...(selected ? { pointerEvents: 'all', zIndex: 1001 } : {}),
              } as React.CSSProperties
            }
            title={selected ? 'Arraste para reposicionar o rótulo ao longo da linha' : undefined}
            onPointerDown={onLabelPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {flowState.labelText ?? String(label)}
          </div>
        ) : null}
        {flowState.whenTag ? (
          <div
            className={`af-when-chip${flowState.dormant ? ' is-off' : ''}${flowState.dimmed ? ' af-dim' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${pointAlong(pts, 0.16).x}px, ${pointAlong(pts, 0.16).y}px)`,
            }}
            title={
              flowState.dormant
                ? 'Condição não satisfeita — a aresta está dormente'
                : 'Condição satisfeita — o evento segue por aqui'
            }
          >
            {flowState.whenTag}
          </div>
        ) : null}
        {flowState.hops && flowState.badgeColor ? (
          <div
            className="af-hop-badge"
            style={{
              transform: `translate(-50%, -50%) translate(${badgePos.x}px, ${badgePos.y}px)`,
              background: onDark(flowState.badgeColor),
              color: inkOn(onDark(flowState.badgeColor)),
            }}
          >
            {flowState.hops}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}

export const OrthoEdgeView = memo(OrthoEdgeViewInner)
