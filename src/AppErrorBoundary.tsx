import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Última linha de defesa: sem isto, um dado inesperado vira tela branca — e como
 * há autosave, o erro voltaria a cada reload. Oferece recuperação explícita.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 640 }}>Algo quebrou ao renderizar o diagrama</div>
        <div style={{ color: 'var(--ink-muted)', maxWidth: '52ch', fontSize: 12.5 }}>
          {String(this.state.error.message || this.state.error)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="af-btn is-outline" onClick={() => location.reload()}>
            Recarregar
          </button>
          <button
            className="af-btn is-outline is-danger"
            onClick={() => {
              localStorage.removeItem('archflow.doc.v1')
              location.reload()
            }}
          >
            Restaurar exemplo (descarta dados locais)
          </button>
        </div>
      </div>
    )
  }
}
