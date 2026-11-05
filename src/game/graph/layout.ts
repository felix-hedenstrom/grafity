import { PRODUCTION_CONFIG } from '../config/production'
import type { Graph } from './types'
import { getEdgeWeight } from './types'

export interface GraphBounds {
  minX: number
  minY: number
  width: number
  height: number
}

/** Padding around the graph's node centers as a fraction of its shortest edge. Star glyphs scale
 * with node spacing (GraphView's starScale), so padding must too — a flat constant gets dwarfed on
 * high-level graphs and the edge beacons' glows get cropped at full zoom-out. 0.65 covers the
 * worst case: a beacon's outer glow spans ~0.58 × minEdgeLength when zoom-out star growth maxes
 * out (BEACON_RADIUS × spacingStarScale × MAX_STAR_ZOOM_GROWTH × the glow layer's 0.46 extent). */
const BOUNDS_PAD_FRACTION = 0.65

/** Fallback spacing for graphs with no edges, where no spacing can be measured. */
const EDGELESS_SPACING = 40

/** Shortest edge in the graph — the actual measured minimum spacing between adjacent nodes, used to keep both view padding and star rendering proportioned to how tightly packed the graph really is. */
export function minEdgeLength(graph: Graph): number {
  return graph.edges.length > 0 ? Math.min(...graph.edges.map((e) => getEdgeWeight(graph, e.source, e.target))) : EDGELESS_SPACING
}

/**
 * Bounds of the *whole* graph (not just discovered nodes), so the SVG
 * viewBox can be sized once per graph and stay fixed — sizing it to only
 * the discovered subset would make the view rescale on every reveal, which
 * is exactly the kind of instability static positions were meant to fix.
 *
 * Padding is proportional to the graph's own measured node spacing (its shortest edge), for the
 * same reason stars are: both must stay in proportion to the layout at every level. Proportional
 * padding stays below the shortest edge on tight early graphs (so it can't dominate a tiny graph's
 * view as empty space) while growing with spread-out high-level ones (so the scaled-up beacon
 * glyphs at the graph's edge aren't cropped at full zoom-out).
 */
