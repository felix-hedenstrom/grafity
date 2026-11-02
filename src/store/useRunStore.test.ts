import { beforeEach, describe, expect, it } from 'vitest'
import { createCurrency } from '../game/currency/rules'
import { bidirectionalSearch } from '../game/strategies'
import { DEFAULT_STRATEGY_ID } from '../game/upgrades/definitions'
import { useAchievementStore } from './useAchievementStore'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from './useProgressionStore'
import { useRunStore } from './useRunStore'

beforeEach(() => {
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

describe('useRunStore', () => {
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

  it('tick advances the walkers and credits currency to the progression store', () => {
    // A single step can land on a node whose whole neighborhood is already discovered
    // (no new reveal, no reward) — and with a small starting graph that's quite likely
    // for any one step — so take many steps rather than asserting on one or few.
    // stepsTaken also resets to 0 on a graph completion, so currency (never reset
    // mid-test) is the only reliably monotonic thing to assert on here.
    const before = useProgressionStore.getState().currency.amount
    for (let i = 0; i < 30; i++) {
      useRunStore.getState().tick()
    }

    expect(useProgressionStore.getState().currency.amount).toBeGreaterThan(before)
  })

  it('resolves a "celebrating" status into a fresh graph on the next tick', () => {
    const originalGraph = useRunStore.getState().graph
    const goalWalker = { ...useRunStore.getState().walkers[0], currentNodeId: originalGraph.goalNodeId, hasReachedGoal: true }
    useRunStore.setState({ walkers: [goalWalker], status: 'celebrating' })

    useRunStore.getState().tick()

    expect(useRunStore.getState().graph).not.toBe(originalGraph)
    expect(useRunStore.getState().status).toBe('exploring')
    expect(useRunStore.getState().walkers[0].currentNodeId).toBe(useRunStore.getState().graph.startNodeId)
  })

  it('generates a brand new graph once a walker reaches the goal', () => {
    // Reaching the goal moves to a one-tick "celebrating" pause before resetWithNewGraph
    // actually fires, so hasReachedGoal is never observable as true from the outside —
    // assert on graph identity changing instead, over enough ticks that a random walk is
    // certain to arrive (and the follow-up tick is certain to fire).
    const originalGraph = useRunStore.getState().graph
    for (let i = 0; i < 10_000; i++) {
      useRunStore.getState().tick()
    }

    // A reset may have happened anywhere in those 10,000 ticks, so the walker has likely
    // wandered since — only graph identity reliably proves a reset occurred.
    expect(useRunStore.getState().graph).not.toBe(originalGraph)
    expect(useRunStore.getState().status).toBe('exploring')
  })

  it('grows the graph by one node each time the goal is reached', () => {
    for (let i = 0; i < 10_000; i++) {
      useRunStore.getState().tick()
    }

    expect(useProgressionStore.getState().graphNodeCount).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT)
    expect(useRunStore.getState().graph.nodes.length).toBe(useProgressionStore.getState().graphNodeCount)
  })

  it('unlocks the first-solve achievement once a graph is actually solved', () => {
    expect(useAchievementStore.getState().unlockedIds).not.toContain('first-solve')

    for (let i = 0; i < 10_000; i++) {
      useRunStore.getState().tick()
    }

    expect(useAchievementStore.getState().unlockedIds).toContain('first-solve')
    expect(useAchievementStore.getState().toastQueue).toContain('first-solve')
  })

  it('spawns an additional searcher mid-run once Extra Searcher is bought, without resetting the others', () => {
    useRunStore.getState().tick()
    const firstWalkerBefore = useRunStore.getState().walkers[0]

    useProgressionStore.setState({ searcherLevel: 1 })
    useRunStore.getState().tick()

    const walkers = useRunStore.getState().walkers
    expect(walkers).toHaveLength(2)
    // The original searcher keeps going from wherever it was, not reset to the start node.
    expect(walkers[0].stepsTaken).toBeGreaterThanOrEqual(firstWalkerBefore.stepsTaken)
  })

  it('relayoutGraph re-lays-out the current graph immediately, without resetting the run', () => {
    useRunStore.getState().tick()
    const { graph: originalGraph, walkers: originalWalkers, discovery: originalDiscovery } = useRunStore.getState()

    useRunStore.getState().relayoutGraph(20)

    const state = useRunStore.getState()
    expect(state.graph).not.toBe(originalGraph) // a fresh layout object, not a mutation
    expect(state.graph.nodes.map((n) => n.id)).toEqual(originalGraph.nodes.map((n) => n.id)) // same topology
    expect(state.graph.startNodeId).toBe(originalGraph.startNodeId)
    expect(state.graph.goalNodeId).toBe(originalGraph.goalNodeId)
    // The run itself is untouched — same walkers/discovery, not a fresh run.
    expect(state.walkers).toBe(originalWalkers)
    expect(state.discovery).toBe(originalDiscovery)
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

    it('ticks both walkers and eventually has them meet, growing the graph', () => {
      // Pathfinding strategies replan from scratch every tick and the graph grows by one node
      // each time the walkers meet, so unlike the single-walker tests this doesn't want 10,000
      // ticks — a small starting graph meets in well under 50.
      const originalGraph = useRunStore.getState().graph
      for (let i = 0; i < 200; i++) {
        useRunStore.getState().tick()
      }

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
      useRunStore.getState().tick()
      expect(useRunStore.getState().walker2).not.toBeNull()

      useProgressionStore.setState({ activeStrategyId: DEFAULT_STRATEGY_ID })
      useRunStore.getState().tick()

      expect(useRunStore.getState().walker2).toBeNull()
    })
  })
})
