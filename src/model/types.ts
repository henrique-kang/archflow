import type { Edge, Node } from '@xyflow/react'

/** Categorias de componente de arquitetura. */
export type ArchType =
  | 'service'
  | 'queue'
  | 'gateway'
  | 'client'
  | 'storage'
  | 'function'
  | 'external'
  | 'generic'

export type IconId =
  | 'sqs'
  | 'sns'
  | 'lambda'
  | 's3'
  | 'apigw'
  | 'client'
  | 'service'
  | 'queue'
  | 'storage'
  | 'external'
  | 'webhook'
  | 'function'
  | 'generic'

export interface XY {
  x: number
  y: number
}

export type Side = 'l' | 'r' | 't' | 'b'

export interface ArchNodeData extends Record<string, unknown> {
  label: string
  archType: ArchType
  /** Cor custom (hex); quando ausente, usa a cor do tipo. */
  color?: string
  icon?: IconId
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string
  color?: string
}

export interface OrthoEdgeData extends Record<string, unknown> {
  color?: string
  dashed?: boolean
  /** Dobras manuais, em coordenadas absolutas do canvas. */
  waypoints: XY[]
  /** Posição do rótulo ao longo do caminho (fração 0–1; padrão 0.5). */
  labelT?: number
}

export type ArchNode = Node<ArchNodeData, 'arch'>
export type GroupNode = Node<GroupNodeData, 'group'>
export type AnyNode = ArchNode | GroupNode
export type OrthoEdge = Edge<OrthoEdgeData, 'ortho'>

/** Fluxo: sequência ordenada de arestas que conta uma história. */
export interface FlowDef {
  id: string
  name: string
  color: string
  edgeIds: string[]
}

export interface DiagramMeta {
  name: string
}

export const ARCH_TYPES: { id: ArchType; label: string; defaultIcon: IconId }[] = [
  { id: 'service', label: 'Serviço', defaultIcon: 'service' },
  { id: 'queue', label: 'Fila', defaultIcon: 'queue' },
  { id: 'gateway', label: 'Gateway', defaultIcon: 'apigw' },
  { id: 'client', label: 'Cliente', defaultIcon: 'client' },
  { id: 'storage', label: 'Storage', defaultIcon: 'storage' },
  { id: 'function', label: 'Função', defaultIcon: 'function' },
  { id: 'external', label: 'Externo', defaultIcon: 'external' },
  { id: 'generic', label: 'Genérico', defaultIcon: 'generic' },
]

/** Cor semântica por tipo (inspirada nas categorias AWS, dessaturada p/ dark). */
export const TYPE_COLORS: Record<ArchType, string> = {
  service: '#6ea8dc', // azul — computação/serviço
  queue: '#d873a8', // rosa — mensageria (SQS)
  gateway: '#a78bdf', // roxo — rede/API
  client: '#5fb8c9', // ciano — quem consome
  storage: '#7fb069', // verde — dados
  function: '#e0985a', // laranja — lambda/função
  external: '#9aa5b5', // cinza-azulado — fora do domínio
  generic: '#8f97a3',
}

/** Cor das arestas/pacotes no modo automático quando a aresta não tem cor própria. */
export const AUTO_EDGE_COLOR = '#7fb3e8'

export function typeColor(data: { archType: ArchType; color?: string }): string {
  return data.color || TYPE_COLORS[data.archType]
}

export function typeLabel(t: ArchType): string {
  return ARCH_TYPES.find((a) => a.id === t)?.label ?? t
}

export function defaultIconFor(t: ArchType): IconId {
  return ARCH_TYPES.find((a) => a.id === t)?.defaultIcon ?? 'generic'
}
