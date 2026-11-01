import { computeDiscoveryReward, computeGoalBonus, REVISIT_REWARD } from '../currency/rules'
import { revealAroundNode } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { nextHopToward, uniformWeight } from '../strategies/pathfinding'
import { moveWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'

export interface BidirectionalTickInput {
  graph: Graph
  walker: WalkerState
  walker2: WalkerState
  discovery: DiscoveryState
}

export interface BidirectionalTickResult {
  walker: WalkerState
  walker2: WalkerState
  discovery: DiscoveryState
  met: boolean
  currencyEarned: number
}

/** Same node, adjacent, or one has physically crossed the other's path — any of these counts as the two walkers finding each other. */
function hasMet(graph: Graph, walker: WalkerState, walker2: WalkerState): boolean {
  if (walker.currentNodeId === walker2.currentNodeId) return true
  if (graph.adjacency[walker.currentNodeId]?.includes(walker2.currentNodeId)) return true
  return walker.path.includes(walker2.currentNodeId) || walker2.path.includes(walker.currentNodeId)
}

interface StepResult {
  walker: WalkerState
  discovery: DiscoveryState
  currencyEarned: number
}

/** Steps one walker toward whatever's nearest-by-hops that neither walker has visited yet (both share one discovery state). Returns the SAME walker/discovery references, unmoved, if nothing unvisited is reachable — a signal the two have no territory left between them. */
function stepToward(graph: Graph, discovery: DiscoveryState, walker: WalkerState): StepResult {
  const next = nextHopToward(graph, walker.currentNodeId, (id) => !discovery.visitedNodeIds.has(id), uniformWeight)
  if (next === null) {
    return { walker, discovery, currencyEarned: 0 }
  }

  const wasAlreadyVisited = discovery.visitedNodeIds.has(next)
  // No single "goal node" concept for either half of a bidirectional search — hasReachedGoal stays false throughout.
  const movedWalker = moveWalker(walker, next, '')
  const { discovery: nextDiscovery, newlyDiscoveredNodeCount } = revealAroundNode(discovery, graph, next)
  const currencyEarned = wasAlreadyVisited ? REVISIT_REWARD : computeDiscoveryReward(newlyDiscoveredNodeCount)

  return { walker: movedWalker, discovery: nextDiscovery, currencyEarned }
}

/**
 * Steps both walkers one hop each — walker from the start, walker2 from the exit — toward
 * whatever's nearest-unvisited from their own side, sharing one discovery state so they
 * naturally converge on the unexplored territory between them. Mirrors runTick's reward
 * structure but there's no single goal node to reach; "met" (and its bonus) replaces goalReached.
 */
export function runBidirectionalTick(input: BidirectionalTickInput): BidirectionalTickResult {
  if (hasMet(input.graph, input.walker, input.walker2)) {
    return { walker: input.walker, walker2: input.walker2, discovery: input.discovery, met: true, currencyEarned: 0 }
  }

  const first = stepToward(input.graph, input.discovery, input.walker)
  const second = stepToward(input.graph, first.discovery, input.walker2)

  // If neither walker could find anywhere left to go, there's no unexplored territory left
  // between them — they must have already effectively converged, so call it met rather than stall.
  const stalled = first.walker === input.walker && second.walker === input.walker2
  const met = stalled || hasMet(input.graph, first.walker, second.walker)

  let currencyEarned = first.currencyEarned + second.currencyEarned
  if (met) currencyEarned += computeGoalBonus(input.graph)

  return { walker: first.walker, walker2: second.walker, discovery: second.discovery, met, currencyEarned }
}
