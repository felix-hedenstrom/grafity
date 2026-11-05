import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'
import type { NodeId } from '../graph/types'
import type { StrategyContext } from './types'

/**
 * How many nodes Node Memory actually covers once Deep Memory's compounding multiplier AND the
 * active strategy's own memoryMultiplier are applied — this is what ends up in
 * StrategyContext.memoryLevel, not the raw owned level. Deep Memory is repeatable and expensive —
 * each purchase multiplies the effective level by another percentPerLevel, compounding, uncapped.
 */
export function computeEffectiveMemoryLevel(memoryLevel: number, deepMemoryLevel: number, strategyMultiplier: number, config: GameConfig = PRODUCTION_CONFIG): number {
  const deepMultiplier = (1 + config.upgrades.deepMemory.percentPerLevel) ** deepMemoryLevel
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
 *
 * Traffic Control's excludedNodeIds are filtered out first and unconditionally — unlike memory,
 * which is a soft preference with a forced-revisit fallback, a claimed node is never a valid
 * choice. If that empties the candidate list entirely, the caller's own no-neighbors fallback
 * (e.g. pickRandom over the unfiltered list) takes over — this walker is fully boxed in.
 */
export function filterByMemory(candidates: NodeId[], ctx: StrategyContext): NodeId[] {
  const available = ctx.excludedNodeIds ? candidates.filter((id) => !ctx.excludedNodeIds!.has(id)) : candidates
  if (available.length === 0) return available

  // Floored at 1 regardless of owned Node Memory level: "never immediately backtrack onto the
  // node I just came from" is a free baseline, not something that requires a purchase — paid
  // levels only extend how much further back than that is also avoided. The dead-end fallback
  // below (bestForcedCandidate over `available`) still lets a true dead end retreat correctly.
  const remembered = rememberedNodes(ctx.walker.path, Math.max(1, ctx.memoryLevel))
  const novel = available.filter((id) => !remembered.has(id))
  if (novel.length > 0) return novel
  return [bestForcedCandidate(available, ctx)]
}

/**
 * Floor on the pathfinding planning horizon — even with zero Node Memory purchased, a planner can
 * still route back through this many of its most recent steps, so low-memory BFS degrades into a
 * local frontier-seeker instead of breaking outright.
 */
export const PLANNING_HORIZON_FLOOR = 8

/**
 * Which nodes a pathfinding strategy (BFS, Dijkstra, A*, Compass, Swarm) may plan routes THROUGH:
 * discovered, not mutex-claimed, and — if already visited — within the remembered window (the last
 * max(floor, memoryLevel) entries of the pooled path, current node included). Discovered-but-
 * unvisited nodes are always plannable: the walker can see them, it just can't remember its way
 * back through visited corridors it's forgotten. This is what makes Node Memory matter to the
 * planners at the top of the algorithm ladder, not just the wandering strategies.
 *
 * A route that no longer exists through remembered territory makes nextHopToward return null,
 * which every planner already answers with its random-neighbor fallback — never a dead stop.
 */
export function plannableFn(ctx: StrategyContext): (id: NodeId) => boolean {
  const horizon = Math.max(PLANNING_HORIZON_FLOOR, ctx.memoryLevel)
  // +1 so the walker's current node is always inside its own window.
  const remembered = new Set(ctx.walker.path.slice(-(horizon + 1)))
  return (id) =>
    ctx.discovery.discoveredNodeIds.has(id) &&
    !ctx.excludedNodeIds?.has(id) &&
    (!ctx.discovery.visitedNodeIds.has(id) || remembered.has(id))
}

/** Truncates a DFS-style stack to the last memoryLevel entries, in place — the walker can't backtrack past what it still remembers. Floored at 1, same as filterByMemory, so DFS can always backtrack to its immediate parent even with zero Node Memory levels owned. */
export function capMemoryStack(stack: NodeId[], memoryLevel: number): void {
  const cap = Math.max(1, memoryLevel)
  if (stack.length > cap) {
    stack.splice(0, stack.length - cap)
  }
}
