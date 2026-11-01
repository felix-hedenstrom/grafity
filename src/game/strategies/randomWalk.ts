import { pickRandom } from '../../utils/rng'
import { filterByMemory, rememberedNodes } from './memory'
import type { TraversalStrategy } from './types'

export const randomWalk: TraversalStrategy = {
  id: 'random-walk',
  name: 'Random Walk',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const neighbors = ctx.graph.adjacency[ctx.walker.currentNodeId]
    return pickRandom(Math.random, filterByMemory(neighbors, ctx))
  },
  getHighlightedNodes(ctx) {
    return [{ kind: 'remembered', nodeIds: rememberedNodes(ctx.walker.path, ctx.memoryLevel) }]
  },
}
