import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { plannableFn } from './memory'
import { actualWeight, shortestPathToward, straightLineDistance } from './pathfinding'
import type { StrategyContext, TraversalStrategy } from './types'

/**
 * The full planned route, two-stage: once the walker's destination (the exit — or the start node,
 * for a Reverse Beacon walker launched from the exit) has been discovered, beeline for it with the
 * straight-line heuristic (admissible, since edge cost is itself Euclidean distance). If no route
 * to it survives plannableFn — it sits on a discovered island not yet connected to this walker's
 * territory, or the remembered corridor to it has been forgotten — fall back to hunting the
 * nearest discovered-but-unvisited node, exactly like Dijkstra. Null only when even the frontier
 * is unreachable (the caller then picks a random neighbor).
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
      actualWeight,
      (id) => straightLineDistance(id, target, nodesById),
      plannable,
    )
    if (toTarget) return toTarget
  }

  return shortestPathToward(
    graph,
    walker.currentNodeId,
    (id) => discovery.discoveredNodeIds.has(id) && !discovery.visitedNodeIds.has(id),
    actualWeight,
    undefined,
    plannable,
  )
}

export const aStar: TraversalStrategy = {
  id: 'a-star',
  name: 'A*',
  memoryMultiplier: 3,
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
