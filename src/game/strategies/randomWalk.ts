import { pickRandom } from '../../utils/rng'
import { filterByMemory, rememberedNodes } from './memory'
import type { TraversalStrategy } from './types'

export const randomWalk: TraversalStrategy = {
  id: 'random-walk',
  name: 'Random Walk',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const neighbors = ctx.graph.adjacency[ctx.walker.currentNodeId]
    const candidates = filterByMemory(neighbors, ctx)
    return pickRandom(Math.random, candidates.length > 0 ? candidates : neighbors)
  },
  getHighlightedNodes(ctx) {
    return [{ kind: 'remembered', nodeIds: rememberedNodes(ctx.walker.path, ctx.memoryLevel) }]
  },
}
