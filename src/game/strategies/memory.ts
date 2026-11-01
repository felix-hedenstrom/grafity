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
 * Filters out candidates the walker currently remembers. Every strategy that picks among graph
 * neighbors should run its candidates through this, so Node Memory applies uniformly. If every
 * candidate is remembered — forced to revisit — narrows to just the single oldest (least
 * recently visited) one instead of picking uniformly among all of them, so a forced revisit
 * prefers the node most likely to have changed since last seen.
 */
export function filterByMemory(candidates: NodeId[], ctx: StrategyContext): NodeId[] {
  const remembered = rememberedNodes(ctx.walker.path, ctx.memoryLevel)
  const novel = candidates.filter((id) => !remembered.has(id))
  if (novel.length > 0) return novel
  return [oldestCandidate(candidates, ctx.walker.path)]
}

/** Truncates a DFS-style stack to the last memoryLevel entries, in place — the walker can't backtrack past what it still remembers. */
export function capMemoryStack(stack: NodeId[], memoryLevel: number): void {
  if (stack.length > memoryLevel) {
    stack.splice(0, stack.length - memoryLevel)
  }
}
