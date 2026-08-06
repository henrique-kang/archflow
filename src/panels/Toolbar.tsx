import { useReactFlow } from '@xyflow/react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { shallow } from 'zustand/shallow'
import { exportPng, exportSvg } from '../export/exporter'
import { IcExport, IcFit, IcImport, IcMore, IcPresent, IcRedo, IcUndo } from '../icons/ui'
import { pickFile, downloadText } from '../lib/utils'
import { toast } from '../lib/toast'
import { docToYaml, yamlToDoc } from '../model/yaml'
import { readHistory, redo, undo, useStore } from '../store/store'
import { Menu } from './Menu'

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'diagrama'
  )
}

export function Toolbar() {
  const name = useStore((s) => s.meta.name)
  const setName = useStore((s) => s.setMetaName)
  const setPresentation = useStore((s) => s.setPresentation)
  const { fitView } = useReactFlow()
  const { canUndo, canRedo } = useStoreWithEqualityFn(
    useStore.temporal,
    (s) => ({ canUndo: s.pastStates.length > 0, canRedo: s.futureStates.length > 0 }),
    shallow,
  )

  const onImport = async () => {
    const file = await pickFile('.yml,.yaml,.txt')
    if (!file) return
    try {
      const doc = yamlToDoc(await file.text())
      useStore.getState().importDoc(doc)
      toast(`Importado: ${doc.name}`)
      setTimeout(() => fitView({ padding: 0.12 }), 60)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao importar YAML.', 'error')
    }
  }

  const onPresent = () => {
    setPresentation(true)
    document.documentElement.requestFullscreen?.().catch(() => {
      // fullscreen negado — modo apresentação funciona mesmo assim
    })
    // re-enquadra depois que os painéis colapsam
    setTimeout(() => fitView({ padding: 0.1, duration: 350 }), 120)
  }

  return (
    <header className="af-topbar">
      <div className="af-logo">
        <svg width="18" height="18" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="oklch(0.24 0 0)" />
          <path
            d="M7 22 L13 22 L13 10 L25 10"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="25" cy="10" r="3.4" fill="var(--accent)" />
        </svg>
        ArchFlow
      </div>
      <input
        className="af-docname"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => {
          if (!e.target.value.trim()) setName('Diagrama')
        }}
        aria-label="Nome do diagrama"
        size={Math.max(8, name.length)}
      />
      <div className="af-topbar-spacer" />

      <button className="af-btn is-icon" onClick={() => undo()} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
        <IcUndo />
      </button>
      <button className="af-btn is-icon" onClick={() => redo()} disabled={!canRedo} title="Refazer (Ctrl+Y)">
        <IcRedo />
      </button>
      <div className="af-divider" />
      <button
        className="af-btn is-icon"
        onClick={() => fitView({ padding: 0.12, duration: 300 })}
        title="Enquadrar diagrama"
      >
        <IcFit />
      </button>
      <div className="af-divider" />
      <button className="af-btn" onClick={onImport} title="Importar arquivo YAML">
        <IcImport /> Importar
      </button>
      <Menu
        trigger={
          <button className="af-btn" title="Exportar diagrama">
            <IcExport /> Exportar
          </button>
        }
      >
        {(close) => {
          const base = slug(useStore.getState().meta.name)
          return (
            <>
              <button
                onClick={() => {
                  downloadText(`${base}.yaml`, docToYaml(useStore.getState().exportDoc()), 'text/yaml')
                  toast('YAML exportado.')
                  close()
                }}
              >
                YAML — arquivo do diagrama
              </button>
              <button
                onClick={async () => {
                  close()
                  try {
                    await exportSvg(`${base}.svg`)
                    toast('SVG exportado (animação embutida).')
                  } catch {
                    toast('Falha ao exportar SVG.', 'error')
                  }
                }}
              >
                SVG — visão atual, animado
              </button>
              <button
                onClick={async () => {
                  close()
                  try {
                    await exportSvg(`${base}-fluxos.svg`, { flows: 'all' })
                    toast('SVG exportado com todos os fluxos animados.')
                  } catch {
                    toast('Falha ao exportar SVG.', 'error')
                  }
                }}
              >
                SVG — todos os fluxos animados
              </button>
              <button
                onClick={async () => {
                  close()
                  try {
                    await exportPng(`${base}.png`)
                    toast('PNG exportado (2×).')
                  } catch {
                    toast('Falha ao exportar PNG.', 'error')
                  }
                }}
              >
                PNG — visão atual (2×)
              </button>
            </>
          )
        }}
      </Menu>
      <Menu trigger={<button className="af-btn is-icon" title="Mais opções"><IcMore /></button>}>
        {(close) => {
          const history = readHistory().slice(-6).reverse()
          const fmt = (ts: number) => {
            const d = new Date(ts)
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          }
          return (
            <>
              <button
                onClick={() => {
                  if (window.confirm('Substituir o diagrama atual pelo exemplo?')) {
                    useStore.getState().resetToSeed()
                    toast('Diagrama de exemplo recarregado.')
                    setTimeout(() => fitView({ padding: 0.12 }), 60)
                  }
                  close()
                }}
              >
                Recarregar diagrama de exemplo…
              </button>
              {history.length > 0 && (
                <>
                  <hr />
                  <div style={{ padding: '4px 9px', fontSize: 10.5, color: 'var(--ink-faint)', fontWeight: 600 }}>
                    Histórico local
                  </div>
                  {history.map((h) => (
                    <button
                      key={h.ts}
                      onClick={() => {
                        if (window.confirm(`Restaurar a versão salva às ${fmt(h.ts)}? O diagrama atual será substituído.`)) {
                          try {
                            if (!h.doc || !Array.isArray(h.doc.nodes)) throw new Error('snapshot inválido')
                            useStore.getState().importDoc(h.doc)
                            toast(`Versão das ${fmt(h.ts)} restaurada.`)
                            setTimeout(() => fitView({ padding: 0.12 }), 60)
                          } catch {
                            toast('Snapshot corrompido — não foi possível restaurar.', 'error')
                          }
                        }
                        close()
                      }}
                    >
                      Restaurar versão das {fmt(h.ts)} — {h.doc.name}
                    </button>
                  ))}
                </>
              )}
            </>
          )
        }}
      </Menu>
      <div className="af-divider" />
      <button className="af-btn is-primary" onClick={onPresent} title="Modo apresentação (tela cheia)">
        <IcPresent /> Apresentar
      </button>
    </header>
  )
}
