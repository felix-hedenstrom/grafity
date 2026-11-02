import type { Graph } from './types'

export interface GraphBounds {
  minX: number
  minY: number
  width: number
  height: number
}

const BOUNDS_PADDING = 40

/**
 * Bounds of the *whole* graph (not just discovered nodes), so the SVG
 * viewBox can be sized once per graph and stay fixed — sizing it to only
 * the discovered subset would make the view rescale on every reveal, which
 * is exactly the kind of instability static positions were meant to fix.
 */
export function computeGraphBounds(graph: Graph): GraphBounds {
  const xs = graph.nodes.map((node) => node.x ?? 0)
  const ys = graph.nodes.map((node) => node.y ?? 0)
  const minX = Math.min(...xs) - BOUNDS_PADDING
  const minY = Math.min(...ys) - BOUNDS_PADDING
  const maxX = Math.max(...xs) + BOUNDS_PADDING
  const maxY = Math.max(...ys) + BOUNDS_PADDING
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** Past this size (in layout units, same scale as node spacing), fitting the whole graph in view shrinks node circles to near-invisible dots — better to show a fixed-size window instead. */
export const MAX_VIEW_SIZE = 900

/**
 * The bounds GraphView should actually render: the whole graph's bounds when they're small enough
 * to stay legible, or a MAX_VIEW_SIZE-square window centered on (focusX, focusY) — typically the
 * walkers' position — once the graph has grown past that. Node circles are a fixed radius in the
 * same coordinate units as positions, so capping the viewBox size is what keeps them a constant,
 * readable on-screen size regardless of how big the graph gets; each dimension is capped
 * independently so a graph that's only oversized in one direction doesn't get needlessly cropped
 * in the other, and the window is clamped so it never drifts past the graph's actual extent.
 */
export function computeViewBounds(graph: Graph, focusX: number, focusY: number, maxSize = MAX_VIEW_SIZE): GraphBounds {
  const full = computeGraphBounds(graph)

  const width = Math.min(full.width, maxSize)
  const height = Math.min(full.height, maxSize)

  const rawMinX = full.width <= maxSize ? full.minX : focusX - width / 2
  const rawMinY = full.height <= maxSize ? full.minY : focusY - height / 2

  const minX = Math.min(Math.max(rawMinX, full.minX), full.minX + full.width - width)
  const minY = Math.min(Math.max(rawMinY, full.minY), full.minY + full.height - height)

  return { minX, minY, width, height }
}
