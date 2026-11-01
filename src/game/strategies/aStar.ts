import { pickRandom } from '../../utils/rng'
import { actualWeight, nextHopToward, shortestPathToward, straightLineDistance } from './pathfinding'
import type { StrategyContext, TraversalStrategy } from './types'

/** A* always beelines for the actual exit — the walker "can see the goal" — unlike BFS/Dijkstra, which just head for whatever's nearest unexplored. */
function heuristicToGoal(ctx: StrategyContext): (id: string) => number {
  const nodesById = new Map(ctx.graph.nodes.map((n) => [n.id, n]))
  const goalId = ctx.graph.goalNodeId
  return (id: string) => straightLineDistance(id, goalId, nodesById)
}

export const aStar: TraversalStrategy = {
  id: 'a-star',
  name: 'A*',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const { graph, walker } = ctx
    const goalId = graph.goalNodeId
    const next = nextHopToward(graph, walker.currentNodeId, (id) => id === goalId, actualWeight, heuristicToGoal(ctx))
    return next ?? pickRandom(Math.random, graph.adjacency[walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const goalId = ctx.graph.goalNodeId
    const path = shortestPathToward(ctx.graph, ctx.walker.currentNodeId, (id) => id === goalId, actualWeight, heuristicToGoal(ctx))
    return [{ kind: 'path', nodeIds: new Set(path ?? [ctx.walker.currentNodeId]) }]
  },
}
