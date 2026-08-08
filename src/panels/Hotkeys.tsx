import { useReactFlow } from '@xyflow/react'
import { useEffect } from 'react'
import { flowPlan } from '../lib/flowPlan'
import { ALL_AUTO, ALL_FLOWS, redo, undo, useStore } from '../store/store'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

/** Atalhos globais de teclado (renderiza nada). */
export function Hotkeys() {
  const { fitView } = useReactFlow()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()

      // undo/redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return
        e.preventDefault()
        undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (isTyping(e.target)) return
        e.preventDefault()
        redo()
        return
      }

      // bloquear/desbloquear seleção
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && !isTyping(e.target)) {
        const selected = st.nodes.filter((n) => n.selected).map((n) => n.id)
        if (selected.length) {
          e.preventDefault()
          st.toggleLock(selected)
        }
        return
      }

      // apresentação: F5 ou Ctrl+.
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === '.')) {
        e.preventDefault()
        const next = !st.presentation
        st.setPresentation(next)
        if (next) {
          document.documentElement.requestFullscreen?.().catch(() => {})
          setTimeout(() => fitView({ padding: 0.1, duration: 350 }), 120)
        } else if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {})
        }
        return
      }

      // enquadrar
      if (e.shiftKey && e.key === '!' && !isTyping(e.target)) {
        e.preventDefault()
        fitView({ padding: 0.12, duration: 300 })
        return
      }
      if (e.shiftKey && e.code === 'Digit1' && !isTyping(e.target)) {
        e.preventDefault()
        fitView({ padding: 0.12, duration: 300 })
        return
      }

      if (e.key === 'Escape') {
        if (st.stepIndex !== null) {
          st.setStep(null)
          return
        }
        if (st.pickingFlowId) {
          st.setPicking(null)
          return
        }
        if (st.presentation) {
          st.setPresentation(false)
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
        }
        return
      }

      // play/pause
      if (e.key === ' ' && !isTyping(e.target) && st.activeFlowId) {
        e.preventDefault()
        st.setPlaying(!st.playing)
        return
      }

      // apresentação: 1–9 seleciona fluxo, 0 = todos, A = automático, ←/→ passo a passo
      if (st.presentation && !isTyping(e.target)) {
        if (/^[1-9]$/.test(e.key)) {
          const flow = st.flows[Number(e.key) - 1]
          if (flow) st.setActiveFlow(st.activeFlowId === flow.id ? null : flow.id)
          return
        }
        if (e.key === '0') {
          st.setActiveFlow(st.activeFlowId === ALL_FLOWS ? null : ALL_FLOWS)
          return
        }
        if (e.key.toLowerCase() === 'a') {
          st.setActiveFlow(st.activeFlowId === ALL_AUTO ? null : ALL_AUTO)
          return
        }
      }
      if (
        (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
        !isTyping(e.target) &&
        st.activeFlowId &&
        st.activeFlowId !== ALL_FLOWS &&
        st.activeFlowId !== ALL_AUTO &&
        (st.presentation || st.stepIndex !== null)
      ) {
        const flow = st.flows.find((f) => f.id === st.activeFlowId)
        // limites pelo caminho EFETIVO (variantes por condição)
        const planLen = flow ? flowPlan(flow, st.edges, st.nodes).hops.length : 0
        if (flow && planLen) {
          e.preventDefault()
          const cur = st.stepIndex
          if (e.key === 'ArrowRight') st.setStep(cur === null ? 0 : Math.min(planLen - 1, cur + 1))
          else st.setStep(cur === null ? planLen - 1 : Math.max(0, cur - 1))
          return
        }
      }

      // nudge com setas (edição)
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
        !isTyping(e.target) &&
        !st.presentation
      ) {
        const selected = st.nodes.filter((n) => n.selected && n.draggable !== false)
        if (!selected.length) return
        e.preventDefault()
        const step = e.shiftKey ? 1 : 8
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        st.onNodesChange(
          selected.map((n) => ({
            type: 'position' as const,
            id: n.id,
            position: { x: n.position.x + dx, y: n.position.y + dy },
          })),
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView])

  return null
}
