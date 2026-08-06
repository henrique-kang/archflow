import { NodeResizer, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { GroupNode } from '../../model/types'
import { withAlpha } from '../../lib/utils'
import { useStore } from '../../store/store'
import { useDimmed } from '../useDimmed'

const DEFAULT_GROUP_COLOR = '#8f97a3'

function GroupNodeViewInner({ id, data, selected }: NodeProps<GroupNode>) {
  const color = data.color || DEFAULT_GROUP_COLOR
  const dimmed = useDimmed(id)
  const isDropTarget = useStore((s) => s.dropTargetId === id)
  const locked = useStore((s) => s.nodes.find((n) => n.id === id)?.draggable === false)
  return (
    <div
      className={`af-group${dimmed ? ' af-dim' : ''}${isDropTarget ? ' af-drop-target' : ''}`}
      style={
        {
          '--group-color': color,
          '--group-color-border': withAlpha(color, 0.34),
          '--group-color-bg': withAlpha(color, 0.055),
        } as React.CSSProperties
      }
    >
      <NodeResizer
        isVisible={!!selected && !locked}
        minWidth={140}
        minHeight={90}
        lineClassName="line"
        handleClassName="handle"
      />
      <div className="af-group-title">
        <span className="dot" />
        {data.label}
        {locked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="bloqueado">
            <path d="M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
          </svg>
        )}
      </div>
    </div>
  )
}

export const GroupNodeView = memo(GroupNodeViewInner)
