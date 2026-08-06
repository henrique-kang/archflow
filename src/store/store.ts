import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { temporal } from 'zundo'
import { create } from 'zustand'
import type {
  AnyNode,
  ArchNodeData,
  ArchType,
  FlowDef,
  GroupNodeData,
  OrthoEdge,
  Side,
  XY,
} from '../model/types'
import { normalizeWaypoints } from '../canvas/edges/ortho'
import { absRect, inflate, rectContains, sideFacing, sideMid } from '../canvas/geometry'
import { defaultIconFor, typeLabel } from '../model/types'
import { seedDoc } from '../model/seed'
import { docToStore, orderNodes, storeToDoc, type Doc, type StoreShape } from '../model/yaml'
import { pulseWavesFrom } from '../lib/graph'
import { debounce, nextFlowColor, uid } from '../lib/utils'

export const ALL_FLOWS = '__all__'
/** Modo automático: anima o diagrama inteiro seguindo as setas, sem configurar fluxo. */
export const ALL_AUTO = '__auto__'
// Bumpar a versão da chave quando o diagrama de exemplo mudar: faz o app abrir
// com o exemplo novo sem apagar o documento salvo anteriormente.
const STORAGE_KEY = 'archflow.doc.v3'
const HISTORY_KEY = 'archflow.history.v3'

interface Guides {
  x?: number
  y?: number
}

/** Evento do modo automático: ondas de arestas a partir do nó clicado. */
export interface Pulse {
  id: string
  originId: string
  waves: string[][]
}


export interface StoreState extends StoreShape {
  // ---- estado de UI (fora do histórico) ----
  activeFlowId: string | null
  playing: boolean
  speed: number
  presentation: boolean
  /** fluxo em modo "clicar arestas para adicionar hops" */
  pickingFlowId: string | null
  guides: Guides | null
  /** navegação hop a hop do fluxo ativo (null = contínuo) */
  stepIndex: number | null
  /** eventos disparados no modo automático (clique num nó) */
  pulses: Pulse[]
  /** arestas atualmente percorridas por algum evento (atualizado por onda) */
  pulseEdges: Set<string>
  /** grupo destacado como alvo de drop durante um arraste */
  dropTargetId: string | null

  // ---- grafo ----
  onNodesChange: (changes: NodeChange<AnyNode>[]) => void
  onEdgesChange: (changes: EdgeChange<OrthoEdge>[]) => void
  onConnect: (conn: Connection) => void
  updateNodeData: (id: string, patch: Partial<ArchNodeData & GroupNodeData>) => void
  updateEdge: (
    id: string,
    patch: { label?: string; color?: string | null; dashed?: boolean; labelT?: number },
  ) => void
  setWaypoints: (edgeId: string, wps: XY[]) => void
  /**
   * Fecha um gesto de edição de aresta (estilo draw.io): descarta dobras
   * dentro dos nós, re-escolhe o lado de entrada/saída conforme a direção
   * de chegada e normaliza os waypoints contra as novas âncoras.
   */
  finishEdgeGesture: (edgeId: string) => void
  reconnectEdge: (edgeId: string, conn: Connection) => void
  addArchNode: (archType: ArchType, position: XY, parentId?: string) => string
  addGroup: (position: XY) => string
  reparent: (nodeId: string, parentId: string | undefined, relPos: XY) => void
  setMetaName: (name: string) => void
  /** Bloqueia/desbloqueia arraste dos nós (estilo cadeado do draw.io). */
  toggleLock: (ids: string[]) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void

  // ---- fluxos ----
  addFlow: () => string
  updateFlow: (id: string, patch: Partial<Omit<FlowDef, 'id'>>) => void
  deleteFlow: (id: string) => void
  appendHop: (flowId: string, edgeId: string) => void
  removeHop: (flowId: string, index: number) => void
  moveHop: (flowId: string, index: number, dir: -1 | 1) => void
  moveHopTo: (flowId: string, from: number, to: number) => void
  /** Autocompleta o fluxo seguindo as setas enquanto o caminho for único. */
  appendFollowArrows: (flowId: string) => number

  // ---- UI ----
  setActiveFlow: (id: string | null) => void
  setPlaying: (v: boolean) => void
  setSpeed: (v: number) => void
  setPresentation: (v: boolean) => void
  setPicking: (flowId: string | null) => void
  setGuides: (g: Guides | null) => void
  setStep: (v: number | null) => void
  setDropTarget: (id: string | null) => void
  /** Dispara um evento a partir de um nó (modo automático). */
  firePulse: (nodeId: string) => void
  endPulse: (id: string) => void
  setPulseEdges: (edges: Set<string>) => void

