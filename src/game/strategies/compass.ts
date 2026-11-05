import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { plannableFn } from './memory'
import { shortestPathToward, straightLineDistance, uniformWeight } from './pathfinding'
import type { StrategyContext, TraversalStrategy } from './types'

/**
 * Greedy best-first: once its destination is discovered, every hop just chases whichever node
 * looks closest as the crow flies — edge costs are ignored entirely (weight 0, pure heuristic
 * ordering), so it commits fast but happily takes an expensive route a smarter ship would skip.
 * Before the destination shows up it behaves exactly like BFS toward the nearest frontier. Same
 * two-stage fallback as A*: a destination with no plannable route falls back to frontier-hunting,
 * and only then to a random neighbor.
 */
function planPath(ctx: StrategyContext): NodeId[] | null {
  const { graph, discovery, walker } = ctx
  const target = ctx.targetNodeId ?? graph.goalNodeId
  const plannable = plannableFn(ctx)

  if (discovery.discoveredNodeIds.has(target)) {
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
    const toTarget = shortestPathToward(
      graph,
      walker.currentNodeId,
      (id) => id === target,
      () => 0,
      (id) => straightLineDistance(id, target, nodesById),
      plannable,
    )
    if (toTarget) return toTarget
  }

  return shortestPathToward(
    graph,
    walker.currentNodeId,
    (id) => discovery.discoveredNodeIds.has(id) && !discovery.visitedNodeIds.has(id),
    uniformWeight,
    undefined,
    plannable,
  )
}

export const compass: TraversalStrategy = {
  id: 'compass',
  name: 'Compass',
  memoryMultiplier: 2,
  chooseNextNode(ctx) {
    const path = planPath(ctx)
    return path?.[1] ?? pickRandom(Math.random, ctx.graph.adjacency[ctx.walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const { graph, discovery, walker } = ctx
    const target = ctx.targetNodeId ?? graph.goalNodeId
    if (discovery.discoveredNodeIds.has(target)) {
      const path = planPath(ctx)
      return [{ kind: 'path', nodeIds: new Set(path ?? [walker.currentNodeId]) }]
    }
    const frontier = [...discovery.discoveredNodeIds].filter((id) => !discovery.visitedNodeIds.has(id))
    return [{ kind: 'frontier', nodeIds: new Set(frontier) }]
  },
}
