import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { Glyph } from '../../icons/glyphs'
import type { ArchNode } from '../../model/types'
import { defaultIconFor, typeColor } from '../../model/types'
import { withAlpha } from '../../lib/utils'
import { useStore } from '../../store/store'
import { useDimmed } from '../useDimmed'

/** Rótulos "técnicos" (ids de fila etc.) rendem em mono. */
export function isMonoLabel(label: string): boolean {
  return label.includes('_')
}

function ArchNodeViewInner({ id, data }: NodeProps<ArchNode>) {
  const color = typeColor(data)
  const dimmed = useDimmed(id)
  // estado de bloqueio do PRÓPRIO nó (o draggable de NodeProps mistura o global do modo apresentação)
  const locked = useStore((s) => s.nodes.find((n) => n.id === id)?.draggable === false)
  const icon = data.icon ?? defaultIconFor(data.archType)
  return (
    <div
      className={`af-node${dimmed ? ' af-dim' : ''}`}
      style={
        {
          '--node-color': color,
          '--node-color-border': withAlpha(color, 0.42),
          '--node-color-soft': withAlpha(color, 0.14),
        } as React.CSSProperties
      }
    >
      <div className="af-node-icon">
        <Glyph icon={icon} size={17} />
      </div>
      <div className={`af-node-label${isMonoLabel(data.label) ? ' is-mono' : ''}`}>{data.label}</div>
      {locked && (
        <span className="af-lock-badge" title="Bloqueado (botão direito → Desbloquear)">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
          </svg>
        </span>
      )}
      <Handle id="l" type="source" position={Position.Left} />
      <Handle id="r" type="source" position={Position.Right} />
      <Handle id="t" type="source" position={Position.Top} />
      <Handle id="b" type="source" position={Position.Bottom} />
    </div>
  )
}

export const ArchNodeView = memo(ArchNodeViewInner)
