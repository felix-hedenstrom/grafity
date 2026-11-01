import { create } from 'zustand'
import { createDiscovery, revealAroundNode } from '../game/discovery/reveal'
import type { DiscoveryState } from '../game/discovery/types'
import { generateGraph } from '../game/graph/generate'
import { layoutGraph } from '../game/graph/layout'
import type { Graph } from '../game/graph/types'
import { runBidirectionalTick } from '../game/loop/bidirectionalTick'
import { runTick } from '../game/loop/tick'
import { bidirectionalSearch, getStrategy } from '../game/strategies'
import { computeEffectiveMemoryLevel } from '../game/strategies/memory'
import { createWalker } from '../game/walker/walkerLogic'
import type { WalkerState } from '../game/walker/types'
import { useProgressionStore } from './useProgressionStore'

type RunStatus = 'exploring' | 'celebrating'

interface RunState {
  graph: Graph
  walker: WalkerState
  /** Only set while Bidirectional Search is active — a second walker starting from the exit, searching toward walker from the other side. */
  walker2: WalkerState | null
  discovery: DiscoveryState
  strategyMemory: unknown
  /** Which strategy strategyMemory belongs to — lets tick() detect a strategy switch and start that strategy fresh instead of handing it another strategy's leftover memory. */
  loadedStrategyId: string
  /** 'celebrating' holds the walker at the exit for one full tick interval so the UI has time to show it before the graph resets. */
  status: RunStatus
  /** Wall-clock timestamp (Date.now()) the current run began — Momentum compounds on real elapsed time, not tick/step count. */
  runStartedAt: number
  tick: () => void
  resetWithNewGraph: () => void
}

function freshRun(): Pick<
  RunState,
  'graph' | 'walker' | 'walker2' | 'discovery' | 'strategyMemory' | 'loadedStrategyId' | 'status' | 'runStartedAt'
> {
  const progression = useProgressionStore.getState()
  const graph = layoutGraph(generateGraph(progression.graphNodeCount))
  const isBidirectional = progression.activeStrategyId === bidirectionalSearch.id

  const discovery = isBidirectional
    ? revealAroundNode(createDiscovery(graph, graph.startNodeId), graph, graph.goalNodeId).discovery
    : createDiscovery(graph, graph.startNodeId)

  return {
    graph,
    walker: createWalker(graph.startNodeId),
    walker2: isBidirectional ? createWalker(graph.goalNodeId) : null,
    discovery,
    strategyMemory: undefined,
    loadedStrategyId: progression.activeStrategyId,
    status: 'exploring',
    runStartedAt: Date.now(),
  }
}

export const useRunStore = create<RunState>((set, get) => ({
  ...freshRun(),

  tick: () => {
    const runState = get()

    if (runState.status === 'celebrating') {
      get().resetWithNewGraph()
      return
    }

    const progression = useProgressionStore.getState()

    if (progression.activeStrategyId === bidirectionalSearch.id) {
      // Lazily spawn walker2 if the player switched into Bidirectional mid-run.
      const walker2 = runState.walker2 ?? createWalker(runState.graph.goalNodeId)
      const result = runBidirectionalTick({
        graph: runState.graph,
        walker: runState.walker,
        walker2,
        discovery: runState.discovery,
      })

      set({
        walker: result.walker,
        walker2: result.walker2,
        discovery: result.discovery,
        strategyMemory: undefined,
        loadedStrategyId: progression.activeStrategyId,
        status: result.met ? 'celebrating' : 'exploring',
      })

      if (result.currencyEarned > 0) {
        progression.earnCurrency(result.currencyEarned)
      }
      if (result.met) {
        progression.growGraph()
      }
      return
    }

    const strategy = getStrategy(progression.activeStrategyId)
    const strategyChanged = progression.activeStrategyId !== runState.loadedStrategyId
    const memory = strategyChanged ? strategy.createMemory?.() : (runState.strategyMemory ?? strategy.createMemory?.())

    const result = runTick({
      graph: runState.graph,
      walker: runState.walker,
      discovery: runState.discovery,
      strategy,
      memory,
      memoryLevel: computeEffectiveMemoryLevel(progression.memoryLevel, progression.deepMemoryLevel, strategy.memoryMultiplier),
    })

    set({
      walker: result.walker,
      walker2: null, // no longer relevant once a non-bidirectional strategy is active
      discovery: result.discovery,
      strategyMemory: result.memory,
      loadedStrategyId: progression.activeStrategyId,
      status: result.goalReached ? 'celebrating' : 'exploring',
    })

    if (result.currencyEarned > 0) {
      progression.earnCurrency(result.currencyEarned)
    }

    if (result.goalReached) {
      progression.growGraph()
    }
  },

  resetWithNewGraph: () => set(freshRun()),
}))
