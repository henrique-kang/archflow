import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MenuProps {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  title?: string
}

/** Dropdown mínimo ancorado no botão. */
export function Menu({ trigger, children, title }: MenuProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
        setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <div
        ref={btnRef}
        style={{ display: 'inline-flex' }}
        title={title}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setPos({ x: Math.min(r.left, window.innerWidth - 210), y: r.bottom + 6 })
          setOpen((v) => !v)
        }}
      >
        {trigger}
      </div>
      {open && (
        <div ref={menuRef} className="af-menu" style={{ left: pos.x, top: pos.y }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  )
}
