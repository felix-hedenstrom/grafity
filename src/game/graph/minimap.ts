import type { GraphBounds } from './layout'

export interface MinimapTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Uniform (non-distorting) scale + centering offset that fits `fullBounds` inside a
 * `minimapWidth` x `minimapHeight` box — letterboxed on whichever axis doesn't exactly match the
 * graph's aspect ratio, rather than stretched, so the minimap's shape actually matches the graph's.
 */
export function computeMinimapTransform(fullBounds: GraphBounds, minimapWidth: number, minimapHeight: number): MinimapTransform {
  const scale = Math.min(minimapWidth / fullBounds.width, minimapHeight / fullBounds.height)
  const offsetX = (minimapWidth - fullBounds.width * scale) / 2
  const offsetY = (minimapHeight - fullBounds.height * scale) / 2
  return { scale, offsetX, offsetY }
}

/** Projects a point in graph (layout) space into minimap pixel space, using a transform from computeMinimapTransform. */
export function projectToMinimap(x: number, y: number, fullBounds: GraphBounds, transform: MinimapTransform): { x: number; y: number } {
  return {
    x: (x - fullBounds.minX) * transform.scale + transform.offsetX,
    y: (y - fullBounds.minY) * transform.scale + transform.offsetY,
  }
}
