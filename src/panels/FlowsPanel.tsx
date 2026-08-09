import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  IcCheck,
  IcEye,
  IcPause,
  IcPencil,
  IcPlay,
  IcPlus,
  IcTarget,
  IcTrash,
  IcX,
} from '../icons/ui'
import { toast } from '../lib/toast'
import { onDark } from '../lib/utils'
import { flowPlan } from '../lib/flowPlan'
import type { FlowDef } from '../model/types'
import { ALL_AUTO, ALL_FLOWS, pauseHistory, resumeHistory, useStore } from '../store/store'

const FLOW_SWATCHES = [
  '#4caf50',
  '#42a5f5',
  '#ab47bc',
  '#ff9800',
  '#ef5350',
  '#26c6da',
  '#d4e157',
  '#ec407a',
  '#2e7d32',
  '#1565c0',
  '#6a1b9a',
  '#e65100',
]

function Transport() {
  const { activeFlowId, playing, speed, inspectorOpen } = useStore(
    useShallow((s) => ({
      activeFlowId: s.activeFlowId,
      playing: s.playing,
      speed: s.speed,
      inspectorOpen: s.inspectorOpen,
    })),
  )
  const setPlaying = useStore((s) => s.setPlaying)
  const setSpeed = useStore((s) => s.setSpeed)
  const setInspector = useStore((s) => s.setInspector)
  if (!activeFlowId) return null
  const singleFlow = activeFlowId !== ALL_FLOWS && activeFlowId !== ALL_AUTO
  return (
    <div className="af-transport">
      <button
        className="af-btn is-icon is-outline"
        onClick={() => setPlaying(!playing)}
        title={playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
      >
        {playing ? <IcPause /> : <IcPlay />}
      </button>
      {singleFlow && (
        <button
          className={`af-btn is-outline${inspectorOpen ? ' is-active' : ''}`}
          style={{ paddingInline: 8, fontSize: 11 }}
          onClick={() => setInspector(!inspectorOpen)}
          title="Inspetor de pacote: trajeto do fluxo e o que acontece em cada hop"
        >
          <IcEye size={13} /> Trajeto
        </button>
      )}
      <div className="af-speed">
        <input
          type="range"
          className="af-range"
          min={0.5}
          max={4}
          step={0.25}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Velocidade da animação"
        />
        <span style={{ width: 34, textAlign: 'right' }}>{speed.toFixed(2).replace(/\.?0+$/, '')}×</span>
      </div>
    </div>
  )
}

/** Seletor de cor no tema do app (swatches + picker avançado). */
function ColorPopover({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="af-btn is-outline is-icon"
        onClick={() => setOpen((v) => !v)}
        title="Cor do fluxo"
        style={{ width: 30 }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 4, background: value }} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 34,
            zIndex: 30,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 8,
            width: 152,
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <div className="af-swatches">
            {FLOW_SWATCHES.map((c) => (
              <button
                key={c}
                className={`af-swatch${value === c ? ' is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                }}
                title={c}
              />
            ))}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              fontSize: 11,
              color: 'var(--ink-faint)',
              cursor: 'pointer',
            }}
          >
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{
                width: 22,
                height: 22,
                padding: 0,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            personalizada
          </label>
        </div>
      )}
    </div>
  )
}

function HopList({ flow }: { flow: FlowDef }) {
  const edges = useStore((s) => s.edges)
  const nodes = useStore((s) => s.nodes)
  const { removeHop, moveHopTo } = useStore(
    useShallow((s) => ({ removeHop: s.removeHop, moveHopTo: s.moveHopTo })),
  )
  // plano efetivo: marca variantes inativas, continuações fora do caminho e barreiras
  const plan = useMemo(() => flowPlan(flow, edges, nodes), [flow, edges, nodes])
  const blockedOriginal = plan.blockedAt !== null ? plan.hops[plan.blockedAt]?.original : null
  const drag = useRef<{ index: number; moved: boolean } | null>(null)
  const endDragGesture = () => {
    if (drag.current?.moved) resumeHistory()
    drag.current = null
  }
  const labelOf = (nodeId: string) =>
    (nodes.find((n) => n.id === nodeId)?.data as { label?: string } | undefined)?.label ?? nodeId
  // keys estáveis por ocorrência (uma aresta pode repetir no fluxo): evita remount durante o drag
  const occurrence = new Map<string, number>()
  return (
    <div onDrop={endDragGesture}>
      {flow.edgeIds.map((eid, i) => {
        const e = edges.find((ed) => ed.id === eid)
        const skipReason = plan.skipped.get(i) ?? null
        const isBlocked = blockedOriginal === i
        const nth = occurrence.get(eid) ?? 0
        occurrence.set(eid, nth + 1)
        return (
          <div
            className="af-hop"
            key={`${eid}#${nth}`}
            draggable
            onDragStart={(e) => {
              drag.current = { index: i, moved: false }
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              const st = drag.current
              if (st && st.index !== i) {
                // 1ª troca é gravada no histórico; o resto do gesto fica pausado (1 undo por gesto)
                moveHopTo(flow.id, st.index, i)
                if (!st.moved) {
                  pauseHistory()
                  st.moved = true
                }
                st.index = i
              }
            }}
            onDragEnd={endDragGesture}
            style={{ cursor: 'grab' }}
            title="Arraste para reordenar"
          >
            <span className="af-hop-n" style={{ background: onDark(flow.color), color: '#101318' }}>
              {i + 1}
            </span>
            <span
              className="af-hop-label"
              title={
                isBlocked
                  ? 'Hop dormente sem alternativa: a animação para aqui — alterne a flag no nó de origem'
                  : skipReason === 'dormant'
                    ? 'Variante inativa pela config atual — a animação segue pelo caminho alternativo'
                    : skipReason === 'unreachable'
                      ? 'Fora do caminho atual (continuação do ramo não escolhido)'
                      : e
                        ? `${labelOf(e.source)} → ${labelOf(e.target)}`
                        : eid
              }
              style={
                isBlocked
                  ? { color: '#ffb74d' }
                  : skipReason
                    ? { opacity: 0.45, textDecoration: 'line-through' }
                    : undefined
              }
            >
              {isBlocked ? '⚠ ' : skipReason ? '↷ ' : ''}
              {e ? `${labelOf(e.source)} → ${labelOf(e.target)}` : '(aresta removida)'}
            </span>
            <button className="af-btn is-danger" onClick={() => removeHop(flow.id, i)} title="Remover hop">
              <IcX size={11} />
            </button>
          </div>
        )
      })}
      {flow.edgeIds.length === 0 && (
        <div className="af-empty-note" style={{ marginTop: 4 }}>
          Sem hops ainda. Clique em <b>Adicionar hops</b> e depois clique nas arestas do canvas, na ordem
          da história — ou comece com um hop e use <b>Seguir setas</b>.
        </div>
      )}
    </div>
  )
}

