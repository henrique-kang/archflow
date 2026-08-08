import { useShallow } from 'zustand/react/shallow'
import { IcX } from '../icons/ui'
import { flowPlan } from '../lib/flowPlan'
import { edgeActive, interpolate, whenLabel } from '../lib/vars'
import { onDark } from '../lib/utils'
import type { ArchNodeData } from '../model/types'
import { ALL_AUTO, ALL_FLOWS, useStore } from '../store/store'

/**
 * Inspetor de Pacote: mostra, para o hop corrente do fluxo ativo, o que o nó
 * de destino faz com a mensagem, o payload de exemplo e a nota do hop.
 * Funciona no modo contínuo (segue o pacote) e no passo a passo.
 */
export function InspectorCard() {
  const open = useStore((s) => s.inspectorOpen)
  const setInspector = useStore((s) => s.setInspector)
  const variables = useStore((s) => s.variables)
  const data = useStore(
    useShallow((s) => {
      if (!s.activeFlowId || s.activeFlowId === ALL_FLOWS || s.activeFlowId === ALL_AUTO) return null
      const flow = s.flows.find((f) => f.id === s.activeFlowId)
      if (!flow || !flow.edgeIds.length) return null
      // hops EFETIVOS sob a config atual (variantes por condição)
      const plan = flowPlan(flow, s.edges, s.nodes)
      if (!plan.hops.length) return null
      const index = Math.min(
        s.stepIndex ?? (s.liveHop?.flowId === flow.id ? s.liveHop.index : 0),
        plan.hops.length - 1,
      )
      const edge = s.edges.find((e) => e.id === plan.hops[index].edgeId)
      if (!edge) return null
      const src = s.nodes.find((n) => n.id === edge.source)
      const tgt = s.nodes.find((n) => n.id === edge.target)
      const tgtData = tgt?.data as ArchNodeData | undefined
      const dormant = !!edge.data?.when && !edgeActive(edge, src)
      return {
        dormant,
        whenTag: whenLabel(edge),
        flowName: flow.name,
        flowColor: flow.color,
        payload: flow.payload ?? null,
        index,
        total: plan.hops.length,
        edgeLabel: edge.label != null ? String(edge.label) : null,
        note: (edge.data?.note as string) ?? null,
        srcLabel: (src?.data as ArchNodeData | undefined)?.label ?? edge.source,
        tgtLabel: tgtData?.label ?? edge.target,
        transform: tgtData?.transform ?? null,
        payloadBefore: tgtData?.payloadBefore ?? null,
        payloadAfter: tgtData?.payloadAfter ?? null,
        tech: tgtData?.tech ?? null,
        owner: tgtData?.owner ?? null,
        link: tgtData?.link ?? null,
        down: tgtData?.status === 'down',
      }
    }),
  )

  if (!open || !data) return null
  const t = (s: string) => interpolate(s, variables)

  return (
    <div className="af-inspector" role="complementary" aria-label="Inspetor de pacote">
      <div className="af-panel-header">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span className="af-flow-dot" style={{ background: onDark(data.flowColor) }} />
          Inspetor · hop {data.index + 1}/{data.total}
        </span>
        <button className="af-btn is-icon" onClick={() => setInspector(false)} title="Fechar inspetor">
          <IcX size={12} />
        </button>
      </div>
      <div className="af-inspector-body">
        <div style={{ fontWeight: 600 }}>
          {t(data.srcLabel)} <span style={{ color: 'var(--ink-faint)' }}>→</span> {t(data.tgtLabel)}
          {data.down && <span style={{ color: '#ef5350', marginLeft: 6 }}>(fora do ar)</span>}
        </div>
        {data.edgeLabel && (
          <div style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 10.5, marginTop: 2 }}>
            {t(data.edgeLabel)}
          </div>
        )}
        {data.dormant && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 9px',
              borderRadius: 7,
              background: 'oklch(0.75 0.13 70 / 0.12)',
              border: '1px solid oklch(0.75 0.13 70 / 0.4)',
              color: '#ffb74d',
              fontSize: 11.5,
            }}
          >
            ⚠ Hop dormente: a condição <span style={{ fontFamily: 'var(--font-mono)' }}>{data.whenTag}</span> não
            vale com a config atual — este caminho não acontece. Alterne a flag no nó de origem para vê-lo fluir.
          </div>
        )}
        {data.note && (
          <div className="af-inspector-section">
            <div className="t">Nota do hop</div>
            <div style={{ color: 'var(--ink-muted)' }}>{t(data.note)}</div>
          </div>
        )}
        {data.transform && (
          <div className="af-inspector-section">
            <div className="t">O que {t(data.tgtLabel)} faz</div>
            <div style={{ color: 'var(--ink-muted)' }}>{t(data.transform)}</div>
          </div>
        )}
        {data.payloadBefore || data.payloadAfter ? (
          <>
            {data.payloadBefore && (
              <div className="af-inspector-section">
                <div className="t">Payload — antes</div>
                <pre>{t(data.payloadBefore)}</pre>
              </div>
            )}
            {data.payloadAfter && (
              <div className="af-inspector-section">
                <div className="t">Payload — depois</div>
                <pre>{t(data.payloadAfter)}</pre>
              </div>
            )}
          </>
        ) : (
          data.payload && (
            <div className="af-inspector-section">
              <div className="t">Payload do fluxo</div>
              <pre>{t(data.payload)}</pre>
            </div>
          )
        )}
        {(data.tech || data.owner || data.link) && (
          <div className="af-inspector-section">
            <div className="t">Ficha técnica</div>
            {data.tech && <div className="af-hint-row"><span>Tecnologia</span><span>{data.tech}</span></div>}
            {data.owner && <div className="af-hint-row"><span>Owner</span><span>{data.owner}</span></div>}
            {data.link && /^https?:\/\//i.test(data.link) && (
              <div className="af-hint-row">
                <span>Link</span>
                <a href={data.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                  abrir ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
