import type { OrthoEdge } from '../model/types'

/**
 * Ondas de um "evento" disparado num nó: BFS a partir da origem seguindo a
 * direção das setas. Onda 0 = arestas de saída da origem; onda k+1 = saídas
 * dos nós alcançados na onda k. Cada aresta participa no máximo uma vez por
 * evento (seguro para ciclos).
 */
export function pulseWavesFrom(originId: string, edges: OrthoEdge[]): string[][] {
  const outs = new Map<string, OrthoEdge[]>()
  for (const e of edges) {
    if (!outs.has(e.source)) outs.set(e.source, [])
    outs.get(e.source)!.push(e)
  }
  const used = new Set<string>()
  const waves: string[][] = []
  let frontier = [originId]
  for (let guard = 0; frontier.length && guard < 64; guard++) {
    const wave: string[] = []
    const nextFrontier = new Set<string>()
    for (const nodeId of frontier) {
      for (const e of outs.get(nodeId) ?? []) {
        if (used.has(e.id)) continue
        used.add(e.id)
        wave.push(e.id)
        nextFrontier.add(e.target)
      }
    }
    if (!wave.length) break
    waves.push(wave)
    frontier = [...nextFrontier]
  }
  return waves
}
