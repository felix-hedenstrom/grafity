import { describe, expect, it } from 'vitest'
import type { Graph } from '../graph/types'
import { actualWeight, nextHopToward, straightLineDistance, uniformWeight } from './pathfinding'

function lineGraph(): Graph {
  // Chain a -1- b -5- c -1- d (3 hops, total distance 7), plus a decoy 2-hop detour a -- x -- d that's
  // fewer hops but, since x sits well off to the side, far more costly in real distance (~19.9) —
  // this is the only way to make a shorter-hop route pricier than a longer one without violating the
  // triangle inequality: a literal direct a--d edge could never cost more than the chain, since any
  // path's cost is lower-bounded by the straight-line distance between its endpoints.
  const adjacency = { a: ['b', 'x'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'x'], x: ['a', 'd'] }
  const positions: Record<string, { x: number; y: number }> = {
    a: { x: 0, y: 0 },
    b: { x: 1, y: 0 },
    c: { x: 1, y: 5 },
    d: { x: 1, y: 6 },
    x: { x: 10, y: 3 },
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'a', isGoal: id === 'd', ...positions[id] })),
    edges: [
      { id: 'a--b', source: 'a', target: 'b' },
      { id: 'b--c', source: 'b', target: 'c' },
      { id: 'c--d', source: 'c', target: 'd' },
      { id: 'a--x', source: 'a', target: 'x' },
      { id: 'd--x', source: 'd', target: 'x' },
    ],
    startNodeId: 'a',
    goalNodeId: 'd',
    adjacency,
  }
}

describe('nextHopToward', () => {
  it('returns null when already at a target', () => {
    expect(nextHopToward(lineGraph(), 'a', (id) => id === 'a', uniformWeight)).toBeNull()
  })

  it('BFS (uniform weight) takes the fewest-hops route, ignoring edge weight', () => {
    // a->x->d is 2 hops (distance ~19.9) vs a->b->c->d is 3 hops (distance 7) — BFS should prefer the 2-hop route.
    const next = nextHopToward(lineGraph(), 'a', (id) => id === 'd', uniformWeight)
    expect(next).toBe('x')
  })

  it('Dijkstra (actual weight) takes the cheapest route even if it has more hops', () => {
    // a->x->d costs ~19.9; a->b->c->d costs 1+5+1=7 — Dijkstra should prefer the cheaper multi-hop route.
    const next = nextHopToward(lineGraph(), 'a', (id) => id === 'd', actualWeight)
    expect(next).toBe('b')
  })

  it('returns the correct single-step hop toward a multi-step target', () => {
    const next = nextHopToward(lineGraph(), 'a', (id) => id === 'c', actualWeight)
    expect(next).toBe('b') // a->b->c is cheaper (1+5=6) than a->x->d->c (~19.9+9.5+1)
  })

  it('is biased toward lower heuristic nodes when one is supplied', () => {
    const graph = lineGraph()
    // A heuristic that makes 'x' and 'd' both look very close from 'a' should push the search down
    // the decoy route and let it commit to 'd' as soon as it's reached, before the cheaper chain
    // route via 'b'/'c' ever gets the chance to relax a better path to 'd'.
    const next = nextHopToward(graph, 'a', (id) => id === 'd', actualWeight, (id) => (id === 'x' || id === 'd' ? -1000 : 100))
    expect(next).toBe('x')
  })

  it('returns null when no reachable node satisfies the target', () => {
    const graph = lineGraph()
    const next = nextHopToward(graph, 'a', () => false, uniformWeight)
    expect(next).toBeNull()
  })

  it('never expands through a node isReachable rejects, even if it would otherwise be the shortest route', () => {
    const graph = lineGraph()
    // 'c' is undiscovered — the cheap a->b->c->d route is off-limits, so it must take the pricier decoy route.
    const next = nextHopToward(graph, 'a', (id) => id === 'd', actualWeight, undefined, (id) => id !== 'c')
    expect(next).toBe('x')
  })

  it('cannot target a node isReachable rejects, even as a direct neighbor', () => {
    const graph = lineGraph()
    // 'd' itself is marked unreachable — no route can ever reach it, regardless of path, so nothing satisfies the target.
    const next = nextHopToward(graph, 'a', (id) => id === 'd', actualWeight, undefined, (id) => id !== 'd')
    expect(next).toBeNull()
  })
})

describe('straightLineDistance', () => {
  it('computes Euclidean distance between two nodes\' positions', () => {
    const nodesById = new Map([
      ['a', { x: 0, y: 0 }],
      ['d', { x: 3, y: 4 }],
    ])
    expect(straightLineDistance('a', 'd', nodesById)).toBe(5)
  })

  it('treats missing positions as the origin', () => {
    const nodesById = new Map<string, { x?: number; y?: number }>()
    expect(straightLineDistance('a', 'd', nodesById)).toBe(0)
  })
})
