import { aStar } from './aStar'
import { bidirectionalSearch } from './bidirectionalSearch'
import { breadthFirstSearch } from './breadthFirstSearch'
import { depthFirstSearch } from './depthFirstSearch'
import { dijkstra } from './dijkstra'
import { greedyFrontier } from './greedyFrontier'
import { leastVisitedPath } from './leastVisitedPath'
import { leastVisitedStar } from './leastVisitedStar'
import { randomWalk } from './randomWalk'
import type { TraversalStrategy } from './types'

const registry: Record<string, TraversalStrategy> = {
  [randomWalk.id]: randomWalk,
  [leastVisitedStar.id]: leastVisitedStar,
  [leastVisitedPath.id]: leastVisitedPath,
  [breadthFirstSearch.id]: breadthFirstSearch,
  [depthFirstSearch.id]: depthFirstSearch,
  [greedyFrontier.id]: greedyFrontier,
  [dijkstra.id]: dijkstra,
  [aStar.id]: aStar,
  [bidirectionalSearch.id]: bidirectionalSearch,
}

/** Falls back to random-walk if a saved activeStrategyId no longer matches a known strategy. */
export function getStrategy(id: string): TraversalStrategy {
  return registry[id] ?? randomWalk
}

export {
  aStar,
  bidirectionalSearch,
  breadthFirstSearch,
  depthFirstSearch,
  dijkstra,
  greedyFrontier,
  leastVisitedPath,
  leastVisitedStar,
  randomWalk,
}
export type { HighlightKind, NodeHighlightGroup, StrategyContext, TraversalStrategy } from './types'
