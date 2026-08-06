import { ReactFlowProvider } from '@xyflow/react'
import { FlowCanvas } from './canvas/FlowCanvas'
import { useToast } from './lib/toast'
import { useStore } from './store/store'
import { FlowsPanel } from './panels/FlowsPanel'
import { Hotkeys } from './panels/Hotkeys'
import { NodePalette } from './panels/NodePalette'
import { Onboarding } from './panels/Onboarding'
import { PresentBar } from './panels/PresentBar'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { Toolbar } from './panels/Toolbar'

function Toast() {
  const { message, kind } = useToast()
  if (!message) return null
  return <div className={`af-toast${kind === 'error' ? ' is-error' : ''}`}>{message}</div>
}

export default function App() {
  const presentation = useStore((s) => s.presentation)

  return (
    <ReactFlowProvider>
      <div className={`af-app${presentation ? ' is-presentation' : ''}`}>
        {!presentation && <Toolbar />}
        <div className="af-main">
          {!presentation && <FlowsPanel />}
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
            <FlowCanvas />
            {!presentation && <NodePalette />}
            <PropertiesPanel />
            {presentation && <PresentBar />}
          </div>
        </div>
      </div>
      <Hotkeys />
      {!presentation && <Onboarding />}
      <Toast />
    </ReactFlowProvider>
  )
}
