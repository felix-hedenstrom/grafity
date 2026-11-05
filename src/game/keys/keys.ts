import { PRODUCTION_CONFIG } from '../config/production'
import type { GameConfig } from '../config/types'
import type { DiscoveryState } from '../discovery/types'
import type { Graph, NodeId } from '../graph/types'
import type { Rng } from '../../utils/rng'

/**
 * Keys: every level hides k of them on ordinary stars, and the exit stays locked until walkers
 * have visited every one. The first visit by any walker (Spaceship or UFO) collects a key. Like
 * neutron stars, "collected" just means "visited", so the run save already covers it. While
 * locked, the exit is an ordinary passable star, and landing on it is not a win.
 *
 * Forward walkers aim at keys before the exit (forwardTargetNodeId), so goal-directed algorithms
 * chase keys once they show up, and exploring algorithms explore as usual.
 */

/** k = max(1, floor((nodes / referenceNodeCount) ^ countExponent)), a square-root curve by default: 7–27 nodes → 1, 28–62 → 2, 63–111 → 3, 112–174 → 4. */
export function computeKeyCount(nodeCount: number, config: GameConfig = PRODUCTION_CONFIG): number {
  const { referenceNodeCount, countExponent } = config.keys
  // The epsilon keeps exact thresholds (28/7 = 4 → √4 = 2) from rounding down to the previous count.
  return Math.max(1, Math.floor(Math.pow(nodeCount / referenceNodeCount, countExponent) + 1e-9))
}

/**
 * Picks min(count, eligible) distinct random nodes, never the start, the goal or a neutron star.
 * It prefers stars that aren't next to the start, so level 1's key isn't collected on the first
 * hop, and only falls back to the start's neighbors when the farther pool runs out.
 */
export function pickKeys(graph: Graph, count: number, rng: Rng): NodeId[] {
  const startNeighbors = new Set(graph.adjacency[graph.startNodeId] ?? [])
  const eligible = graph.nodes.filter((n) => !n.isStart && !n.isGoal && !n.isNeutronStar)
  const far = eligible.filter((n) => !startNeighbors.has(n.id)).map((n) => n.id)
  const near = eligible.filter((n) => startNeighbors.has(n.id)).map((n) => n.id)
  const picked: NodeId[] = []
  for (const pool of [far, near]) {
    while (picked.length < count && pool.length > 0) {
      const at = Math.floor(rng() * pool.length)
      picked.push(pool[at])
      pool[at] = pool[pool.length - 1]
      pool.pop()
    }
  }
  return picked
}

/** Returns graph with the picked nodes flagged isKey. Apply after withNeutronStars so keys never land on a neutron star. */
export function withKeys(graph: Graph, count: number, rng: Rng): Graph {
  if (count <= 0) return graph
  const picked = new Set(pickKeys(graph, count, rng))
  return { ...graph, nodes: graph.nodes.map((n) => (picked.has(n.id) ? { ...n, isKey: true } : n)) }
}

export function keyNodeIds(graph: Graph): NodeId[] {
  return graph.nodes.filter((n) => n.isKey).map((n) => n.id)
}

/** Keys no walker has visited yet. */
export function remainingKeyIds(graph: Graph, discovery: DiscoveryState): NodeId[] {
  return graph.nodes.filter((n) => n.isKey && !discovery.visitedNodeIds.has(n.id)).map((n) => n.id)
}

/** True once every key has been visited (always true for a level without keys, e.g. an old save). */
export function isExitUnlocked(graph: Graph, discovery: DiscoveryState): boolean {
  return graph.nodes.every((n) => !n.isKey || discovery.visitedNodeIds.has(n.id))
}

/**
 * Where a forward walker's algorithm should aim right now. Once the exit is unlocked, that's the
 * exit. Before that, it's the nearest discovered uncollected key (straight line, ties to the lower
 * id). If no remaining key is discovered yet, it's the lowest-id remaining key. Strategies only
 * beeline for a discovered target, so an undiscovered one just leaves them exploring the frontier,
 * rather than hovering around a locked exit.
 */
export function forwardTargetNodeId(graph: Graph, discovery: DiscoveryState, fromNodeId: NodeId): NodeId {
  const remaining = graph.nodes.filter((n) => n.isKey && !discovery.visitedNodeIds.has(n.id))
  if (remaining.length === 0) return graph.goalNodeId

  const discovered = remaining.filter((n) => discovery.discoveredNodeIds.has(n.id))
  if (discovered.length === 0) return remaining.reduce((a, b) => (b.id < a.id ? b : a)).id

  const from = graph.nodes.find((n) => n.id === fromNodeId)
  const fx = from?.x ?? 0
  const fy = from?.y ?? 0
  let best = discovered[0]
  let bestDistance = Infinity
  for (const n of discovered) {
    const d = Math.hypot((n.x ?? 0) - fx, (n.y ?? 0) - fy)
    if (d < bestDistance || (d === bestDistance && n.id < best.id)) {
      best = n
      bestDistance = d
    }
  }
  return best.id
}
