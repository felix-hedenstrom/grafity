import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCurrency } from '../currency/rules'
import type { Graph } from '../graph/types'
import { PRODUCTION_CONFIG } from '../config/production'
import { computeDiscoverWaitMs } from '../speed/rules'
import { DEFAULT_STRATEGY_ID } from '../upgrades/definitions'
import { createWalker } from '../walker/walkerLogic'
import { useAchievementStore } from '../../store/useAchievementStore'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import type { GameLoopHandle } from './walkerScheduler'
import { startWalkerScheduler } from './walkerScheduler'

/**
 * A tiny straight-line graph (start -- A -- goal), used to deterministically exercise the redirect
 * flow: with Math.random mocked to always return 0, randomWalk's pickRandom always picks each
 * node's first adjacency entry, so ordering the arrays below fully controls which way every walker
 * moves. The A--goal distance is deliberately shorter than A--start (edge weight is now derived
 * from node position, not a separate field): both walkers share the same top speed (the speed of
 * light) but are acceleration-limited on these short edges, so the UFO's single A->goal hop
 * (~4.1s, braking into the unvisited goal) finishes before the Spaceship's longer start->A hop
 * lands (~5.1s), leaving a window to observe the mid-flight redirect state the 'exit redirect'
 * tests below check for.
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
    momentumOwned: false,
    memoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    discoverWaitLevel: 0,
    searcherLevel: 0,
    discoveryBonusLevel: 0,
    revisitBonusLevel: 0,
    exitBonusLevel: 0,
    insightMultiplierLevel: 0,
  })
  usePrestigeStore.getState().resetPrestige()
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
    vi.advanceTimersByTime(PRODUCTION_CONFIG.speed.celebrationHoldMs)

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

  it('unlocks the first-solve achievement the instant the goal is reached, before the next level even starts', () => {
    handle = startWalkerScheduler()

    // Advance in small steps until status flips to 'celebrating', stopping well short of
    // PRODUCTION_CONFIG.speed.celebrationHoldMs so the next level's graph hasn't been generated and no hop into it
    // has happened yet.
    let elapsed = 0
    while (useRunStore.getState().status !== 'celebrating' && elapsed < 5_000_000) {
      vi.advanceTimersByTime(100)
      elapsed += 100
    }

    expect(useRunStore.getState().status).toBe('celebrating')
    expect(useAchievementStore.getState().unlockedIds).toContain('first-solve')
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
      vi.advanceTimersByTime(4_600) // just enough for walker[1] (a UFO) to cross A -> goal (~4100ms), before the Spaceship's own hop lands on A (~5100ms)

      const state = useRunStore.getState()
      expect(state.walkers).toHaveLength(1)
      expect(state.redirectPath).not.toBeNull()
      expect(state.status).toBe('exploring') // not a win yet — only the main walker reaching the goal ends the run
    })

    it('eventually lands the main walker on the real goal via the redirect path, ending the run', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(6_500) // first hop (A, ~5100ms) + redirect handoff + second hop (goal, ~800ms), with margin — short of the celebration hold resetting the run at ~7300ms

      expect(useRunStore.getState().walkers[0].hasReachedGoal).toBe(true)
      expect(useRunStore.getState().status).toBe('celebrating')
    })

    it('keeps hunting when a UFO lands on a locked exit, and redirects once the last key is collected', () => {
      // start - A - goal - K: the key sits past the exit, so the UFO stands on the locked exit first.
      const graph: Graph = {
        nodes: [
          { id: 'start', isStart: true, isGoal: false, x: 0, y: 0 },
          { id: 'A', isStart: false, isGoal: false, x: 60, y: 0 },
          { id: 'goal', isStart: false, isGoal: true, x: 80, y: 0 },
          { id: 'K', isStart: false, isGoal: false, isKey: true, x: 100, y: 0 },
        ],
        edges: [
          { id: 'A--start', source: 'start', target: 'A' },
          { id: 'A--goal', source: 'A', target: 'goal' },
          { id: 'K--goal', source: 'goal', target: 'K' },
        ],
        startNodeId: 'start',
        goalNodeId: 'goal',
        adjacency: { start: ['A'], A: ['goal', 'start'], goal: ['K', 'A'], K: ['goal'] },
      }
      useRunStore.setState({ graph })
      handle = startWalkerScheduler()

      vi.advanceTimersByTime(4_600) // the UFO has landed on the (locked) exit
      let state = useRunStore.getState()
      expect(state.walkers[1].currentNodeId).toBe('goal')
      expect(state.walkers).toHaveLength(2)
      expect(state.redirectPath).toBeNull()
      expect(state.status).toBe('exploring')

      // Step until the run is won: by then the key must have been collected first.
      for (let t = 0; t < 600 && useRunStore.getState().status !== 'celebrating'; t++) vi.advanceTimersByTime(100)
      state = useRunStore.getState()
      expect(state.status).toBe('celebrating')
      expect(state.discovery.visitedNodeIds.has('K')).toBe(true)
      expect(state.walkers[0].currentNodeId).toBe('goal')
    })

    it('stops growing the searcher pool while a redirect is in flight', () => {
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(4_600)
      expect(useRunStore.getState().redirectPath).not.toBeNull()

      useProgressionStore.setState({ searcherLevel: 4 })
      vi.advanceTimersByTime(500)

      expect(useRunStore.getState().walkers).toHaveLength(1) // no new searchers spawned mid-redirect
    })

    it('keeps the Spaceship on course mid-hop when the strategy is swapped', () => {
      useProgressionStore.setState({ purchasedUpgradeIds: ['bfs'] })
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(1_000) // the Spaceship is mid-flight start -> A
      const before = useRunStore.getState()
      const transit = before.walkerTransits[0]
      expect(transit?.nextNodeId).toBe('A')

      useProgressionStore.setState({ activeStrategyId: 'bfs' })

      const after = useRunStore.getState()
      expect(after.walkerTransits[0]).toBe(transit) // no snap back to the node it left
      expect(after.walkerSpeeds[0]).toBe(before.walkerSpeeds[0])
      expect(after.walkers[0].currentNodeId).toBe('start')

      vi.advanceTimersByTime(4_500) // the original hop lands on A
      expect(useRunStore.getState().walkers[0].path).toContain('A')
    })

    it('keeps a known exit route and does not respawn UFOs when the strategy is swapped', () => {
      useProgressionStore.setState({ purchasedUpgradeIds: ['bfs'] })
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(4_600) // a UFO found the exit; the Spaceship is beelining
      const redirectPath = useRunStore.getState().redirectPath
      expect(redirectPath).not.toBeNull()

      useProgressionStore.setState({ activeStrategyId: 'bfs' })

      const state = useRunStore.getState()
      expect(state.redirectPath).toEqual(redirectPath)
      expect(state.walkers).toHaveLength(1)

      vi.advanceTimersByTime(1_900)
      expect(useRunStore.getState().status).toBe('celebrating')
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
      usePrestigeStore.setState({ mutexEnabled: true })
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

  describe('Reverse Beacon', () => {
    beforeEach(() => {
      usePrestigeStore.setState({ unlockUfoOwned: true, bidirectionalOwned: true, bidirectionalEnabled: true })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('launches half the UFOs (rounded up) from the exit, with the exit pre-revealed', () => {
      useProgressionStore.setState({ searcherLevel: 3 })
      useRunStore.getState().resetWithNewGraph()

      const { graph, walkers, discovery } = useRunStore.getState()
      expect(walkers).toHaveLength(4)
      expect(walkers[0].origin).toBe('start')
      expect(walkers[0].currentNodeId).toBe(graph.startNodeId)
      const reverse = walkers.filter((w) => w.origin === 'goal')
      expect(reverse).toHaveLength(2) // ceil(3 / 2)
      expect(reverse.every((w) => w.currentNodeId === graph.goalNodeId)).toBe(true)
      expect(discovery.discoveredNodeIds.has(graph.goalNodeId)).toBe(true)
    })

    it('does nothing without UFOs — a lone Spaceship still launches from the start only', () => {
      useProgressionStore.setState({ searcherLevel: 0 })
      useRunStore.getState().resetWithNewGraph()

      const { walkers } = useRunStore.getState()
      expect(walkers).toHaveLength(1)
      expect(walkers[0].origin).toBe('start')
    })

    it('redirects the Spaceship and despawns the UFOs the moment a reverse walker touches forward territory', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // randomWalk always takes each node's first adjacency entry
      useProgressionStore.setState({ searcherLevel: 1 })
      const graph = buildLineGraph()
      useRunStore.setState({
        graph,
        // Spaceship from the start, one Reverse Beacon UFO from the goal — not yet met (start and
        // goal aren't adjacent, and neither path crosses the other's position).
        walkers: [createWalker(graph.startNodeId), createWalker(graph.goalNodeId, 'goal')],
        walkerTransits: [null, null],
        walkerSpeeds: [0, 0],
        walkerRests: [null, null],
        discovery: {
          discoveredNodeIds: new Set(['start', 'A', 'goal']),
          discoveredEdgeIds: new Set(['A--start', 'A--goal']),
          visitedNodeIds: new Set(['start', 'goal']),
        },
        strategyMemories: [undefined, undefined],
        sharedRecentPath: [],
        loadedStrategyId: DEFAULT_STRATEGY_ID,
        status: 'exploring',
        redirectPath: null,
      })
      handle = startWalkerScheduler()

      // The reverse UFO's goal -> A hop (~4.5s) lands while the Spaceship's longer start -> A hop
      // is still in flight; A is adjacent to the Spaceship's position, so that arrival is the meet.
      vi.advanceTimersByTime(4_600)
      const state = useRunStore.getState()
      expect(state.walkers).toHaveLength(1)
      expect(state.walkers[0].origin).toBe('start')
      expect(state.redirectPath).not.toBeNull()
      expect(state.status).toBe('exploring') // only the Spaceship's own landing wins

      // ...and the redirect carries the Spaceship to the actual goal.
      vi.advanceTimersByTime(60_000)
      expect(useProgressionStore.getState().graphNodeCount).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT)
    })

    it('a reverse walker standing on the exit it launched from never counts as a win', () => {
      useProgressionStore.setState({ searcherLevel: 1 })
      useRunStore.getState().resetWithNewGraph()

      expect(useRunStore.getState().walkers[1].origin).toBe('goal')
      expect(useRunStore.getState().walkers[1].hasReachedGoal).toBe(false)
      expect(useRunStore.getState().status).toBe('exploring')
    })

    it('preserves each walker origin across a strategy switch', () => {
      useProgressionStore.setState({ searcherLevel: 1, purchasedUpgradeIds: ['bfs'] })
      useRunStore.getState().resetWithNewGraph()
      handle = startWalkerScheduler()
      vi.advanceTimersByTime(500)

      useProgressionStore.setState({ activeStrategyId: 'bfs' })
      vi.advanceTimersByTime(500)

      const { walkers } = useRunStore.getState()
      expect(walkers).toHaveLength(2)
      expect(walkers[0].origin).toBe('start')
      expect(walkers[1].origin).toBe('goal')
    })
  })

  describe('discover rest records', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // randomWalk always takes each node's first adjacency entry
    })

    /** Puts the single main walker on the line graph at `at`, with the given nodes already visited. */
    function setupLineRun(at: string, visited: string[]): void {
      const graph = buildLineGraph()
      useRunStore.setState({
        graph,
        walkers: [createWalker(at)],
        walkerTransits: [null],
        walkerSpeeds: [0],
        walkerRests: [null],
        discovery: {
          discoveredNodeIds: new Set(['start', 'A', 'goal']),
          discoveredEdgeIds: new Set(['A--start', 'A--goal']),
          visitedNodeIds: new Set(visited),
        },
        strategyMemories: [undefined],
        sharedRecentPath: [],
        loadedStrategyId: DEFAULT_STRATEGY_ID,
        status: 'exploring',
        redirectPath: null,
      })
    }

    it('records the pause on arriving at an unvisited node, and clears it at the next departure', () => {
      setupLineRun('start', ['start'])
      handle = startWalkerScheduler()

      vi.advanceTimersByTime(7_800) // start -> A takes ~7746ms (rest-to-rest over 60 units at accel 4)
      const resting = useRunStore.getState()
      expect(resting.walkerTransits[0]).toBeNull()
      expect(resting.walkerRests[0]?.waitMs).toBe(computeDiscoverWaitMs(0))

      vi.advanceTimersByTime(computeDiscoverWaitMs(0)) // the full discover wait — departure fires
      const departed = useRunStore.getState()
      expect(departed.walkerTransits[0]).not.toBeNull()
      expect(departed.walkerRests[0]).toBeNull()
    })

    it('drops to zero speed while discovering, even after arriving too fast to fully brake', () => {
      // start --(200)-- A (visited) --(1)-- B (unvisited): the ship passes A at ~40 distance/sec and
      // can't brake to a stop over B's 1-unit edge, so it lands with leftover speed.
      const graph: Graph = {
        nodes: [
          { id: 'start', isStart: true, isGoal: false, x: 0, y: 0 },
          { id: 'A', isStart: false, isGoal: false, x: 200, y: 0 },
          { id: 'B', isStart: false, isGoal: false, x: 201, y: 0 },
          { id: 'goal', isStart: false, isGoal: true, x: 400, y: 0 },
        ],
        edges: [
          { id: 'A--start', source: 'start', target: 'A' },
          { id: 'A--B', source: 'A', target: 'B' },
          { id: 'B--goal', source: 'B', target: 'goal' },
        ],
        startNodeId: 'start',
        goalNodeId: 'goal',
        adjacency: { start: ['A'], A: ['B', 'start'], B: ['goal', 'A'], goal: ['B'] },
      }
      useProgressionStore.setState({ purchasedUpgradeIds: ['bfs'] })
      useRunStore.setState({
        graph,
        walkers: [createWalker('start')],
        walkerTransits: [null],
        walkerSpeeds: [0],
        walkerRests: [null],
        discovery: {
          discoveredNodeIds: new Set(['start', 'A', 'B']),
          discoveredEdgeIds: new Set(['A--start', 'A--B']),
          visitedNodeIds: new Set(['start', 'A']),
        },
        strategyMemories: [undefined],
        sharedRecentPath: [],
        loadedStrategyId: DEFAULT_STRATEGY_ID,
        status: 'exploring',
        redirectPath: null,
      })
      handle = startWalkerScheduler()

      for (let t = 0; t < 200 && useRunStore.getState().walkers[0].currentNodeId !== 'B'; t++) vi.advanceTimersByTime(100)
      const resting = useRunStore.getState()
      expect(resting.walkers[0].currentNodeId).toBe('B')
      expect(resting.walkerRests[0]).not.toBeNull()
      expect(resting.walkerSpeeds[0]).toBe(0)

      // A strategy swap mid-discovery keeps it at rest too.
      useProgressionStore.setState({ activeStrategyId: 'bfs' })
      expect(useRunStore.getState().walkerSpeeds[0]).toBe(0)

      vi.advanceTimersByTime(computeDiscoverWaitMs(0))
      expect(useRunStore.getState().walkerTransits[0]?.entryVelocity).toBe(0)
    })

    it('records no pause on a revisit — the walker carries straight through', () => {
      setupLineRun('start', ['start', 'A'])
      handle = startWalkerScheduler()

      vi.advanceTimersByTime(5_600) // start -> A without stopping takes ~5477ms
      const state = useRunStore.getState()
      expect(state.walkerRests[0]).toBeNull()
      expect(state.walkerTransits[0]).not.toBeNull() // already departed again, no wait
    })

    it('records no pause on the winning hop — celebration is not a discovery', () => {
      setupLineRun('A', ['start', 'A'])
      handle = startWalkerScheduler()

      vi.advanceTimersByTime(4_600) // A -> goal takes ~4472ms (rest-to-rest over 20 units)
      const state = useRunStore.getState()
      expect(state.status).toBe('celebrating')
      expect(state.walkerRests[0]).toBeNull()
    })

    it('records and clears the rest for a Reverse Beacon walker like any other searcher', () => {
      usePrestigeStore.setState({ unlockUfoOwned: true, bidirectionalOwned: true, bidirectionalEnabled: true })
      useProgressionStore.setState({ searcherLevel: 1 })
      // A longer line (start - A - B - C - goal) so the two halves don't meet during the test.
      const graph: Graph = {
        nodes: [
          { id: 'start', isStart: true, isGoal: false, x: 0, y: 0 },
          { id: 'A', isStart: false, isGoal: false, x: 60, y: 0 },
          { id: 'B', isStart: false, isGoal: false, x: 120, y: 0 },
          { id: 'C', isStart: false, isGoal: false, x: 180, y: 0 },
          { id: 'goal', isStart: false, isGoal: true, x: 200, y: 0 },
        ],
        edges: [
          { id: 'A--start', source: 'start', target: 'A' },
          { id: 'A--B', source: 'A', target: 'B' },
          { id: 'B--C', source: 'B', target: 'C' },
          { id: 'C--goal', source: 'C', target: 'goal' },
        ],
        startNodeId: 'start',
        goalNodeId: 'goal',
        adjacency: { start: ['A'], A: ['B', 'start'], B: ['C', 'A'], C: ['goal', 'B'], goal: ['C'] },
      }
      useRunStore.setState({
        graph,
        walkers: [createWalker('start'), createWalker('goal', 'goal')],
        walkerTransits: [null, null],
        walkerSpeeds: [0, 0],
        walkerRests: [null, null],
        discovery: {
          discoveredNodeIds: new Set(['start', 'A', 'C', 'goal']),
          discoveredEdgeIds: new Set(['A--start', 'C--goal']),
          visitedNodeIds: new Set(['start', 'goal']),
        },
        strategyMemories: [undefined, undefined],
        sharedRecentPath: [],
        loadedStrategyId: DEFAULT_STRATEGY_ID,
        status: 'exploring',
        redirectPath: null,
      })
      handle = startWalkerScheduler()

      vi.advanceTimersByTime(4_600) // goal -> C takes ~4472ms; the Spaceship's start -> A (~7746ms) is still in flight
      const resting = useRunStore.getState()
      expect(resting.walkerTransits[1]).toBeNull()
      expect(resting.walkerRests[1]?.waitMs).toBe(computeDiscoverWaitMs(0))
      expect(resting.walkerRests[0]).toBeNull() // the Spaceship is mid-transit, no rest

      vi.advanceTimersByTime(computeDiscoverWaitMs(0))
      const departed = useRunStore.getState()
      expect(departed.walkerTransits[1]).not.toBeNull()
      expect(departed.walkerRests[1]).toBeNull()
    })
  })
})