  // ---- documento ----
  exportDoc: () => Doc
  importDoc: (doc: Doc) => void
  resetToSeed: () => void
}

type Tracked = Pick<StoreState, 'meta' | 'nodes' | 'edges' | 'flows'>

/** Projeção estável do estado rastreado — ignora selected/dragging/measured. */
function proj(state: Tracked): string {
  return JSON.stringify({
    m: state.meta,
    n: state.nodes.map((n) => [n.id, n.type, n.position.x, n.position.y, n.parentId ?? null, n.width ?? null, n.height ?? null, n.draggable ?? null, n.data]),
    e: state.edges.map((e) => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.label ?? null, e.data]),
    f: state.flows,
  })
}

function loadInitial(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const doc = JSON.parse(raw) as Doc
      if (doc && Array.isArray(doc.nodes)) return docToStore(doc)
    }
  } catch {
    // localStorage corrompido — cai para o seed
  }
  return docToStore(seedDoc())
}

/** Descendentes (recursivo) de um conjunto de nós. */
function descendantsOf(ids: Set<string>, nodes: AnyNode[]): Set<string> {
  const all = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (n.parentId && all.has(n.parentId) && !all.has(n.id)) {
        all.add(n.id)
        grew = true
      }
    }
  }
  return all
}

export const useStore = create<StoreState>()(
  temporal(
    (set, get) => ({
      ...loadInitial(),
      activeFlowId: null,
      playing: true,
      speed: 1,
      presentation: false,
      pickingFlowId: null,
      guides: null,
      stepIndex: null,
      dropTargetId: null,
      pulses: [],
      pulseEdges: new Set<string>(),

      onNodesChange: (changes) => {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
        if (removed.size) {
          const all = descendantsOf(removed, get().nodes)
          for (const id of all) {
            if (!removed.has(id)) changes.push({ type: 'remove', id })
          }
          const deadEdges = get().edges.filter((e) => all.has(e.source) || all.has(e.target))
          const nodes = applyNodeChanges(changes, get().nodes)
          const deadIds = new Set(deadEdges.map((e) => e.id))
          const edges = get().edges.filter((e) => !deadIds.has(e.id))
          const flows = get().flows.map((f) => ({ ...f, edgeIds: f.edgeIds.filter((id) => !deadIds.has(id)) }))
          set({ nodes, edges, flows })
          return
        }
        set({ nodes: applyNodeChanges(changes, get().nodes) })
      },

      onEdgesChange: (changes) => {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
        const edges = applyEdgeChanges(changes, get().edges)
        if (removed.size) {
          set({
            edges,
            flows: get().flows.map((f) => ({ ...f, edgeIds: f.edgeIds.filter((id) => !removed.has(id)) })),
          })
        } else {
          set({ edges })
        }
      },

      onConnect: (conn) => {
        if (!conn.source || !conn.target) return
        if (conn.source === conn.target && conn.sourceHandle === conn.targetHandle) return
        const edge: OrthoEdge = {
          id: uid('e_'),
          source: conn.source,
          target: conn.target,
          sourceHandle: conn.sourceHandle ?? 'r',
          targetHandle: conn.targetHandle ?? 'l',
          type: 'ortho',
          data: { waypoints: [] },
        }
        set({ edges: [...get().edges, edge] })
      },

      updateNodeData: (id, patch) => {
        set({
          nodes: get().nodes.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AnyNode) : n)),
        })
      },

      updateEdge: (id, patch) => {
        set({
          edges: get().edges.map((e) => {
            if (e.id !== id) return e
            const next: OrthoEdge = { ...e, data: { waypoints: [], ...e.data } }
            if (patch.label !== undefined) next.label = patch.label
            if (patch.dashed !== undefined) next.data = { ...next.data!, dashed: patch.dashed }
            if (patch.labelT !== undefined) next.data = { ...next.data!, labelT: patch.labelT }
            if (patch.color !== undefined)
              next.data = { ...next.data!, color: patch.color === null ? undefined : patch.color }
            return next
          }),
        })
      },

      setWaypoints: (edgeId, wps) => {
        set({
          edges: get().edges.map((e) =>
            e.id === edgeId ? { ...e, data: { ...e.data!, waypoints: wps } } : e,
          ),
        })
      },

      finishEdgeGesture: (edgeId) => {
        const st = get()
        const edge = st.edges.find((e) => e.id === edgeId)
        if (!edge) return
        const byId = new Map(st.nodes.map((n) => [n.id, n]))
        const srcNode = byId.get(edge.source)
        const tgtNode = byId.get(edge.target)
        if (!srcNode || !tgtNode) return
        const srcRect = absRect(srcNode, byId)
        const tgtRect = absRect(tgtNode, byId)

        // dobras dentro (ou rentes) dos nós não fazem sentido — é o que criava
        // a ancoragem colada na ponta da seta
        const wps = (edge.data?.waypoints ?? []).filter(
          (p) => !rectContains(inflate(srcRect, 4), p) && !rectContains(inflate(tgtRect, 4), p),
        )

        // conexão flutuante: o lado se adapta à direção de chegada/saída
        let sSide = (edge.sourceHandle as Side) || 'r'
        let tSide = (edge.targetHandle as Side) || 'l'
        if (wps.length) {
          sSide = sideFacing(srcRect, wps[0])
          tSide = sideFacing(tgtRect, wps[wps.length - 1])
        }

        const sAnchor = sideMid(srcRect, sSide)
        const tAnchor = sideMid(tgtRect, tSide)
        const normalized = normalizeWaypoints({
          sx: sAnchor.x,
          sy: sAnchor.y,
          sSide,
          tx: tAnchor.x,
          ty: tAnchor.y,
          tSide,
          waypoints: wps,
        })

        set({
          edges: st.edges.map((e) =>
            e.id === edgeId
              ? { ...e, sourceHandle: sSide, targetHandle: tSide, data: { ...e.data!, waypoints: normalized } }
              : e,
          ),
        })
      },

      reconnectEdge: (edgeId, conn) => {
        if (!conn.source || !conn.target) return
        set({
          edges: get().edges.map((e) =>
            e.id === edgeId
              ? {
                  ...e,
                  source: conn.source,
                  target: conn.target,
                  sourceHandle: conn.sourceHandle ?? e.sourceHandle,
                  targetHandle: conn.targetHandle ?? e.targetHandle,
                  // dobras antigas são absolutas — não fazem sentido no novo destino
                  data: { ...e.data!, waypoints: [] },
                }
              : e,
          ),
        })
      },

      addArchNode: (archType, position, parentId) => {
        const id = uid('n_')
        const count = get().nodes.filter((n) => n.type === 'arch' && (n.data as ArchNodeData).archType === archType).length
        const node: AnyNode = {
          id,
          type: 'arch',
          position,
          ...(parentId ? { parentId } : {}),
          data: { label: `${typeLabel(archType)} ${count + 1}`, archType, icon: defaultIconFor(archType) },
          selected: true,
        }
        set({ nodes: orderNodes([...get().nodes.map((n) => ({ ...n, selected: false })), node]) })
        return id
      },

      addGroup: (position) => {
        const id = uid('g_')
        const count = get().nodes.filter((n) => n.type === 'group').length
        const node: AnyNode = {
          id,
          type: 'group',
          position,
          width: 320,
          height: 220,
          zIndex: -1,
          data: { label: `Grupo ${count + 1}` },
          selected: true,
        }
        set({ nodes: orderNodes([...get().nodes.map((n) => ({ ...n, selected: false })), node]) })
        return id
      },

      reparent: (nodeId, parentId, relPos) => {
        set({
          nodes: orderNodes(
            get().nodes.map((n) =>
              n.id === nodeId ? ({ ...n, parentId, position: relPos } as AnyNode) : n,
            ),
          ),
        })
      },

      setMetaName: (name) => set({ meta: { name } }),

      toggleLock: (ids) => {
        // travar draggable no meio de um drag desarma o gesto sem o change final,
        // deixando o histórico pausado — ignora enquanto algo está sendo arrastado
        if (get().nodes.some((n) => n.dragging)) return
        const idSet = new Set(ids)
        const anyUnlocked = get().nodes.some((n) => idSet.has(n.id) && n.draggable !== false)
        set({
          nodes: get().nodes.map((n) =>
            idSet.has(n.id) ? ({ ...n, draggable: !anyUnlocked } as AnyNode) : n,
          ),
        })
      },

      bringToFront: (id) => {
        const nodes = get().nodes
        const node = nodes.find((n) => n.id === id)
        if (!node) return
        // move para o fim da sua coorte (mesmo pai, mesma classe) → renderiza por cima
        const rest = nodes.filter((n) => n.id !== id)
        set({ nodes: orderNodes([...rest, node]) })
      },

      sendToBack: (id) => {
        const nodes = get().nodes
        const node = nodes.find((n) => n.id === id)
        if (!node) return
        const rest = nodes.filter((n) => n.id !== id)
        set({ nodes: orderNodes([node, ...rest]) })
      },

      addFlow: () => {
        const id = uid('f_')
        const flows = get().flows
        set({
          flows: [
            ...flows,
            { id, name: `Fluxo ${flows.length + 1}`, color: nextFlowColor(flows.map((f) => f.color)), edgeIds: [] },
          ],
        })
        return id
      },

      updateFlow: (id, patch) => {
        set({ flows: get().flows.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
      },

      deleteFlow: (id) => {
        const st = get()
        set({
          flows: st.flows.filter((f) => f.id !== id),
          ...(st.activeFlowId === id ? { activeFlowId: null, stepIndex: null } : {}),
          ...(st.pickingFlowId === id ? { pickingFlowId: null } : {}),
        })
      },

      appendHop: (flowId, edgeId) => {
        set({
          flows: get().flows.map((f) => (f.id === flowId ? { ...f, edgeIds: [...f.edgeIds, edgeId] } : f)),
        })
      },

      removeHop: (flowId, index) => {
        const st = get()
        const flows = st.flows.map((f) =>
          f.id === flowId ? { ...f, edgeIds: f.edgeIds.filter((_, i) => i !== index) } : f,
        )
        // mantém o passo a passo dentro do range após remoção
        let stepIndex = st.stepIndex
        if (stepIndex !== null && st.activeFlowId === flowId) {
          const len = flows.find((f) => f.id === flowId)?.edgeIds.length ?? 0
          stepIndex = len === 0 ? null : Math.min(stepIndex, len - 1)
        }
        set({ flows, stepIndex })
      },

      moveHop: (flowId, index, dir) => {
        set({
          flows: get().flows.map((f) => {
            if (f.id !== flowId) return f
            const j = index + dir
            if (j < 0 || j >= f.edgeIds.length) return f
            const ids = [...f.edgeIds]
            ;[ids[index], ids[j]] = [ids[j], ids[index]]
            return { ...f, edgeIds: ids }
          }),
        })
      },

      moveHopTo: (flowId, from, to) => {
        set({
          flows: get().flows.map((f) => {
            if (f.id !== flowId || from === to) return f
            if (from < 0 || from >= f.edgeIds.length || to < 0 || to >= f.edgeIds.length) return f
            const ids = [...f.edgeIds]
            const [moved] = ids.splice(from, 1)
            ids.splice(to, 0, moved)
            return { ...f, edgeIds: ids }
          }),
        })
      },

      appendFollowArrows: (flowId) => {
        const st = get()
        const flow = st.flows.find((f) => f.id === flowId)
        if (!flow || flow.edgeIds.length === 0) return 0
        const byId = new Map(st.edges.map((e) => [e.id, e]))
        const used = new Set(flow.edgeIds)
        const appended: string[] = []
        let cursor = byId.get(flow.edgeIds[flow.edgeIds.length - 1])?.target
        for (let guard = 0; cursor && guard < 60; guard++) {
          const outgoing = st.edges.filter((e) => e.source === cursor && !used.has(e.id))
          if (outgoing.length !== 1) break // ambíguo (ramificação) ou fim do caminho
          const next = outgoing[0]
          appended.push(next.id)
          used.add(next.id)
          cursor = next.target
        }
        if (appended.length) {
          set({
            flows: st.flows.map((f) =>
              f.id === flowId ? { ...f, edgeIds: [...f.edgeIds, ...appended] } : f,
            ),
          })
        }
        return appended.length
      },

      setActiveFlow: (id) =>
        set({ activeFlowId: id, stepIndex: null, pulses: [], pulseEdges: new Set() }),
      setPlaying: (v) => set({ playing: v, ...(v ? { stepIndex: null } : {}) }),
      setSpeed: (v) => set({ speed: Math.min(4, Math.max(0.5, v)) }),
      setPresentation: (v) => set({ presentation: v, ...(v ? { pickingFlowId: null } : {}) }),
      setPicking: (flowId) => set({ pickingFlowId: flowId }),
      setGuides: (g) => set({ guides: g }),
      setStep: (v) => set({ stepIndex: v, ...(v !== null ? { playing: false } : { playing: true }) }),
      setDropTarget: (id) => {
        if (get().dropTargetId !== id) set({ dropTargetId: id })
      },

      firePulse: (nodeId) => {
        const waves = pulseWavesFrom(nodeId, get().edges)
        if (!waves.length) return
        set({ pulses: [...get().pulses, { id: uid('p_'), originId: nodeId, waves }] })
      },

      endPulse: (id) => {
        set({ pulses: get().pulses.filter((p) => p.id !== id) })
      },

      setPulseEdges: (edges) => set({ pulseEdges: edges }),

      exportDoc: () => storeToDoc(get()),

      importDoc: (doc) => {
        const shape = docToStore(doc)
        set({ ...shape, activeFlowId: null, pickingFlowId: null, stepIndex: null })
        useStore.temporal.getState().clear()
      },

      resetToSeed: () => {
        get().importDoc(seedDoc())
      },
    }),
    {
      limit: 100,
      partialize: (s): Tracked => ({ meta: s.meta, nodes: s.nodes, edges: s.edges, flows: s.flows }),
      equality: (past, cur) => proj(past as Tracked) === proj(cur as Tracked),
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__afStore = useStore
}

export const pauseHistory = () => useStore.temporal.getState().pause()
export const resumeHistory = () => useStore.temporal.getState().resume()
export const undo = () => useStore.temporal.getState().undo()
export const redo = () => useStore.temporal.getState().redo()

// ---- autosave em localStorage ----

export interface HistoryEntry {
  ts: number
  doc: Doc
}

/** Snapshots locais (proteção contra perda acidental) — no máx. 12, 1 a cada ≥90s. */
export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : []
    return Array.isArray(list) ? list.filter((h) => h && h.doc && typeof h.ts === 'number') : []
  } catch {
    return []
  }
}

