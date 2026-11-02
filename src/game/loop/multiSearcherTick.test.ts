import { describe, expect, it } from 'vitest'
import { GOAL_REWARD_PER_NODE, REVISIT_REWARD } from '../currency/rules'
import { createDiscovery } from '../discovery/reveal'
import type { Graph, NodeId } from '../graph/types'
import type { StrategyContext, TraversalStrategy } from '../strategies/types'
import { createWalker } from '../walker/walkerLogic'
import { runMultiSearcherTick } from './multiSearcherTick'

function fixedGraph(): Graph {
  const adjacency = { a: ['b'], b: ['a', 'c'], c: ['b'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'a', isGoal: id === 'c' })),
    edges: [],
    startNodeId: 'a',
    goalNodeId: 'c',
    adjacency,
  }
}

function scriptedStrategy(moves: string[]): TraversalStrategy {
  let i = 0
  return {
    id: 'scripted',
    name: 'Scripted',
    memoryMultiplier: 1,
    chooseNextNode: () => moves[i++],
  }
}

/** Records the walker.path it was handed at decision time, per call — lets tests assert exactly what each searcher saw. */
function recordingStrategy(moves: string[], seenPaths: NodeId[][]): TraversalStrategy {
  let i = 0
  return {
    id: 'recording',
    name: 'Recording',
    memoryMultiplier: 1,
    chooseNextNode: (ctx: StrategyContext) => {
      seenPaths.push([...ctx.walker.path])
      return moves[i++]
    },
  }
}

describe('runMultiSearcherTick', () => {
  it('with a single walker, behaves exactly like the old single-searcher tick', () => {
    const graph = fixedGraph()
    const result = runMultiSearcherTick({
      graph,
      walkers: [createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b']),
      strategyMemories: [undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    expect(result.walkers[0].currentNodeId).toBe('b')
    expect(result.goalReached).toBe(false)
    expect(result.discovery.discoveredNodeIds.has('c')).toBe(true)
    expect(result.currencyEarned).toBeGreaterThan(0)
  })

  it('a single walker sees its own accumulated path via sharedRecentPath, step by step', () => {
    const graph = fixedGraph()
    const seenPaths: NodeId[][] = []
    const strategy = recordingStrategy(['b', 'c'], seenPaths)

    const afterFirst = runMultiSearcherTick({
      graph,
      walkers: [createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy,
      strategyMemories: [undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    runMultiSearcherTick({
      graph,
      walkers: afterFirst.walkers,
      discovery: afterFirst.discovery,
      strategy,
      strategyMemories: afterFirst.strategyMemories,
      sharedRecentPath: afterFirst.sharedRecentPath,
      memoryLevel: 0,
    })

    // Exactly matches what a single WalkerState.path would have looked like at each decision point.
    expect(seenPaths).toEqual([['a'], ['a', 'b']])
  })

  it('awards the goal bonus once a searcher reaches the goal', () => {
    const graph = fixedGraph()
    const afterFirst = runMultiSearcherTick({
      graph,
      walkers: [createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b', 'c']),
      strategyMemories: [undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    const afterSecond = runMultiSearcherTick({
      graph,
      walkers: afterFirst.walkers,
      discovery: afterFirst.discovery,
      strategy: scriptedStrategy(['c']),
      strategyMemories: afterFirst.strategyMemories,
      sharedRecentPath: afterFirst.sharedRecentPath,
      memoryLevel: 0,
    })

    expect(afterSecond.walkers[0].currentNodeId).toBe('c')
    expect(afterSecond.goalReached).toBe(true)
    expect(afterSecond.currencyEarned).toBeGreaterThanOrEqual(graph.nodes.length * GOAL_REWARD_PER_NODE)
  })

  it('awards only the tiny revisit reward when stepping onto an already-visited node', () => {
    const graph = fixedGraph()
    const afterFirst = runMultiSearcherTick({
      graph,
      walkers: [createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b']),
      strategyMemories: [undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    const afterSecond = runMultiSearcherTick({
      graph,
      walkers: afterFirst.walkers,
      discovery: afterFirst.discovery,
      strategy: scriptedStrategy(['a']),
      strategyMemories: afterFirst.strategyMemories,
      sharedRecentPath: afterFirst.sharedRecentPath,
      memoryLevel: 0,
    })

    expect(afterSecond.walkers[0].currentNodeId).toBe('a')
    expect(afterSecond.currencyEarned).toBe(REVISIT_REWARD)
  })

  it('uses the base reward rates by default, but custom rewardRates when supplied (Discovery/Revisit/Exit Bonus)', () => {
    const graph = fixedGraph()
    const customRates = { discoveryPerNode: 100, revisit: 50, goalPerNode: 1000 }

    const result = runMultiSearcherTick({
      graph,
      walkers: [createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b']),
      strategyMemories: [undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
      rewardRates: customRates,
    })

    // 'b' newly reveals 'c' (1 newly discovered node) at the custom discovery rate.
    expect(result.currencyEarned).toBe(customRates.discoveryPerNode)
  })

  it('leaves a walker that has already reached the goal untouched', () => {
    const graph = fixedGraph()
    const finishedWalker = { ...createWalker('a'), currentNodeId: 'c', hasReachedGoal: true }
    const stillGoingWalker = createWalker('a')

    const result = runMultiSearcherTick({
      graph,
      walkers: [finishedWalker, stillGoingWalker],
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b']),
      strategyMemories: [undefined, undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    expect(result.walkers[0]).toBe(finishedWalker)
    expect(result.walkers[1].currentNodeId).toBe('b')
    expect(result.goalReached).toBe(true)
  })

  it('later searchers in the same tick see earlier ones\' moves via the shared pool', () => {
    const graph = fixedGraph()
    const seenPaths: NodeId[][] = []
    // Both walkers start at 'a'; the recording strategy is shared, called once per walker per tick.
    const strategy = recordingStrategy(['b', 'b'], seenPaths)

    runMultiSearcherTick({
      graph,
      walkers: [createWalker('a'), createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy,
      strategyMemories: [undefined, undefined],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    // First searcher sees just its own start; the second sees the first's pre-move position too.
    expect(seenPaths).toEqual([['a'], ['a', 'a']])
  })

  it('keeps per-walker strategy memory independent, never pooled', () => {
    const graph = fixedGraph()
    // Mutates ctx.memory in place, same pattern DFS uses for its stack — relies on the caller
    // always handing it an already-seeded object (what strategy.createMemory() is for), never undefined.
    const strategy: TraversalStrategy = {
      id: 'memo',
      name: 'Memo',
      memoryMultiplier: 1,
      createMemory: () => ({ calls: 0 }),
      chooseNextNode: (ctx) => {
        ;(ctx.memory as { calls: number }).calls += 1
        return 'b'
      },
    }

    const result = runMultiSearcherTick({
      graph,
      walkers: [createWalker('a'), createWalker('a')],
      discovery: createDiscovery(graph, 'a'),
      strategy,
      strategyMemories: [{ calls: 5 }, strategy.createMemory?.()],
      sharedRecentPath: [],
      memoryLevel: 0,
    })

    expect(result.strategyMemories[0]).toEqual({ calls: 6 }) // started at 5, independent of walker 2
    expect(result.strategyMemories[1]).toEqual({ calls: 1 }) // started fresh
  })
})
