import { ViewportPortal } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { onDark, withAlpha } from '../lib/utils'
import { AUTO_EDGE_COLOR as AUTO_COLOR } from '../model/types'
import { ALL_AUTO, ALL_FLOWS, useStore } from '../store/store'

/** distância (px) do terminal em que o nó "esquenta" quando o pacote passa. */
const HEAT_RADIUS = 26

/** Duração-alvo de um ciclo em função do comprimento (fluxos longos não viram novela). */
function targetDuration(len: number): number {
  return Math.min(12, Math.max(4, len / 260))
}

interface PathCache {
  d: string
  len: number
  el: SVGPathElement
}

/**
 * Pacotes que percorrem o caminho exato das arestas, com highlight dos nós
 * por onde passam (estilo Syncitect). No modo automático, nada anima sozinho:
 * clicar num nó dispara um evento que cascateia seguindo as setas.
 * Atualização imperativa via rAF — sem re-render por frame.
 */
export function FlowPackets() {
  const { activeFlowId, playing, speed, stepIndex } = useStore(
    useShallow((s) => ({
      activeFlowId: s.activeFlowId,
      playing: s.playing,
      speed: s.speed,
      stepIndex: s.stepIndex,
    })),
  )
  const flows = useStore((s) => s.flows)
  const edges = useStore((s) => s.edges)
  const pulses = useStore((s) => s.pulses)

  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const auto = activeFlowId === ALL_AUTO

  const animFlows = useMemo(() => {
    if (!activeFlowId || auto) return []
    const list = activeFlowId === ALL_FLOWS ? flows : flows.filter((f) => f.id === activeFlowId)
    return list.filter((f) => f.edgeIds.length > 0)
  }, [activeFlowId, auto, flows])

  const edgeColor = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of edges) m.set(e.id, onDark((e.data?.color as string) || AUTO_COLOR))
    return m
  }, [edges])

  /** chaves dos pacotes a renderizar: fluxo (modos normais) ou evento×aresta (auto). */
  const packets = useMemo(() => {
    if (auto)
      return pulses.flatMap((p) =>
        p.waves.flat().map((eid) => ({ key: `${p.id}:${eid}`, color: edgeColor.get(eid) ?? onDark(AUTO_COLOR) })),
      )
    return animFlows.map((f) => ({ key: f.id, color: onDark(f.color) }))
  }, [auto, pulses, animFlows, edgeColor])

  const packetRefs = useRef(new Map<string, HTMLDivElement>())
  const progress = useRef(new Map<string, number>())
  const pathCache = useRef(new Map<string, PathCache>())
  const hotUntil = useRef(new Map<string, number>())
  const lastPulseEdgesKey = useRef('')

  // modo reduzido: o evento vira um realce estático breve, sem movimento
  useEffect(() => {
    if (!reduced || !auto || pulses.length === 0) return
    const st = useStore.getState()
    const all = new Set(pulses.flatMap((p) => p.waves.flat()))
    st.setPulseEdges(all)
    const t = setTimeout(() => {
      const cur = useStore.getState()
      for (const p of pulses) cur.endPulse(p.id)
      cur.setPulseEdges(new Set())
    }, 1800)
    return () => clearTimeout(t)
  }, [reduced, auto, pulses])

  useEffect(() => {
    if (reduced || packets.length === 0) return
    let raf = 0
    let last = performance.now()
    const cache = pathCache.current
    const alive = new Set(edges.map((e) => e.id))
    for (const key of [...cache.keys()]) {
      if (!alive.has(key)) cache.delete(key)
    }

    const getPath = (edgeId: string): PathCache | null => {
      const el = document.getElementById(`af-path-${edgeId}`) as SVGPathElement | null
      if (!el) return null
      const d = el.getAttribute('d') ?? ''
      const hit = cache.get(edgeId)
      if (hit && hit.d === d && hit.el === el) return hit
      const entry = { d, len: el.getTotalLength(), el }
      cache.set(edgeId, entry)
      return entry
    }

    // CSS.escape: ids vêm do YAML e podem conter aspas/colchetes
    const nodeEl = (nodeId: string) =>
      document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`) as HTMLElement | null

    const heat = (nodeId: string, color: string, now: number) => {
      const el = nodeEl(nodeId)
      if (!el) return
      if (!el.classList.contains('af-hot')) el.classList.add('af-hot')
      el.style.setProperty('--hot', color)
      el.style.setProperty('--hot-glow', withAlpha(color, 0.4))
      hotUntil.current.set(nodeId, now + 420)
    }

    const sweepHeat = (now: number) => {
      for (const [nodeId, until] of hotUntil.current) {
        if (now > until) {
          hotUntil.current.delete(nodeId)
          nodeEl(nodeId)?.classList.remove('af-hot')
        }
      }
    }

    const place = (key: string, edgeId: string | null, off: number) => {
      const el = packetRefs.current.get(key)
      if (!el) return
      if (!edgeId) {
        el.style.opacity = '0'
        return
      }
      const p = getPath(edgeId)
      if (!p || p.len === 0) {
        el.style.opacity = '0'
        return
      }
      const pt = p.el.getPointAtLength(Math.min(off, p.len))
      el.style.opacity = '1'
      el.style.transform = `translate(${pt.x}px, ${pt.y}px)`
    }

    const byId = new Map(edges.map((e) => [e.id, e]))

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      if (auto) {
        // eventos disparados por clique: cada pulse cascateia em ondas
        const activeEdges = new Set<string>()
        const finished: string[] = []
        for (const pulse of pulses) {
          const durations = pulse.waves.map((w) => {
            let maxLen = 0
            for (const eid of w) maxLen = Math.max(maxLen, getPath(eid)?.len ?? 0)
            return Math.min(2.5, Math.max(0.7, maxLen / 300)) / speed
          })
          const GAP = 0.1 / speed
          const total = durations.reduce((a, b) => a + b + GAP, 0)
          let t = progress.current.get(pulse.id) ?? 0
          if (playing) t += dt
          progress.current.set(pulse.id, t)
          if (t >= total) {
            finished.push(pulse.id)
            for (const w of pulse.waves) for (const eid of w) place(`${pulse.id}:${eid}`, null, 0)
            continue
          }
          let acc = 0
          for (let k = 0; k < pulse.waves.length; k++) {
            const dur = durations[k]
            const local = t - acc
            const active = local >= 0 && local < dur
            const frac = active ? local / dur : 0
            for (const eid of pulse.waves[k]) {
              const key = `${pulse.id}:${eid}`
              const p = getPath(eid)
              const len = p?.len ?? 0
              if (active && p) {
                activeEdges.add(eid)
                const off = frac * len
                place(key, eid, off)
                const e = byId.get(eid)
                const color = edgeColor.get(eid) ?? onDark(AUTO_COLOR)
                if (e) {
                  if (off < HEAT_RADIUS) heat(e.source, color, now)
                  if (off > len - HEAT_RADIUS) heat(e.target, color, now)
                }
              } else {
                place(key, null, 0)
              }
            }
            acc += dur + GAP
          }
        }
        // publica o conjunto de arestas ativas só quando muda (fronteiras de onda)
        const edgesKey = [...activeEdges].sort().join(',')
        if (edgesKey !== lastPulseEdgesKey.current) {
          lastPulseEdgesKey.current = edgesKey
          useStore.getState().setPulseEdges(activeEdges)
        }
        if (finished.length) {
          const st = useStore.getState()
          for (const id of finished) {
            progress.current.delete(id)
            st.endPulse(id)
          }
        }
      } else {
        for (const flow of animFlows) {
          const color = onDark(flow.color)
          // modo passo a passo: o pacote circula apenas no hop atual
          if (stepIndex !== null && animFlows.length === 1) {
            const eid = flow.edgeIds[Math.min(stepIndex, flow.edgeIds.length - 1)]
            const p = eid ? getPath(eid) : null
            if (!p || p.len === 0) {
              place(flow.id, null, 0)
              continue
            }
            const cycle = p.len + 90
            let pos = progress.current.get(flow.id) ?? 0
            pos = (pos + dt * (p.len / Math.max(1.2, targetDuration(p.len) / 2)) * speed) % cycle
            progress.current.set(flow.id, pos)
            if (pos >= p.len) {
              place(flow.id, null, 0)
            } else {
              place(flow.id, eid, pos)
              const e = byId.get(eid)
              if (e) {
                if (pos < HEAT_RADIUS) heat(e.source, color, now)
                if (pos > p.len - HEAT_RADIUS) heat(e.target, color, now)
              }
            }
            continue
          }

          const paths = flow.edgeIds.map(getPath)
          let total = 0
          for (const p of paths) total += p?.len ?? 0
          if (total === 0) {
            place(flow.id, null, 0)
            continue
          }
          const velocity = (total / targetDuration(total)) * speed
          const cycle = total + velocity * 0.8
          let pos = progress.current.get(flow.id) ?? 0
          if (playing) pos = (pos + dt * velocity) % cycle
          progress.current.set(flow.id, pos)
          if (pos >= total) {
            place(flow.id, null, 0)
            continue
          }
          let off = pos
          let placed = false
          for (let i = 0; i < paths.length; i++) {
            const p = paths[i]
            if (!p) continue
            if (off <= p.len) {
              place(flow.id, flow.edgeIds[i], off)
              const e = byId.get(flow.edgeIds[i])
              if (e) {
                if (off < HEAT_RADIUS) heat(e.source, color, now)
                if (off > p.len - HEAT_RADIUS) heat(e.target, color, now)
              }
              placed = true
              break
            }
            off -= p.len
          }
          if (!placed) place(flow.id, null, 0)
        }
      }

      sweepHeat(now)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      for (const nodeId of hotUntil.current.keys()) {
        try {
          document
            .querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`)
            ?.classList.remove('af-hot')
        } catch {
          // seletor inválido não pode derrubar o unmount
        }
      }
      hotUntil.current.clear()
    }
  }, [animFlows, pulses, auto, playing, speed, stepIndex, reduced, edges, edgeColor])

  // saiu do modo auto ou acabaram os eventos → limpa o realce das arestas
  useEffect(() => {
    if ((!auto || pulses.length === 0) && lastPulseEdgesKey.current !== '') {
      lastPulseEdgesKey.current = ''
      useStore.getState().setPulseEdges(new Set())
    }
  }, [auto, pulses])

  if (reduced || packets.length === 0) return null

  return (
    <ViewportPortal>
      {packets.map((p) => (
        <div
          key={p.key}
          ref={(el) => {
            if (el) packetRefs.current.set(p.key, el)
            else packetRefs.current.delete(p.key)
          }}
          className="af-packet"
          style={{
            background: p.color,
            boxShadow: `0 0 10px 3px ${withAlpha(p.color, 0.5)}, 0 0 3px ${withAlpha(p.color, 0.9)}`,
            opacity: 0,
          }}
        />
      ))}
    </ViewportPortal>
  )
}
