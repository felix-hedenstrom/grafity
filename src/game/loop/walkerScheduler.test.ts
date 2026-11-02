import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCurrency } from '../currency/rules'
import type { Graph } from '../graph/types'
import { CELEBRATION_HOLD_MS } from '../speed/rules'
import { bidirectionalSearch } from '../strategies'
import { DEFAULT_STRATEGY_ID } from '../upgrades/definitions'
import { createWalker } from '../walker/walkerLogic'
import { useAchievementStore } from '../../store/useAchievementStore'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import type { GameLoopHandle } from './walkerScheduler'
import { startWalkerScheduler } from './walkerScheduler'

/**
 * A tiny straight-line graph (start -- A -- goal), used to deterministically exercise the redirect
 * flow: with Math.random mocked to always return 0, randomWalk's pickRandom always picks each
 * node's first adjacency entry, so ordering the arrays below fully controls which way every walker
 * moves. The A--goal distance is deliberately shorter than A--start (edge weight is now derived
 * from node position, not a separate field): at UFO_SPEED_RATIO_BASE, a UFO's single A->goal hop
 * and the Spaceship's own two full-speed hops (start->A->goal) would otherwise land at the exact
 * same instant when both edges share a distance, leaving no window to observe the mid-flight
 * redirect state the 'exit redirect' tests below check for.
 */
function buildLineGraph(): Graph {
  return {
    nodes: [
      { id: 'start', isStart: true, isGoal: false, x: 0, y: 0 },
      { id: 'A', isStart: false, isGoal: false, x: 60, y: 0 },
      { id: 'goal', isStart: false, isGoal: true, x: 80, y: 0 },
    ],
    edges: [
      { id: 'A--start', source: 'start', target: 'A' },
      { id: 'A--goal', source: 'A', target: 'goal' },
    ],
    startNodeId: 'start',
    goalNodeId: 'goal',
    adjacency: { start: ['A'], A: ['goal', 'start'], goal: ['A'] },
  }
}

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
    mutexEnabled: false,
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

  describe('exit redirect', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // randomWalk always takes each node's first adjacency entry
      useProgressionStore.setState({ searcherLevel: 1 }) // a second (non-main) walker
      const graph = buildLineGraph()
      useRunStore.setState({
        graph,
        walkers: [createWalker(graph.startNodeId), { ...createWalker('A'), path: ['start', 'A'] }],
        walkerTransits: [null, null],
        discovery: {
          discoveredNodeIds: new Set(['start', 'A']),
          discoveredEdgeIds: new Set(['A--start']),
          visitedNodeIds: new Set(['start', 'A']),
        },
        strategyMemories: [undefined, undefined],
        sharedRecentPath: [],
        loadedStrategyId: DEFAULT_STRATEGY_ID,
        status: 'exploring',
        redirectPath: null,
      })
    })

    it('redirects the main walker and makes every other walker disappear once a non-main walker finds the exit', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(2700) // just enough for walker[1] (a UFO, at UFO_SPEED_RATIO_BASE speed) to cross A -> goal, well before the Spaceship's own two-hop trip would land there (~5333ms)

      const state = useRunStore.getState()
      expect(state.walkers).toHaveLength(1)
      expect(state.redirectPath).not.toBeNull()
      expect(state.status).toBe('exploring') // not a win yet — only the main walker reaching the goal ends the run
    })

    it('eventually lands the main walker on the real goal via the redirect path, ending the run', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(6_000) // first hop (A, 4000ms) + redirect handoff + second hop (goal, ~1333ms), with margin — short of the celebration hold resetting the run at ~6833ms

      expect(useRunStore.getState().walkers[0].hasReachedGoal).toBe(true)
      expect(useRunStore.getState().status).toBe('celebrating')
    })

    it('stops growing the searcher pool while a redirect is in flight', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(2700)
      expect(useRunStore.getState().redirectPath).not.toBeNull()

      useProgressionStore.setState({ searcherLevel: 4 })
      vi.advanceTimersByTime(500)

      expect(useRunStore.getState().walkers).toHaveLength(1) // no new searchers spawned mid-redirect
    })
  })

  describe('Traffic Control (mutex)', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    /** hub connects to both 'a' and 'b' — randomWalk mocked to always take the first adjacency entry ('a'). */
    function buildHubGraph(): Graph {
      return {
        nodes: [
          { id: 'hub', isStart: true, isGoal: false, x: 0, y: 0 },
          { id: 'a', isStart: false, isGoal: false, x: 10, y: 0 },
          { id: 'b', isStart: false, isGoal: false, x: 0, y: 10 },
        ],
        edges: [
          { id: 'a--hub', source: 'hub', target: 'a' },
          { id: 'b--hub', source: 'hub', target: 'b' },
        ],
        startNodeId: 'hub',
        goalNodeId: 'none',
        adjacency: { hub: ['a', 'b'], a: ['hub'], b: ['hub'] },
      }
    }

    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // randomWalk always takes each node's first adjacency entry
      useProgressionStore.setState({ searcherLevel: 1 }) // a second walker, already resting on 'a'
      const graph = buildHubGraph()
      useRunStore.setState({
        graph,
        walkers: [createWalker('hub'), { ...createWalker('a'), path: ['hub', 'a'] }],
        walkerTransits: [null, null],
        discovery: {
          discoveredNodeIds: new Set(['hub', 'a', 'b']),
          discoveredEdgeIds: new Set(['a--hub', 'b--hub']),
          visitedNodeIds: new Set(['hub', 'a']),
        },
        strategyMemories: [undefined, undefined],
        sharedRecentPath: [],
        loadedStrategyId: DEFAULT_STRATEGY_ID,
        status: 'exploring',
        redirectPath: null,
      })
    })

    it('steers a searcher away from a node another walker currently occupies', () => {
      useProgressionStore.setState({ mutexEnabled: true })
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(1) // let the initial dispatch timer fire

      // Unrestricted, randomWalk (mocked) would send walkers[0] to 'a' — but walkers[1] is already there.
      expect(useRunStore.getState().walkerTransits[0]?.nextNodeId).toBe('b')
    })

    it('does not restrict movement when mutex is disabled', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(1)

      expect(useRunStore.getState().walkerTransits[0]?.nextNodeId).toBe('a')
    })
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
