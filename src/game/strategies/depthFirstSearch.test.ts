import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiscovery, revealAroundNode } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker, moveWalker } from '../walker/walkerLogic'
import { depthFirstSearch } from './depthFirstSearch'
import type { StrategyContext } from './types'

function treeGraph(): Graph {
  const adjacency = { root: ['a', 'b'], a: ['root', 'c'], b: ['root'], c: ['a'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'root', isGoal: false })),
    edges: [],
    startNodeId: 'root',
    goalNodeId: 'none',
    adjacency,
  }
}

/** 'c' has two visited neighbors — 'a' is its true DFS parent, 'extra' is a dangling dead end reached some other way. */
function dangleGraph(): Graph {
  const adjacency = { root: ['a'], a: ['root', 'c'], c: ['a', 'extra'], extra: ['c'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'root', isGoal: false })),
    edges: [],
    startNodeId: 'root',
    goalNodeId: 'none',
    adjacency,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('depthFirstSearch', () => {
  it('createMemory starts with an empty stack', () => {
    expect(depthFirstSearch.createMemory?.()).toEqual({ stack: [] })
  })

  it('backtracks to the parent when every neighbor is already visited', () => {
    const graph = treeGraph()
    const walker = { ...createWalker('c'), currentNodeId: 'c', previousNodeId: 'a', path: ['root', 'a', 'c'] }
    const discovery = {
      discoveredNodeIds: new Set(['root', 'a', 'c']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['root', 'a', 'c']),
    }
    const memory = { stack: ['root', 'a', 'c'] }

    const next = depthFirstSearch.chooseNextNode({ graph, discovery, walker, memory, memoryLevel: 0 })

    expect(next).toBe('a')
    expect(memory.stack).toEqual(['root', 'a'])
  })

  it('getHighlightedNodes returns the current stack as a "stack" group', () => {
    const graph = treeGraph()
    const walker = { ...createWalker('c'), currentNodeId: 'c', previousNodeId: 'a', path: ['root', 'a', 'c'] }
    const discovery = {
      discoveredNodeIds: new Set(['root', 'a', 'c']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['root', 'a', 'c']),
    }
    const memory = { stack: ['root', 'a', 'c'] }

    const highlighted = depthFirstSearch.getHighlightedNodes?.({ graph, discovery, walker, memory, memoryLevel: 0 })

    expect(highlighted).toEqual([{ kind: 'stack', nodeIds: new Set(['root', 'a', 'c']) }])
  })

  it('getHighlightedNodes returns an empty array for malformed memory', () => {
    const graph = treeGraph()
    const walker = createWalker('root')
    const discovery = createDiscovery(graph, 'root')

    const highlighted = depthFirstSearch.getHighlightedNodes?.({ graph, discovery, walker, memory: undefined, memoryLevel: 0 })

    expect(highlighted).toEqual([])
  })

  it('caps the stack at memoryLevel entries, with the chosen node always on top', () => {
    const graph = treeGraph()
    const walker = { ...createWalker('c'), currentNodeId: 'c', path: ['root', 'a', 'c'] }
    const discovery = createDiscovery(graph, 'root') // only 'root' is visited
    const memory = { stack: ['root', 'a'] } // about to push 'c' then its chosen next, which would exceed 2

    const next = depthFirstSearch.chooseNextNode({ graph, discovery, walker, memory, memoryLevel: 2 })

    expect(memory.stack.length).toBeLessThanOrEqual(2)
    expect(memory.stack[memory.stack.length - 1]).toBe(next)
  })

  it('with enough memory, backtracks to the correct parent every time', () => {
    const graph = dangleGraph()
    const walker = { ...createWalker('c'), currentNodeId: 'c', path: ['root', 'a', 'c'] }
    const discovery = {
      discoveredNodeIds: new Set(['root', 'a', 'c', 'extra']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['root', 'a', 'c', 'extra']),
    }

    for (let i = 0; i < 50; i++) {
      const memory = { stack: ['root', 'a', 'c'] }
      const next = depthFirstSearch.chooseNextNode({ graph, discovery, walker, memory, memoryLevel: 3 })
      expect(next).toBe('a')
    }
  })

  it('at memoryLevel 0, the stack is forgotten and backtracking can land on the wrong neighbor', () => {
    const graph = dangleGraph()
    const walker = { ...createWalker('c'), currentNodeId: 'c', path: ['root', 'a', 'c'] }
    const discovery = {
      discoveredNodeIds: new Set(['root', 'a', 'c', 'extra']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['root', 'a', 'c', 'extra']),
    }

    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const memory = { stack: [] as string[] } // nothing remembered, as memoryLevel 0 would leave it
      seen.add(depthFirstSearch.chooseNextNode({ graph, discovery, walker, memory, memoryLevel: 0 }))
    }
    // 'a' is the only correct DFS parent, but with no memory it's no better than a coin flip
    // against 'extra' — demonstrating the guarantee is lost, not just that it doesn't crash.
    expect(seen).toEqual(new Set(['a', 'extra']))
  })

  it('performs a real depth-first traversal: descends, backtracks on dead ends, visits every node', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // forces pickRandom to always take the first candidate

    const graph = treeGraph()
    let walker = createWalker('root')
    let discovery = createDiscovery(graph, 'root')
    const memory = depthFirstSearch.createMemory?.() as { stack: string[] }

    for (let i = 0; i < 6; i++) {
      const ctx: StrategyContext = { graph, discovery, walker, memory, memoryLevel: 0 }
      const next = depthFirstSearch.chooseNextNode(ctx)
      walker = moveWalker(walker, next, graph.goalNodeId)
      discovery = revealAroundNode(discovery, graph, next).discovery
    }

    for (const node of graph.nodes) {
      expect(discovery.visitedNodeIds.has(node.id)).toBe(true)
    }
  })
})
