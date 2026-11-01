import { beforeEach, describe, expect, it } from 'vitest'
import { createCurrency } from '../game/currency/rules'
import { bidirectionalSearch } from '../game/strategies'
import { DEFAULT_STRATEGY_ID } from '../game/upgrades/definitions'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from './useProgressionStore'
import { useRunStore } from './useRunStore'

beforeEach(() => {
  useProgressionStore.setState({
    currency: createCurrency(),
    purchasedUpgradeIds: [],
    activeStrategyId: DEFAULT_STRATEGY_ID,
    graphNodeCount: STARTING_GRAPH_NODE_COUNT,
    unlockedLevels: [STARTING_GRAPH_NODE_COUNT],
    momentumLevel: 0,
    memoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    quickStepsLevel: 0,
  })
  useRunStore.getState().resetWithNewGraph()
})

describe('useRunStore', () => {
  it('starts the walker on the graph start node with only its surroundings discovered', () => {
    const { graph, walker, discovery } = useRunStore.getState()
    expect(walker.currentNodeId).toBe(graph.startNodeId)
    expect(discovery.discoveredNodeIds.has(graph.startNodeId)).toBe(true)
    expect(discovery.discoveredNodeIds.has(graph.goalNodeId)).toBe(false)
    expect(useRunStore.getState().status).toBe('exploring')
  })

  it('tick advances the walker and credits currency to the progression store', () => {
    // A single step can land on a node whose whole neighborhood is already discovered
    // (no new reveal, no reward) — and with a small starting graph that's quite likely
    // for any one step — so take many steps rather than asserting on one or few.
    // walker.stepsTaken also resets to 0 on a graph completion, so currency (never reset
    // mid-test) is the only reliably monotonic thing to assert on here.
    const before = useProgressionStore.getState().currency.amount
    for (let i = 0; i < 30; i++) {
      useRunStore.getState().tick()
    }

    expect(useProgressionStore.getState().currency.amount).toBeGreaterThan(before)
  })

  it('resolves a "celebrating" status into a fresh graph on the next tick', () => {
    const originalGraph = useRunStore.getState().graph
    const goalWalker = { ...useRunStore.getState().walker, currentNodeId: originalGraph.goalNodeId, hasReachedGoal: true }
    useRunStore.setState({ walker: goalWalker, status: 'celebrating' })

    useRunStore.getState().tick()

    expect(useRunStore.getState().graph).not.toBe(originalGraph)
    expect(useRunStore.getState().status).toBe('exploring')
    expect(useRunStore.getState().walker.currentNodeId).toBe(useRunStore.getState().graph.startNodeId)
  })

  it('generates a brand new graph once the walker reaches the goal', () => {
    // Reaching the goal moves to a one-tick "celebrating" pause before resetWithNewGraph
    // actually fires, so walker.hasReachedGoal is never observable as true from the
    // outside — assert on graph identity changing instead, over enough ticks that a
    // random walk is certain to arrive (and the follow-up tick is certain to fire).
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

  describe('bidirectional search', () => {
    beforeEach(() => {
      useProgressionStore.setState({ activeStrategyId: bidirectionalSearch.id })
      useRunStore.getState().resetWithNewGraph()
    })

    it('spawns a second walker at the goal node, with both ends already revealed', () => {
      const { graph, walker, walker2, discovery } = useRunStore.getState()
      expect(walker.currentNodeId).toBe(graph.startNodeId)
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

    it('clears walker2 once a different strategy becomes active', () => {
      useRunStore.getState().tick()
      expect(useRunStore.getState().walker2).not.toBeNull()

      useProgressionStore.setState({ activeStrategyId: DEFAULT_STRATEGY_ID })
      useRunStore.getState().tick()

      expect(useRunStore.getState().walker2).toBeNull()
    })
  })
})
