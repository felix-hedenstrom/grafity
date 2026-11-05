import type { NodeId } from '../graph/types'
import type { WalkerOrigin, WalkerState } from './types'

export function createWalker(startNodeId: NodeId, origin: WalkerOrigin = 'start'): WalkerState {
  return {
    currentNodeId: startNodeId,
    previousNodeId: null,
    path: [startNodeId],
    stepsTaken: 0,
    hasReachedGoal: false,
    origin,
  }
}

export function moveWalker(walker: WalkerState, nextNodeId: NodeId, goalNodeId: NodeId): WalkerState {
  return {
    currentNodeId: nextNodeId,
    previousNodeId: walker.currentNodeId,
    path: [...walker.path, nextNodeId],
    stepsTaken: walker.stepsTaken + 1,
    hasReachedGoal: nextNodeId === goalNodeId,
    origin: walker.origin,
  }
}
