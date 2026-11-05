import type { Graph, NodeId } from '../graph/types'
import type { Rng } from '../../utils/rng'

/**
 * Neutron stars: a few ordinary stars per level secretly flagged as Scanner Array pickups. They
 * look like any other star under fog, glow laser-green once discovered, and the first walker to
 * visit one (Spaceship or UFO) adds a sensor to the array. Strategies never see the flag, so ship
 * behavior is unchanged. Collected = visited, so the existing run save already covers it.
 */

/** Picks min(count, non-beacon nodes) distinct random nodes, never the start or the goal. */
export function pickNeutronStars(graph: Graph, count: number, rng: Rng): NodeId[] {
  const pool = graph.nodes.filter((n) => !n.isStart && !n.isGoal).map((n) => n.id)
  const picked: NodeId[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const at = Math.floor(rng() * pool.length)
    picked.push(pool[at])
    pool[at] = pool[pool.length - 1]
    pool.pop()
  }
  return picked
}

/** Returns graph with the picked nodes flagged isNeutronStar. */
export function withNeutronStars(graph: Graph, count: number, rng: Rng): Graph {
  if (count <= 0) return graph
  const picked = new Set(pickNeutronStars(graph, count, rng))
  return { ...graph, nodes: graph.nodes.map((n) => (picked.has(n.id) ? { ...n, isNeutronStar: true } : n)) }
}
