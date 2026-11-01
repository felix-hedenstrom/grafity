import { pickRandom } from '../../utils/rng'
import { actualWeight, nextHopToward } from './pathfinding'
import type { TraversalStrategy } from './types'

export const dijkstra: TraversalStrategy = {
  id: 'dijkstra',
  name: 'Dijkstra',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const { graph, discovery, walker } = ctx
    const next = nextHopToward(graph, walker.currentNodeId, (id) => !discovery.visitedNodeIds.has(id), actualWeight)
    return next ?? pickRandom(Math.random, graph.adjacency[walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const frontier = [...ctx.discovery.discoveredNodeIds].filter((id) => !ctx.discovery.visitedNodeIds.has(id))
    return [{ kind: 'frontier', nodeIds: new Set(frontier) }]
  },
}
