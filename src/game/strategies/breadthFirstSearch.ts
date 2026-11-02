import { pickRandom } from '../../utils/rng'
import { nextHopToward, uniformWeight } from './pathfinding'
import type { TraversalStrategy } from './types'

export const breadthFirstSearch: TraversalStrategy = {
  id: 'bfs',
  name: 'Breadth-First Search',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const { graph, discovery, walker } = ctx
    const next = nextHopToward(
      graph,
      walker.currentNodeId,
      (id) => discovery.discoveredNodeIds.has(id) && !discovery.visitedNodeIds.has(id),
      uniformWeight,
      undefined,
      (id) => discovery.discoveredNodeIds.has(id),
    )
    return next ?? pickRandom(Math.random, graph.adjacency[walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const frontier = [...ctx.discovery.discoveredNodeIds].filter((id) => !ctx.discovery.visitedNodeIds.has(id))
    return [{ kind: 'frontier', nodeIds: new Set(frontier) }]
  },
}
