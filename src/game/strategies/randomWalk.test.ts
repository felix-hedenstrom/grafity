import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { randomWalk } from './randomWalk'
import type { StrategyContext } from './types'

function fixedGraph(): Graph {
  const adjacency = {
    a: ['b', 'c', 'd'],
    b: ['a'],
    c: ['a'],
    d: ['a'],
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'a', isGoal: id === 'd' })),
    edges: [],
    startNodeId: 'a',
    goalNodeId: 'd',
    adjacency,
  }
}

function deadEndGraph(): Graph {
  const adjacency = { a: ['b'], b: ['a'] }
  return {
    nodes: [
      { id: 'a', isStart: true, isGoal: false },
      { id: 'b', isStart: false, isGoal: true },
    ],
    edges: [],
    startNodeId: 'a',
    goalNodeId: 'b',
    adjacency,
  }
}

describe('randomWalk', () => {
  it('always returns a neighbor of the current node', () => {
    const graph = fixedGraph()
    const walker = createWalker('a')
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'a'), walker, memory: undefined, memoryLevel: 0 }

    for (let i = 0; i < 200; i++) {
      const next = randomWalk.chooseNextNode(ctx)
      expect(graph.adjacency['a']).toContain(next)
    }
  })

  it('ignores memory entirely at level 0 — any neighbor is possible', () => {
    const graph = fixedGraph()
    const walker = { ...createWalker('a'), path: ['b', 'a', 'b', 'a'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'a'), walker, memory: undefined, memoryLevel: 0 }

    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(randomWalk.chooseNextNode(ctx))
    expect(seen).toEqual(new Set(['b', 'c', 'd']))
  })

  it('avoids a remembered node once memoryLevel > 0', () => {
    const graph = fixedGraph()
    let walker = createWalker('b')
    walker = { ...walker, currentNodeId: 'a', previousNodeId: 'b', path: ['b', 'a'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'a'), walker, memory: undefined, memoryLevel: 1 }

    for (let i = 0; i < 200; i++) {
      const next = randomWalk.chooseNextNode(ctx)
      expect(next).not.toBe('b')
    }
  })

  it('never returns a node excluded by Traffic Control', () => {
    const graph = fixedGraph()
    const walker = createWalker('a')
    const ctx: StrategyContext = {
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker,
      memory: undefined,
      memoryLevel: 0,
      excludedNodeIds: new Set(['b', 'c']),
    }

    for (let i = 0; i < 200; i++) {
      expect(randomWalk.chooseNextNode(ctx)).toBe('d')
    }
  })

  it('falls back to any neighbor when every neighbor is excluded', () => {
    const graph = fixedGraph()
    const walker = createWalker('a')
    const ctx: StrategyContext = {
      graph,
      discovery: createDiscovery(graph, 'a'),
      walker,
      memory: undefined,
      memoryLevel: 0,
      excludedNodeIds: new Set(['b', 'c', 'd']),
    }

    expect(graph.adjacency['a']).toContain(randomWalk.chooseNextNode(ctx))
  })

  it('at a dead end with everything remembered, prefers the oldest node over a random one', () => {
    const graph = deadEndGraph()
    const walker = { ...createWalker('a'), currentNodeId: 'b', previousNodeId: 'a', path: ['a', 'b'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'b'), walker, memory: undefined, memoryLevel: 5 }

    // 'b' only neighbor is 'a', which is remembered — forced to revisit it, deterministically.
    expect(randomWalk.chooseNextNode(ctx)).toBe('a')
  })

  it('getHighlightedNodes returns the remembered window as a "remembered" group', () => {
    const graph = fixedGraph()
    const walker = { ...createWalker('a'), path: ['b', 'a'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'a'), walker, memory: undefined, memoryLevel: 1 }

    expect(randomWalk.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'remembered', nodeIds: new Set(['b']) }])
  })
})
