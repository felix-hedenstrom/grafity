import { describe, expect, it } from 'vitest'
import { capMemoryStack, filterByMemory, PLANNING_HORIZON_FLOOR, plannableFn, rememberedNodes } from './memory'
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
      origin: 'start',
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

  it('excludes the immediate previous node even at memoryLevel 0, so a walker never involuntarily reverses', () => {
    const ctx = ctxWithPath(['a', 'b'], 0) // just came from 'a', owns no Node Memory
    expect(filterByMemory(['a', 'c'], ctx)).toEqual(['c'])
  })

  it('still lets a true dead end (previous node is the only candidate) retreat, even at memoryLevel 0', () => {
    const ctx = ctxWithPath(['a', 'b'], 0)
    expect(filterByMemory(['a'], ctx)).toEqual(['a'])
  })

  it('excludes just the remembered candidates when some are novel', () => {
    const ctx = ctxWithPath(['x', 'a', 'b'], 2) // remembers x, a
    expect(filterByMemory(['a', 'c'], ctx)).toEqual(['c'])
  })

  it('when every candidate is remembered and there is no discovered frontier anywhere, falls back to the oldest (least recently visited) one', () => {
    const ctx = ctxWithPath(['start', 'x', 'y', 'start'], 3) // remembers start, x, y; empty graph/discovery — no frontier exists
    // 'x' was last visited at index 1, 'y' at index 2 — 'x' is older.
    expect(filterByMemory(['x', 'y'], ctx)).toEqual(['x'])
  })

  it('when every candidate is remembered but a frontier exists, prefers whichever is closer to it over whichever was visited longer ago', () => {
    // hub -- near -- bridge -- frontier (discovered, unvisited)
    // hub -- far -- deadend
    const adjacency = {
      hub: ['near', 'far'],
      near: ['hub', 'bridge'],
      bridge: ['near', 'frontier'],
      frontier: ['bridge'],
      far: ['hub', 'deadend'],
      deadend: ['far'],
    }
    const graph = {
      nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: false })),
      edges: [],
      startNodeId: 'hub',
      goalNodeId: 'none',
      adjacency,
    }
    const discovery = {
      discoveredNodeIds: new Set(['hub', 'near', 'bridge', 'frontier', 'far', 'deadend']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['hub', 'near', 'bridge', 'far', 'deadend']), // everything but frontier
    }
    const ctx: StrategyContext = {
      graph,
      discovery,
      // path's last 2 entries before 'hub' are 'far' then 'near', so memoryLevel 2 remembers both.
      // 'far' was visited longer ago (index 0 vs near's index 1) — the old recency-only rule would
      // pick it — but 'near' (2 hops from frontier, vs far's 4) is the one that leads back out.
      walker: { currentNodeId: 'hub', previousNodeId: 'near', path: ['far', 'near', 'hub'], stepsTaken: 2, hasReachedGoal: false, origin: 'start' },
      memory: undefined,
      memoryLevel: 2,
    }

    expect(filterByMemory(['near', 'far'], ctx)).toEqual(['near'])
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

  it('floors the cap at 1 even at memoryLevel 0, so DFS can still backtrack to its immediate parent', () => {
    const stack = ['a', 'b']
    capMemoryStack(stack, 0)
    expect(stack).toEqual(['b'])
  })
})

describe('plannableFn', () => {
  /** A ctx whose walker has walked `path`, with full control over what's discovered/visited. */
  function planCtx(path: string[], memoryLevel: number, discovered: string[], visited: string[], excluded?: string[]): StrategyContext {
    const ctx = ctxWithPath(path, memoryLevel)
    return {
      ...ctx,
      discovery: { discoveredNodeIds: new Set(discovered), discoveredEdgeIds: new Set(), visitedNodeIds: new Set(visited) },
      excludedNodeIds: excluded ? new Set(excluded) : undefined,
    }
  }

  it('never allows undiscovered nodes', () => {
    const plannable = plannableFn(planCtx(['a'], 50, ['a'], ['a']))
    expect(plannable('fog')).toBe(false)
  })

  it('always allows discovered-but-unvisited frontier nodes, regardless of memory', () => {
    const plannable = plannableFn(planCtx(['a'], 0, ['a', 'edge'], ['a']))
    expect(plannable('edge')).toBe(true)
  })

  it('blocks visited nodes that have fallen out of the remembered window', () => {
    // Path longer than the floor with memoryLevel 0: the earliest steps are forgotten.
    const path = ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10']
    const plannable = plannableFn(planCtx(path, 0, path, path))
    expect(plannable('v0')).toBe(false) // forgotten corridor
    expect(plannable('v10')).toBe(true) // current node, always in the window
    expect(plannable('v3')).toBe(true) // within the floor-of-8 window
  })

  it('applies the planning-horizon floor even at memoryLevel 0', () => {
    const path = ['a', 'b', 'c']
    const plannable = plannableFn(planCtx(path, 0, path, path))
    // Everything fits inside the floor window — nothing is forgotten yet.
    expect(PLANNING_HORIZON_FLOOR).toBeGreaterThanOrEqual(path.length)
    expect(plannable('a')).toBe(true)
  })

  it('a high memory level extends the window past the floor', () => {
    const path = Array.from({ length: 30 }, (_, i) => `v${i}`)
    const plannable = plannableFn(planCtx(path, 25, path, path))
    expect(plannable('v4')).toBe(true) // within the last 25
    expect(plannable('v0')).toBe(false) // beyond even the raised window
  })

  it('still excludes Traffic Control claims unconditionally', () => {
    const plannable = plannableFn(planCtx(['a'], 50, ['a', 'edge'], ['a'], ['edge']))
    expect(plannable('edge')).toBe(false)
  })
})
