import { describe, expect, it } from 'vitest'
import { capMemoryStack, filterByMemory, rememberedNodes } from './memory'
import type { StrategyContext } from './types'

function ctxWithPath(path: string[], memoryLevel: number): StrategyContext {
  return {
    graph: { nodes: [], edges: [], startNodeId: path[0], goalNodeId: 'none', adjacency: {} },
    discovery: { discoveredNodeIds: new Set(), discoveredEdgeIds: new Set(), visitedNodeIds: new Set() },
    walker: {
      currentNodeId: path[path.length - 1],
      previousNodeId: path.length > 1 ? path[path.length - 2] : null,
      path,
      stepsTaken: path.length - 1,
      hasReachedGoal: false,
    },
    memory: undefined,
    memoryLevel,
  }
}

describe('rememberedNodes', () => {
  it('returns an empty set at level 0 or below', () => {
    expect(rememberedNodes(['a', 'b', 'c'], 0)).toEqual(new Set())
  })

  it('excludes the current node (last path entry) from the window', () => {
    expect(rememberedNodes(['a', 'b', 'c'], 1)).toEqual(new Set(['b']))
  })

  it('returns the last N nodes visited before the current one', () => {
    expect(rememberedNodes(['a', 'b', 'c', 'd'], 2)).toEqual(new Set(['b', 'c']))
  })

  it('caps at however much history actually exists', () => {
    expect(rememberedNodes(['a', 'b'], 10)).toEqual(new Set(['a']))
  })
})

describe('filterByMemory', () => {
  it('passes through candidates untouched when none are remembered', () => {
    const ctx = ctxWithPath(['a'], 2)
    expect(filterByMemory(['b', 'c'], ctx)).toEqual(['b', 'c'])
  })

  it('excludes just the remembered candidates when some are novel', () => {
    const ctx = ctxWithPath(['x', 'a', 'b'], 2) // remembers x, a
    expect(filterByMemory(['a', 'c'], ctx)).toEqual(['c'])
  })

  it('when every candidate is remembered, narrows to the single oldest (least recently visited) one', () => {
    const ctx = ctxWithPath(['start', 'x', 'y', 'start'], 3) // remembers start, x, y
    // 'x' was last visited at index 1, 'y' at index 2 — 'x' is older.
    expect(filterByMemory(['x', 'y'], ctx)).toEqual(['x'])
  })
})

describe('capMemoryStack', () => {
  it('leaves a stack within the cap untouched', () => {
    const stack = ['a', 'b', 'c']
    capMemoryStack(stack, 5)
    expect(stack).toEqual(['a', 'b', 'c'])
  })

  it('truncates from the front, keeping the most recent entries', () => {
    const stack = ['a', 'b', 'c', 'd', 'e']
    capMemoryStack(stack, 2)
    expect(stack).toEqual(['d', 'e'])
  })

  it('empties the stack entirely at memoryLevel 0', () => {
    const stack = ['a', 'b']
    capMemoryStack(stack, 0)
    expect(stack).toEqual([])
  })
})
