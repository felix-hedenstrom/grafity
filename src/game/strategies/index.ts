import { aStar } from './aStar'
import { breadthFirstSearch } from './breadthFirstSearch'
import { compass } from './compass'
import { depthFirstSearch } from './depthFirstSearch'
import { dijkstra } from './dijkstra'
import { greedyFrontier } from './greedyFrontier'
import { leastVisitedStar } from './leastVisitedStar'
import { pheromone } from './pheromone'
import { randomWalk } from './randomWalk'
import { swarmSearch } from './swarmSearch'
import type { TraversalStrategy } from './types'

const registry: Record<string, TraversalStrategy> = {
  [randomWalk.id]: randomWalk,
  [leastVisitedStar.id]: leastVisitedStar,
  [breadthFirstSearch.id]: breadthFirstSearch,
  [depthFirstSearch.id]: depthFirstSearch,
  [pheromone.id]: pheromone,
  [greedyFrontier.id]: greedyFrontier,
  [dijkstra.id]: dijkstra,
  [compass.id]: compass,
  [aStar.id]: aStar,
  [swarmSearch.id]: swarmSearch,
}

/** Falls back to random-walk if a saved activeStrategyId no longer matches a known strategy. */
export function getStrategy(id: string): TraversalStrategy {
  return registry[id] ?? randomWalk
}

export {
  aStar,
  breadthFirstSearch,
  compass,
  depthFirstSearch,
  dijkstra,
  greedyFrontier,
  leastVisitedStar,
  pheromone,
  randomWalk,
  swarmSearch,
}
export type { HighlightKind, NodeHighlightGroup, StrategyContext, TraversalStrategy } from './types'
