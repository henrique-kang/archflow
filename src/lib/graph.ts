import type { AnyNode, ArchNodeData, OrthoEdge } from '../model/types'
import { edgeActive, isDown } from './vars'

/** Fase de um evento: ou consultas de config (round-trip visual), ou arestas. */
export interface PulsePhase {
  /** arestas percorridas nesta onda */
  edges: string[]
  /** arestas cujo destino está fora do ar (pacote morre com ✕ na chegada) */
  deadEnds: string[]
  /** round-trips de consulta de config (nó → origem da var → nó) */
  lookups: { from: string; to: string }[]
}

/**
 * Fases de um "evento" disparado num nó: BFS a partir da origem seguindo a
 * direção das setas, respeitando as condições (`when` × vars declaradas do nó
 * de origem) e o estado dos nós (down não propaga). Quando um nó decide por
 * uma var com `source`, uma fase de consulta é inserida antes da onda dele.
 * Cada aresta participa no máximo uma vez por evento (seguro para ciclos).
 */
export function pulsePhasesFrom(originId: string, edges: OrthoEdge[], nodes: AnyNode[]): PulsePhase[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const origin = byId.get(originId)
  if (!origin || isDown(origin)) return []

  const outs = new Map<string, OrthoEdge[]>()
  for (const e of edges) {
    if (!outs.has(e.source)) outs.set(e.source, [])
    outs.get(e.source)!.push(e)
  }

  const used = new Set<string>()
  const looked = new Set<string>()
  const phases: PulsePhase[] = []
  let frontier = [originId]

  for (let guard = 0; frontier.length && guard < 64; guard++) {
    const lookups: { from: string; to: string }[] = []
    const waveEdges: string[] = []
    const deadEnds: string[] = []
    const nextFrontier = new Set<string>()

    for (const nodeId of frontier) {
      const node = byId.get(nodeId)
      const all = outs.get(nodeId) ?? []
      const data = node?.data as ArchNodeData | undefined
      // consulta de config: alguma aresta de saída decide por var com source?
      // (source fora do ar → sem consulta, e as arestas dependentes ficam dormentes)
      const deadSources = new Set<string>()
      if (!looked.has(nodeId)) {
        const sources = new Set<string>()
        for (const e of all) {
          const v = e.data?.when?.var
          const src = v ? data?.vars?.[v]?.source : undefined
          if (!src || !byId.has(src)) continue
          if (isDown(byId.get(src))) deadSources.add(src)
          else sources.add(src)
        }
        for (const src of sources) lookups.push({ from: nodeId, to: src })
        if (sources.size) looked.add(nodeId)
      } else {
        for (const e of all) {
          const v = e.data?.when?.var
          const src = v ? data?.vars?.[v]?.source : undefined
          if (src && isDown(byId.get(src))) deadSources.add(src)
        }
      }
      for (const e of all) {
        if (used.has(e.id)) continue
        if (!edgeActive(e, node)) continue
        // a config vem de um nó fora do ar → não dá para decidir → não segue
        const whenVar = e.data?.when?.var
        const whenSrc = whenVar ? data?.vars?.[whenVar]?.source : undefined
        if (whenSrc && deadSources.has(whenSrc)) continue
        used.add(e.id)
        waveEdges.push(e.id)
        const target = byId.get(e.target)
        if (isDown(target)) deadEnds.push(e.id)
        else nextFrontier.add(e.target)
      }
    }

    if (lookups.length) phases.push({ edges: [], deadEnds: [], lookups })
    if (waveEdges.length) phases.push({ edges: waveEdges, deadEnds, lookups: [] })
    if (!waveEdges.length && !lookups.length) break
    frontier = [...nextFrontier]
  }
  return phases
}
