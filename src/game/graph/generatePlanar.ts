import { Delaunay } from 'd3-delaunay'
import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'
import type { Rng } from '../../utils/rng'
import { randomInt } from '../../utils/rng'
import type { Point } from './poissonDisk'
import { samplePoissonDisk } from './poissonDisk'
import type { Graph, GraphEdge, GraphNode, NodeId } from './types'
import { edgeId } from './types'

// All generation tunables (edge ratio, warp, spacing curve, packing) live in GameConfig's graph
// group — see config/types.ts for what each knob does and PRODUCTION_CONFIG for the shipped
// values, including the spacing/acceleration coupling that used to be documented here.
// config.graph.spacingAtReferenceCount is also the camera/star-sizing reference: layout.ts's
// viewScale treats a graph whose shortest edge equals it as 1x zoom, so view windows and star
// radii scale with it automatically.

/** How many multiples of the reference spacing this graph's nodeCount gets, uncapped so distances
 * keep scaling at every level, not just early ones. Since edge weight is real distance, this is
 * what makes early (small) graphs faster to cross and later (big) graphs slower, proportional to
 * level — see graph.spacingScaleExponent for why that growth is super-linear in nodeCount, and
 * graph.spacingLateKneeNodeCount for the second, steeper late-game regime (continuous at the knee). */
function spacingScaleForNodeCount(nodeCount: number, config: GameConfig): number {
  const base = (nodeCount / config.progression.startingGraphNodeCount) ** config.graph.spacingScaleExponent
  const late = Math.max(1, nodeCount / config.graph.spacingLateKneeNodeCount) ** config.graph.spacingLateExtraExponent
  return base * late
}

interface PlanarEdgeCandidate {
  a: number
  b: number
  distance: number
}

function shuffle<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

/** Samples roughly nodeCount points at the given spacing, growing the canvas and retrying if the first attempt falls short, then trims (or — vanishingly rarely — pads) to exactly nodeCount. */
function samplePointsForCount(nodeCount: number, spacing: number, rng: Rng, config: GameConfig): Point[] {
  let width = 0
  let height = 0
  let points: Point[] = []

  for (let attempt = 0; attempt < config.graph.maxSampleAttempts; attempt++) {
    const growth = 1 + attempt * 0.35
    const area = ((nodeCount * spacing * spacing) / config.graph.packingDensity) * growth
    width = Math.sqrt(area * config.graph.aspectRatio)
    height = area / width
    points = samplePoissonDisk(width, height, spacing, rng)
    if (points.length >= nodeCount) break
  }

  shuffle(points, rng)
  if (points.length >= nodeCount) return points.slice(0, nodeCount)

  // Only reachable if maxSampleAttempts' growth still wasn't enough — pad with plain uniform
  // points rather than fail outright; these won't respect minDistance, but that's an extreme
  // edge case (very small canvas, very high spacing) rather than the normal path.
  while (points.length < nodeCount) {
    points.push({ x: rng() * width, y: rng() * height })
  }
  return points
}

/** Every edge of the Delaunay triangulation, deduplicated, with its Euclidean length — the full set of crossing-free connections available to build the maze from. */
function extractDelaunayEdges(points: Point[], delaunay: Delaunay<Point>): PlanarEdgeCandidate[] {
  const seen = new Set<string>()
  const edges: PlanarEdgeCandidate[] = []

  function addEdge(i: number, j: number): void {
    const a = Math.min(i, j)
    const b = Math.max(i, j)
    const key = `${a}-${b}`
    if (seen.has(key)) return
    seen.add(key)
    const dx = points[a].x - points[b].x
    const dy = points[a].y - points[b].y
    edges.push({ a, b, distance: Math.sqrt(dx * dx + dy * dy) })
  }

  const { triangles } = delaunay
  for (let i = 0; i < triangles.length; i += 3) {
    addEdge(triangles[i], triangles[i + 1])
    addEdge(triangles[i + 1], triangles[i + 2])
    addEdge(triangles[i + 2], triangles[i])
  }
  return edges
}

/** Bounding box of the sampled points, used to scale the density warp to the actual canvas size. */
function computeBounds(points: Point[]): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const p of points) {
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { width: maxX, height: maxY }
}

/**
 * Poisson-disk sampling alone produces near-uniform spacing, so Delaunay edge lengths (which,
 * since edge weight = real distance, are also edge weights) would all cluster in a narrow band.
 * This pulls points toward — or pushes them away from — a handful of random attractors, in place,
 * so some regions end up dense (short, cheap edges) and others sparse (long, expensive edges),
 * widening the edge length spread considerably. Runs before triangulation, so Delaunay (and every
 * edge length derived from it) sees only the final warped positions — nothing downstream needs to
 * know this step happened.
 */
function warpPoints(points: Point[], width: number, height: number, rng: Rng, config: GameConfig): void {
  const falloffRadius = width * config.graph.warpFalloffRatio
  const attractors = Array.from({ length: config.graph.warpAttractorCount }, () => ({
    x: rng() * width,
    y: rng() * height,
    strength: (rng() * 2 - 1) * config.graph.warpStrength,
  }))

  for (const p of points) {
    let dx = 0
    let dy = 0
    for (const a of attractors) {
      const ax = a.x - p.x
      const ay = a.y - p.y
      const dist = Math.sqrt(ax * ax + ay * ay) || 1
      const falloff = 1 / (1 + dist / falloffRadius)
      dx += ax * a.strength * falloff
      dy += ay * a.strength * falloff
    }
    p.x += dx
    p.y += dy
  }
}

