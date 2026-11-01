import type { Graph, NodeId } from '../graph/types'
import { edgeId } from '../graph/types'
import type { DiscoveryState } from './types'

export interface RevealResult {
  discovery: DiscoveryState
  newlyDiscoveredNodeCount: number
}

/**
 * Always returns fresh Set instances rather than mutating in place, so
 * React's reference-equality checks see every reveal as a change. This is
 * the one place discovery state is ever constructed or mutated.
 */
export function revealAroundNode(discovery: DiscoveryState, graph: Graph, nodeId: NodeId): RevealResult {
  const discoveredNodeIds = new Set(discovery.discoveredNodeIds)
  const discoveredEdgeIds = new Set(discovery.discoveredEdgeIds)
  const visitedNodeIds = new Set(discovery.visitedNodeIds)

  let newlyDiscoveredNodeCount = 0
  if (!discoveredNodeIds.has(nodeId)) newlyDiscoveredNodeCount++
  discoveredNodeIds.add(nodeId)
  visitedNodeIds.add(nodeId)

  for (const neighborId of graph.adjacency[nodeId]) {
    if (!discoveredNodeIds.has(neighborId)) newlyDiscoveredNodeCount++
    discoveredNodeIds.add(neighborId)
    discoveredEdgeIds.add(edgeId(nodeId, neighborId))
  }

  return {
    discovery: { discoveredNodeIds, discoveredEdgeIds, visitedNodeIds },
    newlyDiscoveredNodeCount,
  }
}

export function createDiscovery(graph: Graph, atNodeId: NodeId): DiscoveryState {
  const empty: DiscoveryState = {
    discoveredNodeIds: new Set(),
    discoveredEdgeIds: new Set(),
    visitedNodeIds: new Set(),
  }
  return revealAroundNode(empty, graph, atNodeId).discovery
}
