import { dump, load } from 'js-yaml'
import { GLYPHS } from '../icons/glyphs'
import type {
  AnyNode,
  ArchNodeData,
  ArchType,
  DiagramMeta,
  FlowDef,
  GroupNode,
  IconId,
  NodeVar,
  OrthoEdge,
  Scenario,
  Side,
  XY,
} from './types'
import { ARCH_TYPES, defaultIconFor } from './types'

/** Documento YAML — o formato de arquivo do ArchFlow (legível e versionável). */
export interface DocNode {
  id: string
  label: string
  type: ArchType
  icon?: IconId
  color?: string
  /** id do grupo pai; posição é relativa ao grupo. */
  group?: string
  pos: XY
  /** bloqueado contra arraste acidental */
  locked?: boolean
  /** config do nó: atalho `nome: valor` ou forma longa `{value, source}` */
  vars?: Record<string, string | boolean | { value: string | boolean; source?: string }>
  status?: 'down'
  transform?: string
  payloadBefore?: string
  payloadAfter?: string
  tech?: string
  owner?: string
  link?: string
}

export interface DocGroup {
  id: string
  label: string
  color?: string
  parent?: string
  pos: XY
  size: { w: number; h: number }
  locked?: boolean
}

export interface DocEdge {
  id: string
  from: string
  to: string
  fromSide: Side
  toSide: Side
  label?: string
  dashed?: boolean
  color?: string
  waypoints?: XY[]
  /** posição do rótulo ao longo do caminho (fração 0–1) */
  labelT?: number
  /** condição contra a var do nó de origem */
  when?: { var: string; equals: string | boolean }
  note?: string
  /** duração relativa do hop (1 = normal) */
  weight?: number
}

export interface DocFlow {
  id: string
  name: string
  color: string
  edges: string[]
  payload?: string
}

export interface Doc {
  version: 1
  name: string
  groups: DocGroup[]
  nodes: DocNode[]
  edges: DocEdge[]
  flows: DocFlow[]
  /** variáveis do diagrama (interpolação {{nome}}) */
  variables?: Record<string, string>
  /** cenários nomeados (snapshots de variáveis/config/estado) */
  scenarios?: Scenario[]
}

export interface StoreShape {
  meta: DiagramMeta
  nodes: AnyNode[]
  edges: OrthoEdge[]
  flows: FlowDef[]
  variables: Record<string, string>
  scenarios: Scenario[]
}

const r1 = (v: number) => Math.round(v * 10) / 10
const rXY = (p: XY): XY => ({ x: r1(p.x), y: r1(p.y) })

