/**
 * Estado compartilhado de gestos de aresta: o clique sintetizado logo após um
 * arrasto não deve virar seleção/hop (o pointerup global encerra o gesto antes
 * do handler React, então stopPropagation não alcança o click).
 */
let lastGestureEndAt = 0

export function markGestureEnd() {
  lastGestureEndAt = performance.now()
}

export function gestureJustEnded(windowMs = 250): boolean {
  return performance.now() - lastGestureEndAt < windowMs
}
