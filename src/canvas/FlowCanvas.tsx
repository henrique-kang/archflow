import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  useReactFlow,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type OnReconnect,
} from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { AnyNode, ArchNodeData, ArchType, OrthoEdge, XY } from '../model/types'
import { TYPE_COLORS, typeColor } from '../model/types'
import { setCanvasPointer } from '../lib/pointer'
import { toast } from '../lib/toast'
import { withAlpha } from '../lib/utils'
import { ALL_AUTO, hasClipboard, useStore } from '../store/store'
import { gestureJustEnded } from './edges/gestureState'
import { nearestT, pointAlong, snap } from './edges/ortho'
import { OrthoEdgeView } from './edges/OrthoEdgeView'
import { FlowPackets } from './FlowAnimation'
import { absPosition, absRect, deepestGroupAt, nodeSize, withDescendants } from './geometry'
import { ArchNodeView } from './nodes/ArchNodeView'
import { GroupNodeView } from './nodes/GroupNodeView'

const nodeTypes: NodeTypes = { arch: ArchNodeView, group: GroupNodeView }
const edgeTypes: EdgeTypes = { ortho: OrthoEdgeView }

const GUIDE_THRESHOLD = 6

/** Linhas-guia de alinhamento durante o arraste. */
function GuideLines() {
  const guides = useStore((s) => s.guides)
  if (!guides) return null
  return (
    <ViewportPortal>
      {guides.x !== undefined && (
        <div className="af-guide" style={{ left: guides.x, top: -20000, width: 1, height: 40000 }} />
      )}
      {guides.y !== undefined && (
        <div className="af-guide" style={{ top: guides.y, left: -20000, height: 1, width: 40000 }} />
      )}
    </ViewportPortal>
  )
}

interface CtxMenu {
  x: number
  y: number
  kind: 'node' | 'group' | 'edge' | 'pane'
  id: string | null
}

interface InlineEditState {
  kind: 'node' | 'edge'
  id: string
  x: number
  y: number
  w: number
  value: string
}

/** Amostra o path DOM de uma aresta como polilinha em coordenadas do canvas. */
function samplePath(edgeId: string, n = 140): XY[] | null {
  const el = document.getElementById(`af-path-${edgeId}`) as SVGPathElement | null
  if (!el) return null
  const len = el.getTotalLength()
  if (len === 0) return null
  const pts: XY[] = []
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n)
    pts.push({ x: p.x, y: p.y })
  }
  return pts
}