export function storeToDoc(s: StoreShape): Doc {
  const groups: DocGroup[] = []
  const nodes: DocNode[] = []
  for (const n of s.nodes) {
    if (n.type === 'group') {
      const g = n as GroupNode
      groups.push({
        id: g.id,
        label: g.data.label,
        ...(g.data.color ? { color: g.data.color } : {}),
        ...(g.parentId ? { parent: g.parentId } : {}),
        pos: rXY(g.position),
        size: { w: r1(g.width ?? 320), h: r1(g.height ?? 200) },
        ...(g.draggable === false ? { locked: true } : {}),
      })
    } else {
      const d = n.data as ArchNodeData
      // vars: forma curta `nome: valor` quando não há source
      const vars = d.vars && Object.keys(d.vars).length
        ? Object.fromEntries(
            Object.entries(d.vars).map(([k, v]) => [k, v.source ? { value: v.value, source: v.source } : v.value]),
          )
        : undefined
      nodes.push({
        id: n.id,
        label: d.label,
        type: d.archType,
        ...(d.icon && d.icon !== defaultIconFor(d.archType) ? { icon: d.icon } : {}),
        ...(d.color ? { color: d.color } : {}),
        ...(n.parentId ? { group: n.parentId } : {}),
        pos: rXY(n.position),
        ...(n.draggable === false ? { locked: true } : {}),
        ...(vars ? { vars } : {}),
        ...(d.status === 'down' ? { status: 'down' as const } : {}),
        ...(d.transform ? { transform: d.transform } : {}),
        ...(d.payloadBefore ? { payloadBefore: d.payloadBefore } : {}),
        ...(d.payloadAfter ? { payloadAfter: d.payloadAfter } : {}),
        ...(d.tech ? { tech: d.tech } : {}),
        ...(d.owner ? { owner: d.owner } : {}),
        ...(d.link ? { link: d.link } : {}),
      })
    }
  }
  const edges: DocEdge[] = s.edges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    fromSide: (e.sourceHandle as Side) || 'r',
    toSide: (e.targetHandle as Side) || 'l',
    ...(e.label ? { label: String(e.label) } : {}),
    ...(e.data?.dashed ? { dashed: true } : {}),
    ...(e.data?.color ? { color: e.data.color } : {}),
    ...(e.data?.waypoints?.length ? { waypoints: e.data.waypoints.map(rXY) } : {}),
    ...(e.data?.labelT != null && Math.abs(e.data.labelT - 0.5) > 0.01
      ? { labelT: Math.round(e.data.labelT * 100) / 100 }
      : {}),
    ...(e.data?.when ? { when: { var: e.data.when.var, equals: e.data.when.equals } } : {}),
    ...(e.data?.note ? { note: e.data.note } : {}),
    ...(e.data?.weight != null && e.data.weight !== 1 ? { weight: e.data.weight } : {}),
  }))
  const flows: DocFlow[] = s.flows.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    edges: [...f.edgeIds],
    ...(f.payload ? { payload: f.payload } : {}),
  }))
  return {
    version: 1,
    name: s.meta.name,
    groups,
    nodes,
    edges,
    flows,
    ...(Object.keys(s.variables ?? {}).length ? { variables: { ...s.variables } } : {}),
    ...(s.scenarios?.length ? { scenarios: s.scenarios.map((sc) => ({ ...sc })) } : {}),
  }
}

/** Ordena nós: pais antes de filhos; grupos antes de nós no mesmo nível. */
export function orderNodes(nodes: AnyNode[]): AnyNode[] {
  const byParent = new Map<string | undefined, AnyNode[]>()
  for (const n of nodes) {
    const key = n.parentId ?? undefined
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(n)
  }
  const out: AnyNode[] = []
  const visit = (parent: string | undefined) => {
    const children = byParent.get(parent) ?? []
    const groups = children.filter((c) => c.type === 'group')
    const rest = children.filter((c) => c.type !== 'group')
    for (const g of groups) {
      out.push(g)
      visit(g.id)
    }
    for (const n of rest) {
      out.push(n)
      visit(n.id)
    }
  }
  visit(undefined)
  // nós com parentId órfão (não deveria acontecer) entram no fim, sem pai
  for (const n of nodes) {
    if (!out.includes(n)) out.push({ ...n, parentId: undefined })
  }
  return out
}

