import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { Graph, NodeId } from './types'

export const LAYOUT_WIDTH = 800
export const LAYOUT_HEIGHT = 600

/** Clarity is repeatable — each purchase spreads nodes farther apart and pushes them harder away from each other, untangling what would otherwise become a dense hairball as graphs grow. */
export const CLARITY_BASE_COST = 300
export const CLARITY_COST_GROWTH = 1.4

const BASE_CHARGE_STRENGTH = -150
const BASE_LINK_DISTANCE = 70
const BASE_COLLIDE_RADIUS = 20
const CHARGE_STRENGTH_PER_LEVEL = -40
const LINK_DISTANCE_PER_LEVEL = 10
const COLLIDE_RADIUS_PER_LEVEL = 3

export interface LayoutForces {
  chargeStrength: number
  linkDistance: number
  collideRadius: number
}

export function computeLayoutForces(clarityLevel: number): LayoutForces {
  return {
    chargeStrength: BASE_CHARGE_STRENGTH + clarityLevel * CHARGE_STRENGTH_PER_LEVEL,
    linkDistance: BASE_LINK_DISTANCE + clarityLevel * LINK_DISTANCE_PER_LEVEL,
    collideRadius: BASE_COLLIDE_RADIUS + clarityLevel * COLLIDE_RADIUS_PER_LEVEL,
  }
}

interface SimNode extends SimulationNodeDatum {
  id: NodeId
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string
}

/**
 * Runs the whole graph's layout to convergence once and bakes the result
 * into each node's x/y — positions are then static for the graph's
 * lifetime. This is deliberate: running the simulation live as fog-of-war
 * reveals new nodes made the *already-visible* part of the graph visibly
 * reshuffle on every reveal, which read as the graph "re-forming" rather
 * than simply being explored. Laying out the full graph (including
 * not-yet-discovered nodes) up front means a reveal only ever shows more of
 * a shape that was already fixed.
 */
export function layoutGraph(graph: Graph, clarityLevel = 0): Graph {
  const simNodes: SimNode[] = graph.nodes.map((node) => ({ id: node.id }))
  const simLinks: SimLink[] = graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
  const { chargeStrength, linkDistance, collideRadius } = computeLayoutForces(clarityLevel)

  const simulation = forceSimulation<SimNode, SimLink>(simNodes)
    .force('charge', forceManyBody().strength(chargeStrength))
    .force('center', forceCenter(LAYOUT_WIDTH / 2, LAYOUT_HEIGHT / 2))
    .force('collide', forceCollide(collideRadius))
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(linkDistance),
    )
    .stop()

  // d3's forceSimulation auto-starts its own timer; .stop() above cancels
  // that so we can drive convergence synchronously instead.
  const tickCount = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()))
  for (let i = 0; i < tickCount; i++) {
    simulation.tick()
  }

  const positionById = new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, ...positionById.get(node.id) })),
  }
}

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

/** Past this size (in layout units, same scale as link distance), fitting the whole graph in view shrinks node circles to near-invisible dots — better to show a fixed-size window instead. */
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
