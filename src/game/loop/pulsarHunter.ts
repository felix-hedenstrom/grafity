import type { DiscoveryState } from '../discovery/types'
import type { Graph, NodeId } from '../graph/types'
import { shortestPathsFrom } from '../strategies/pathfinding'

/**
 * Two toggleable algorithm improvements that sit on top of ANY traversal algorithm, both built on
 * the same pulsar-collecting route (pulsarHuntNextHop):
 *
 * - Pulsar Hunter: while the level has an uncollected neutron star (a pulsar — visible through
 *   fog), walkers head for it instead of asking their algorithm.
 * - Exit Avoidance: the algorithm explores as usual, but once the exit has been discovered a
 *   forward walker won't take it while pulsars remain — it collects them first, then leaves.
 *
 * Fog-of-war stays honest: routes run only through discovered stars. Each candidate (a discovered,
 * not-yet-visited star) is scored as route length to it + straight-line distance from it to the
 * nearest uncollected pulsar (0 for a discovered pulsar itself), and the walker steps along the
 * route to the best one. That score is a fixed per-candidate offset on top of the route length,
 * so stepping toward the winner lowers its score by exactly that step and every rival's by at most
 * the same — the winner stays the winner, so the walker never ping-pongs between two goals. Every
 * winner is an unvisited star, so each one reached grows the explored set: the hunt always ends,
 * with every pulsar collected unless it's walled off behind avoidNodeId.
 *
 * avoidNodeId (the exit, for forward walkers) is never routed through or aimed at, so the hunt
 * can't end the run with pulsars still uncollected. Returns null when there's nothing to hunt.
 */
export function pulsarHuntNextHop(graph: Graph, discovery: DiscoveryState, fromNodeId: NodeId, avoidNodeId?: NodeId): NodeId | null {
  const pulsars = graph.nodes.filter((n) => n.isNeutronStar && !discovery.visitedNodeIds.has(n.id))
  if (pulsars.length === 0) return null

  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const { distance, parent } = shortestPathsFrom(graph, fromNodeId, (id) => discovery.discoveredNodeIds.has(id) && id !== avoidNodeId)

  let best: NodeId | null = null
  let bestScore = Infinity
  for (const [id, routeLength] of distance) {
    if (discovery.visitedNodeIds.has(id)) continue
    const node = nodesById.get(id)
    let remaining = Infinity
    for (const p of pulsars) remaining = Math.min(remaining, p.id === id ? 0 : Math.hypot((node?.x ?? 0) - (p.x ?? 0), (node?.y ?? 0) - (p.y ?? 0)))
    const score = routeLength + remaining
    if (score < bestScore || (score === bestScore && best !== null && id < best)) {
      best = id
      bestScore = score
    }
  }
  if (best === null) return null

  let step = best
  while (parent.get(step) !== fromNodeId) {
    const previous = parent.get(step)
    if (previous === undefined) return null
    step = previous
  }
  return step
}

/** Exit Avoidance: once a forward walker's algorithm could see the exit, collect any remaining reachable pulsars first. Null when it doesn't apply — the algorithm decides. */
export function exitAvoidanceNextHop(graph: Graph, discovery: DiscoveryState, fromNodeId: NodeId): NodeId | null {
  if (!discovery.discoveredNodeIds.has(graph.goalNodeId)) return null
  return pulsarHuntNextHop(graph, discovery, fromNodeId, graph.goalNodeId)
}

/** The hop the pulsar upgrades impose on this walker right now, or null to let the redirect/algorithm decide — shared by the live scheduler and the sim. Pulsar Hunter wins over Exit Avoidance; Exit Avoidance only applies to forward walkers (a Reverse Beacon walker's "exit" is the start, which never ends the run). */
export function pulsarOverrideHop(
  graph: Graph,
  discovery: DiscoveryState,
  walker: { currentNodeId: NodeId; origin?: 'start' | 'goal' },
  upgrades: { pulsarHunter: boolean; exitAvoidance: boolean },
): NodeId | null {
  const forward = walker.origin !== 'goal'
  if (upgrades.pulsarHunter) return pulsarHuntNextHop(graph, discovery, walker.currentNodeId, forward ? graph.goalNodeId : undefined)
  if (upgrades.exitAvoidance && forward) return exitAvoidanceNextHop(graph, discovery, walker.currentNodeId)
  return null
}
