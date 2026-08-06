import type { IconId } from '../model/types'

/**
 * Biblioteca de glifos 24×24, traço 1.75, terminações arredondadas.
 * Fonte única de verdade: os mesmos paths alimentam a UI (React) e o export SVG.
 */
export const GLYPHS: Record<IconId, { title: string; paths: string[] }> = {
  sqs: {
    title: 'Fila SQS',
    paths: [
      'M3.5 7.5h17v9h-17z',
      'M8 10l2.5 2L8 14',
      'M13 10l2.5 2L13 14',
    ],
  },
  queue: {
    title: 'Fila',
    paths: [
      'M3.5 7.5h17v9h-17z',
      'M8 10l2.5 2L8 14',
      'M13 10l2.5 2L13 14',
    ],
  },
  sns: {
    title: 'Tópico SNS',
    paths: [
      'M5 9.5v5l7 3.5v-12z',
      'M12 8.5l6-2v11l-6-2',
      'M20.5 10.5v3',
    ],
  },
  lambda: {
    title: 'Lambda',
    paths: ['M6.5 4.5h4l6.5 15h-3.5', 'M11.5 12.5 7 19.5'],
  },
  function: {
    title: 'Função',
    paths: ['M6.5 4.5h4l6.5 15h-3.5', 'M11.5 12.5 7 19.5'],
  },
  s3: {
    title: 'Bucket S3',
    paths: [
      'M5 5.5c0 1.1 3.1 2 7 2s7-.9 7-2-3.1-2-7-2-7 .9-7 2z',
      'M5 5.5l2 13c0 1 2.2 2 5 2s5-1 5-2l2-13',
    ],
  },
  apigw: {
    title: 'API Gateway',
    paths: [
      'M12 3.5v17',
      'M8.5 8.5 5 12l3.5 3.5',
      'M15.5 8.5 19 12l-3.5 3.5',
    ],
  },
  client: {
    title: 'Cliente',
    paths: [
      'M4 5h16v11H4z',
      'M9.5 19.5h5',
      'M12 16v3.5',
    ],
  },
  service: {
    title: 'Serviço',
    paths: [
      'M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5z',
      'M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.55 1.55M7.55 16.45 6 18M18 18l-1.55-1.55M7.55 7.55 6 6',
    ],
  },
  storage: {
    title: 'Storage',
    paths: [
      'M5 6.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5S15.9 4 12 4 5 5.1 5 6.5z',
      'M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11',
      'M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
    ],
  },
  external: {
    title: 'Sistema externo',
    paths: [
      'M7 17.5a3.8 3.8 0 0 1-.4-7.6 5.4 5.4 0 0 1 10.5-1.2 4.4 4.4 0 0 1-.6 8.8z',
    ],
  },
  webhook: {
    title: 'Webhook',
    paths: [
      'M10.5 5.5a3.4 3.4 0 1 1 4.9 3l-3 5.3',
      'M8.6 10.8l-2.9 5a3.4 3.4 0 1 0 4.7 1.2h6.2a3.4 3.4 0 1 1-.3 2.2',
    ],
  },
  generic: {
    title: 'Componente',
    paths: ['M5 5h14v14H5z'],
  },
}

export const ICON_IDS = Object.keys(GLYPHS) as IconId[]

export function Glyph({ icon, size = 16, color }: { icon: IconId; size?: number; color?: string }) {
  const g = GLYPHS[icon] ?? GLYPHS.generic
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {g.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

/** Paths crus para o export SVG. */
export function glyphPaths(icon: IconId): string[] {
  return (GLYPHS[icon] ?? GLYPHS.generic).paths
}
