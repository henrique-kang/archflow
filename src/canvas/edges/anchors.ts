import type { AnyNode, OrthoEdge, Side, XY } from '../../model/types'
import { absRect, nodeSize } from '../geometry'

export interface AnchorShift {
  dx: number
  dy: number
}

export interface EdgeShifts {
  s: AnchorShift
  t: AnchorShift
}

const ZERO: AnchorShift = { dx: 0, dy: 0 }

/**
 * Espalha as ancoragens quando várias arestas usam o MESMO lado de um nó
 * (fan-in/fan-out): em vez de todas convergirem no centro do lado, cada uma
 * ganha um deslocamento ao longo do lado, ordenado pela posição do nó na outra
 * ponta (minimiza cruzamentos). Comportamento inspirado no draw.io.
 */
export function computeAnchorShifts(edges: OrthoEdge[], nodes: AnyNode[]): Map<string, EdgeShifts> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const centers = new Map<string, XY>()
  const center = (id: string): XY => {
    const hit = centers.get(id)
    if (hit) return hit
    const n = byId.get(id)
    if (!n) return { x: 0, y: 0 }
    const r = absRect(n, byId)
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }
    centers.set(id, c)
    return c
  }

  // agrupa pontas por (nó, lado)
  interface Entry {
    edgeId: string
    role: 's' | 't'
    otherId: string
  }
  const groups = new Map<string, Entry[]>()
  const push = (nodeId: string, side: Side, entry: Entry) => {
    const key = `${nodeId}|${side}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  }
  for (const e of edges) {
    push(e.source, (e.sourceHandle as Side) || 'r', { edgeId: e.id, role: 's', otherId: e.target })
    push(e.target, (e.targetHandle as Side) || 'l', { edgeId: e.id, role: 't', otherId: e.source })
  }

  const out = new Map<string, EdgeShifts>()
  const shiftsOf = (edgeId: string): EdgeShifts => {
    let s = out.get(edgeId)
    if (!s) {
      s = { s: { ...ZERO }, t: { ...ZERO } }
      out.set(edgeId, s)
    }
    return s
  }

  for (const [key, entries] of groups) {
    if (entries.length < 2) continue
    const [nodeId, side] = key.split('|') as [string, Side]
    const node = byId.get(nodeId)
    if (!node) continue
    const size = nodeSize(node)
    const vertical = side === 'l' || side === 'r' // espalha ao longo do eixo Y
    const sideLen = vertical ? size.h : size.w
    // ordena pela posição da outra ponta ao longo do eixo do lado
    const sorted = [...entries].sort((a, b) => {
      const ca = center(a.otherId)
      const cb = center(b.otherId)
      return vertical ? ca.y - cb.y : ca.x - cb.x
    })
    const spacing = Math.min(14, Math.max(8, (sideLen - 14) / sorted.length))
    sorted.forEach((entry, i) => {
      const off = (i - (sorted.length - 1) / 2) * spacing
      const shift = shiftsOf(entry.edgeId)
      const target = entry.role === 's' ? shift.s : shift.t
      if (vertical) target.dy = off
      else target.dx = off
    })
  }
  return out
}

// cache por referência: o cálculo é O(E log E) e cada aresta consulta por render
let lastEdges: OrthoEdge[] | null = null
let lastNodes: AnyNode[] | null = null
let lastResult: Map<string, EdgeShifts> = new Map()

export function anchorShiftsCached(edges: OrthoEdge[], nodes: AnyNode[]): Map<string, EdgeShifts> {
  if (edges !== lastEdges || nodes !== lastNodes) {
    lastResult = computeAnchorShifts(edges, nodes)
    lastEdges = edges
    lastNodes = nodes
  }
  return lastResult
}
