import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCurrency } from '../currency/rules'
import { CELEBRATION_HOLD_MS } from '../speed/rules'
import { bidirectionalSearch } from '../strategies'
import { DEFAULT_STRATEGY_ID } from '../upgrades/definitions'
import { useAchievementStore } from '../../store/useAchievementStore'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import type { GameLoopHandle } from './walkerScheduler'
import { startWalkerScheduler } from './walkerScheduler'

let handle: GameLoopHandle | undefined

beforeEach(() => {
  vi.useFakeTimers()
  useAchievementStore.setState({ unlockedIds: [], toastQueue: [] })
  useProgressionStore.setState({
    currency: createCurrency(),
    purchasedUpgradeIds: [],
    activeStrategyId: DEFAULT_STRATEGY_ID,
    graphNodeCount: STARTING_GRAPH_NODE_COUNT,
    highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
    momentumLevel: 0,
    memoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    quickStepsLevel: 0,
    discoverWaitLevel: 0,
    searcherLevel: 0,
    clarityLevel: 0,
    discoveryBonusLevel: 0,
    revisitBonusLevel: 0,
    exitBonusLevel: 0,
    insightMultiplierLevel: 0,
    minimapEnabled: true,
  })
  useRunStore.getState().resetWithNewGraph()
})

afterEach(() => {
  handle?.stop()
  handle = undefined
  vi.useRealTimers()
})

describe('walkerScheduler', () => {
  it('starts with a single walker on the graph start node, with only its surroundings discovered', () => {
    const { graph, walkers, discovery } = useRunStore.getState()
    expect(walkers).toHaveLength(1)
    expect(walkers[0].currentNodeId).toBe(graph.startNodeId)
    expect(discovery.discoveredNodeIds.has(graph.startNodeId)).toBe(true)
    expect(discovery.discoveredNodeIds.has(graph.goalNodeId)).toBe(false)
    expect(useRunStore.getState().status).toBe('exploring')
  })

  it('starts with 1 + searcherLevel walkers, all from the start node', () => {
    useProgressionStore.setState({ searcherLevel: 3 })
    useRunStore.getState().resetWithNewGraph()

    const { graph, walkers } = useRunStore.getState()
    expect(walkers).toHaveLength(4)
    for (const walker of walkers) {
      expect(walker.currentNodeId).toBe(graph.startNodeId)
    }
  })

  it('moves walkers independently over real time and credits currency to the progression store', () => {
    const before = useProgressionStore.getState().currency.amount
    handle = startWalkerScheduler()

    vi.advanceTimersByTime(60_000)

    expect(useProgressionStore.getState().currency.amount).toBeGreaterThan(before)
  })

  it('resolves a "celebrating" status into a fresh graph after the celebration hold', () => {
    const originalGraph = useRunStore.getState().graph
    const goalWalker = { ...useRunStore.getState().walkers[0], currentNodeId: originalGraph.goalNodeId, hasReachedGoal: true }
    useRunStore.setState({ walkers: [goalWalker], status: 'celebrating' })

    handle = startWalkerScheduler()
    vi.advanceTimersByTime(CELEBRATION_HOLD_MS)

    expect(useRunStore.getState().graph).not.toBe(originalGraph)
    expect(useRunStore.getState().status).toBe('exploring')
    expect(useRunStore.getState().walkers[0].currentNodeId).toBe(useRunStore.getState().graph.startNodeId)
  })

  it('generates a brand new graph once a walker reaches the goal', () => {
    const originalGraph = useRunStore.getState().graph
    handle = startWalkerScheduler()

    vi.advanceTimersByTime(5_000_000)

    expect(useRunStore.getState().graph).not.toBe(originalGraph)
    expect(useRunStore.getState().status).toBe('exploring')
  })

  it('grows the graph by one node each time the goal is reached', () => {
    handle = startWalkerScheduler()
    vi.advanceTimersByTime(5_000_000)

    expect(useProgressionStore.getState().graphNodeCount).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT)
    expect(useRunStore.getState().graph.nodes.length).toBe(useProgressionStore.getState().graphNodeCount)
  })

  it('unlocks the first-solve achievement once a graph is actually solved', () => {
    expect(useAchievementStore.getState().unlockedIds).not.toContain('first-solve')

    handle = startWalkerScheduler()
    vi.advanceTimersByTime(5_000_000)

    expect(useAchievementStore.getState().unlockedIds).toContain('first-solve')
    expect(useAchievementStore.getState().toastQueue).toContain('first-solve')
  })

  it('spawns an additional searcher mid-run once Extra Searcher is bought, without resetting the others', () => {
    handle = startWalkerScheduler()
    vi.advanceTimersByTime(2000)
    const firstWalkerBefore = useRunStore.getState().walkers[0]

    useProgressionStore.setState({ searcherLevel: 1 })
    vi.advanceTimersByTime(2000)

    const walkers = useRunStore.getState().walkers
    expect(walkers).toHaveLength(2)
    // The original searcher keeps going from wherever it was, not reset to the start node.
    expect(walkers[0].stepsTaken).toBeGreaterThanOrEqual(firstWalkerBefore.stepsTaken)
  })

  describe('bidirectional search', () => {
    beforeEach(() => {
      useProgressionStore.setState({ activeStrategyId: bidirectionalSearch.id })
      useRunStore.getState().resetWithNewGraph()
    })

    it('spawns a second walker at the goal node, with both ends already revealed', () => {
      const { graph, walkers, walker2, discovery } = useRunStore.getState()
      expect(walkers[0].currentNodeId).toBe(graph.startNodeId)
      expect(walker2?.currentNodeId).toBe(graph.goalNodeId)
      expect(discovery.discoveredNodeIds.has(graph.startNodeId)).toBe(true)
      expect(discovery.discoveredNodeIds.has(graph.goalNodeId)).toBe(true)
    })

    it('moves both walkers independently and eventually has them meet, growing the graph', () => {
      const originalGraph = useRunStore.getState().graph
      handle = startWalkerScheduler()

      vi.advanceTimersByTime(500_000)

      expect(useRunStore.getState().graph).not.toBe(originalGraph) // a meet-and-reset happened
      expect(useProgressionStore.getState().graphNodeCount).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT)
    })

    it('ignores searcherLevel — always exactly two walkers, from opposite ends', () => {
      useProgressionStore.setState({ searcherLevel: 5 })
      useRunStore.getState().resetWithNewGraph()

      expect(useRunStore.getState().walkers).toHaveLength(1)
      expect(useRunStore.getState().walker2).not.toBeNull()
    })

    it('clears walker2 once a different strategy becomes active', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(500)
      expect(useRunStore.getState().walker2).not.toBeNull()

      useProgressionStore.setState({ activeStrategyId: DEFAULT_STRATEGY_ID })
      vi.advanceTimersByTime(500)

      expect(useRunStore.getState().walker2).toBeNull()
    })
  })
})
