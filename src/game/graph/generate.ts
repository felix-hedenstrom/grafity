import type { Rng } from '../../utils/rng'
import { pickRandom, randomInt } from '../../utils/rng'
import type { Graph, GraphEdge, GraphNode, NodeId } from './types'
import { edgeId } from './types'

const EXTRA_EDGE_RATIO = 0.4
const MIN_EDGE_WEIGHT = 1
const MAX_EDGE_WEIGHT = 9

export function generateGraph(nodeCount: number, rng: Rng = Math.random): Graph {
  if (nodeCount < 2) {
    throw new Error('generateGraph requires at least 2 nodes')
  }

  const nodeIds: NodeId[] = Array.from({ length: nodeCount }, (_, i) => `n${i}`)
  const edgesByKey = new Map<string, GraphEdge>()
  const adjacency: Record<NodeId, NodeId[]> = {}
  for (const id of nodeIds) adjacency[id] = []

  function connect(a: NodeId, b: NodeId) {
    const key = edgeId(a, b)
    if (edgesByKey.has(key)) return
    const weight = MIN_EDGE_WEIGHT + randomInt(rng, MAX_EDGE_WEIGHT - MIN_EDGE_WEIGHT + 1)
    edgesByKey.set(key, { id: key, source: a, target: b, weight })
    adjacency[a].push(b)
    adjacency[b].push(a)
  }

  // Random spanning tree: guarantees every node is reachable from every other.
  const placed: NodeId[] = [nodeIds[0]]
  const unplaced: NodeId[] = nodeIds.slice(1)
  while (unplaced.length > 0) {
    const nextIndex = randomInt(rng, unplaced.length)
    const next = unplaced[nextIndex]
    const anchor = pickRandom(rng, placed)
    connect(next, anchor)
    unplaced.splice(nextIndex, 1)
    placed.push(next)
  }

  // Extra edges on top of the tree, so there's more than one path between
  // nodes — otherwise smarter search algorithms added later have nothing to
  // be smarter about.
  const extraEdgeCount = Math.round(nodeCount * EXTRA_EDGE_RATIO)
  for (let i = 0; i < extraEdgeCount; i++) {
    const a = pickRandom(rng, nodeIds)
    const b = pickRandom(rng, nodeIds)
    if (a === b) continue
    connect(a, b)
  }

  const startNodeId = nodeIds[0]
  const goalNodeId = findFarthestNode(startNodeId, adjacency)

  const nodes: GraphNode[] = nodeIds.map((id) => ({
    id,
    isStart: id === startNodeId,
    isGoal: id === goalNodeId,
  }))

  return {
    nodes,
    edges: Array.from(edgesByKey.values()),
    startNodeId,
    goalNodeId,
    adjacency,
  }
}

function findFarthestNode(from: NodeId, adjacency: Record<NodeId, NodeId[]>): NodeId {
  const distances = new Map<NodeId, number>([[from, 0]])
  const queue: NodeId[] = [from]
  let farthest = from

  while (queue.length > 0) {
    const current = queue.shift() as NodeId
    const currentDistance = distances.get(current) as number
    for (const neighbor of adjacency[current]) {
      if (distances.has(neighbor)) continue
      distances.set(neighbor, currentDistance + 1)
      queue.push(neighbor)
      farthest = neighbor
    }
  }

  return farthest
}