function pushHistory(doc: Doc) {
  try {
    const list = readHistory()
    const last = list[list.length - 1]
    if (last && Date.now() - last.ts < 90_000) return
    list.push({ ts: Date.now(), doc })
    while (list.length > 12) list.shift()
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    // quota — histórico é best-effort
  }
}

let lastWrittenDoc = ''

function saveNow() {
  try {
    const doc = storeToDoc(useStore.getState())
    const json = JSON.stringify(doc)
    lastWrittenDoc = json
    localStorage.setItem(STORAGE_KEY, json)
    pushHistory(doc)
  } catch {
    // quota/serialização — silencioso, o usuário ainda tem export manual
  }
}
const save = debounce(saveNow, 600)

// outra aba escrevendo o mesmo diagrama → avisa (última escrita vence)
let warnedAt = 0
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || e.newValue === null || e.newValue === lastWrittenDoc) return
  if (Date.now() - warnedAt < 60_000) return
  warnedAt = Date.now()
  import('../lib/toast').then(({ toast }) =>
    toast('Outra aba está editando este diagrama — a última alteração salva vence.', 'error'),
  )
})

useStore.subscribe((s, prev) => {
  if (s.nodes !== prev.nodes || s.edges !== prev.edges || s.flows !== prev.flows || s.meta !== prev.meta) save()
})

