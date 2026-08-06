import type { AnyNode, Side, XY } from '../model/types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function nodeSize(n: AnyNode): { w: number; h: number } {
  return {
    w: n.width ?? n.measured?.width ?? (n.type === 'group' ? 320 : 170),
    h: n.height ?? n.measured?.height ?? (n.type === 'group' ? 220 : 48),
  }
}

/** Posição absoluta (soma da cadeia de pais). */
export function absPosition(n: AnyNode, byId: Map<string, AnyNode>): XY {
  let x = n.position.x
  let y = n.position.y
  let pid = n.parentId
  let guard = 0
  while (pid && guard++ < 32) {
    const p = byId.get(pid)
    if (!p) break
    x += p.position.x
    y += p.position.y
    pid = p.parentId
  }
  return { x, y }
}

export function absRect(n: AnyNode, byId: Map<string, AnyNode>): Rect {
  const p = absPosition(n, byId)
  const s = nodeSize(n)
  return { x: p.x, y: p.y, w: s.w, h: s.h }
}

export function rectContains(r: Rect, p: XY): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function inflate(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 }
}

/** Ponto médio de um lado do retângulo (ancoragem da aresta). */
export function sideMid(r: Rect, side: Side): XY {
  switch (side) {
    case 'l':
      return { x: r.x, y: r.y + r.h / 2 }
    case 'r':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
    case 't':
      return { x: r.x + r.w / 2, y: r.y }
    case 'b':
      return { x: r.x + r.w / 2, y: r.y + r.h }
  }
}

/**
 * Lado do retângulo que "encara" o ponto dado (conexão flutuante estilo
 * draw.io): eixo dominante da distância normalizada pelas meias-dimensões.
 */
export function sideFacing(r: Rect, p: XY): Side {
  const nx = (p.x - (r.x + r.w / 2)) / Math.max(1, r.w / 2)
  const ny = (p.y - (r.y + r.h / 2)) / Math.max(1, r.h / 2)
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'r' : 'l'
  return ny >= 0 ? 'b' : 't'
}

export function groupDepth(n: AnyNode, byId: Map<string, AnyNode>): number {
  let d = 0
  let pid = n.parentId
  let guard = 0
  while (pid && guard++ < 32) {
    d++
    pid = byId.get(pid)?.parentId
  }
  return d
}

/** ids do nó + todos os descendentes. */
export function withDescendants(id: string, nodes: AnyNode[]): Set<string> {
  const set = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (n.parentId && set.has(n.parentId) && !set.has(n.id)) {
        set.add(n.id)
        grew = true
      }
    }
  }
  return set
}

/** Grupo mais profundo que contém o ponto, excluindo ids proibidos. */
export function deepestGroupAt(
  point: XY,
  nodes: AnyNode[],
  exclude: Set<string>,
): AnyNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let best: AnyNode | null = null
  let bestDepth = -1
  for (const n of nodes) {
    if (n.type !== 'group' || exclude.has(n.id)) continue
    if (!rectContains(absRect(n, byId), point)) continue
    const d = groupDepth(n, byId)
    if (d > bestDepth) {
      bestDepth = d
      best = n
    }
  }
  return best
}
