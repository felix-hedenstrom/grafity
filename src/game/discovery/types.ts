import type { NodeId } from '../graph/types'

export interface DiscoveryState {
  discoveredNodeIds: Set<NodeId>
  discoveredEdgeIds: Set<string>
  visitedNodeIds: Set<NodeId>
}
