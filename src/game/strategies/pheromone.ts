import { pickRandom } from '../../utils/rng'
import { edgeId } from '../graph/types'
import type { NodeId } from '../graph/types'
import { filterByMemory } from './memory'
import type { StrategyContext, TraversalStrategy } from './types'

/** Per-decision decay factor: a trail left N decisions ago is worth DECAY^N of its deposit. Decaying by decision count (not wall clock) keeps the strategy pure and sim-replayable — and means a bigger fleet, deciding more often, collectively fades old trails faster. */
const DECAY = 0.97
/** A trail whose effective amount has decayed below this is as good as gone — used when pruning. */
const NEGLIGIBLE_TRAIL = 0.01
/** Prune the trail record once it holds more than this many times the graph's edge count, so the run save never bloats. */
const PRUNE_RATIO = 4

/** JSON-safe shared state: one global decision counter plus, per edge, the (already-decayed-to-`tick`) amount and when it was last touched. Lazy decay — nothing is ever swept, each read just applies DECAY^(now - then). */
interface PheromoneMemory {
  tick: number
  trails: Record<string, { amount: number; tick: number }>
}

function isPheromoneMemory(value: unknown): value is PheromoneMemory {
  return typeof value === 'object' && value !== null && 'trails' in value && 'tick' in value
}

function effectiveTrail(memory: PheromoneMemory, id: string): number {
  const entry = memory.trails[id]
  return entry ? entry.amount * DECAY ** (memory.tick - entry.tick) : 0
}

function deposit(memory: PheromoneMemory, id: string): void {
  memory.trails[id] = { amount: effectiveTrail(memory, id) + 1, tick: memory.tick }
}

function pruneIfBloated(memory: PheromoneMemory, edgeCount: number): void {
  const ids = Object.keys(memory.trails)
  if (ids.length <= edgeCount * PRUNE_RATIO) return
  for (const id of ids) {
    if (effectiveTrail(memory, id) < NEGLIGIBLE_TRAIL) delete memory.trails[id]
  }
}

/** The candidates the swarm actually weighs: unexplored neighbors always beat trailed ones, and Node Memory's window applies first like everywhere else. */
function candidatesFor(ctx: StrategyContext): NodeId[] {
  const allNeighbors = ctx.graph.adjacency[ctx.walker.currentNodeId]
  const filtered = filterByMemory(allNeighbors, ctx)
  const neighbors = filtered.length > 0 ? filtered : allNeighbors
  const unvisited = neighbors.filter((id) => !ctx.discovery.visitedNodeIds.has(id))
  return unvisited.length > 0 ? unvisited : neighbors
}

/** Of the candidates, the ones tied for the faintest trail from here. */
function faintestTrailCandidates(ctx: StrategyContext, memory: PheromoneMemory): NodeId[] {
  const candidates = candidatesFor(ctx)
  let best: NodeId[] = []
  let bestTrail = Infinity
  for (const candidate of candidates) {
    const trail = effectiveTrail(memory, edgeId(ctx.walker.currentNodeId, candidate))
    if (trail < bestTrail) {
      bestTrail = trail
      best = [candidate]
    } else if (trail === bestTrail) {
      best.push(candidate)
    }
  }
  return best
}

/**
 * Every ship leaves a decaying pheromone trail on each edge it crosses, and every ship steers
 * toward the faintest trail it can see — so the fleet spreads out instead of clumping, without
 * ever talking to each other. The trail map is shared across ALL walkers (createSharedMemory),
 * which makes this the first algorithm that genuinely gets better with every extra UFO.
 * Single-ship it behaves like a decaying self-avoiding walk, somewhere between DFS and Greedy
 * Frontier.
 */
export const pheromone: TraversalStrategy = {
  id: 'pheromone',
  name: 'Pheromone Trails',
  memoryMultiplier: 1.5,
  createSharedMemory(): PheromoneMemory {
    return { tick: 0, trails: {} }
  },
  chooseNextNode(ctx) {
    const { graph, walker } = ctx
    if (!isPheromoneMemory(ctx.sharedMemory)) {
      return pickRandom(Math.random, graph.adjacency[walker.currentNodeId])
    }
    const memory = ctx.sharedMemory
    memory.tick++
    const next = pickRandom(Math.random, faintestTrailCandidates(ctx, memory))
    // Depositing at decision time is correct — every decision is a traversal of exactly that edge.
    deposit(memory, edgeId(walker.currentNodeId, next))
    pruneIfBloated(memory, graph.edges.length)
    return next
  },
  getHighlightedNodes(ctx) {
    if (!isPheromoneMemory(ctx.sharedMemory)) return []
    const memory = ctx.sharedMemory
    // The ~20 strongest trails right now, shown by lighting up their endpoints.
    const strongest = Object.keys(memory.trails)
      .map((id) => ({ id, trail: effectiveTrail(memory, id) }))
      .filter(({ trail }) => trail >= NEGLIGIBLE_TRAIL)
      .sort((a, b) => b.trail - a.trail)
      .slice(0, 20)
    const nodeIds = new Set<NodeId>()
    for (const { id } of strongest) {
      const [a, b] = id.split('--')
      if (a) nodeIds.add(a)
      if (b) nodeIds.add(b)
    }
    return [{ kind: 'trail', nodeIds }]
  },
}
