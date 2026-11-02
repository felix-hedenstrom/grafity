import { create } from 'zustand'
import { createDiscovery, revealAroundNode } from '../game/discovery/reveal'
import type { DiscoveryState } from '../game/discovery/types'
import { generatePlanarGraph } from '../game/graph/generatePlanar'
import type { Graph } from '../game/graph/types'
import type { NodeId } from '../game/graph/types'
import { bidirectionalSearch } from '../game/strategies'
import { createWalker } from '../game/walker/walkerLogic'
import type { WalkerState } from '../game/walker/types'
import { useProgressionStore } from './useProgressionStore'

type RunStatus = 'exploring' | 'celebrating'

interface RunState {
  graph: Graph
  /** Every active searcher running the current strategy. Always length 1 + searcherLevel, except while Bidirectional Search is active, where it holds just the start-side walker. */
  walkers: WalkerState[]
  /** Only set while Bidirectional Search is active — the goal-side walker searching toward walkers[0] from the other end. Unaffected by Extra Searcher. */
  walker2: WalkerState | null
  discovery: DiscoveryState
  /** Per-walker scratch state (e.g. DFS's backtracking stack), index-aligned with walkers — never pooled. */
  strategyMemories: unknown[]
  /** The pooled Node Memory window every searcher shares — what makes "Extra Searcher" searchers share memory instead of each remembering their own trail. */
  sharedRecentPath: NodeId[]
  /** Which strategy strategyMemories/sharedRecentPath belong to — lets the scheduler detect a strategy switch and start fresh instead of handing it another strategy's leftover memory. */
  loadedStrategyId: string
  /** 'celebrating' holds the walkers at the exit for a fixed hold so the UI has time to show it before the graph resets. */
  status: RunStatus
  /** Wall-clock timestamp (Date.now()) the current run began — Momentum compounds on real elapsed time, not step count. */
  runStartedAt: number
  resetWithNewGraph: () => void
}

function freshRun(): Pick<
  RunState,
  'graph' | 'walkers' | 'walker2' | 'discovery' | 'strategyMemories' | 'sharedRecentPath' | 'loadedStrategyId' | 'status' | 'runStartedAt'
> {
  const progression = useProgressionStore.getState()
  const graph = generatePlanarGraph(progression.graphNodeCount, undefined, progression.clarityLevel > 0)
  const isBidirectional = progression.activeStrategyId === bidirectionalSearch.id
  const searcherCount = isBidirectional ? 1 : 1 + progression.searcherLevel

  const discovery = isBidirectional
    ? revealAroundNode(createDiscovery(graph, graph.startNodeId), graph, graph.goalNodeId).discovery
    : createDiscovery(graph, graph.startNodeId)

  return {
    graph,
    walkers: Array.from({ length: searcherCount }, () => createWalker(graph.startNodeId)),
    walker2: isBidirectional ? createWalker(graph.goalNodeId) : null,
    discovery,
    strategyMemories: [],
    sharedRecentPath: [],
    loadedStrategyId: progression.activeStrategyId,
    status: 'exploring',
    runStartedAt: Date.now(),
  }
}

export const useRunStore = create<RunState>((set) => ({
  ...freshRun(),
  resetWithNewGraph: () => set(freshRun()),
}))