export function docToStore(doc: Doc): StoreShape {
  const groupIds = new Set(doc.groups.map((g) => g.id))
  const nodes: AnyNode[] = []
  for (const g of doc.groups) {
    nodes.push({
      id: g.id,
      type: 'group',
      position: { ...g.pos },
      width: g.size.w,
      height: g.size.h,
      ...(g.parent && groupIds.has(g.parent) ? { parentId: g.parent } : {}),
      ...(g.locked ? { draggable: false } : {}),
      data: { label: g.label, ...(g.color ? { color: g.color } : {}) },
      zIndex: -1,
    } satisfies GroupNode)
  }
  const allNodeIds = new Set(doc.nodes.map((n) => n.id))
  for (const n of doc.nodes) {
    // normaliza vars para a forma longa; source só vale se o nó existe
    const vars: Record<string, NodeVar> | undefined = n.vars
      ? Object.fromEntries(
          Object.entries(n.vars).map(([k, v]) => {
            const long = typeof v === 'object' && v !== null ? v : { value: v }
            return [
              k,
              {
                value: long.value,
                ...(long.source && allNodeIds.has(long.source) ? { source: long.source } : {}),
              },
            ]
          }),
        )
      : undefined
    nodes.push({
      id: n.id,
      type: 'arch',
      position: { ...n.pos },
      ...(n.group && groupIds.has(n.group) ? { parentId: n.group } : {}),
      ...(n.locked ? { draggable: false } : {}),
      data: {
        label: n.label,
        archType: n.type,
        icon: n.icon ?? defaultIconFor(n.type),
        ...(n.color ? { color: n.color } : {}),
        ...(vars && Object.keys(vars).length ? { vars } : {}),
        ...(n.status === 'down' ? { status: 'down' as const } : {}),
        ...(n.transform ? { transform: n.transform } : {}),
        ...(n.payloadBefore ? { payloadBefore: n.payloadBefore } : {}),
        ...(n.payloadAfter ? { payloadAfter: n.payloadAfter } : {}),
        ...(n.tech ? { tech: n.tech } : {}),
        ...(n.owner ? { owner: n.owner } : {}),
        ...(n.link ? { link: n.link } : {}),
      },
    })
  }
  const nodeIds = new Set(doc.nodes.map((n) => n.id))
  const edges: OrthoEdge[] = doc.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: e.fromSide,
      targetHandle: e.toSide,
      type: 'ortho',
      ...(e.label ? { label: e.label } : {}),
      data: {
        ...(e.dashed ? { dashed: true } : {}),
        ...(e.color ? { color: e.color } : {}),
        ...(e.labelT != null ? { labelT: e.labelT } : {}),
        ...(e.when ? { when: { var: e.when.var, equals: e.when.equals } } : {}),
        ...(e.note ? { note: e.note } : {}),
        ...(e.weight != null && e.weight !== 1 ? { weight: e.weight } : {}),
        waypoints: (e.waypoints ?? []).map((p) => ({ ...p })),
      },
    }))
  const edgeIds = new Set(edges.map((e) => e.id))
  const flows: FlowDef[] = doc.flows.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    edgeIds: f.edges.filter((id) => edgeIds.has(id)),
    ...(f.payload ? { payload: f.payload } : {}),
  }))
  return {
    meta: { name: doc.name },
    nodes: orderNodes(nodes),
    edges,
    flows,
    variables: { ...(doc.variables ?? {}) },
    scenarios: (doc.scenarios ?? []).map((sc) => ({ ...sc })),
  }
}

export function docToYaml(doc: Doc): string {
  // flowLevel 3 → itens (grupo/nó/aresta/fluxo) ficam em block style, mas as coleções no
  // nível seguinte — pos/size/waypoints/edges — saem em flow style compacto:
  //   pos: {x: 40, y: 120}   waypoints: [{x: 296, y: 790}]   edges: [e1, e2]
  const text = dump(doc, { lineWidth: 200, noRefs: true, flowLevel: 3 })
  // js-yaml cita a chave `y` ("'y':") porque `y` é booleano no YAML 1.1 — cosmético, mas feio.
  // Removemos as aspas APENAS quando `y` é chave de mapa flow-style de coordenada, ou seja,
  // precedida por `{x: <num>, ` e seguida de número (XY sempre serializa x antes de y).
  // Labels que contenham "'y':" não casam: dentro de escalar single-quoted o ' interno vira ''.
  return text.replace(/(\{x: -?[\d.]+, )'y':(?= -?[\d.])/g, '$1y:')
}

// ---- validação de import (dados externos: nunca confiar) ----

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const SIDES: readonly Side[] = ['l', 'r', 't', 'b']

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const validXY = (p: unknown): p is XY => !!p && typeof p === 'object' && num((p as XY).x) && num((p as XY).y)

function cleanColor(c: unknown): string | undefined {
  return typeof c === 'string' && HEX_COLOR.test(c.trim()) ? c.trim() : undefined
}

function cleanSide(s: unknown, fallback: Side): Side {
  return SIDES.includes(s as Side) ? (s as Side) : fallback
}

const VAR_KEY = /^[\w.-]{1,40}$/
/** chaves que envenenariam protótipos via atribuição */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
export const safeVarKey = (k: string): boolean => VAR_KEY.test(k) && !FORBIDDEN_KEYS.has(k)

/** links só com protocolo http(s) — YAML importado é hostil (javascript: = XSS) */
function cleanLink(v: unknown): string | undefined {
  const t = cleanText(v, 300)
  return t && /^https?:\/\//i.test(t) ? t : undefined
}

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}

