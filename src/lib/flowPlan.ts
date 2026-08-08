import type { AnyNode, FlowDef, OrthoEdge } from '../model/types'
import { edgeActive } from './vars'

export type SkipReason = 'dormant' | 'unreachable' | 'missing'

/**
 * Plano efetivo de um fluxo sob a config atual (variantes por condição).
 *
 * Regras:
 * - Hop dormente COM alternativa ativa no fluxo (outro hop saindo do mesmo nó)
 *   é pulado — é uma troca de variante (ex.: Gateway A vs B por flag).
 * - Depois da primeira troca de variante, hops cuja origem nunca foi alcançada
 *   também saem do caminho (a continuação do ramo não escolhido).
 * - Hop dormente SEM alternativa vira BARREIRA: a história para nele com ⚠
 *   (entra no plano como última parada, marcada).
 * - Fluxos sem condições não sofrem poda nenhuma (roteiro fixo de sempre,
 *   inclusive saltos desconexos intencionais).
 */
export interface FlowPlan {
  /** hops efetivos, na ordem; `original` é o índice na lista do editor */
  hops: { edgeId: string; original: number }[]
  /** índice EM `hops` da barreira (hop dormente sem alternativa), se houver */
  blockedAt: number | null
  /** hops fora do caminho atual, por índice original */
  skipped: Map<number, SkipReason>
}

export function flowPlan(flow: FlowDef, edges: OrthoEdge[], nodes: AnyNode[]): FlowPlan {
  const edgeById = new Map(edges.map((e) => [e.id, e]))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const dormant = (e: OrthoEdge) => !!e.data?.when && !edgeActive(e, nodeById.get(e.source))

  const hops: { edgeId: string; original: number }[] = []
  const skipped = new Map<number, SkipReason>()
  let blockedAt: number | null = null
  const reached = new Set<string>()
  let variantMode = false

  for (let i = 0; i < flow.edgeIds.length; i++) {
    const eid = flow.edgeIds[i]
    const edge = edgeById.get(eid)
    if (!edge) {
      skipped.set(i, 'missing')
      continue
    }
    if (dormant(edge)) {
      const hasActiveAlt = flow.edgeIds.some((otherId, j) => {
        if (j === i) return false
        const other = edgeById.get(otherId)
        return !!other && other.source === edge.source && !dormant(other)
      })
      if (hasActiveAlt) {
        skipped.set(i, 'dormant')
        variantMode = true
        continue
      }
      // sem alternativa: a história para aqui
      hops.push({ edgeId: eid, original: i })
      blockedAt = hops.length - 1
      break
    }
    // continuação de um ramo não escolhido: origem nunca alcançada
    if (variantMode && reached.size && !reached.has(edge.source)) {
      skipped.set(i, 'unreachable')
      continue
    }
    hops.push({ edgeId: eid, original: i })
    reached.add(edge.source)
    reached.add(edge.target)
  }

  return { hops, blockedAt, skipped }
}