export function FlowCanvas() {
  const { nodes, edges } = useStore(useShallow((s) => ({ nodes: s.nodes, edges: s.edges })))
  const presentation = useStore((s) => s.presentation)
  const picking = useStore((s) => s.pickingFlowId)
  const autoMode = useStore((s) => s.activeFlowId === ALL_AUTO)
  const hasPulses = useStore((s) => s.pulses.length > 0)
  const [connecting, setConnecting] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [inline, setInline] = useState<InlineEditState | null>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  /** posição do botão direito ao apertar — distingue clique de arrasto (pan) */
  const rightDown = useRef<{ x: number; y: number } | null>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()

  /**
   * Menu de contexto do canvas vazio. O botão direito também faz pan
   * (panOnDrag), e o React Flow cancela o contextmenu antes de ele chegar ao
   * React — por isso ouvimos na fase de CAPTURE, e só abrimos quando o gesto
   * foi um clique (sem arrasto).
   */
  useEffect(() => {
    const host = flowRef.current
    if (!host) return
    const onCtx = (e: MouseEvent) => {
      // durante o pan o ponteiro é capturado e o e.target deixa de ser o pane —
      // olhamos quem está de fato sob o cursor
      const under = document.elementFromPoint(e.clientX, e.clientY)
      if (!under || !host.contains(under)) return
      if (under.closest('.react-flow__node, .react-flow__edge, .af-menu, .af-props, .af-palette, .react-flow__controls, .react-flow__minimap'))
        return
      const d = rightDown.current
      rightDown.current = null
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
      e.preventDefault()
      e.stopPropagation()
      setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'pane', id: null })
    }
    host.addEventListener('contextmenu', onCtx, true)
    return () => host.removeEventListener('contextmenu', onCtx, true)
  }, [])

  // Esc fecha o menu de contexto (antes de qualquer outro atalho de Esc)
  useEffect(() => {
    if (!ctxMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setCtxMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ctxMenu])

  /** Snap por linhas-guia: ajusta o change de posição e publica as guias. */
  const applyGuides = useCallback((changes: NodeChange<AnyNode>[]) => {
    const st = useStore.getState()
    const posChanges = changes.filter(
      (c) => c.type === 'position' && c.position && c.dragging,
    ) as Extract<NodeChange<AnyNode>, { type: 'position' }>[]
    if (posChanges.length !== 1) {
      if (st.guides) st.setGuides(null)
      return
    }
    const ch = posChanges[0]
    const byId = new Map(st.nodes.map((n) => [n.id, n]))
    const node = byId.get(ch.id)
    if (!node || !ch.position) return
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    const parentAbs = parent ? absPosition(parent, byId) : { x: 0, y: 0 }
    const size = nodeSize(node)
    const abs = { x: parentAbs.x + ch.position.x, y: parentAbs.y + ch.position.y }
    const moving = withDescendants(ch.id, st.nodes)

    const myX = [abs.x, abs.x + size.w / 2, abs.x + size.w]
    const myY = [abs.y, abs.y + size.h / 2, abs.y + size.h]
    let bestX: { guide: number; delta: number } | null = null
    let bestY: { guide: number; delta: number } | null = null
    for (const other of st.nodes) {
      if (moving.has(other.id)) continue
      const r = absRect(other, byId)
      const ox = [r.x, r.x + r.w / 2, r.x + r.w]
      const oy = [r.y, r.y + r.h / 2, r.y + r.h]
      for (const a of myX)
        for (const b of ox) {
          const d = b - a
          if (Math.abs(d) <= GUIDE_THRESHOLD && (!bestX || Math.abs(d) < Math.abs(bestX.delta)))
            bestX = { guide: b, delta: d }
        }
      for (const a of myY)
        for (const b of oy) {
          const d = b - a
          if (Math.abs(d) <= GUIDE_THRESHOLD && (!bestY || Math.abs(d) < Math.abs(bestY.delta)))
            bestY = { guide: b, delta: d }
        }
    }
    if (bestX) ch.position.x += bestX.delta
    if (bestY) ch.position.y += bestY.delta
    st.setGuides(bestX || bestY ? { x: bestX?.guide, y: bestY?.guide } : null)
  }, [])

  const handleNodesChange = useCallback(
    (changes: NodeChange<AnyNode>[]) => {
      const st = useStore.getState()
      const temporal = useStore.temporal.getState()
      const startGesture = changes.some(
        (c) =>
          (c.type === 'position' && c.dragging === true) ||
          (c.type === 'dimensions' && c.resizing === true),
      )
      const endGesture = changes.some(
        (c) =>
          (c.type === 'position' && c.dragging === false) ||
          (c.type === 'dimensions' && c.resizing === false),
      )
      if (startGesture) applyGuides(changes)
      if (endGesture && !temporal.isTracking) {
        st.onNodesChange(changes)
        temporal.resume()
        return
      }
      st.onNodesChange(changes)
      if (startGesture && temporal.isTracking) temporal.pause()
    },
    [applyGuides],
  )

  /** Destaca a raia que receberia o nó se ele fosse solto agora. */
  const handleNodeDrag = useCallback<OnNodeDrag<AnyNode>>((_e, node) => {
    const st = useStore.getState()
    const all = st.nodes
    const byId = new Map(all.map((n) => [n.id, n]))
    const cur = byId.get(node.id)
    if (!cur) return
    const abs = absPosition(cur, byId)
    const size = nodeSize(cur)
    const center = { x: abs.x + size.w / 2, y: abs.y + size.h / 2 }
    const target = deepestGroupAt(center, all, withDescendants(cur.id, all))
    st.setDropTarget(target && target.id !== cur.parentId ? target.id : null)
  }, [])

  const handleNodeDragStop = useCallback<OnNodeDrag<AnyNode>>(
    (_e, _node, dragged) => {
      const st = useStore.getState()
      st.setGuides(null)
      st.setDropTarget(null)
      // reparents dentro de um pause para o gesto inteiro virar UM passo de undo
      let paused = false
      for (const dn of dragged) {
        const all = useStore.getState().nodes
        const byId = new Map(all.map((n) => [n.id, n]))
        const cur = byId.get(dn.id)
        if (!cur) continue
        const abs = absPosition(cur, byId)
        const size = nodeSize(cur)
        const center = { x: abs.x + size.w / 2, y: abs.y + size.h / 2 }
        const exclude = withDescendants(cur.id, all)
        const target = deepestGroupAt(center, all, exclude)
        const targetId = target?.id
        if (targetId !== cur.parentId) {
          if (!paused) {
            useStore.temporal.getState().pause()
            paused = true
          }
          const targetAbs = target ? absPosition(target, byId) : { x: 0, y: 0 }
          st.reparent(cur.id, targetId, { x: abs.x - targetAbs.x, y: abs.y - targetAbs.y })
        }
      }
      if (paused) useStore.temporal.getState().resume()
    },
    [],
  )

  const handleEdgeClick = useCallback((_e: React.MouseEvent, edge: OrthoEdge) => {
    if (gestureJustEnded()) return // clique residual de um arrasto de dobra/segmento
    const st = useStore.getState()
    if (st.pickingFlowId) st.appendHop(st.pickingFlowId, edge.id)
  }, [])

  const handleReconnect: OnReconnect<OrthoEdge> = useCallback((oldEdge, conn) => {
    useStore.getState().reconnectEdge(oldEdge.id, conn)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/archflow')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData('application/archflow')
      if (!raw) return
      e.preventDefault()
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const st = useStore.getState()
      if (raw === 'group') {
        st.addGroup({ x: pos.x - 160, y: pos.y - 110 })
        return
      }
      const type = raw as ArchType
      const target = deepestGroupAt(pos, st.nodes, new Set())
      if (target) {
        const byId = new Map(st.nodes.map((n) => [n.id, n]))
        const gAbs = absPosition(target, byId)
        st.addArchNode(type, { x: pos.x - gAbs.x - 85, y: pos.y - gAbs.y - 24 }, target.id)
      } else {
        st.addArchNode(type, { x: pos.x - 85, y: pos.y - 24 })
      }
    },
    [screenToFlowPosition],
  )

  // ---------- edição inline de rótulo ----------

  const openNodeRename = useCallback((nodeId: string) => {
    const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const node = useStore.getState().nodes.find((n) => n.id === nodeId)
    if (!node) return
    setInline({
      kind: 'node',
      id: nodeId,
      x: r.left,
      y: node.type === 'group' ? r.top + 4 : r.top + r.height / 2 - 14,
      w: Math.max(150, r.width),
      value: (node.data as { label: string }).label,
    })
  }, [])

  const openEdgeRename = useCallback((edgeId: string, at: { x: number; y: number }) => {
    const edge = useStore.getState().edges.find((e) => e.id === edgeId)
    if (!edge) return
    setInline({
      kind: 'edge',
      id: edgeId,
      x: at.x,
      y: at.y,
      w: 170,
      value: String(edge.label ?? ''),
    })
  }, [])

  const commitInline = useCallback(
    (value: string | null) => {
      if (inline && value !== null) {
        const st = useStore.getState()
        if (inline.kind === 'node') st.updateNodeData(inline.id, { label: value.trim() || '—' })
        else st.updateEdge(inline.id, { label: value.trim() })
      }
      setInline(null)
    },
    [inline],
  )

  // ---------- menu de contexto ----------

  const ctxNode = ctxMenu?.id ? useStore.getState().nodes.find((n) => n.id === ctxMenu.id) : null
  const ctxEdge = ctxMenu?.id ? useStore.getState().edges.find((e) => e.id === ctxMenu.id) : null

  const closeMenu = () => setCtxMenu(null)

  const menuFor = (): React.ReactNode => {
    if (!ctxMenu) return null
    const st = useStore.getState()
    if ((ctxMenu.kind === 'node' || ctxMenu.kind === 'group') && ctxNode) {
      const selectedIds = st.nodes.filter((n) => n.selected).map((n) => n.id)
      const ids = selectedIds.includes(ctxNode.id) && selectedIds.length > 1 ? selectedIds : [ctxNode.id]
      const locked = ctxNode.draggable === false
      const nodeData = ctxNode.type === 'arch' ? (ctxNode.data as ArchNodeData) : null
      const boolVars = nodeData?.vars
        ? Object.entries(nodeData.vars).filter(([, v]) => typeof v.value === 'boolean')
        : []
      const down = nodeData?.status === 'down'
      return (
        <>
          {boolVars.length > 0 && (
            <>
              {boolVars.map(([name, v]) => (
                <button
                  key={name}
                  onClick={() => {
                    st.setNodeVar(ctxNode.id, name, { ...v, value: !v.value })
                    closeMenu()
                  }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                >
                  {name}: {String(v.value)} → {String(!v.value)}
                </button>
              ))}
              <hr />
            </>
          )}
          {nodeData && (
            <button
              onClick={() => {
                st.setNodeStatus(ctxNode.id, !down)
                closeMenu()
              }}
            >
              {down ? 'Marcar operacional' : 'Marcar fora do ar'}
            </button>
          )}
          <button
            onClick={() => {
              closeMenu()
              openNodeRename(ctxNode.id)
            }}
          >
            Renomear
          </button>
          <button
            onClick={() => {
              const n = st.copyNodes(ids)
              toast(`${n} ${n === 1 ? 'item copiado' : 'itens copiados'}.`)
              closeMenu()
            }}
          >
            Copiar <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)', fontSize: 10.5 }}>Ctrl+C</span>
          </button>
          <button
            onClick={() => {
              st.duplicateNodes(ids)
              closeMenu()
            }}
          >
            Duplicar <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)', fontSize: 10.5 }}>Ctrl+D</span>
          </button>
          <button
            onClick={() => {
              st.toggleLock(ids)
              closeMenu()
            }}
          >
            {locked ? 'Desbloquear' : 'Bloquear'} {ids.length > 1 ? `(${ids.length})` : ''}
          </button>
          <button
            onClick={() => {
              st.bringToFront(ctxNode.id)
              closeMenu()
            }}
          >
            Trazer para frente
          </button>
          <button
            onClick={() => {
              st.sendToBack(ctxNode.id)
              closeMenu()
            }}
          >
            Enviar para trás
          </button>
          <hr />
          <button
            onClick={() => {
              st.onNodesChange(ids.map((id) => ({ type: 'remove' as const, id })))
              closeMenu()
            }}
          >
            Excluir
          </button>
        </>
      )
    }
    if (ctxMenu.kind === 'edge' && ctxEdge) {
      const wps = ctxEdge.data?.waypoints ?? []
      return (
        <>
          <button
            onClick={() => {
              const flowPos = screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y })
              const sampled = samplePath(ctxEdge.id)
              if (sampled) {
                const t = nearestT(sampled, flowPos)
                const point = pointAlong(sampled, t)
                const wpTs = wps.map((w) => nearestT(sampled, w))
                const idx = wpTs.filter((wt) => wt < t).length
                const next = [...wps]
                next.splice(idx, 0, { x: snap(point.x, 1), y: snap(point.y, 1) })
                useStore.getState().setWaypoints(ctxEdge.id, next)
              }
              closeMenu()
            }}
          >
            Adicionar dobra aqui
          </button>
          <button
            disabled={wps.length === 0}
            onClick={() => {
              useStore.getState().setWaypoints(ctxEdge.id, [])
              closeMenu()
            }}
          >
            Limpar dobras {wps.length ? `(${wps.length})` : ''}
          </button>
          <button
            onClick={() => {
              closeMenu()
              openEdgeRename(ctxEdge.id, { x: ctxMenu.x, y: ctxMenu.y })
            }}
          >
            Editar rótulo
          </button>
          <hr />
          <button
            onClick={() => {
              useStore.getState().onEdgesChange([{ type: 'remove', id: ctxEdge.id }])
              closeMenu()
            }}
          >
            Excluir
          </button>
        </>
      )
    }
    return (
      <>
        {hasClipboard() && (
          <>
            <button
              onClick={() => {
                const at = screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y })
                const n = st.pasteNodes(at)
                if (n) toast(`${n} ${n === 1 ? 'item colado' : 'itens colados'}.`)
                closeMenu()
              }}
            >
              Colar aqui <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)', fontSize: 10.5 }}>Ctrl+V</span>
            </button>
            <hr />
          </>
        )}
        <button
          onClick={() => {
            fitView({ padding: 0.12, duration: 300 })
            closeMenu()
          }}
        >
          Enquadrar diagrama
        </button>
      </>
    )
  }

  return (
    <div
      className={`af-canvas-wrap${picking ? ' af-picking' : ''}${autoMode ? ' af-auto' : ''}`}
      ref={flowRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerMove={(e) => setCanvasPointer(screenToFlowPosition({ x: e.clientX, y: e.clientY }))}
      onPointerLeave={() => setCanvasPointer(null)}
      onPointerDown={(e) => {
        if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY }
      }}
    >
      <ReactFlow
        className={connecting ? 'is-connecting' : ''}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={(changes) => useStore.getState().onEdgesChange(changes)}
        onConnect={(c) => useStore.getState().onConnect(c)}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onReconnect={handleReconnect}
        onNodeClick={(_e, node) => {
          // modo automático: clicar num nó dispara o evento que segue as setas
          if (autoMode && node.type === 'arch') {
            if ((node.data as ArchNodeData).status === 'down') {
              toast('Este nó está fora do ar — o evento não parte daqui.', 'error')
              return
            }
            useStore.getState().firePulse(node.id)
          }
        }}
        onNodeDoubleClick={(_e, node) => {
          if (!presentation) openNodeRename(node.id)
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, kind: node.type === 'group' ? 'group' : 'node', id: node.id })
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'edge', id: edge.id })
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, kind: 'pane', id: null })
        }}
        onPaneClick={closeMenu}
        onMoveStart={closeMenu}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={24}
        reconnectRadius={8}
        snapToGrid
        snapGrid={[8, 8]}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.12}
        maxZoom={2.5}
        panOnDrag={[1, 2]}
        selectionOnDrag
        zoomOnDoubleClick={false}
        deleteKeyCode={presentation ? null : ['Delete', 'Backspace']}
        nodesDraggable={!presentation}
        nodesConnectable={!presentation}
        elementsSelectable={!presentation}
        defaultEdgeOptions={{ type: 'ortho' }}
        elevateNodesOnSelect={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="oklch(0.24 0 0)" />
        {!presentation && <Controls position="bottom-left" showInteractive={false} />}
        {!presentation && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            bgColor="oklch(0.15 0 0)"
            maskColor="oklch(0.1 0 0 / 0.7)"
            nodeColor={(n) => {
              const data = (n as AnyNode).data as { archType?: ArchType; color?: string }
              if ((n as AnyNode).type === 'group') return withAlpha(data.color || '#8f97a3', 0.18)
              return data.archType ? typeColor({ archType: data.archType, color: data.color }) : TYPE_COLORS.generic
            }}
          />
        )}
        <GuideLines />
        <FlowPackets />
      </ReactFlow>

      {autoMode && !hasPulses && (
        <div className="af-auto-hint">
          Clique num nó para disparar o evento — ele segue as setas a partir dali
        </div>
      )}

      {ctxMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 29 }}
            onPointerDown={closeMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              closeMenu()
            }}
          />
          <div
            className="af-menu"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 210),
              top: Math.min(ctxMenu.y, window.innerHeight - 220),
            }}
          >
            {menuFor()}
          </div>
        </>
      )}

      {inline && (
        <input
          className="af-inline-edit"
          style={{ position: 'fixed', left: inline.x, top: inline.y, width: inline.w }}
          defaultValue={inline.value}
          autoFocus
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInline((e.target as HTMLInputElement).value)
            else if (e.key === 'Escape') commitInline(null)
            e.stopPropagation()
          }}
          onBlur={(e) => commitInline(e.target.value)}
        />
      )}
    </div>
  )
}
