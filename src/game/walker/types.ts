import type { NodeId } from '../graph/types'

export interface WalkerState {
  currentNodeId: NodeId
  previousNodeId: NodeId | null
  path: NodeId[]
  stepsTaken: number
  hasReachedGoal: boolean
}
