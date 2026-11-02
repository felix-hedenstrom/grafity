import type { NodeId } from '../graph/types'
import type { StrategyContext } from './types'

export const NODE_MEMORY_BASE_COST = 100
export const NODE_MEMORY_COST_GROWTH = 1.15

/** Deep Memory is repeatable and expensive — each purchase multiplies the effective Node Memory level by another 20%, compounding, uncapped. */
export const DEEP_MEMORY_PERCENT_PER_LEVEL = 0.2
export const DEEP_MEMORY_BASE_COST = 2000
export const DEEP_MEMORY_COST_GROWTH = 1.3

/**
 * How many nodes Node Memory actually covers once Deep Memory's compounding multiplier AND the
 * active strategy's own memoryMultiplier are applied — this is what ends up in
 * StrategyContext.memoryLevel, not the raw owned level.
 */
export function computeEffectiveMemoryLevel(memoryLevel: number, deepMemoryLevel: number, strategyMultiplier: number): number {
  const deepMultiplier = (1 + DEEP_MEMORY_PERCENT_PER_LEVEL) ** deepMemoryLevel
  return Math.round(memoryLevel * deepMultiplier * strategyMultiplier)
}

/**
 * The last `memoryLevel` nodes visited before the walker's current position. path's last entry
 * IS the current position (never a candidate neighbor of itself), so it's excluded from the
 * window — memoryLevel=1 means "the node I just came from".
 */
export function rememberedNodes(path: NodeId[], memoryLevel: number): Set<NodeId> {
  if (memoryLevel <= 0) return new Set()
  const history = path.slice(0, -1)
  return new Set(history.slice(-memoryLevel))
}

/** Of a forced set of candidates (all remembered), the one visited longest ago — never visited counts as oldest of all. */
function oldestCandidate(candidates: NodeId[], path: NodeId[]): NodeId {
  let oldest = candidates[0]
  let oldestIndex = path.lastIndexOf(oldest)
  for (const candidate of candidates.slice(1)) {
    const index = path.lastIndexOf(candidate)
    if (index < oldestIndex) {
      oldest = candidate
      oldestIndex = index
    }
  }
  return oldest
}

/**
 * Hop-distance from every discovered node to the nearest discovered-but-unvisited node (the
 * "frontier"), via one multi-source BFS seeded from every frontier node at once — so looking up
 * any candidate's distance afterward is a single map read rather than its own search. Nodes with
 * no discovered path to any frontier node (or when there's no frontier left at all) are absent.
 */
function computeFrontierDistances(ctx: StrategyContext): Map<NodeId, number> {
  const { graph, discovery } = ctx
  const distances = new Map<NodeId, number>()
  const queue: NodeId[] = []
  for (const id of discovery.discoveredNodeIds) {
    if (discovery.visitedNodeIds.has(id)) continue
    distances.set(id, 0)
    queue.push(id)
  }

  let head = 0
  while (head < queue.length) {
    const current = queue[head++]
    const currentDistance = distances.get(current) as number
    for (const neighbor of graph.adjacency[current] ?? []) {
      if (!discovery.discoveredNodeIds.has(neighbor) || distances.has(neighbor)) continue
      distances.set(neighbor, currentDistance + 1)
      queue.push(neighbor)
    }
  }
  return distances
}

/**
 * Of a forced set of candidates (all remembered), the one closest to the discovery frontier —
 * recency avoidance alone has no sense of direction, and could easily steer a walker away from
 * the one corridor leading back to unexplored territory just because it was "recently visited."
 * Ties (including "no frontier reachable from any candidate," e.g. a fully-discovered graph) fall
 * back to the oldest-visited candidate, same as before this existed.
 */
function bestForcedCandidate(candidates: NodeId[], ctx: StrategyContext): NodeId {
  const frontierDistances = computeFrontierDistances(ctx)
  if (frontierDistances.size === 0) return oldestCandidate(candidates, ctx.walker.path)

  let best = candidates[0]
  let bestDistance = frontierDistances.get(best) ?? Infinity
  let bestVisitIndex = ctx.walker.path.lastIndexOf(best)
  for (const candidate of candidates.slice(1)) {
    const distance = frontierDistances.get(candidate) ?? Infinity
    const visitIndex = ctx.walker.path.lastIndexOf(candidate)
    if (distance < bestDistance || (distance === bestDistance && visitIndex < bestVisitIndex)) {
      best = candidate
      bestDistance = distance
      bestVisitIndex = visitIndex
    }
  }
  return best
}

/**
 * Filters out candidates the walker currently remembers. Every strategy that picks among graph
 * neighbors should run its candidates through this, so Node Memory applies uniformly. If every
 * candidate is remembered — forced to revisit — narrows to just the single candidate closest to
 * the discovery frontier instead of picking uniformly among all of them, so a forced revisit
 * still drifts back toward unexplored territory rather than wandering the explored pocket.
 */
export function filterByMemory(candidates: NodeId[], ctx: StrategyContext): NodeId[] {
  const remembered = rememberedNodes(ctx.walker.path, ctx.memoryLevel)
  const novel = candidates.filter((id) => !remembered.has(id))
  if (novel.length > 0) return novel
  return [bestForcedCandidate(candidates, ctx)]
}

/** Truncates a DFS-style stack to the last memoryLevel entries, in place — the walker can't backtrack past what it still remembers. */
export function capMemoryStack(stack: NodeId[], memoryLevel: number): void {
  if (stack.length > memoryLevel) {
    stack.splice(0, stack.length - memoryLevel)
  }
}
