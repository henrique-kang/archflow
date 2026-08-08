import { ViewportPortal } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { flowPlan, type FlowPlan } from '../lib/flowPlan'
import { onDark, withAlpha } from '../lib/utils'
import type { XY } from '../model/types'
import { AUTO_EDGE_COLOR as AUTO_COLOR } from '../model/types'
import { ALL_AUTO, ALL_FLOWS, useStore } from '../store/store'
import { absRect } from './geometry'

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
 * por onde passam. No modo automático, clicar num nó dispara um evento que
 * cascateia seguindo as setas, respeitando condições (`when` × vars do nó),
 * consultas de config (round-trip visual) e nós fora do ar (✕).
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
  const nodes = useStore((s) => s.nodes)
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

  const edgeWeight = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of edges) m.set(e.id, e.data?.weight ?? 1)
    return m
  }, [edges])

  /** plano efetivo por fluxo ativo (variantes por condição + barreiras). */
  const plans = useMemo(() => {
    const m = new Map<string, FlowPlan>()
    for (const f of animFlows) m.set(f.id, flowPlan(f, edges, nodes))
    return m
  }, [animFlows, edges, nodes])

  /** centros absolutos dos nós (para os round-trips de consulta). */
  const nodeCenter = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const m = new Map<string, XY>()
    for (const n of nodes) {
      const r = absRect(n, byId)
      m.set(n.id, { x: r.x + r.w / 2, y: r.y + r.h / 2 })
    }
    return m
  }, [nodes])

  /** chaves dos pacotes a renderizar. */
  const packets = useMemo(() => {
    const list: { key: string; color: string; lookup?: boolean; clickable?: boolean }[] = []
    if (auto) {
      for (const p of pulses) {
        p.phases.forEach((ph, i) => {
          for (const eid of ph.edges)
            list.push({ key: `${p.id}:${eid}`, color: edgeColor.get(eid) ?? onDark(AUTO_COLOR) })
          ph.lookups.forEach((_, j) =>
            list.push({ key: `${p.id}:lk:${i}:${j}`, color: '#7fb3e8', lookup: true }),
          )
        })
      }
      return list
    }
    for (const f of animFlows) list.push({ key: f.id, color: onDark(f.color), clickable: true })
    return list
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
    const all = new Set(pulses.flatMap((p) => p.phases.flatMap((ph) => ph.edges)))
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

    const setDead = (key: string, dead: boolean) => {
      const el = packetRefs.current.get(key)
      if (el) el.classList.toggle('is-dead', dead)
    }

    const setBlocked = (key: string, blocked: boolean) => {
      const el = packetRefs.current.get(key)
      if (el) el.classList.toggle('is-blocked', blocked)
    }

    const place = (key: string, edgeId: string | null, off: number) => {
      const el = packetRefs.current.get(key)
      if (!el) return
      if (!edgeId) {
        el.style.opacity = '0'
        el.classList.remove('is-dead')
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

    const placeAt = (key: string, pos: XY | null) => {
      const el = packetRefs.current.get(key)
      if (!el) return
      if (!pos) {
        el.style.opacity = '0'
        return
      }
      el.style.opacity = '1'
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`
    }

    const byId = new Map(edges.map((e) => [e.id, e]))
    const effLen = (eid: string) => (getPath(eid)?.len ?? 0) * (edgeWeight.get(eid) ?? 1)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      if (auto) {
        // eventos disparados por clique: fases de consulta e ondas de arestas
        const activeEdges = new Set<string>()
        const finished: string[] = []
        for (const pulse of pulses) {
          const durations = pulse.phases.map((ph) => {
            if (ph.lookups.length) return 0.9 / speed
            let maxEff = 0
            for (const eid of ph.edges) maxEff = Math.max(maxEff, effLen(eid))
            return Math.min(2.5, Math.max(0.7, maxEff / 300)) / speed
          })
          const GAP = 0.1 / speed
          const total = durations.reduce((a, b) => a + b + GAP, 0)
          let t = progress.current.get(pulse.id) ?? 0
          if (playing) t += dt
          progress.current.set(pulse.id, t)
          if (t >= total) {
            finished.push(pulse.id)
            pulse.phases.forEach((ph, i) => {
              for (const eid of ph.edges) place(`${pulse.id}:${eid}`, null, 0)
              ph.lookups.forEach((_, j) => placeAt(`${pulse.id}:lk:${i}:${j}`, null))
            })
            continue
          }
          let acc = 0
          for (let k = 0; k < pulse.phases.length; k++) {
            const ph = pulse.phases[k]
            const dur = durations[k]
            const local = t - acc
            const active = local >= 0 && local < dur
            const phaseFrac = active ? local / dur : 0

            if (ph.lookups.length) {
              ph.lookups.forEach((lk, j) => {
                const key = `${pulse.id}:lk:${k}:${j}`
                if (!active) {
                  placeAt(key, null)
                  return
                }
                const a = nodeCenter.get(lk.from)
                const b = nodeCenter.get(lk.to)
                if (!a || !b) return
                // ida e volta: nó → origem da config → nó
                const f = phaseFrac < 0.5 ? phaseFrac * 2 : (1 - phaseFrac) * 2
                placeAt(key, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })
                if (phaseFrac > 0.4 && phaseFrac < 0.6) heat(lk.to, '#7fb3e8', now)
              })
              acc += dur + GAP
              continue
            }

            const maxEff = ph.edges.reduce((m, eid) => Math.max(m, effLen(eid)), 0) || 1
            for (const eid of ph.edges) {
              const key = `${pulse.id}:${eid}`
              const p = getPath(eid)
              const len = p?.len ?? 0
              if (active && p) {
                activeEdges.add(eid)
                // aresta mais "pesada" leva mais tempo dentro da onda
                const own = Math.max(0.05, effLen(eid) / maxEff)
                const frac = Math.min(1, phaseFrac / own)
                const off = frac * len
                place(key, eid, off)
                const e = byId.get(eid)
                const color = edgeColor.get(eid) ?? onDark(AUTO_COLOR)
                const dead = ph.deadEnds.includes(eid)
                if (e) {
                  if (off < HEAT_RADIUS) heat(e.source, color, now)
                  if (off > len - HEAT_RADIUS) heat(e.target, dead ? '#ef5350' : color, now)
                }
                setDead(key, dead && frac > 0.9)
              } else if (ph.deadEnds.includes(eid) && local >= dur && p) {
                // pacote morto fica cravado com ✕ no nó fora do ar até o fim do evento
                place(key, eid, p.len)
                setDead(key, true)
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
          // plano efetivo: variantes por condição, com possível barreira no fim
          const plan = plans.get(flow.id) ?? { hops: [], blockedAt: null, skipped: new Map() }
          const hopIds = plan.hops.map((h) => h.edgeId)

          // modo passo a passo: o pacote circula apenas no hop atual
          if (stepIndex !== null && animFlows.length === 1) {
            if (!hopIds.length) {
              place(flow.id, null, 0)
              continue
            }
            const idx = Math.min(stepIndex, hopIds.length - 1)
            const eid = hopIds[idx]
            const p = getPath(eid)
            if (!p || p.len === 0) {
              place(flow.id, null, 0)
              continue
            }
            // barreira: hop dormente sem alternativa — não flui
            if (plan.blockedAt === idx) {
              place(flow.id, eid, 0)
              setBlocked(flow.id, true)
              continue
            }
            setBlocked(flow.id, false)
            const w = edgeWeight.get(eid) ?? 1
            const cycle = p.len + 90
            let pos = progress.current.get(flow.id) ?? 0
            pos = (pos + dt * (p.len / (Math.max(1.2, targetDuration(p.len * w) / 2) * w)) * speed) % cycle
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

          // espaço "efetivo": comprimento × peso (hop pesado = mais lento)
          const paths = hopIds.map(getPath)
          const blockedIndex = plan.blockedAt ?? -1
          let effTotal = 0
          for (let i = 0; i < paths.length; i++) {
            if (blockedIndex >= 0 && i >= blockedIndex) break
            effTotal += (paths[i]?.len ?? 0) * (edgeWeight.get(hopIds[i]) ?? 1)
          }
          if (effTotal === 0) {
            if (blockedIndex >= 0) {
              // bloqueado já no primeiro hop
              place(flow.id, hopIds[blockedIndex], 0)
              setBlocked(flow.id, true)
              if (animFlows.length === 1)
                useStore.getState().setLiveHop({ flowId: flow.id, index: blockedIndex })
            } else {
              place(flow.id, null, 0)
            }
            continue
          }
          const velocity = (effTotal / targetDuration(effTotal)) * speed
          const hold = blockedIndex >= 0 ? velocity * 1.6 : velocity * 0.8
          const cycle = effTotal + hold
          let pos = progress.current.get(flow.id) ?? 0
          if (playing) pos = (pos + dt * velocity) % cycle
          progress.current.set(flow.id, pos)
          if (pos >= effTotal) {
            if (blockedIndex >= 0) {
              // segura no início do hop dormente, marcado com ⚠
              place(flow.id, hopIds[blockedIndex], 0)
              setBlocked(flow.id, true)
              if (animFlows.length === 1)
                useStore.getState().setLiveHop({ flowId: flow.id, index: blockedIndex })
            } else {
              place(flow.id, null, 0)
            }
            continue
          }
          setBlocked(flow.id, false)
          let off = pos
          let placed = false
          for (let i = 0; i < paths.length; i++) {
            const p = paths[i]
            if (!p) continue
            const w = edgeWeight.get(hopIds[i]) ?? 1
            const eff = p.len * w
            if (off <= eff) {
              const realOff = off / w
              place(flow.id, hopIds[i], realOff)
              if (animFlows.length === 1)
                useStore.getState().setLiveHop({ flowId: flow.id, index: i })
              const e = byId.get(hopIds[i])
              if (e) {
                if (realOff < HEAT_RADIUS) heat(e.source, color, now)
                if (realOff > p.len - HEAT_RADIUS) heat(e.target, color, now)
              }
              placed = true
              break
            }
            off -= eff
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
  }, [animFlows, pulses, auto, playing, speed, stepIndex, reduced, edges, edgeColor, edgeWeight, nodeCenter, plans])

  // saiu do modo auto ou acabaram os eventos → limpa o realce das arestas
  useEffect(() => {
    if ((!auto || pulses.length === 0) && lastPulseEdgesKey.current !== '') {
      lastPulseEdgesKey.current = ''
      useStore.getState().setPulseEdges(new Set())
    }
  }, [auto, pulses])

  // hop ao vivo só faz sentido com um fluxo único ativo
  useEffect(() => {
    if (animFlows.length !== 1) useStore.getState().setLiveHop(null)
  }, [animFlows])

  // as escalas de progresso do modo passo e do contínuo são diferentes — zera ao alternar
  useEffect(() => {
    progress.current.clear()
  }, [stepIndex === null])

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
          className={`af-packet${p.lookup ? ' is-lookup' : ''}${p.clickable ? ' is-clickable' : ''}`}
          onClick={p.clickable ? () => useStore.getState().setInspector(true) : undefined}
          title={p.clickable ? 'Inspecionar pacote' : undefined}
          style={{
            background: p.color,
            boxShadow: `0 0 10px 3px ${withAlpha(p.color.startsWith('var') ? '#7fb3e8' : p.color, 0.5)}, 0 0 3px ${withAlpha(p.color.startsWith('var') ? '#7fb3e8' : p.color, 0.9)}`,
            opacity: 0,
          }}
        />
      ))}
    </ViewportPortal>
  )
}
