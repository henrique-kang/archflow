interface P {
  size?: number
}

function I({ size = 15, d, fill }: P & { d: string; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}

export const IcUndo = (p: P) => <I {...p} d="M8 5 4 9l4 4M4 9h10a6 6 0 0 1 0 12h-3" />
export const IcRedo = (p: P) => <I {...p} d="M16 5l4 4-4 4M20 9H10a6 6 0 0 0 0 12h3" />
export const IcPlay = (p: P) => <I {...p} fill d="M7 4.8v14.4a.7.7 0 0 0 1.06.6l12-7.2a.7.7 0 0 0 0-1.2l-12-7.2A.7.7 0 0 0 7 4.8z" />
export const IcPause = (p: P) => <I {...p} fill d="M6.5 4h3.4v16H6.5zM14.1 4h3.4v16h-3.4z" />
export const IcPlus = (p: P) => <I {...p} d="M12 5v14M5 12h14" />
export const IcTrash = (p: P) => <I {...p} d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
export const IcPencil = (p: P) => <I {...p} d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
export const IcX = (p: P) => <I {...p} d="M6 6l12 12M18 6 6 18" />
export const IcUp = (p: P) => <I {...p} d="M6 14.5 12 8.5l6 6" />
export const IcDown = (p: P) => <I {...p} d="M6 9.5l6 6 6-6" />
export const IcImport = (p: P) => <I {...p} d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16" />
export const IcExport = (p: P) => <I {...p} d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 19.5h16" />
export const IcPresent = (p: P) => <I {...p} d="M3.5 4.5h17v11h-17zM12 15.5V19M8.5 21h7M10.3 7.5l4 2.5-4 2.5z" />
export const IcFit = (p: P) => <I {...p} d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
export const IcMore = (p: P) => <I {...p} fill d="M5 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm7 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm7 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z" />
export const IcCheck = (p: P) => <I {...p} d="M5 12.5 10 17.5 19 6.5" />
export const IcGroup = (p: P) => <I {...p} d="M4.5 6.5v-2h2M17.5 4.5h2v2M19.5 17.5v2h-2M6.5 19.5h-2v-2M9 9h11v11H9z" />
export const IcTarget = (p: P) => <I {...p} d="M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3" />
export const IcLayers = (p: P) => <I {...p} d="M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5" />
export const IcEye = (p: P) => <I {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 12m-2.6 0a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0" />
