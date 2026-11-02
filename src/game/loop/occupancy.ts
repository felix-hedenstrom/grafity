import type { NodeId } from '../graph/types'

export interface OccupancyEntry {
  currentNodeId: NodeId
  transitTarget: NodeId | null
}

/** Every node currently claimed by some OTHER walker in entries — either resting there or mid-transit toward it. Used to enforce Traffic Control's node/edge mutex: blocking entry into any claimed node also blocks every edge collision, since using an edge requires one endpoint to be a walker's current position and the other its destination. */
export function claimedNodeIds(entries: readonly OccupancyEntry[], selfIndex: number): Set<NodeId> {
  const claimed = new Set<NodeId>()
  entries.forEach((entry, idx) => {
    if (idx === selfIndex) return
    claimed.add(entry.currentNodeId)
    if (entry.transitTarget !== null) claimed.add(entry.transitTarget)
  })
  return claimed
}
