import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { IcEye, IcLayers, IcPause, IcPlay, IcX } from '../icons/ui'
import { flowPlan } from '../lib/flowPlan'
import { toast } from '../lib/toast'
import { onDark } from '../lib/utils'
import { ALL_AUTO, ALL_FLOWS, useStore } from '../store/store'

/** Barra flutuante do modo apresentação: fluxos, transporte, passo a passo e saída. */
export function PresentBar() {
  const { flows, activeFlowId, playing, speed, stepIndex } = useStore(
    useShallow((s) => ({
      flows: s.flows,
      activeFlowId: s.activeFlowId,
      playing: s.playing,
      speed: s.speed,
      stepIndex: s.stepIndex,
    })),
  )
  const { setActiveFlow, setPlaying, setSpeed, setPresentation, setStep, setInspector } = useStore(
    useShallow((s) => ({
      setActiveFlow: s.setActiveFlow,
      setPlaying: s.setPlaying,
      setSpeed: s.setSpeed,
      setPresentation: s.setPresentation,
      setStep: s.setStep,
      setInspector: s.setInspector,
    })),
  )
  const inspectorOpen = useStore((s) => s.inspectorOpen)
  const scenarios = useStore((s) => s.scenarios)
  const applyScenario = useStore((s) => s.applyScenario)
  const [scOpen, setScOpen] = useState(false)
  // total de hops EFETIVOS (variantes por condição)
  const planLen = useStore((s) => {
    const f = s.flows.find((f) => f.id === s.activeFlowId)
    return f ? flowPlan(f, s.edges, s.nodes).hops.length : 0
  })
  const activeFlow = flows.find((f) => f.id === activeFlowId)

  const exit = () => {
    setPresentation(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  return (
    <div className="af-presentbar">
      {flows.map((f) => (
        <button
          key={f.id}
          className={`af-chip${activeFlowId === f.id ? ' is-active' : ''}`}
          style={{ '--chip-color': onDark(f.color) } as React.CSSProperties}
          onClick={() => setActiveFlow(activeFlowId === f.id ? null : f.id)}
        >
          <span className="dot" style={{ background: onDark(f.color) }} />
          {f.name}
        </button>
      ))}
      {flows.length > 1 && (
        <button
          className={`af-chip${activeFlowId === ALL_FLOWS ? ' is-active' : ''}`}
          onClick={() => setActiveFlow(activeFlowId === ALL_FLOWS ? null : ALL_FLOWS)}
        >
          Todos
        </button>
      )}
      <button
        className={`af-chip${activeFlowId === ALL_AUTO ? ' is-active' : ''}`}
        onClick={() => setActiveFlow(activeFlowId === ALL_AUTO ? null : ALL_AUTO)}
        title="Segue as setas automaticamente"
      >
        Auto
      </button>
      {scenarios.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            className={`af-chip${scOpen ? ' is-active' : ''}`}
            onClick={() => setScOpen((v) => !v)}
            title="Aplicar um cenário (variáveis, configs e estados)"
          >
            <IcLayers size={12} /> Cenário
          </button>
          {scOpen && (
            <div
              className="af-menu"
              style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: 0, minWidth: 230 }}
            >
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => {
                    applyScenario(sc.id)
                    toast(`Cenário aplicado: ${sc.name}`)
                    setScOpen(false)
                  }}
                >
                  {sc.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="af-divider" />
      {activeFlow && (
        <>
          <button
            className={`af-btn is-icon${inspectorOpen ? ' is-active' : ''}`}
            title="Inspetor de pacote"
            onClick={() => setInspector(!inspectorOpen)}
          >
            <IcEye size={14} />
          </button>
          <button
            className="af-btn is-icon"
            title="Hop anterior (←)"
            onClick={() => setStep(stepIndex === null ? 0 : Math.max(0, stepIndex - 1))}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 11,
              color: stepIndex !== null ? 'var(--ink)' : 'var(--ink-faint)',
              minWidth: 52,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {stepIndex !== null ? `hop ${Math.min(stepIndex + 1, planLen)}/${planLen}` : 'contínuo'}
          </span>
          <button
            className="af-btn is-icon"
            title="Próximo hop (→)"
            onClick={() => setStep(stepIndex === null ? 0 : Math.min(planLen - 1, stepIndex + 1))}
          >
            ›
          </button>
          <div className="af-divider" />
        </>
      )}
      <button
        className="af-btn is-icon"
        onClick={() => setPlaying(!playing)}
        disabled={!activeFlowId}
        title={playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
      >
        {playing ? <IcPause /> : <IcPlay />}
      </button>
      <input
        type="range"
        className="af-range"
        style={{ width: 90 }}
        min={0.5}
        max={4}
        step={0.25}
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        aria-label="Velocidade da animação"
        disabled={!activeFlowId}
      />
      <span style={{ fontSize: 11, color: 'var(--ink-faint)', width: 30, textAlign: 'right' }}>
        {speed.toFixed(2).replace(/\.?0+$/, '')}×
      </span>
      <div className="af-divider" />
      <button className="af-btn is-icon" onClick={exit} title="Sair da apresentação (Esc)">
        <IcX />
      </button>
    </div>
  )
}
