import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { filterByMemory, rememberedNodes } from './memory'
import type { StrategyContext, TraversalStrategy } from './types'

function visitCount(path: NodeId[], id: NodeId): number {
  let count = 0
  for (const node of path) {
    if (node === id) count++
  }
  return count
}

/** Among neighbors the walker hasn't exceeded its memory on, the ones tied for the fewest times visited so far. */
function pickLeastVisited(ctx: StrategyContext): NodeId[] {
  const { graph, walker } = ctx
  const candidates = filterByMemory(graph.adjacency[walker.currentNodeId], ctx)

  let bestCount = Infinity
  let best: NodeId[] = []
  for (const candidate of candidates) {
    const count = visitCount(walker.path, candidate)
    if (count < bestCount) {
      bestCount = count
      best = [candidate]
    } else if (count === bestCount) {
      best.push(candidate)
    }
  }

  return best
}

/** Leans harder on the walker's own history than other strategies, so it gets a bigger cut of Node Memory to work with. */
export const leastVisited: TraversalStrategy = {
  id: 'least-visited',
  name: 'Least Visited',
  memoryMultiplier: 2,
  chooseNextNode(ctx) {
    return pickRandom(Math.random, pickLeastVisited(ctx))
  },
  getHighlightedNodes(ctx) {
    return [
      { kind: 'remembered', nodeIds: rememberedNodes(ctx.walker.path, ctx.memoryLevel) },
      { kind: 'candidate', nodeIds: new Set(pickLeastVisited(ctx)) },
    ]
  },
}
