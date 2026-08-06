export function uid(prefix = ''): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Debounce simples. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

const FLOW_PALETTE = ['#4caf50', '#42a5f5', '#ab47bc', '#ff9800', '#ef5350', '#26c6da', '#d4e157', '#ec407a']

/** Matiz aproximado (0–360) de um hex; -1 para cinzas. */
function hueOf(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return -1
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 0.08) return -1
  let h = 0
  if (max === r) h = ((g - b) / (max - min)) % 6
  else if (max === g) h = (b - r) / (max - min) + 2
  else h = (r - g) / (max - min) + 4
  return ((h * 60) % 360 + 360) % 360
}

/** Escolhe da paleta a cor mais DISTANTE em matiz das já usadas (evita dois verdes). */
export function nextFlowColor(used: string[]): string {
  const usedHues = used.map(hueOf).filter((h) => h >= 0)
  if (!usedHues.length) return FLOW_PALETTE[0]
  let best = FLOW_PALETTE[0]
  let bestScore = -1
  for (const c of FLOW_PALETTE) {
    if (used.includes(c)) continue
    const h = hueOf(c)
    const minDist = Math.min(...usedHues.map((u) => Math.min(Math.abs(u - h), 360 - Math.abs(u - h))))
    if (minDist > bestScore) {
      bestScore = minDist
      best = c
    }
  }
  return best
}

/** Converte hex → rgba com alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Garante contraste mínimo de uma cor sobre o fundo escuro do canvas:
 * eleva a luminosidade percebida quando a cor é escura demais.
 * Mantém a cor armazenada intacta — só o render usa a variante.
 */
export function onDark(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const MIN = 110
  if (lum >= MIN) return hex.startsWith('#') ? hex : `#${hex}`
  const k = (MIN - lum) / (255 - lum)
  r = Math.round(r + (255 - r) * k)
  g = Math.round(g + (255 - g) * k)
  b = Math.round(b + (255 - b) * k)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
