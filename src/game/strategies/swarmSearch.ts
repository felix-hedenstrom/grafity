import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { plannableFn } from './memory'
import { actualWeight, shortestPathToward, straightLineDistance } from './pathfinding'
import type { StrategyContext, TraversalStrategy } from './types'

/** JSON-safe shared state: which frontier node each walker (by index) has currently claimed as its personal target. Claims are re-validated on every decision, so there's no cleanup protocol — a stale claim just gets dropped and re-planned. */
interface SwarmMemory {
  assignments: Record<number, NodeId>
}

function isSwarmMemory(value: unknown): value is SwarmMemory {
  return typeof value === 'object' && value !== null && 'assignments' in value
}

/**
 * The fleet coordinates: each ship claims the nearest frontier node no one else has claimed and
 * sweeps toward it, so N ships fan out across N different frontiers instead of all racing to the
 * same nearest one. Once the destination itself is discovered, everyone drops their claims and
 * beelines A*-style. With a single ship it degrades exactly to "A* with real edge costs" — the
 * claims never conflict — which keeps it at or above A*'s tier even before any UFOs exist.
 */
function chooseNext(ctx: StrategyContext): NodeId | null {
  const { graph, discovery, walker } = ctx
  const target = ctx.targetNodeId ?? graph.goalNodeId
  const plannable = plannableFn(ctx)
  const walkerIndex = ctx.walkerIndex ?? 0
  const memory = isSwarmMemory(ctx.sharedMemory) ? ctx.sharedMemory : null

  // Destination known: full beeline, same as A*.
  if (discovery.discoveredNodeIds.has(target)) {
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
    const toTarget = shortestPathToward(
      graph,
      walker.currentNodeId,
      (id) => id === target,
      actualWeight,
      (id) => straightLineDistance(id, target, nodesById),
      plannable,
    )
    if (toTarget) {
      if (memory) delete memory.assignments[walkerIndex]
      return toTarget[1]
    }
  }

  const isFrontier = (id: NodeId) => discovery.discoveredNodeIds.has(id) && !discovery.visitedNodeIds.has(id)
  const claimedByOthers = new Set<NodeId>()
  if (memory) {
    for (const [index, nodeId] of Object.entries(memory.assignments)) {
      // Drop stale claims eagerly (target already visited by anyone) instead of routing to a dead target.
      if (!isFrontier(nodeId)) {
        delete memory.assignments[Number(index)]
        continue
      }
      if (Number(index) !== walkerIndex) claimedByOthers.add(nodeId)
    }
  }

  // My standing claim, if it survived validation: keep marching toward it.
  const myClaim = memory?.assignments[walkerIndex]
  const seekTarget = (accept: (id: NodeId) => boolean): NodeId[] | null =>
    shortestPathToward(graph, walker.currentNodeId, accept, actualWeight, undefined, plannable)

  const path =
    (myClaim ? seekTarget((id) => id === myClaim) : null) ??
    // Nearest unclaimed frontier; claim whatever the search lands on.
    seekTarget((id) => isFrontier(id) && !claimedByOthers.has(id)) ??
    // More ships than frontier nodes — share, rather than stall.
    seekTarget(isFrontier)

  if (!path) return null
  if (memory) memory.assignments[walkerIndex] = path[path.length - 1]
  return path[1]
}

export const swarmSearch: TraversalStrategy = {
  id: 'swarm',
  name: 'Swarm Search',
  memoryMultiplier: 3,
  createSharedMemory(): SwarmMemory {
    return { assignments: {} }
  },
  chooseNextNode(ctx) {
    return chooseNext(ctx) ?? pickRandom(Math.random, ctx.graph.adjacency[ctx.walker.currentNodeId])
  },
  getHighlightedNodes(ctx) {
    const { graph, discovery, walker } = ctx
    const target = ctx.targetNodeId ?? graph.goalNodeId
    const claimed = isSwarmMemory(ctx.sharedMemory) ? new Set(Object.values(ctx.sharedMemory.assignments)) : new Set<NodeId>()
    if (discovery.discoveredNodeIds.has(target)) {
      const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
      const path = shortestPathToward(
        graph,
        walker.currentNodeId,
        (id) => id === target,
        actualWeight,
        (id) => straightLineDistance(id, target, nodesById),
        plannableFn(ctx),
      )
      if (path) return [{ kind: 'path', nodeIds: new Set(path) }]
    }
    return [{ kind: 'candidate', nodeIds: claimed }]
  },
}
