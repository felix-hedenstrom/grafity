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
  /** Nodes currently claimed by another walker (Traffic Control) — off-limits as a next hop while set. Undefined/empty when Traffic Control isn't owned or is toggled off. */
  excludedNodeIds?: ReadonlySet<NodeId>
  /** This walker's index in the run's walker array (0 = the Spaceship) — lets shared-memory strategies key per-walker claims. Defaults to 0 when absent (tests, sim). */
  walkerIndex?: number
  /** The node this walker is ultimately hunting for — the graph's goal for forward walkers, the START node for Reverse Beacon walkers launched from the exit. Strategies that aim at a destination must use this, never graph.goalNodeId directly. Defaults to graph.goalNodeId when absent. */
  targetNodeId?: NodeId
  /** Cross-walker scratch state created by createSharedMemory(), one object shared by every walker running this strategy (pheromone trails, swarm claims) — mutated in place. Undefined when the strategy declares none. */
  sharedMemory?: unknown
}

/** What kind of thing a highlighted group of nodes represents, so GraphView can color each consistently across strategies. */
export type HighlightKind = 'remembered' | 'stack' | 'candidate' | 'frontier' | 'path' | 'trail'

export interface NodeHighlightGroup {
  kind: HighlightKind
  nodeIds: Set<NodeId>
}

export interface TraversalStrategy {
  id: string
  name: string
  createMemory?(): unknown
  /** One shared scratch object for ALL walkers running this strategy (vs createMemory's per-walker state). Must be JSON-serializable — plain objects/arrays, no Sets or Maps — because it's persisted in the run save. Created fresh on strategy switch and on every new graph. */
  createSharedMemory?(): unknown
  /** Must return a graph neighbor of ctx.walker.currentNodeId. */
  chooseNextNode(ctx: StrategyContext): NodeId
  /** Groups of nodes this strategy is currently tracking, for visualization (e.g. a remembered trail, a backtracking stack, scored candidates). Omit or return an empty array if there's nothing to highlight. */
  getHighlightedNodes?(ctx: StrategyContext): NodeHighlightGroup[]
  /** Multiplies the effective Node Memory level while this strategy is active — 1 for most; a strategy that leans harder on history can ask for more. */
  memoryMultiplier: number
}
