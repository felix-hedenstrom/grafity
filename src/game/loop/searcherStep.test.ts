import { describe, expect, it } from 'vitest'
import { PRODUCTION_CONFIG } from '../config/production'
import { createDiscovery } from '../discovery/reveal'
import type { Graph, NodeId } from '../graph/types'
import type { StrategyContext, TraversalStrategy } from '../strategies/types'
import { createWalker } from '../walker/walkerLogic'
import { commitHop, decideNextHop } from './searcherStep'

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

describe('decideNextHop', () => {
  it('asks the strategy for the next node, given the shared recent path', () => {
    const graph = fixedGraph()
    const result = decideNextHop({
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker: createWalker('a'),
      strategy: scriptedStrategy(['b']),
      memory: undefined,
      memoryLevel: 0,
      sharedRecentPath: [],
    })

    expect(result.nextNodeId).toBe('b')
  })

  it('appends sharedRecentPath + the walker\'s own position before asking the strategy', () => {
    const graph = fixedGraph()
    const seenPaths: NodeId[][] = []
    const strategy = recordingStrategy(['b'], seenPaths)

    decideNextHop({
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker: createWalker('a'),
      strategy,
      memory: undefined,
      memoryLevel: 0,
      sharedRecentPath: ['x', 'y'],
    })

    expect(seenPaths).toEqual([['x', 'y', 'a']])
  })

  it('mutates and returns the strategy\'s own memory object, independent of any other searcher\'s', () => {
    const graph = fixedGraph()
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

    const result = decideNextHop({
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker: createWalker('a'),
      strategy,
      memory: { calls: 5 },
      memoryLevel: 0,
      sharedRecentPath: [],
    })

    expect(result.memory).toEqual({ calls: 6 })
  })
})

describe('commitHop', () => {
  it('moves the walker and reveals around the new node', () => {
    const graph = fixedGraph()
    const result = commitHop({
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker: createWalker('a'),
      nextNodeId: 'b',
    })

    expect(result.walker.currentNodeId).toBe('b')
    expect(result.goalReached).toBe(false)
    expect(result.discovery.discoveredNodeIds.has('c')).toBe(true)
    expect(result.currencyEarned).toBeGreaterThan(0)
  })

  it('awards the goal bonus once the walker reaches the goal', () => {
    const graph = fixedGraph()
    const afterFirst = commitHop({ graph, discovery: createDiscovery(graph, 'a'), walker: createWalker('a'), nextNodeId: 'b' })
    const afterSecond = commitHop({ graph, discovery: afterFirst.discovery, walker: afterFirst.walker, nextNodeId: 'c' })

    expect(afterSecond.walker.currentNodeId).toBe('c')
    expect(afterSecond.goalReached).toBe(true)
    expect(afterSecond.currencyEarned).toBeGreaterThanOrEqual(graph.nodes.length * PRODUCTION_CONFIG.currency.goalRewardPerNode)
  })

  it('awards only the tiny revisit reward when stepping onto an already-visited node', () => {
    const graph = fixedGraph()
    const afterFirst = commitHop({ graph, discovery: createDiscovery(graph, 'a'), walker: createWalker('a'), nextNodeId: 'b' })
    const afterSecond = commitHop({ graph, discovery: afterFirst.discovery, walker: afterFirst.walker, nextNodeId: 'a' })

    expect(afterSecond.walker.currentNodeId).toBe('a')
    expect(afterSecond.wasAlreadyVisited).toBe(true)
    expect(afterSecond.currencyEarned).toBe(PRODUCTION_CONFIG.currency.revisitReward)
  })

  it('uses the base reward rates by default, but custom rewardRates when supplied (Discovery/Revisit/Exit Bonus)', () => {
    const graph = fixedGraph()
    const customRates = { discoveryPerNode: 100, revisit: 50, goalPerNode: 1000 }

    const result = commitHop({
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker: createWalker('a'),
      nextNodeId: 'b',
      rewardRates: customRates,
    })

    // 'b' newly reveals 'c' (1 newly discovered node) at the custom discovery rate.
    expect(result.currencyEarned).toBe(customRates.discoveryPerNode)
  })

  it("goalNodeId: '' keeps a Reverse Beacon walker's landing on the real goal from counting as a win or paying the goal bonus", () => {
    const graph = fixedGraph()
    const afterFirst = commitHop({ graph, discovery: createDiscovery(graph, 'a'), walker: createWalker('a', 'goal'), nextNodeId: 'b', goalNodeId: '' })
    const afterSecond = commitHop({ graph, discovery: afterFirst.discovery, walker: afterFirst.walker, nextNodeId: 'c', goalNodeId: '' })

    expect(afterSecond.walker.currentNodeId).toBe('c') // c IS the graph's goal node
    expect(afterSecond.goalReached).toBe(false)
    expect(afterSecond.walker.origin).toBe('goal')
    expect(afterSecond.currencyEarned).toBeLessThan(graph.nodes.length * PRODUCTION_CONFIG.currency.goalRewardPerNode)
  })
})
