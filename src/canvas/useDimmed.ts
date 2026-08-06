import { useStore, activeSets } from '../store/store'

/** true quando existe fluxo ativo e o elemento NÃO participa dele. */
export function useDimmed(elementId: string, kind: 'node' | 'edge' = 'node'): boolean {
  return useStore((s) => {
    if (!s.activeFlowId) return false
    const sets = activeSets(s)
    if (!sets) return false
    return kind === 'node' ? !sets.nodeIds.has(elementId) : !sets.edgeIds.has(elementId)
  })
}
