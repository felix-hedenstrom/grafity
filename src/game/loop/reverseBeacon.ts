import type { Graph } from '../graph/types'
import type { WalkerState } from '../walker/types'

/**
 * How many of the UFOs launch from the exit while Reverse Beacon is active — half, rounded up, so
 * the very first UFO after buying the beacon visibly launches from the other side. The Spaceship
 * (walkers[0]) always launches from the start and is never counted here.
 */
export function reverseUfoCount(searcherLevel: number, beaconActive: boolean): number {
  return beaconActive ? Math.ceil(searcherLevel / 2) : 0
}

/** Same node, adjacent, or one has physically crossed the other's path — any of these counts as two walkers finding each other. */
export function hasMet(graph: Graph, walker: WalkerState, walker2: WalkerState): boolean {
  if (walker.currentNodeId === walker2.currentNodeId) return true
  if (graph.adjacency[walker.currentNodeId]?.includes(walker2.currentNodeId)) return true
  return walker.path.includes(walker2.currentNodeId) || walker2.path.includes(walker.currentNodeId)
}

/**
 * True once any start-side walker and any exit-side walker have found each other — the Reverse
 * Beacon's win condition. A meet guarantees the two discovered regions connect (the meeting point
 * is standing in both), so a redirect path to the goal can always be planned through discovered
 * territory afterward. False whenever the pool doesn't actually hold both origins.
 */
export function forwardAndReverseMet(graph: Graph, walkers: WalkerState[]): boolean {
  const reverse = walkers.filter((w) => w.origin === 'goal')
  if (reverse.length === 0) return false
  return walkers.some((f) => f.origin === 'start' && reverse.some((r) => hasMet(graph, f, r)))
}
