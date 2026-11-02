import { pickRandom } from '../../utils/rng'
import { actualWeight, nextHopToward, shortestPathToward, straightLineDistance } from './pathfinding'
import type { StrategyContext, TraversalStrategy } from './types'

/** A* can only beeline for the actual exit once the walker has actually seen it — otherwise it has
 * no more information than Dijkstra and heads for whatever's nearest discovered-but-unvisited. */
function isTargetFn(ctx: StrategyContext): (id: string) => boolean {
  const { discovery, graph } = ctx
  if (discovery.discoveredNodeIds.has(graph.goalNodeId)) {
    return (id: string) => id === graph.goalNodeId
  }
  return (id: string) => discovery.discoveredNodeIds.has(id) && !discovery.visitedNodeIds.has(id)
}

/** Straight-line-to-goal heuristic once the goal is known; otherwise no bias, same as Dijkstra. */
function heuristicFn(ctx: StrategyContext): (id: string) => number {
  const { discovery, graph } = ctx
  if (!discovery.discoveredNodeIds.has(graph.goalNodeId)) return () => 0
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const goalId = graph.goalNodeId
  return (id: string) => straightLineDistance(id, goalId, nodesById)
}

/** Only discovered territory can be searched through or targeted — the walker can't plan routes through fog. */
function isReachableFn(ctx: StrategyContext): (id: string) => boolean {
  return (id: string) => ctx.discovery.discoveredNodeIds.has(id)
}

export const aStar: TraversalStrategy = {
  id: 'a-star',
  name: 'A*',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const { graph, walker } = ctx
    const next = nextHopToward(graph, walker.currentNodeId, isTargetFn(ctx), actualWeight, heuristicFn(ctx), isReachableFn(ctx))
    return next ?? pickRandom(Math.random, graph.adjacency[walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const { graph, discovery, walker } = ctx
    if (discovery.discoveredNodeIds.has(graph.goalNodeId)) {
      const path = shortestPathToward(graph, walker.currentNodeId, isTargetFn(ctx), actualWeight, heuristicFn(ctx), isReachableFn(ctx))
      return [{ kind: 'path', nodeIds: new Set(path ?? [walker.currentNodeId]) }]
    }
    const frontier = [...discovery.discoveredNodeIds].filter((id) => !discovery.visitedNodeIds.has(id))
    return [{ kind: 'frontier', nodeIds: new Set(frontier) }]
  },
}
