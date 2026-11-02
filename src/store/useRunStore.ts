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

/** Where a walker is headed and how long the crossing takes — lets the UI animate the glide across the edge's real travel time instead of snapping on arrival. Set by the scheduler at departure, cleared on arrival. */
export interface WalkerTransit {
  nextNodeId: NodeId
  travelMs: number
}

interface RunState {
  graph: Graph
  /** Every active searcher running the current strategy. Always length 1 + searcherLevel, except while Bidirectional Search is active, where it holds just the start-side walker. */
  walkers: WalkerState[]
  /** Only set while Bidirectional Search is active — the goal-side walker searching toward walkers[0] from the other end. Unaffected by Extra Searcher. */
  walker2: WalkerState | null
  /** In-flight transit info for each entry in walkers, index-aligned — null while a walker is sitting still (discovering or waiting). */
  walkerTransits: (WalkerTransit | null)[]
  /** walker2's in-flight transit — only meaningful while Bidirectional Search is active. */
  walker2Transit: WalkerTransit | null
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
  /** Set once a non-main walker (or Bidirectional's two halves meeting) has found a route to the real goal before the main walker did — walkers[0] then follows this deterministically, ignoring its strategy, until it reaches the goal. Null the rest of the time. */
  redirectPath: NodeId[] | null
  resetWithNewGraph: () => void
}

function freshRun(): Pick<
  RunState,
  | 'graph'
  | 'walkers'
  | 'walker2'
  | 'walkerTransits'
  | 'walker2Transit'
  | 'discovery'
  | 'strategyMemories'
  | 'sharedRecentPath'
  | 'loadedStrategyId'
  | 'status'
  | 'runStartedAt'
  | 'redirectPath'
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
    walkerTransits: Array.from({ length: searcherCount }, () => null),
    walker2Transit: null,
    discovery,
    strategyMemories: [],
    sharedRecentPath: [],
    loadedStrategyId: progression.activeStrategyId,
    status: 'exploring',
    runStartedAt: Date.now(),
    redirectPath: null,
  }
}

export const useRunStore = create<RunState>((set) => ({
  ...freshRun(),
  resetWithNewGraph: () => set(freshRun()),
}))
