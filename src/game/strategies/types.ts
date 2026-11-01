import type { DiscoveryState } from '../discovery/types'
import type { Graph, NodeId } from '../graph/types'
import type { WalkerState } from '../walker/types'

export interface StrategyContext {
  graph: Graph
  discovery: DiscoveryState
  walker: WalkerState
  /** Strategy-private scratch state, opaque to the caller. Unused by MVP strategies; future BFS/DFS/Dijkstra/A* strategies need somewhere to carry a frontier across ticks. */
  memory: unknown
  /** How many of the walker's most recent nodes it can remember — a universal cap every strategy respects, not just one strategy's trick. Ignored by logic that doesn't use node history at all. */
  memoryLevel: number
}

/** What kind of thing a highlighted group of nodes represents, so GraphView can color each consistently across strategies. */
export type HighlightKind = 'remembered' | 'stack' | 'candidate' | 'frontier' | 'path'

export interface NodeHighlightGroup {
  kind: HighlightKind
  nodeIds: Set<NodeId>
}

export interface TraversalStrategy {
  id: string
  name: string
  createMemory?(): unknown
  /** Must return a graph neighbor of ctx.walker.currentNodeId. */
  chooseNextNode(ctx: StrategyContext): NodeId
  /** Groups of nodes this strategy is currently tracking, for visualization (e.g. a remembered trail, a backtracking stack, scored candidates). Omit or return an empty array if there's nothing to highlight. */
  getHighlightedNodes?(ctx: StrategyContext): NodeHighlightGroup[]
  /** Multiplies the effective Node Memory level while this strategy is active — 1 for most; a strategy that leans harder on history can ask for more. */
  memoryMultiplier: number
}
