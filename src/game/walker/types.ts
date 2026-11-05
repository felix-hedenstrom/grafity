import type { NodeId } from '../graph/types'

/** Which end of the graph this walker launched from — 'goal' marks a Reverse Beacon walker searching backward from the exit. */
export type WalkerOrigin = 'start' | 'goal'

export interface WalkerState {
  currentNodeId: NodeId
  previousNodeId: NodeId | null
  path: NodeId[]
  stepsTaken: number
  hasReachedGoal: boolean
  origin: WalkerOrigin
}
