import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { filterByMemory, rememberedNodes } from './memory'
import type { StrategyContext, TraversalStrategy } from './types'

/** Among neighbors the walker hasn't exceeded its memory on, the ones tied for opening up the most undiscovered territory. */
function pickBestNeighbors(ctx: StrategyContext): NodeId[] {
  const { graph, discovery, walker } = ctx
  const allNeighbors = graph.adjacency[walker.currentNodeId]
  const filtered = filterByMemory(allNeighbors, ctx)
  const neighbors = filtered.length > 0 ? filtered : allNeighbors

  let bestScore = -1
  let bestNeighbors: NodeId[] = []
  for (const neighbor of neighbors) {
    const score = graph.adjacency[neighbor].filter((id) => !discovery.discoveredNodeIds.has(id)).length
    if (score > bestScore) {
      bestScore = score
      bestNeighbors = [neighbor]
    } else if (score === bestScore) {
      bestNeighbors.push(neighbor)
    }
  }

  return bestNeighbors
}

export const greedyFrontier: TraversalStrategy = {
  id: 'greedy-frontier',
  name: 'Greedy Frontier',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    return pickRandom(Math.random, pickBestNeighbors(ctx))
  },
  getHighlightedNodes(ctx) {
    return [
      { kind: 'remembered', nodeIds: rememberedNodes(ctx.walker.path, ctx.memoryLevel) },
      { kind: 'candidate', nodeIds: new Set(pickBestNeighbors(ctx)) },
    ]
  },
}
