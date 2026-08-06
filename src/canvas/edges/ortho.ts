import type { Side, XY } from '../../model/types'

/**
 * Roteador ortogonal com waypoints manuais — o coração técnico do ArchFlow.
 *
 * Modelo: uma aresta tem uma lista ordenada de waypoints (coordenadas absolutas
 * do canvas). O caminho renderizado é a polilinha ortogonal que sai do source,
 * visita cada waypoint e entra no target. Cantos não-alinhados ganham um ponto
 * de dobra automático; ao arrastar um segmento, as dobras automáticas são
 * "assadas" em waypoints explícitos (comportamento draw.io).
 */

const EPS = 0.5
/** Comprimento do trecho reto ao sair/entrar de um nó na rota automática. */
const STUB = 20

export function sideAxis(side: Side): 'h' | 'v' {
  return side === 'l' || side === 'r' ? 'h' : 'v'
}

export function sideDir(side: Side): XY {
  switch (side) {
    case 'l':
      return { x: -1, y: 0 }
    case 'r':
      return { x: 1, y: 0 }
    case 't':
      return { x: 0, y: -1 }
    case 'b':
      return { x: 0, y: 1 }
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < EPS
const samePoint = (a: XY, b: XY) => near(a.x, b.x) && near(a.y, b.y)

/** Remove pontos duplicados e colineares consecutivos. */
export function simplify(pts: XY[]): XY[] {
  const out: XY[] = []
  for (const p of pts) {
    if (out.length && samePoint(out[out.length - 1], p)) continue
    out.push(p)
  }
  let changed = true
  while (changed) {
    changed = false
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1]
      const b = out[i]
      const c = out[i + 1]
      const colH = near(a.y, b.y) && near(b.y, c.y)
      const colV = near(a.x, b.x) && near(b.x, c.x)
      if (colH || colV) {
        out.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return out
}

export interface RouteInput {
  sx: number
  sy: number
  sSide: Side
  tx: number
  ty: number
  tSide: Side
  waypoints: XY[]
}

/** Rota automática (sem waypoints): stubs de saída/entrada + dobra no meio. */
function autoRoute(inp: RouteInput): XY[] {
  const S = { x: inp.sx, y: inp.sy }
  const T = { x: inp.tx, y: inp.ty }
  const ds = sideDir(inp.sSide)
  const dt = sideDir(inp.tSide)
  const S2 = { x: S.x + ds.x * STUB, y: S.y + ds.y * STUB }
  const T2 = { x: T.x + dt.x * STUB, y: T.y + dt.y * STUB }
  const sa = sideAxis(inp.sSide)
  const ta = sideAxis(inp.tSide)
  const mid: XY[] = []

  if (sa === 'h' && ta === 'h') {
    // O alvo está "à frente" dos dois stubs?
    const forward = (T2.x - S2.x) * ds.x > 0 && (S2.x - T2.x) * dt.x > 0
    if (near(S2.y, T2.y) && forward) {
      // reta
    } else if (forward) {
      const mx = (S2.x + T2.x) / 2
      mid.push({ x: mx, y: S2.y }, { x: mx, y: T2.y })
    } else {
      const my = (S2.y + T2.y) / 2
      mid.push({ x: S2.x, y: my }, { x: T2.x, y: my })
    }
  } else if (sa === 'v' && ta === 'v') {
    const forward = (T2.y - S2.y) * ds.y > 0 && (S2.y - T2.y) * dt.y > 0
    if (near(S2.x, T2.x) && forward) {
      // reta
    } else if (forward) {
      const my = (S2.y + T2.y) / 2
      mid.push({ x: S2.x, y: my }, { x: T2.x, y: my })
    } else {
      const mx = (S2.x + T2.x) / 2
      mid.push({ x: mx, y: S2.y }, { x: mx, y: T2.y })
    }
  } else if (sa === 'h') {
    // sai horizontal, entra vertical → um L
    mid.push({ x: T2.x, y: S2.y })
  } else {
    mid.push({ x: S2.x, y: T2.y })
  }

  return simplify([S, S2, ...mid, T2, T])
}

/** Rota com waypoints: liga S → wps → T com dobras ortogonais. */
function waypointRoute(inp: RouteInput): XY[] {
  const S = { x: inp.sx, y: inp.sy }
  const T = { x: inp.tx, y: inp.ty }
  const wps = inp.waypoints
  const pts: XY[] = [S]
  let axis = sideAxis(inp.sSide)
  const ds = sideDir(inp.sSide)

  // primeiro trecho: respeita a direção de saída quando possível
  const first = wps[0]
  {
    const cur = S
    if (near(cur.x, first.x) || near(cur.y, first.y)) {
      // alinhado — segue direto
      axis = near(cur.y, first.y) && !near(cur.x, first.x) ? 'h' : 'v'
      pts.push(first)
    } else {
      const ahead = axis === 'h' ? (first.x - cur.x) * ds.x > 0 : (first.y - cur.y) * ds.y > 0
      const hFirst = axis === 'h' ? ahead : !((first.y - cur.y) * ds.y > 0)
      if (hFirst) {
        pts.push({ x: first.x, y: cur.y }, first)
        axis = 'v'
      } else {
        pts.push({ x: cur.x, y: first.y }, first)
        axis = 'h'
      }
    }
  }

  // trechos intermediários: continua no eixo corrente e dobra uma vez
  for (let i = 1; i < wps.length; i++) {
    const cur = wps[i - 1]
    const nxt = wps[i]
    if (near(cur.x, nxt.x) && near(cur.y, nxt.y)) continue
    if (near(cur.y, nxt.y)) {
      pts.push(nxt)
      axis = 'h'
    } else if (near(cur.x, nxt.x)) {
      pts.push(nxt)
      axis = 'v'
    } else if (axis === 'h') {
      pts.push({ x: nxt.x, y: cur.y }, nxt)
      axis = 'v'
    } else {
      pts.push({ x: cur.x, y: nxt.y }, nxt)
      axis = 'h'
    }
  }

  // trecho final: chega em T pelo eixo do lado de entrada
  const last = pts[pts.length - 1]
  const ta = sideAxis(inp.tSide)
  if (near(last.x, T.x) || near(last.y, T.y)) {
    pts.push(T)
  } else if (ta === 'h') {
    pts.push({ x: last.x, y: T.y }, T)
  } else {
    pts.push({ x: T.x, y: last.y }, T)
  }

  return simplify(pts)
}

/** Lista completa de pontos (S, dobras, T) da aresta. */
export function routePoints(inp: RouteInput): XY[] {
  if (!inp.waypoints || inp.waypoints.length === 0) return autoRoute(inp)
  return waypointRoute(inp)
}

/** Path SVG com cantos arredondados. */
export function roundedPath(pts: XY[], radius = 8): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.y - a.y)
    const l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    if (r < 1) {
      d += ` L ${b.x} ${b.y}`
      continue
    }
    const p1 = { x: b.x - ((b.x - a.x) / l1) * r, y: b.y - ((b.y - a.y) / l1) * r }
    const p2 = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r }
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`
  }
  const end = pts[pts.length - 1]
  d += ` L ${end.x} ${end.y}`
  return d
}

export function polylineLength(pts: XY[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

/** Ponto a uma fração [0..1] do comprimento da polilinha. */
export function pointAlong(pts: XY[], t: number): XY {
  const total = polylineLength(pts)
  if (total === 0 || pts.length < 2) return pts[0] ?? { x: 0, y: 0 }
  let target = total * Math.min(Math.max(t, 0), 1)
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (target <= seg) {
      const k = seg === 0 ? 0 : target / seg
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
      }
    }
    target -= seg
  }
  return pts[pts.length - 1]
}

export interface Segment {
  a: XY
  b: XY
  index: number
  orientation: 'h' | 'v'
}

/** Segmentos retos da polilinha, com orientação. */
export function segments(pts: XY[]): Segment[] {
  const out: Segment[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (samePoint(a, b)) continue
    out.push({ a, b, index: i, orientation: near(a.y, b.y) ? 'h' : 'v' })
  }
  return out
}

/**
 * Arrasto de segmento (estilo draw.io): desloca o segmento `segIndex`
 * perpendicular à sua orientação e devolve a nova lista de waypoints
 * (dobras automáticas viram waypoints explícitos).
 */
export function dragSegment(pts: XY[], segIndex: number, delta: number): XY[] {
  const work = pts.map((p) => ({ ...p }))
  let i = segIndex
  // endpoints fixos (source/target) ganham uma cópia para virar dobra
  if (i === 0) {
    work.splice(1, 0, { ...work[0] })
    i = 1
  }
  if (i + 1 === work.length - 1) {
    work.splice(work.length - 1, 0, { ...work[work.length - 1] })
  }
  const a = work[i]
  const b = work[i + 1]
  // eixo dominante: robusto a waypoints levemente desalinhados vindos de arquivo
  const horizontal = Math.abs(b.y - a.y) <= Math.abs(b.x - a.x)
  if (horizontal) {
    a.y += delta
    b.y += delta
  } else {
    a.x += delta
    b.x += delta
  }
  return work.slice(1, -1)
}

/** Fração [0..1] do comprimento da polilinha mais próxima do ponto dado. */
export function nearestT(pts: XY[], p: XY): number {
  const total = polylineLength(pts)
  if (total === 0) return 0.5
  let bestT = 0.5
  let bestDist = Infinity
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > 0) {
      const k = Math.min(
        1,
        Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)),
      )
      const proj = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
      const dist = Math.hypot(proj.x - p.x, proj.y - p.y)
      if (dist < bestDist) {
        bestDist = dist
        bestT = (acc + len * k) / total
      }
    }
    acc += len
  }
  return bestT
}

/** Insere um waypoint na posição do ponto mais próximo sobre o segmento. */
export function nearestOnSegment(seg: Segment, p: XY): XY {
  if (seg.orientation === 'h') {
    const minX = Math.min(seg.a.x, seg.b.x)
    const maxX = Math.max(seg.a.x, seg.b.x)
    return { x: Math.min(Math.max(p.x, minX), maxX), y: seg.a.y }
  }
  const minY = Math.min(seg.a.y, seg.b.y)
  const maxY = Math.max(seg.a.y, seg.b.y)
  return { x: seg.a.x, y: Math.min(Math.max(p.y, minY), maxY) }
}

export function snap(v: number, grid = 8): number {
  return Math.round(v / grid) * grid
}

/** Alinha v ao candidato mais próximo dentro da tolerância (âncoras/vizinhos). */
export function alignTo(v: number, candidates: number[], tol = 6): number {
  let best = v
  let bestD = tol + 0.001
  for (const c of candidates) {
    const d = Math.abs(c - v)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/** Comprimento mínimo de segmento; jogs menores que isso são colapsados. */
const MIN_SEG = 10

/**
 * Normalização pós-gesto (comportamento draw.io):
 * 1. alinha coordenadas quase iguais às âncoras dos terminais;
 * 2. funde pontos colineares/duplicados;
 * 3. colapsa micro-segmentos (jogs < MIN_SEG) alinhando os vizinhos;
 * 4. se a forma resultante equivale à rota automática, limpa os waypoints.
 */
export function normalizeWaypoints(inp: RouteInput): XY[] {
  if (!inp.waypoints.length) return []
  // parte da polilinha renderizada (dobras automáticas viram explícitas)
  let pts = waypointRoute(inp).map((p) => ({ ...p }))
  const S = pts[0]
  const T = pts[pts.length - 1]

  // 1. alinhamento às âncoras
  for (let i = 1; i < pts.length - 1; i++) {
    pts[i].x = alignTo(pts[i].x, [S.x, T.x])
    pts[i].y = alignTo(pts[i].y, [S.y, T.y])
  }
  pts = simplify(pts)

  // 3. colapsa micro-segmentos internos, iterando até estabilizar
  for (let guard = 0; guard < 24; guard++) {
    let changed = false
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len >= MIN_SEG) continue
      const prev = pts[i - 1]
      const next = pts[i + 2]
      // o jog a→b é perpendicular aos vizinhos: alinha o lado mais curto ao mais longo
      const prevLen = Math.hypot(a.x - prev.x, a.y - prev.y)
      const nextLen = Math.hypot(next.x - b.x, next.y - b.y)
      const horizontalJog = Math.abs(b.y - a.y) < Math.abs(b.x - a.x)
      if (horizontalJog) {
        // jog horizontal entre segmentos verticais → iguala os x
        const x = prevLen >= nextLen ? a.x : b.x
        prev.x = prev === S ? prev.x : x
        a.x = x
        b.x = x
        next.x = next === T ? next.x : x
      } else {
        const y = prevLen >= nextLen ? a.y : b.y
        prev.y = prev === S ? prev.y : y
        a.y = y
        b.y = y
        next.y = next === T ? next.y : y
      }
      changed = true
    }
    pts = simplify(pts)
    if (!changed) break
  }

  const cleaned = pts.slice(1, -1)

  // 4. se equivale à rota automática, dispensa waypoints
  const auto = autoRoute({ ...inp, waypoints: [] })
  if (auto.length === pts.length) {
    let same = true
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(auto[i].x - pts[i].x) > 6 || Math.abs(auto[i].y - pts[i].y) > 6) {
        same = false
        break
      }
    }
    if (same) return []
  }
  return cleaned
}

/**
 * Índice de inserção de um waypoint criado sobre o segmento `segIndex`
 * (quantos waypoints existentes aparecem antes dele ao longo da polilinha).
 */
export function insertionIndex(pts: XY[], waypoints: XY[], segIndex: number): number {
  let count = 0
  for (let i = 1; i <= segIndex && i < pts.length - 1; i++) {
    const p = pts[i]
    if (waypoints.some((w) => near(w.x, p.x) && near(w.y, p.y))) count++
  }
  return count
}