// garante flush do debounce ao fechar/trocar de aba
window.addEventListener('pagehide', saveNow)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow()
})

// ---- seletores derivados ----

/** Conjunto de ids (nós+arestas+grupos) que participam do(s) fluxo(s) ativo(s). */
export function activeSets(s: Pick<StoreState, 'activeFlowId' | 'flows' | 'edges' | 'nodes'>): {
  edgeIds: Set<string>
  nodeIds: Set<string>
} | null {
  if (!s.activeFlowId) return null
  if (s.activeFlowId === ALL_AUTO) {
    // modo automático: o diagrama inteiro participa — nada esmaece
    return {
      edgeIds: new Set(s.edges.map((e) => e.id)),
      nodeIds: new Set(s.nodes.map((n) => n.id)),
    }
  }
  const flows = s.activeFlowId === ALL_FLOWS ? s.flows : s.flows.filter((f) => f.id === s.activeFlowId)
  const edgeIds = new Set<string>()
  const nodeIds = new Set<string>()
  const byId = new Map(s.edges.map((e) => [e.id, e]))
  for (const f of flows) {
    for (const eid of f.edgeIds) {
      const e = byId.get(eid)
      if (!e) continue
      edgeIds.add(eid)
      nodeIds.add(e.source)
      nodeIds.add(e.target)
    }
  }
  // inclui os grupos ancestrais dos nós participantes
  const byNode = new Map(s.nodes.map((n) => [n.id, n]))
  for (const id of [...nodeIds]) {
    let cur = byNode.get(id)
    while (cur?.parentId) {
      nodeIds.add(cur.parentId)
      cur = byNode.get(cur.parentId)
    }
  }
  return { edgeIds, nodeIds }
}