function FlowRow({
  flow,
  editing,
  onToggleEdit,
}: {
  flow: FlowDef
  editing: boolean
  onToggleEdit: () => void
}) {
  const { activeFlowId, pickingFlowId } = useStore(
    useShallow((s) => ({ activeFlowId: s.activeFlowId, pickingFlowId: s.pickingFlowId })),
  )
  const { setActiveFlow, setPicking, updateFlow, deleteFlow, appendFollowArrows } = useStore(
    useShallow((s) => ({
      setActiveFlow: s.setActiveFlow,
      setPicking: s.setPicking,
      updateFlow: s.updateFlow,
      deleteFlow: s.deleteFlow,
      appendFollowArrows: s.appendFollowArrows,
    })),
  )
  const active = activeFlowId === flow.id
  const picking = pickingFlowId === flow.id

  return (
    <div className={`af-flow-row${active ? ' is-active' : ''}`}>
      <button
        className="af-flow-row-main"
        onClick={() => setActiveFlow(active ? null : flow.id)}
        title={active ? 'Desligar animação deste fluxo' : 'Animar este fluxo'}
      >
        <span className="af-flow-dot" style={{ background: onDark(flow.color) }} />
        <span className="af-flow-name">{flow.name}</span>
        <span className="af-flow-count">{flow.edgeIds.length}</span>
        <span
          className="af-btn is-icon"
          role="button"
          tabIndex={0}
          style={{ width: 24, height: 24 }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleEdit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onToggleEdit()
            }
          }}
          title="Editar fluxo"
        >
          <IcPencil size={12} />
        </span>
      </button>
      {editing && (
        <div className="af-flow-editor">
          <div className="af-field">
            <label>Nome</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="af-input"
                value={flow.name}
                onChange={(e) => updateFlow(flow.id, { name: e.target.value })}
              />
              <ColorPopover value={flow.color} onChange={(color) => updateFlow(flow.id, { color })} />
            </div>
          </div>
          <div className="af-field">
            <label>Payload de exemplo (inspetor · aceita {'{{variáveis}}'})</label>
            <textarea
              className="af-input"
              style={{ height: 64, padding: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, resize: 'vertical' }}
              value={flow.payload ?? ''}
              placeholder={'{"pedido": "{{pedido}}", "total": 189.90}'}
              onChange={(e) => updateFlow(flow.id, { payload: e.target.value || undefined })}
            />
          </div>
          <HopList flow={flow} />
          {/* dois botões por linha: três não cabem nos 260px do painel */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              className={`af-btn is-outline${picking ? ' is-active' : ''}`}
              style={{ flex: 1, minWidth: 0, paddingInline: 6, fontSize: 11 }}
              onClick={() => setPicking(picking ? null : flow.id)}
            >
              {picking ? (
                <>
                  <IcCheck size={12} /> Concluir
                </>
              ) : (
                <>
                  <IcTarget size={12} /> Adicionar hops
                </>
              )}
            </button>
            <button
              className="af-btn is-outline"
              style={{ flex: 1, minWidth: 0, paddingInline: 6, fontSize: 11 }}
              disabled={flow.edgeIds.length === 0}
              title="Continua o fluxo seguindo as setas enquanto o caminho for único"
              onClick={() => {
                const n = appendFollowArrows(flow.id)
                toast(
                  n > 0
                    ? `${n} ${n === 1 ? 'hop adicionado' : 'hops adicionados'} seguindo as setas.`
                    : 'Sem caminho único a seguir (fim ou ramificação).',
                )
              }}
            >
              Seguir setas →
            </button>
          </div>
          <button
            className="af-btn is-outline is-danger"
            style={{ width: '100%', marginTop: 6, fontSize: 11 }}
            onClick={() => {
              if (window.confirm(`Excluir o fluxo "${flow.name}"?`)) deleteFlow(flow.id)
            }}
            title="Excluir este fluxo (as arestas do diagrama continuam)"
          >
            <IcTrash size={12} /> Excluir fluxo
          </button>
          {picking && (
            <div
              className="af-empty-note"
              style={{ marginTop: 8, borderColor: 'var(--accent-strong)', color: 'var(--ink-muted)' }}
            >
              Clique nas arestas do canvas na ordem do fluxo. Cada clique adiciona um hop.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FlowsPanel() {
  const flows = useStore((s) => s.flows)
  const activeFlowId = useStore((s) => s.activeFlowId)
  const { setActiveFlow, addFlow } = useStore(
    useShallow((s) => ({ setActiveFlow: s.setActiveFlow, addFlow: s.addFlow })),
  )
  const [editingId, setEditingId] = useState<string | null>(null)

  const switchEditing = (id: string | null) => {
    const st = useStore.getState()
    if (st.pickingFlowId && st.pickingFlowId !== id) st.setPicking(null)
    setEditingId(id)
  }

  return (
    <aside className="af-sidebar">
      <div className="af-panel-header">
        Fluxos
        <button className="af-btn is-icon" onClick={() => switchEditing(addFlow())} title="Novo fluxo">
          <IcPlus size={14} />
        </button>
      </div>
      <Transport />
      <div className="af-panel-scroll" style={{ paddingTop: 6 }}>
        <div className={`af-flow-row${activeFlowId === ALL_AUTO ? ' is-active' : ''}`}>
          <button
            className="af-flow-row-main"
            onClick={() => setActiveFlow(activeFlowId === ALL_AUTO ? null : ALL_AUTO)}
            title="Anima o diagrama inteiro seguindo as setas — sem configurar fluxo"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12h13M12 5l7 7-7 7" />
            </svg>
            <span className="af-flow-name">Automático</span>
            <span className="af-flow-count" title="segue as setas">setas</span>
          </button>
        </div>
        {flows.length > 1 && (
          <div className={`af-flow-row${activeFlowId === ALL_FLOWS ? ' is-active' : ''}`}>
            <button
              className="af-flow-row-main"
              onClick={() => setActiveFlow(activeFlowId === ALL_FLOWS ? null : ALL_FLOWS)}
              title="Animar todos os fluxos simultaneamente"
            >
              <span style={{ display: 'inline-flex', width: 12, justifyContent: 'center' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: `conic-gradient(${flows
                      .slice(0, 6)
                      .map(
                        (f, i, arr) =>
                          `${onDark(f.color)} ${(i / arr.length) * 360}deg ${((i + 1) / arr.length) * 360}deg`,
                      )
                      .join(', ')})`,
                  }}
                />
              </span>
              <span className="af-flow-name">Todos os fluxos</span>
              <span className="af-flow-count">{flows.length}</span>
            </button>
          </div>
        )}
        {flows.map((f) => (
          <FlowRow
            key={f.id}
            flow={f}
            editing={editingId === f.id}
            onToggleEdit={() => switchEditing(editingId === f.id ? null : f.id)}
          />
        ))}
        {flows.length === 0 && (
          <div className="af-empty-note">
            Fluxos contam a história do diagrama: uma sequência de arestas que anima na ordem, com o
            resto esmaecido. Crie o primeiro com <IcPlus size={10} /> — ou use <b>Automático</b> para
            animar tudo seguindo as setas.
          </div>
        )}
      </div>
    </aside>
  )
}
