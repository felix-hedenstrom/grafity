import { pickRandom } from '../../utils/rng'
import type { NodeId } from '../graph/types'
import { capMemoryStack } from './memory'
import type { TraversalStrategy } from './types'

interface DfsMemory {
  /** The path from the root of the current DFS traversal to the walker's position — the literal call stack, truncated to the last memoryLevel entries. */
  stack: NodeId[]
}

function isDfsMemory(memory: unknown): memory is DfsMemory {
  return typeof memory === 'object' && memory !== null && Array.isArray((memory as DfsMemory).stack)
}

export const depthFirstSearch: TraversalStrategy = {
  id: 'dfs',
  name: 'Depth-First Search',
  memoryMultiplier: 1,
  createMemory: (): DfsMemory => ({ stack: [] }),
  chooseNextNode(ctx) {
    const { graph, discovery, walker, memoryLevel } = ctx
    const memory = isDfsMemory(ctx.memory) ? ctx.memory : { stack: [] }

    // Keep the stack in sync with where the walker actually is — covers both the
    // very first call and a strategy switch landing us mid-graph.
    if (memory.stack[memory.stack.length - 1] !== walker.currentNodeId) {
      memory.stack.push(walker.currentNodeId)
      capMemoryStack(memory.stack, memoryLevel)
    }

    const neighbors = graph.adjacency[walker.currentNodeId]
    const unvisited = neighbors.filter((id) => !discovery.visitedNodeIds.has(id) && !ctx.excludedNodeIds?.has(id))

    if (unvisited.length > 0) {
      const next = pickRandom(Math.random, unvisited)
      memory.stack.push(next)
      capMemoryStack(memory.stack, memoryLevel)
      return next
    }

    // Dead end: pop back to the parent and walk there — DFS backtracking is just retracing one step.
    // If memory doesn't reach far enough back, the stack runs out early and it falls back to a random
    // neighbor instead of a correct backtrack — the cost of forgetting beyond what Node Memory covers.
    // A claimed parent (Traffic Control) falls through the same way: there's nowhere unclaimed left,
    // so it picks any neighbor rather than walking into another walker.
    memory.stack.pop()
    const parent = memory.stack[memory.stack.length - 1]
    if (parent !== undefined && !ctx.excludedNodeIds?.has(parent)) return parent
    return pickRandom(Math.random, neighbors)
  },
  getHighlightedNodes(ctx) {
    return isDfsMemory(ctx.memory) ? [{ kind: 'stack', nodeIds: new Set(ctx.memory.stack) }] : []
  },
}