function cleanVarValue(v: unknown): string | boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.trim().slice(0, 80)
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

/** vars do nó: aceita atalho `nome: valor` e forma longa `{value, source}`. */
function cleanVars(raw: unknown): Record<string, string | boolean | { value: string | boolean; source?: string }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string | boolean | { value: string | boolean; source?: string }> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!safeVarKey(k)) continue
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const value = cleanVarValue((v as { value?: unknown }).value)
      if (value === undefined) continue
      const source = (v as { source?: unknown }).source
      out[k] = source != null ? { value, source: String(source) } : { value }
    } else {
      const value = cleanVarValue(v)
      if (value !== undefined) out[k] = value
    }
    if (Object.keys(out).length >= 16) break
  }
  return Object.keys(out).length ? out : undefined
}

function cleanWhen(raw: unknown): { var: string; equals: string | boolean } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const w = raw as { var?: unknown; equals?: unknown }
  if (typeof w.var !== 'string' || !safeVarKey(w.var)) return undefined
  const equals = cleanVarValue(w.equals)
  if (equals === undefined) return undefined
  return { var: w.var, equals }
}

function cleanVariables(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!safeVarKey(k)) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v).slice(0, 200)
    if (Object.keys(out).length >= 32) break
  }
  return out
}

function cleanScenarios(raw: unknown): Scenario[] {
  if (!Array.isArray(raw)) return []
  const out: Scenario[] = []
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue
    const sc = item as Record<string, unknown>
    if (sc.id == null) continue
    const nodeVars: Record<string, Record<string, string | boolean>> = {}
    if (sc.nodeVars && typeof sc.nodeVars === 'object' && !Array.isArray(sc.nodeVars)) {
      for (const [nodeId, vars] of Object.entries(sc.nodeVars as Record<string, unknown>)) {
        if (!vars || typeof vars !== 'object' || Array.isArray(vars)) continue
        const clean: Record<string, string | boolean> = {}
        for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
          if (!safeVarKey(k)) continue
          const value = cleanVarValue(v)
          if (value !== undefined) clean[k] = value
        }
        const safeId = String(nodeId).slice(0, 64)
        if (Object.keys(clean).length && !FORBIDDEN_KEYS.has(safeId)) nodeVars[safeId] = clean
      }
    }
    out.push({
      id: String(sc.id).slice(0, 64),
      name: cleanText(sc.name, 60) ?? String(sc.id).slice(0, 64),
      variables: cleanVariables(sc.variables),
      nodeVars,
      down: Array.isArray(sc.down)
        ? sc.down.filter((d) => d != null).map((d) => String(d).slice(0, 64)).slice(0, 64)
        : [],
    })
  }
  const seen = new Set<string>()
  return out.filter((sc) => (seen.has(sc.id) ? false : (seen.add(sc.id), true)))
}

/** Mantém apenas a primeira ocorrência de cada id. */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
}

