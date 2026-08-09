import type { XY } from '../model/types'

/**
 * Última posição do cursor sobre o canvas, em coordenadas do diagrama.
 * Usada para colar onde o mouse está (comportamento draw.io/Figma).
 */
let canvasPointer: XY | null = null

export function setCanvasPointer(p: XY | null) {
  canvasPointer = p
}

export function getCanvasPointer(): XY | null {
  return canvasPointer
}
