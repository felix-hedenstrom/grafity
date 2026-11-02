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
export const MAX_VIEW_SIZE = 1600
/** Smallest the camera window ever shrinks to, even with no other walkers to fit in frame — keeps nodes a comfortable, legible size. */
export const MIN_VIEW_SIZE = 500
/** How many of the main walker's nearest companions the camera tries to keep in frame alongside it. */
const VISIBLE_OTHER_WALKERS = 2
/** Multiplies the span needed to just barely fit the included walkers, so they land comfortably inside the window instead of right at its edge. */
const SPAN_MARGIN = 1.4

/**
 * Sizes the camera window around the main walker so its nearest couple of companions stay in
 * frame too, instead of a size based only on graph size — on a big, spread-out graph a fixed
 * window either wastes space when walkers happen to be close together, or crops everyone but the
 * main walker out when they're not. Falls back toward MIN_VIEW_SIZE when there's nothing else to
 * fit (no other walkers, or they're already close by), and never exceeds MAX_VIEW_SIZE even if
 * the nearest others are extremely far away.
 */
export function computeDynamicViewSize(mainPos: { x: number; y: number }, otherPositions: { x: number; y: number }[]): number {
  const nearest = [...otherPositions]
    .sort((a, b) => Math.hypot(a.x - mainPos.x, a.y - mainPos.y) - Math.hypot(b.x - mainPos.x, b.y - mainPos.y))
    .slice(0, VISIBLE_OTHER_WALKERS)
  const halfSpan = nearest.reduce((max, p) => Math.max(max, Math.abs(p.x - mainPos.x), Math.abs(p.y - mainPos.y)), 0)
  return Math.min(MAX_VIEW_SIZE, Math.max(MIN_VIEW_SIZE, halfSpan * 2 * SPAN_MARGIN))
}

/**
 * The bounds GraphView should actually render: the whole graph's bounds when they're small enough
 * to stay legible, or a maxSize-square window centered on (focusX, focusY) — typically the main
 * walker's position — once the graph has grown past that. Node circles are a fixed radius in the
 * same coordinate units as positions, so capping the viewBox size is what keeps them a constant,
 * readable on-screen size regardless of how big the graph gets; each dimension is capped
 * independently so a graph that's only oversized in one direction doesn't get needlessly cropped
 * in the other, and the window is clamped so it never drifts past the graph's actual extent.
 */
export function computeViewBounds(graph: Graph, focusX: number, focusY: number, maxSize = MAX_VIEW_SIZE): GraphBounds {
  const full = computeGraphBounds(graph)

  const width = Math.min(Math.max(full.width, MIN_VIEW_SIZE), maxSize)
  const height = Math.min(Math.max(full.height, MIN_VIEW_SIZE), maxSize)

  // Three cases: the graph is small enough to pad out to MIN_VIEW_SIZE (center on the graph
  // itself, so it gets even breathing room on all sides), it fits within maxSize as-is (use its
  // own bounds directly), or it's bigger than maxSize (window centered on the focus/walker).
  const rawMinX = width > full.width ? full.minX + full.width / 2 - width / 2 : full.width <= maxSize ? full.minX : focusX - width / 2
  const rawMinY = height > full.height ? full.minY + full.height / 2 - height / 2 : full.height <= maxSize ? full.minY : focusY - height / 2

  const minX = width <= full.width ? Math.min(Math.max(rawMinX, full.minX), full.minX + full.width - width) : rawMinX
  const minY = height <= full.height ? Math.min(Math.max(rawMinY, full.minY), full.minY + full.height - height) : rawMinY

  return { minX, minY, width, height }
}