export function yamlToDoc(text: string): Doc {
  let raw: unknown
  try {
    raw = load(text)
  } catch (err) {
    throw new Error(`YAML inválido: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!raw || typeof raw !== 'object') throw new Error('YAML inválido: documento vazio.')
  const d = raw as Record<string, unknown>
  if (!Array.isArray(d.nodes)) throw new Error('YAML inválido: faltou a lista "nodes".')

  const archTypes = new Set(ARCH_TYPES.map((t) => t.id))
  const iconIds = new Set<string>(Object.keys(GLYPHS))

  const groups = dedupeById(
    (Array.isArray(d.groups) ? d.groups : [])
      .filter(
        (g: Record<string, unknown>) =>
          g && g.id != null && validXY(g.pos) && g.size != null && num((g.size as { w: unknown }).w) && num((g.size as { h: unknown }).h),
      )
      .map(
        (g: Record<string, unknown>): DocGroup => ({
          id: String(g.id),
          label: g.label != null ? String(g.label) : String(g.id),
          ...(cleanColor(g.color) ? { color: cleanColor(g.color) } : {}),
          ...(g.parent != null ? { parent: String(g.parent) } : {}),
          pos: { x: (g.pos as XY).x, y: (g.pos as XY).y },
          size: { w: (g.size as { w: number }).w, h: (g.size as { h: number }).h },
          ...(g.locked === true ? { locked: true } : {}),
        }),
      ),
  )

  const nodes = dedupeById(
    (d.nodes as Record<string, unknown>[])
      .filter((n) => n && n.id != null && validXY(n.pos))
      .map(
        (n): DocNode => ({
          id: String(n.id),
          label: n.label != null ? String(n.label) : String(n.id),
          type: archTypes.has(n.type as ArchType) ? (n.type as ArchType) : 'generic',
          ...(iconIds.has(n.icon as string) ? { icon: n.icon as IconId } : {}),
          ...(cleanColor(n.color) ? { color: cleanColor(n.color) } : {}),
          ...(n.group != null ? { group: String(n.group) } : {}),
          pos: { x: (n.pos as XY).x, y: (n.pos as XY).y },
          ...(n.locked === true ? { locked: true } : {}),
          ...(() => {
            const vars = cleanVars(n.vars)
            return vars ? { vars } : {}
          })(),
          ...(n.status === 'down' ? { status: 'down' as const } : {}),
          ...(cleanText(n.transform, 300) ? { transform: cleanText(n.transform, 300) } : {}),
          ...(cleanText(n.payloadBefore, 4000) ? { payloadBefore: cleanText(n.payloadBefore, 4000) } : {}),
          ...(cleanText(n.payloadAfter, 4000) ? { payloadAfter: cleanText(n.payloadAfter, 4000) } : {}),
          ...(cleanText(n.tech, 80) ? { tech: cleanText(n.tech, 80) } : {}),
          ...(cleanText(n.owner, 80) ? { owner: cleanText(n.owner, 80) } : {}),
          ...(cleanLink(n.link) ? { link: cleanLink(n.link) } : {}),
        }),
      ),
  )

  const edges = dedupeById(
    (Array.isArray(d.edges) ? d.edges : [])
      .filter((e: Record<string, unknown>) => e && e.id != null && e.from != null && e.to != null)
      .map(
        (e: Record<string, unknown>): DocEdge => ({
          id: String(e.id),
          from: String(e.from),
          to: String(e.to),
          fromSide: cleanSide(e.fromSide, 'r'),
          toSide: cleanSide(e.toSide, 'l'),
          ...(e.label != null && e.label !== '' ? { label: String(e.label) } : {}),
          ...(e.dashed ? { dashed: true } : {}),
          ...(cleanColor(e.color) ? { color: cleanColor(e.color) } : {}),
          waypoints: (Array.isArray(e.waypoints) ? e.waypoints : [])
            .filter(validXY)
            .map((p: XY) => ({ x: p.x, y: p.y })),
          ...(num(e.labelT) ? { labelT: Math.min(0.95, Math.max(0.05, e.labelT)) } : {}),
          ...(() => {
            const when = cleanWhen(e.when)
            return when ? { when } : {}
          })(),
          ...(cleanText(e.note, 500) ? { note: cleanText(e.note, 500) } : {}),
          ...(num(e.weight) ? { weight: Math.min(10, Math.max(0.25, e.weight)) } : {}),
        }),
      ),
  )

  const flows = dedupeById(
    (Array.isArray(d.flows) ? d.flows : [])
      .filter((f: Record<string, unknown>) => f && f.id != null)
      .map(
        (f: Record<string, unknown>): DocFlow => ({
          id: String(f.id),
          name: f.name != null && f.name !== '' ? String(f.name) : String(f.id),
          color: cleanColor(f.color) ?? '#6ea8dc',
          edges: (Array.isArray(f.edges) ? f.edges : []).filter((id) => id != null).map(String),
          ...(cleanText(f.payload, 4000) ? { payload: cleanText(f.payload, 4000) } : {}),
        }),
      ),
  )

  return {
    version: 1,
    name: typeof d.name === 'string' && d.name ? String(d.name).slice(0, 120) : 'Diagrama',
    groups,
    nodes,
    edges,
    flows,
    variables: cleanVariables(d.variables),
    scenarios: cleanScenarios(d.scenarios),
  }
}
