import { computeAnchorShifts } from '../canvas/edges/anchors'
import { glyphPaths } from '../icons/glyphs'
import { onDark, withAlpha } from '../lib/utils'
import type { ArchNodeData, GroupNodeData, Side } from '../model/types'
import { AUTO_EDGE_COLOR, defaultIconFor, typeColor } from '../model/types'
import { routePoints, roundedPath, polylineLength, pointAlong } from '../canvas/edges/ortho'
import { absRect, groupDepth, type Rect } from '../canvas/geometry'
import { edgeActive, interpolate } from '../lib/vars'
import { ALL_AUTO, ALL_FLOWS, useStore, activeSets } from '../store/store'
import { buildFontFaceCss } from './fonts'

const FONT_UI = `'Inter Variable', 'Segoe UI', system-ui, sans-serif`
const FONT_MONO = `'JetBrains Mono', 'Cascadia Mono', Consolas, monospace`
const BG = '#141414'

export interface ExportOptions {
  /** 'view' = WYSIWYG (fluxo ativo anima, resto esmaece); 'all' = todos os fluxos animados. */
  flows?: 'view' | 'all'
  /** CSS @font-face com as fontes embutidas (data URI). */
  fontCss?: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function anchor(r: Rect, side: Side) {
  switch (side) {
    case 'l':
      return { x: r.x, y: r.y + r.h / 2 }
    case 'r':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
    case 't':
      return { x: r.x + r.w / 2, y: r.y }
    case 'b':
      return { x: r.x + r.w / 2, y: r.y + r.h }
  }
}

let measureCtx: CanvasRenderingContext2D | null = null
function measure(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

function wrapText(text: string, font: string, maxW: number): string[] {
  if (measure(text, font) <= maxW) return [text]
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (cur && measure(cand, font) > maxW) {
      lines.push(cur)
      cur = w
    } else {
      cur = cand
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Gera o SVG standalone do diagrama. */
export function buildSvg(opts: ExportOptions = {}): string {
  const s = useStore.getState()
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const rects = new Map(s.nodes.map((n) => [n.id, absRect(n, byId)]))
  const all = opts.flows === 'all'
  const sets = all ? null : activeSets(s)
  const autoActive = !all && s.activeFlowId === ALL_AUTO
  const animatedFlows = all
    ? s.flows.filter((f) => f.edgeIds.length)
    : s.activeFlowId && !autoActive
      ? s.activeFlowId === ALL_FLOWS
        ? s.flows.filter((f) => f.edgeIds.length)
        : s.flows.filter((f) => f.id === s.activeFlowId && f.edgeIds.length)
      : []
  const edgeFlowColor = new Map<string, string>()
  if (autoActive) {
    // modo automático: todas as arestas animam na própria cor (como no canvas)
    for (const e of s.edges) edgeFlowColor.set(e.id, (e.data?.color as string) || AUTO_EDGE_COLOR)
  } else {
    for (const f of animatedFlows) {
      for (const eid of f.edgeIds) if (!edgeFlowColor.has(eid)) edgeFlowColor.set(eid, f.color)
    }
  }
  // pacotes SMIL: no modo automático, um por aresta; senão, um por fluxo
  const smilFlows = autoActive
    ? s.edges.map((e) => ({ color: (e.data?.color as string) || AUTO_EDGE_COLOR, edgeIds: [e.id] }))
    : animatedFlows.map((f) => ({ color: f.color, edgeIds: f.edgeIds }))

  // rotas de todas as arestas (com o mesmo espalhamento de âncoras do canvas)
  const shifts = computeAnchorShifts(s.edges, s.nodes)
  const routes = new Map<string, { pts: { x: number; y: number }[]; d: string }>()
  for (const e of s.edges) {
    const sr = rects.get(e.source)
    const tr = rects.get(e.target)
    if (!sr || !tr) continue
    const sSide = (e.sourceHandle as Side) || 'r'
    const tSide = (e.targetHandle as Side) || 'l'
    const sh = shifts.get(e.id)
    const a = anchor(sr, sSide)
    const b = anchor(tr, tSide)
    const pts = routePoints({
      sx: a.x + (sh?.s.dx ?? 0),
      sy: a.y + (sh?.s.dy ?? 0),
      sSide,
      tx: b.x + (sh?.t.dx ?? 0),
      ty: b.y + (sh?.t.dy ?? 0),
      tSide,
      waypoints: e.data?.waypoints ?? [],
    })
    routes.set(e.id, { pts, d: roundedPath(pts) })
  }

  // bounds
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects.values()) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  for (const { pts } of routes.values()) {
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 100
    maxY = 100
  }
  const PAD = 48
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD
  const W = Math.round(maxX - minX)
  const H = Math.round(maxY - minY)

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" width="${W}" height="${H}" font-family="${esc(FONT_UI)}">`,
  )

  // defs: setas por cor
  const markerColors = new Set<string>()
  const strokeFor = (e: (typeof s.edges)[number]): string => {
    const fc = edgeFlowColor.get(e.id)
    if (fc && (!sets || sets.edgeIds.has(e.id))) return onDark(fc)
    return e.data?.color ? onDark(e.data.color) : '#6f6f6f'
  }
  for (const e of s.edges) markerColors.add(strokeFor(e))
  parts.push('<defs>')
  for (const c of markerColors) {
    const id = `arw-${c.replace(/[^a-z0-9]/gi, '')}`
    parts.push(
      `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 1 1.5 L 8.5 5 L 1 8.5 Z" fill="${c}"/></marker>`,
    )
  }
  parts.push(
    `<style>${opts.fontCss ?? ''}@keyframes afdash { to { stroke-dashoffset: -36; } } .afrun { animation: afdash ${(0.55 / s.speed).toFixed(3)}s linear infinite; }</style>`,
  )
  parts.push('</defs>')

  parts.push(`<rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="${BG}"/>`)

  const dimAttr = (participates: boolean) => (sets && !participates ? ' opacity="0.2"' : '')

  // grupos (pais antes dos filhos)
  const groups = s.nodes
    .filter((n) => n.type === 'group')
    .sort((a, b) => groupDepth(a, byId) - groupDepth(b, byId))
  for (const g of groups) {
    const r = rects.get(g.id)!
    const data = g.data as GroupNodeData
    const color = data.color || '#8f97a3'
    parts.push(
      `<g${dimAttr(!sets || sets.nodeIds.has(g.id))}>` +
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="12" fill="${withAlpha(color, 0.055)}" stroke="${withAlpha(color, 0.34)}"/>` +
        `<circle cx="${r.x + 14}" cy="${r.y + 16.5}" r="3.5" fill="${color}"/>` +
        `<text x="${r.x + 24}" y="${r.y + 20.5}" font-size="11.5" font-weight="640" letter-spacing="0.02em" fill="${color}">${esc(data.label)}</text>` +
        `</g>`,
    )
  }

  // arestas
  const nodeById = new Map(s.nodes.map((n) => [n.id, n]))
  for (const e of s.edges) {
    const route = routes.get(e.id)
    if (!route) continue
    const stroke = strokeFor(e)
    const dormant = !edgeActive(e, nodeById.get(e.source))
    const isAnim = !dormant && edgeFlowColor.has(e.id) && (!sets || sets.edgeIds.has(e.id))
    const marker = `arw-${stroke.replace(/[^a-z0-9]/gi, '')}`
    const dash = isAnim
      ? ' stroke-dasharray="11 7" class="afrun"'
      : dormant
        ? ' stroke-dasharray="3 5"'
        : e.data?.dashed
          ? ' stroke-dasharray="7 5"'
          : ''
    const width = isAnim ? 2.2 : 1.6
    parts.push(
      `<g${dormant ? ' opacity="0.32"' : dimAttr(!sets || sets.edgeIds.has(e.id))}>` +
        `<path d="${route.d}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash} marker-end="url(#${marker})"/>`,
    )
    if (e.label) {
      const mid = pointAlong(route.pts, e.data?.labelT ?? 0.5)
      const text = interpolate(String(e.label), s.variables)
      const font = `480 9.5px ${FONT_MONO}`
      const tw = measure(text, font)
      parts.push(
        `<rect x="${mid.x - tw / 2 - 6}" y="${mid.y - 9}" width="${tw + 12}" height="18" rx="5" fill="#141414" fill-opacity="0.92" stroke="${isAnim ? stroke : '#2e2e2e'}"/>` +
          `<text x="${mid.x}" y="${mid.y + 3.2}" text-anchor="middle" font-family="${esc(FONT_MONO)}" font-size="9.5" fill="${isAnim ? '#e8e8e8' : '#a8a8a8'}">${esc(text)}</text>`,
      )
    }
    parts.push('</g>')
  }

  // nós
  for (const n of s.nodes) {
    if (n.type !== 'arch') continue
    const r = rects.get(n.id)!
    const data = n.data as ArchNodeData
    const color = typeColor(data)
    const icon = data.icon ?? defaultIconFor(data.archType)
    const labelText = interpolate(data.label, s.variables)
    const mono = data.label.includes('_')
    const font = mono ? `480 10.5px ${FONT_MONO}` : `550 12.5px ${FONT_UI}`
    const maxTextW = r.w - 8 - 30 - 9 - 12
    const lines = wrapText(labelText, font, Math.max(maxTextW, 40))
    const lineH = mono ? 13.5 : 15.5
    const textY0 = r.y + r.h / 2 - ((lines.length - 1) * lineH) / 2 + 3.8
    parts.push(
      `<g${dimAttr(!sets || sets.nodeIds.has(n.id))}>` +
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="#242424" fill-opacity="0.97" stroke="${withAlpha(color, 0.42)}"/>` +
        `<rect x="${r.x + 8}" y="${r.y + r.h / 2 - 15}" width="30" height="30" rx="7" fill="${withAlpha(color, 0.14)}"/>` +
        `<g transform="translate(${r.x + 8 + 6.5}, ${r.y + r.h / 2 - 8.5}) scale(0.708)" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
        glyphPaths(icon)
          .map((d) => `<path d="${d}"/>`)
          .join('') +
        `</g>` +
        lines
          .map(
            (ln, i) =>
              `<text x="${r.x + 47}" y="${textY0 + i * lineH}" font-family="${esc(mono ? FONT_MONO : FONT_UI)}" font-size="${mono ? 10.5 : 12.5}" font-weight="${mono ? 480 : 550}" fill="#ededed">${esc(ln)}</text>`,
          )
          .join('') +
        `</g>`,
    )
  }

  // pacotes animados (SMIL) — seguem hop a hop o caminho exato
  for (const f of smilFlows) {
    const hopDs: string[] = []
    let total = 0
    for (const eid of f.edgeIds) {
      const route = routes.get(eid)
      if (!route) continue
      hopDs.push(route.d)
      total += polylineLength(route.pts)
    }
    if (!hopDs.length || total === 0) continue
    // mesma normalização do app: fluxos longos não viram novela (~4–12s por ciclo)
    const travel = Math.min(12, Math.max(4, total / 260)) / s.speed
    const dur = travel + 0.9
    const kt = (travel / dur).toFixed(4)
    const c = onDark(f.color)
    parts.push(
      `<circle r="6" fill="${c}" stroke="${withAlpha(c, 0.35)}" stroke-width="5">` +
        `<animateMotion dur="${dur.toFixed(3)}s" repeatCount="indefinite" path="${hopDs.join(' ')}" keyPoints="0;1;1" keyTimes="0;${kt};1" calcMode="linear"/>` +
        `</circle>`,
    )
  }

  parts.push('</svg>')
  return parts.join('\n')
}

export async function exportSvg(filename: string, opts: ExportOptions = {}) {
  const fontCss = await buildFontFaceCss()
  const svg = buildSvg({ ...opts, fontCss })
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function exportPng(filename: string, scale = 2): Promise<void> {
  const fontCss = await buildFontFaceCss()
  return new Promise((resolve, reject) => {
    const svg = buildSvg({ fontCss })
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas 2d indisponível'))
        return
      }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((png) => {
        if (!png) {
          reject(new Error('falha ao gerar PNG'))
          return
        }
        const a = document.createElement('a')
        const pngUrl = URL.createObjectURL(png)
        a.href = pngUrl
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(pngUrl), 4000)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('falha ao rasterizar SVG'))
    }
    img.src = url
  })
}