export function computeGraphBounds(graph: Graph): GraphBounds {
  const xs = graph.nodes.map((node) => node.x ?? 0)
  const ys = graph.nodes.map((node) => node.y ?? 0)
  const padding = minEdgeLength(graph) * BOUNDS_PAD_FRACTION
  const minX = Math.min(...xs) - padding
  const minY = Math.min(...ys) - padding
  const maxX = Math.max(...xs) + padding
  const maxY = Math.max(...ys) + padding
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/**
 * How many multiples of the reference spacing (PRODUCTION_CONFIG.graph.spacingAtReferenceCount) this graph's actual node
 * spacing is — the single zoom knob that keeps the view scale-invariant across levels. Node
 * spacing grows super-linearly with graph size (see generatePlanar's spacingScaleForNodeCount),
 * while the view-size constants below are all tuned for a level-7 graph; multiplying them by this
 * keeps the same number of stars (and the same star/ship proportions) on screen at every level.
 * Floored at 1 so tiny or edge-less graphs keep the untuned, reference behavior.
 */
export function viewScale(graph: Graph): number {
  return Math.max(1, minEdgeLength(graph) / PRODUCTION_CONFIG.graph.spacingAtReferenceCount)
}

/** Past this size (in layout units at reference spacing — multiplied by viewScale on real graphs), fitting the whole graph in view shrinks node circles to near-invisible dots — better to show a fixed-size window instead. */
export const MAX_VIEW_SIZE = 1600
/** Smallest the camera window ever shrinks to, even with no other walkers to fit in frame — keeps nodes a comfortable, legible size. Only used for the walker-proximity zoom (computeDynamicViewSize) and the walker scale it feeds into — NOT for padding a small whole-graph view, which uses MIN_GRAPH_VIEW_SIZE instead, since graph sizes now range far below this (level-7 graphs are far smaller than a few walkers' proximity window ever needs to be). */
export const MIN_VIEW_SIZE = 500
/** Smallest a player-controlled manual zoom is allowed to shrink the camera window to — lower
 * than MIN_VIEW_SIZE since manual zoom is explicitly for getting a closer look than the
 * automatic walker-tracking camera ever bothers to, not for keeping a comfortable fallback size. */
export const MANUAL_MIN_VIEW_SIZE = 150
/** Smallest the whole-graph view ever pads out to when the graph itself is smaller than this — much lower than MIN_VIEW_SIZE so an early, naturally tiny graph isn't zoomed out several times past its real size. */
export const MIN_GRAPH_VIEW_SIZE = 100
/** How many of the main walker's nearest companions the camera tries to keep in frame alongside it. */
const VISIBLE_OTHER_WALKERS = 2
/** How many stars the camera window guarantees in frame around the main walker — the walker's own
 * node plus this many nearest neighbors. A hard floor on window size computed from real node
 * positions, because node density is deliberately uneven (generatePlanar's warp): keying the
 * window to average spacing alone leaves the walker alone in frame in the sparse regions. */
const VISIBLE_NEARBY_STARS = 4
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
export function computeDynamicViewSize(
  mainPos: { x: number; y: number },
  otherPositions: { x: number; y: number }[],
  scale = 1,
  graph?: Graph,
): number {
  const nearest = [...otherPositions]
    .sort((a, b) => Math.hypot(a.x - mainPos.x, a.y - mainPos.y) - Math.hypot(b.x - mainPos.x, b.y - mainPos.y))
    .slice(0, VISIBLE_OTHER_WALKERS)
  const halfSpan = nearest.reduce((max, p) => Math.max(max, Math.abs(p.x - mainPos.x), Math.abs(p.y - mainPos.y)), 0)
  // halfSpan is measured in graph units so it scales with spacing on its own — only the min/max
  // clamps are tuned for reference spacing and need the viewScale multiplier.
  const walkerSize = Math.min(MAX_VIEW_SIZE * scale, Math.max(MIN_VIEW_SIZE * scale, halfSpan * 2 * SPAN_MARGIN))
  // The nearby-stars floor deliberately sits OUTSIDE the max clamp: in the sparsest warped regions
  // keeping ~5 stars in frame matters more than the comfortable zoom ceiling.
  return Math.max(walkerSize, graph ? nearbyStarsViewSize(mainPos, graph) : 0)
}

/**
 * Smallest window centered on `pos` that keeps the walker's own star plus its
 * VISIBLE_NEARBY_STARS nearest neighbors in frame (with the same comfort margin as the walker
 * span) — the "always at least ~5 stars on screen" guarantee, measured against the actual node
 * layout rather than any average spacing, so it adapts to the deliberately uneven node density.
 */
export function nearbyStarsViewSize(pos: { x: number; y: number }, graph: Graph): number {
  // Chebyshev distance, since the window that must contain a point is square.
  const distances = graph.nodes
    .map((n) => Math.max(Math.abs((n.x ?? 0) - pos.x), Math.abs((n.y ?? 0) - pos.y)))
    .sort((a, b) => a - b)
  // distances[0] is (near) zero — the walker's own node. Index VISIBLE_NEARBY_STARS is the
  // farthest of the neighbors that must fit.
  const halfSpan = distances[Math.min(VISIBLE_NEARBY_STARS, distances.length - 1)] ?? 0
  return halfSpan * 2 * SPAN_MARGIN
}

/**
 * The bounds GraphView should actually render: the whole graph's bounds when they're small enough
 * to stay legible, or a maxSize-square window centered on (focusX, focusY) — typically the main
 * walker's position — once the graph has grown past that. Node circles are a fixed radius in the
 * same coordinate units as positions, so capping the viewBox size is what keeps them a constant,
 * readable on-screen size regardless of how big the graph gets; each dimension is capped
 * independently so a graph that's only oversized in one direction doesn't get needlessly cropped
 * in the other. The window deliberately is NOT clamped to the graph's extent — near a map edge
 * it keeps the walker centered and shows empty space beyond the edge, rather than pinning to the
 * boundary and letting the walker drift off-center.
 * `containerAspectRatio`, when given, then grows whichever axis is narrower relative to that
 * ratio so the viewBox fills the on-screen SVG box instead of being letterboxed by the default
 * `xMidYMid meet` scaling.
 */
export function computeViewBounds(
  graph: Graph,
  focusX: number,
  focusY: number,
  maxSize = MAX_VIEW_SIZE,
  containerAspectRatio?: number,
): GraphBounds {
  const full = computeGraphBounds(graph)

  const width = Math.min(Math.max(full.width, MIN_GRAPH_VIEW_SIZE), maxSize)
  const height = Math.min(Math.max(full.height, MIN_GRAPH_VIEW_SIZE), maxSize)

  // Three cases: the graph is small enough to pad out to MIN_GRAPH_VIEW_SIZE (center on the
  // graph itself, so it gets even breathing room on all sides), it fits within maxSize as-is
  // (use its own bounds directly), or it's bigger than maxSize (window centered on the focus/walker).
  const minX = width > full.width ? full.minX + full.width / 2 - width / 2 : full.width <= maxSize ? full.minX : focusX - width / 2
  const minY = height > full.height ? full.minY + full.height / 2 - height / 2 : full.height <= maxSize ? full.minY : focusY - height / 2

  const bounds = { minX, minY, width, height }
  return containerAspectRatio && containerAspectRatio > 0 ? expandToAspectRatio(bounds, containerAspectRatio) : bounds
}

/**
 * Grows the narrower axis of `bounds` (never shrinks the wider one) so its aspect ratio matches
 * the container's actual on-screen pixel aspect ratio. Without this, a viewBox whose aspect ratio
 * doesn't match the SVG's rendered box gets letterboxed by the default `xMidYMid meet` scaling —
 * shrunk to fit the tighter axis, with the other axis padded by dead empty space. This expands in
 * graph space instead, so the previously-binding axis keeps its exact size (same on-screen zoom)
 * while the other axis just reveals more of the world around the same center — the grown axis
 * keeps the window's center (the walker, when windowed) rather than clamping back inside the
 * graph's extent. The grown axis may end up larger than maxSize/MAX_VIEW_SIZE — that's expected
 * and correct, since it reveals more world at an unchanged scale rather than changing the scale;
 * don't cap it back down.
 */
function expandToAspectRatio(bounds: GraphBounds, aspectRatio: number): GraphBounds {
  const currentRatio = bounds.width / bounds.height
  if (currentRatio < aspectRatio) {
    const width = bounds.height * aspectRatio
    return { ...bounds, width, minX: bounds.minX + bounds.width / 2 - width / 2 }
  }
  if (currentRatio > aspectRatio) {
    const height = bounds.width / aspectRatio
    return { ...bounds, height, minY: bounds.minY + bounds.height / 2 - height / 2 }
  }
  return bounds
}
