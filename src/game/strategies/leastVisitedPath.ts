import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { filterByMemory, rememberedNodes } from './memory'
import type { StrategyContext, TraversalStrategy } from './types'

function edgeVisitCount(path: NodeId[], from: NodeId, to: NodeId): number {
  let count = 0
  for (let i = 0; i < path.length - 1; i++) {
    if ((path[i] === from && path[i + 1] === to) || (path[i] === to && path[i + 1] === from)) count++
  }
  return count
}

/** Among neighbors the walker hasn't exceeded its memory on, the ones reachable via the edge crossed fewest times so far. */
function pickLeastVisitedEdge(ctx: StrategyContext): NodeId[] {
  const { graph, walker } = ctx
  const candidates = filterByMemory(graph.adjacency[walker.currentNodeId], ctx)

  let bestCount = Infinity
  let best: NodeId[] = []
  for (const candidate of candidates) {
    const count = edgeVisitCount(walker.path, walker.currentNodeId, candidate)
    if (count < bestCount) {
      bestCount = count
      best = [candidate]
    } else if (count === bestCount) {
      best.push(candidate)
    }
  }

  return best
}

/** Like Least Visited*, but tracks the specific edge crossed rather than the node landed on — two different routes into the same node are never treated as the same thing. */
export const leastVisitedPath: TraversalStrategy = {
  id: 'least-visited-path',
  name: 'Least Visited Path',
  memoryMultiplier: 2,
  chooseNextNode(ctx) {
    return pickRandom(Math.random, pickLeastVisitedEdge(ctx))
  },
  getHighlightedNodes(ctx) {
    return [
      { kind: 'remembered', nodeIds: rememberedNodes(ctx.walker.path, ctx.memoryLevel) },
      { kind: 'candidate', nodeIds: new Set(pickLeastVisitedEdge(ctx)) },
    ]
  },
}
