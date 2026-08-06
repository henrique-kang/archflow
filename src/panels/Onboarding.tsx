import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import '../styles/onboarding.css'

const KEY = 'archflow.onboarded.v1'
const MARGIN = 12

interface Step {
  anchor: string
  /** onde o card fica em relação à âncora */
  place: 'right' | 'center' | 'below'
  /** expansão (+) ou retração (−) do anel em relação ao rect da âncora */
  inset: number
  title: string
  text: string
}

const STEPS: Step[] = [
  {
    anchor: '.af-sidebar',
    place: 'right',
    inset: 0,
    title: 'Fluxos contam a história',
    text: 'Clique num fluxo para animá-lo: o caminho acende hop a hop e o resto esmaece. «Todos os fluxos» anima tudo.',
  },
  {
    anchor: '.af-canvas-wrap',
    place: 'center',
    inset: -14,
    title: 'Dobre as linhas como no draw.io',
    text: 'Selecione uma aresta e arraste um segmento para criar uma dobra. Arraste os quadrados para ajustar; duplo-clique remove.',
  },
  {
    anchor: '.af-btn.is-primary',
    place: 'below',
    inset: 5,
    title: 'Modo apresentação',
    text: 'Tela cheia, sem painéis — só o diagrama e o seletor de fluxos. Feito para projetar em reunião.',
  },
]

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** Tour de primeira execução: coach-marks ancorados nos elementos-chave da UI. */
export function Onboarding() {
  const [done, setDone] = useState(() => localStorage.getItem(KEY) !== null)
  const [step, setStep] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const focusedStep = useRef(-1)

  const finish = useCallback(() => {
    localStorage.setItem(KEY, '1')
    setDone(true)
  }, [])

  // avança para o primeiro passo a partir de `from` cuja âncora existe no DOM
  const advance = useCallback(
    (from: number) => {
      for (let i = from; i < STEPS.length; i++) {
        if (document.querySelector(STEPS[i].anchor)) {
          setStep(i)
          return
        }
      }
      finish()
    },
    [finish],
  )

  useEffect(() => {
    if (!done && step < 0) advance(0)
  }, [done, step, advance])

  // mede a âncora do passo atual; re-mede em resize
  useEffect(() => {
    if (done || step < 0) return
    const measure = () => {
      const el = document.querySelector(STEPS[step].anchor)
      if (el) setRect(el.getBoundingClientRect())
      else advance(step + 1)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [done, step, advance])

  useEffect(() => {
    if (done) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, finish])

  // posiciona o card com o tamanho real medido, antes do paint
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !rect || step < 0) return
    const s = STEPS[step]
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    let left: number
    let top: number
    if (s.place === 'right') {
      left = rect.right + 18
      top = rect.top + 76
    } else if (s.place === 'center') {
      left = rect.left + rect.width / 2 - cw / 2
      top = rect.top + rect.height / 2 - ch / 2
    } else {
      left = rect.right - cw
      top = rect.bottom + 14
    }
    card.style.left = `${clamp(left, MARGIN, window.innerWidth - cw - MARGIN)}px`
    card.style.top = `${clamp(top, MARGIN, window.innerHeight - ch - MARGIN)}px`
    if (focusedStep.current !== step) {
      focusedStep.current = step
      nextRef.current?.focus()
    }
  }, [rect, step])

  if (done || step < 0 || !rect) return null

  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const ring = {
    left: rect.left - s.inset,
    top: rect.top - s.inset,
    width: rect.width + s.inset * 2,
    height: rect.height + s.inset * 2,
  }

  return (
    <>
      <div className="af-onb-ring" style={ring} />
      <div
        key={step}
        ref={cardRef}
        className="af-onb-card"
        role="dialog"
        aria-label={`Tour de introdução — passo ${step + 1} de ${STEPS.length}: ${s.title}`}
      >
        <div className="af-onb-step">
          {step + 1}/{STEPS.length}
        </div>
        <h2 className="af-onb-title">{s.title}</h2>
        <p className="af-onb-text">{s.text}</p>
        <div className="af-onb-footer">
          <div className="af-onb-dots" aria-hidden="true">
            {STEPS.map((st, i) => (
              <span key={st.anchor} className={`af-onb-dot${i === step ? ' is-active' : ''}`} />
            ))}
          </div>
          <div className="af-onb-actions">
            <button className="af-onb-btn" onClick={finish}>
              Pular
            </button>
            <button
              ref={nextRef}
              className="af-onb-btn is-primary"
              onClick={() => (last ? finish() : advance(step + 1))}
            >
              {last ? 'Começar' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
