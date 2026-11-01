import { describe, expect, it } from 'vitest'
import { GOAL_REWARD_PER_NODE, REVISIT_REWARD } from '../currency/rules'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import type { TraversalStrategy } from '../strategies/types'
import { createWalker } from '../walker/walkerLogic'
import { runTick } from './tick'

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

describe('runTick', () => {
  it('moves the walker, reveals new territory, and reports discovery currency earned', () => {
    const graph = fixedGraph()
    const result = runTick({
      graph,
      walker: createWalker('a'),
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b']),
      memory: undefined,
      memoryLevel: 0,
    })

    expect(result.walker.currentNodeId).toBe('b')
    expect(result.goalReached).toBe(false)
    expect(result.discovery.discoveredNodeIds.has('c')).toBe(true) // revealed as b's neighbor
    expect(result.currencyEarned).toBeGreaterThan(0)
  })

  it('includes the goal bonus on top of discovery reward when reaching the goal', () => {
    const graph = fixedGraph()
    const afterFirstTick = runTick({
      graph,
      walker: createWalker('a'),
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b', 'c']),
      memory: undefined,
      memoryLevel: 0,
    })

    const afterSecondTick = runTick({
      graph,
      walker: afterFirstTick.walker,
      discovery: afterFirstTick.discovery,
      strategy: scriptedStrategy(['c']),
      memory: undefined,
      memoryLevel: 0,
    })

    expect(afterSecondTick.walker.currentNodeId).toBe('c')
    expect(afterSecondTick.goalReached).toBe(true)
    expect(afterSecondTick.currencyEarned).toBeGreaterThanOrEqual(graph.nodes.length * GOAL_REWARD_PER_NODE)
  })

  it('awards only the tiny revisit reward when stepping onto an already-visited node', () => {
    const graph = fixedGraph()
    const afterFirstTick = runTick({
      graph,
      walker: createWalker('a'),
      discovery: createDiscovery(graph, 'a'),
      strategy: scriptedStrategy(['b']),
      memory: undefined,
      memoryLevel: 0,
    })

    // Step back from 'b' to 'a' — 'a' was already visited, and its neighbors were
    // already fully revealed on the very first tick, so nothing new to discover.
    const afterSecondTick = runTick({
      graph,
      walker: afterFirstTick.walker,
      discovery: afterFirstTick.discovery,
      strategy: scriptedStrategy(['a']),
      memory: undefined,
      memoryLevel: 0,
    })

    expect(afterSecondTick.walker.currentNodeId).toBe('a')
    expect(afterSecondTick.currencyEarned).toBe(REVISIT_REWARD)
  })

  it('is a no-op once the walker has already reached the goal', () => {
    const graph = fixedGraph()
    let walker = createWalker('a')
    walker = { ...walker, currentNodeId: 'c', hasReachedGoal: true }
    const discovery = createDiscovery(graph, 'c')

    const result = runTick({
      graph,
      walker,
      discovery,
      strategy: scriptedStrategy([]),
      memory: undefined,
      memoryLevel: 0,
    })

    expect(result).toEqual({ walker, discovery, memory: undefined, goalReached: true, currencyEarned: 0 })
  })
})
