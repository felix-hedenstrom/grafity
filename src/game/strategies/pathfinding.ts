import type { Graph, NodeId } from '../graph/types'

function buildWeightedAdjacency(graph: Graph): Map<NodeId, Array<{ id: NodeId; weight: number }>> {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const map = new Map<NodeId, Array<{ id: NodeId; weight: number }>>()
  for (const id of Object.keys(graph.adjacency)) map.set(id, [])
  for (const edge of graph.edges) {
    const a = nodesById.get(edge.source)
    const b = nodesById.get(edge.target)
    const weight = Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))
    map.get(edge.source)?.push({ id: edge.target, weight })
    map.get(edge.target)?.push({ id: edge.source, weight })
  }
  return map
}

/** Binary min-heap keyed by score, with lazy deletion — duplicate pushes for the same node are expected (edge relaxation) and resolved by skipping already-visited nodes at pop time, same as a textbook Dijkstra/A* priority queue. O(log n) push/pop instead of an O(n) linear scan, which matters once graphs grow into the hundreds of nodes. */
class MinHeap {
  private items: { id: NodeId; score: number }[] = []

  get size(): number {
    return this.items.length
  }

  push(id: NodeId, score: number): void {
    this.items.push({ id, score })
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent].score <= this.items[i].score) break
      ;[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]]
      i = parent
    }
  }

  pop(): NodeId | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]
    const last = this.items.pop() as { id: NodeId; score: number }
    if (this.items.length > 0) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = i * 2 + 2
        let smallest = i
        if (left < this.items.length && this.items[left].score < this.items[smallest].score) smallest = left
        if (right < this.items.length && this.items[right].score < this.items[smallest].score) smallest = right
        if (smallest === i) break
        ;[this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]]
        i = smallest
      }
    }
    return top.id
  }
}

/**
 * Best-first search from `fromNodeId` toward the nearest node satisfying `isTarget`, returning
 * the full path (including fromNodeId itself). Dijkstra when `heuristic` is omitted; A* when one
 * is supplied. `weightFn` lets callers treat every edge as cost 1 (BFS) or use the graph's real
 * edge weights (Dijkstra/A*). `isReachable` restricts which nodes the search may expand through —
 * callers pass the fog-of-war discovered set so the walker can only plan routes through territory
 * it's actually seen, never through or toward undiscovered parts of the true graph; it defaults
 * to "everything" for callers (tests, mostly) working with a fully-known graph on purpose.
 * Returns null if fromNodeId already satisfies isTarget, or nothing reachable does.
 */
export function shortestPathToward(
  graph: Graph,
  fromNodeId: NodeId,
  isTarget: (id: NodeId) => boolean,
  weightFn: (edgeWeight: number) => number,
  heuristic: (id: NodeId) => number = () => 0,
  isReachable: (id: NodeId) => boolean = () => true,
): NodeId[] | null {
  if (isTarget(fromNodeId)) return null

  const weighted = buildWeightedAdjacency(graph)
  const distance = new Map<NodeId, number>([[fromNodeId, 0]])
  const parent = new Map<NodeId, NodeId>()
  const visited = new Set<NodeId>()
  const frontier = new MinHeap()
  frontier.push(fromNodeId, heuristic(fromNodeId))

  let current = frontier.pop()
  while (current !== undefined) {
    if (visited.has(current)) {
      current = frontier.pop()
      continue
    }
    visited.add(current)

    if (isTarget(current)) {
      const path = [current]
      let step = current
      while (step !== fromNodeId) {
        const next = parent.get(step)
        if (next === undefined) return null // disconnected — shouldn't happen on a connected graph
        step = next
        path.push(step)
      }
      return path.reverse()
    }

    for (const { id: neighbor, weight } of weighted.get(current) ?? []) {
      if (visited.has(neighbor)) continue
      if (!isReachable(neighbor)) continue
      const candidateDistance = (distance.get(current) ?? Infinity) + weightFn(weight)
      if (candidateDistance < (distance.get(neighbor) ?? Infinity)) {
        distance.set(neighbor, candidateDistance)
        parent.set(neighbor, current)
        frontier.push(neighbor, candidateDistance + heuristic(neighbor))
      }
    }

    current = frontier.pop()
  }

  return null
}

/** The single next hop to take from fromNodeId toward the nearest node satisfying isTarget — see shortestPathToward. */
export function nextHopToward(
  graph: Graph,
  fromNodeId: NodeId,
  isTarget: (id: NodeId) => boolean,
  weightFn: (edgeWeight: number) => number,
  heuristic: (id: NodeId) => number = () => 0,
  isReachable: (id: NodeId) => boolean = () => true,
): NodeId | null {
  const path = shortestPathToward(graph, fromNodeId, isTarget, weightFn, heuristic, isReachable)
  return path && path.length > 1 ? path[1] : null
}

/** Uniform cost per edge, ignoring actual weight — turns nextHopToward into plain BFS. */
export function uniformWeight(): number {
  return 1
}

/** The real geometric distance between the two nodes — turns nextHopToward into Dijkstra (or A*, with a heuristic). */
export function actualWeight(edgeWeight: number): number {
  return edgeWeight
}

/** Straight-line distance between two nodes' laid-out positions — a genuinely admissible A* heuristic, since edge cost is itself the real Euclidean distance, so by the triangle inequality no real path can ever be shorter than this estimate. */
export function straightLineDistance(a: NodeId, b: NodeId, nodesById: Map<NodeId, { x?: number; y?: number }>): number {
  const nodeA = nodesById.get(a)
  const nodeB = nodesById.get(b)
  const dx = (nodeA?.x ?? 0) - (nodeB?.x ?? 0)
  const dy = (nodeA?.y ?? 0) - (nodeB?.y ?? 0)
  return Math.sqrt(dx * dx + dy * dy)
}


/** Full single-source Dijkstra from fromNodeId over real edge weights, expanding only through nodes isReachable allows — every reached node's distance and parent, for callers that score many candidate targets at once. */
export function shortestPathsFrom(
  graph: Graph,
  fromNodeId: NodeId,
  isReachable: (id: NodeId) => boolean = () => true,
): { distance: Map<NodeId, number>; parent: Map<NodeId, NodeId> } {
  const weighted = buildWeightedAdjacency(graph)
  const distance = new Map<NodeId, number>([[fromNodeId, 0]])
  const parent = new Map<NodeId, NodeId>()
  const settled = new Set<NodeId>()
  const frontier = new MinHeap()
  frontier.push(fromNodeId, 0)
  for (let current = frontier.pop(); current !== undefined; current = frontier.pop()) {
    if (settled.has(current)) continue
    settled.add(current)
    for (const { id: neighbor, weight } of weighted.get(current) ?? []) {
      if (settled.has(neighbor) || !isReachable(neighbor)) continue
      const candidate = (distance.get(current) ?? Infinity) + weight
      if (candidate < (distance.get(neighbor) ?? Infinity)) {
        distance.set(neighbor, candidate)
        parent.set(neighbor, current)
        frontier.push(neighbor, candidate)
      }
    }
  }
  return { distance, parent }
}