/**
 * warpPoints can drag points closer together than the Poisson-disk minimum spacing it ran after
 * (nothing about the attractor pull respects that invariant) — with few points, one strong
 * attractor can pull several into a near-single clump. This nudges apart only the pairs that
 * actually ended up too close, leaving everything already compliant (including the density
 * variation warping is meant to produce) untouched.
 */
function resolveOverlaps(points: Point[], minDistance: number, rng: Rng, config: GameConfig): void {
  // Resolving one too-close pair can nudge it into violating the minimum distance with a third
  // point, so convergence on a crowded cluster takes more than a couple of passes — hence
  // overlapResolveIterations in the twenties; still negligible cost, generation runs once per level.
  for (let iter = 0; iter < config.graph.overlapResolveIterations; iter++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        let dx = points[j].x - points[i].x
        let dy = points[j].y - points[i].y
        let dist = Math.hypot(dx, dy)
        if (dist >= minDistance) continue
        if (dist === 0) {
          const angle = rng() * Math.PI * 2
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist = 1
        }
        const push = (minDistance - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        points[i].x -= ux * push
        points[i].y -= uy * push
        points[j].x += ux * push
        points[j].y += uy * push
      }
    }
  }
}

function findFarthestNode(from: NodeId, adjacency: Record<NodeId, NodeId[]>): NodeId {
  const distances = new Map<NodeId, number>([[from, 0]])
  const queue: NodeId[] = [from]
  let farthest = from

  while (queue.length > 0) {
    const current = queue.shift() as NodeId
    const currentDistance = distances.get(current) as number
    for (const neighbor of adjacency[current]) {
      if (distances.has(neighbor)) continue
      distances.set(neighbor, currentDistance + 1)
      queue.push(neighbor)
      farthest = neighbor
    }
  }

  return farthest
}

/**
 * Generates a graph that is planar BY CONSTRUCTION — nodes are points sampled via Poisson-disk
 * (blue noise: evenly spread, no clumps or large gaps), and every edge comes from the Delaunay
 * triangulation of those points, so no two edges can ever cross, in this or any other view of the
 * same positions. A minimum spanning tree over the triangulation forms the maze's backbone
 * (guaranteed connected, using only crossing-free edges); a random subset of the remaining
 * triangulation edges is added back for loops, same role the old generator's extra random edges
 * played — except every candidate here is already local and planar, so loops never introduce a
 * long-range "shortcut" edge the way a uniformly-random pair could. Positions are final immediately
 * — there's no separate force-layout pass afterward, unlike the graph this replaced.
 */
export function generatePlanarGraph(nodeCount: number, rng: Rng = Math.random, config: GameConfig = PRODUCTION_CONFIG): Graph {
  if (nodeCount < 2) {
    throw new Error('generatePlanarGraph requires at least 2 nodes')
  }

  const spacing = config.graph.spacingAtReferenceCount * spacingScaleForNodeCount(nodeCount, config)
  const points = samplePointsForCount(nodeCount, spacing, rng, config)
  const bounds = computeBounds(points)
  warpPoints(points, bounds.width, bounds.height, rng, config)
  resolveOverlaps(points, spacing, rng, config)

  const delaunay = Delaunay.from(
    points,
    (p) => p.x,
    (p) => p.y,
  )
  const delaunayEdges = extractDelaunayEdges(points, delaunay)

  const nodeIds: NodeId[] = points.map((_, i) => `n${i}`)
  const edgesByKey = new Map<string, GraphEdge>()
  const adjacency: Record<NodeId, NodeId[]> = {}
  for (const id of nodeIds) adjacency[id] = []

  function connect(aIndex: number, bIndex: number): void {
    const a = nodeIds[aIndex]
    const b = nodeIds[bIndex]
    const key = edgeId(a, b)
    if (edgesByKey.has(key)) return
    edgesByKey.set(key, { id: key, source: a, target: b })
    adjacency[a].push(b)
    adjacency[b].push(a)
  }

  // Kruskal's, shortest edges first, using union-find — the shortest-possible spanning tree
  // within the already-planar Delaunay edge set.
  const sortedByLength = [...delaunayEdges].sort((e1, e2) => e1.distance - e2.distance)
  const parent = nodeIds.map((_, i) => i)
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }

  const remainingEdges: PlanarEdgeCandidate[] = []
  for (const edge of sortedByLength) {
    const rootA = find(edge.a)
    const rootB = find(edge.b)
    if (rootA !== rootB) {
      parent[rootA] = rootB
      connect(edge.a, edge.b)
    } else {
      remainingEdges.push(edge)
    }
  }

  const extraEdgeCount = Math.round(nodeCount * config.graph.extraEdgeRatio)
  shuffle(remainingEdges, rng)
  for (const edge of remainingEdges.slice(0, extraEdgeCount)) {
    connect(edge.a, edge.b)
  }

  const startNodeId = nodeIds[0]
  const goalNodeId = findFarthestNode(startNodeId, adjacency)

  const nodes: GraphNode[] = nodeIds.map((id, i) => ({
    id,
    isStart: id === startNodeId,
    isGoal: id === goalNodeId,
    x: points[i].x,
    y: points[i].y,
  }))

  return {
    nodes,
    edges: Array.from(edgesByKey.values()),
    startNodeId,
    goalNodeId,
    adjacency,
  }
}
