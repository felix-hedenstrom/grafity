import { pickRandom } from '../../utils/rng'
import { nextHopToward, uniformWeight } from './pathfinding'
import type { TraversalStrategy } from './types'

/**
 * Two walkers, one from the start and one from the exit, searching toward each other until
 * they meet — see src/game/loop/bidirectionalTick.ts for the real dual-walker stepping logic,
 * which bypasses chooseNextNode entirely (StrategyContext only has room for one walker).
 * This object exists so the strategy still has an id/name/cost/memoryMultiplier like any other
 * for the Shop and strategy registry, and so it behaves reasonably if ever invoked directly —
 * chooseNextNode here just mirrors plain BFS as a sane fallback.
 */
export const bidirectionalSearch: TraversalStrategy = {
  id: 'bidirectional',
  name: 'Bidirectional Search',
  memoryMultiplier: 1,
  chooseNextNode(ctx) {
    const { graph, discovery, walker } = ctx
    const next = nextHopToward(graph, walker.currentNodeId, (id) => !discovery.visitedNodeIds.has(id), uniformWeight)
    return next ?? pickRandom(Math.random, graph.adjacency[walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const frontier = [...ctx.discovery.discoveredNodeIds].filter((id) => !ctx.discovery.visitedNodeIds.has(id))
    return [{ kind: 'frontier', nodeIds: new Set(frontier) }]
  },
}
