import { describe, expect, it } from 'vitest'
import type { Graph } from '../graph/types'
import { actualWeight, nextHopToward, straightLineDistance, uniformWeight } from './pathfinding'

function lineGraph(): Graph {
  // a -1- b -5- c -1- d, plus a direct shortcut a--d weighing 20 (longer by weight, shorter by hops)
  const adjacency = { a: ['b', 'd'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'a'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'a', isGoal: id === 'd' })),
    edges: [
      { id: 'a--b', source: 'a', target: 'b', weight: 1 },
      { id: 'b--c', source: 'b', target: 'c', weight: 5 },
      { id: 'c--d', source: 'c', target: 'd', weight: 1 },
      { id: 'a--d', source: 'a', target: 'd', weight: 20 },
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
    // a->d direct is 1 hop (weight 20) vs a->b->c->d is 3 hops (weight 7) — BFS should prefer the 1-hop route.
    const next = nextHopToward(lineGraph(), 'a', (id) => id === 'd', uniformWeight)
    expect(next).toBe('d')
  })

  it('Dijkstra (actual weight) takes the cheapest route even if it has more hops', () => {
    // a->d direct costs 20; a->b->c->d costs 1+5+1=7 — Dijkstra should prefer the cheaper multi-hop route.
    const next = nextHopToward(lineGraph(), 'a', (id) => id === 'd', actualWeight)
    expect(next).toBe('b')
  })

  it('returns the correct single-step hop toward a multi-step target', () => {
    const next = nextHopToward(lineGraph(), 'a', (id) => id === 'c', actualWeight)
    expect(next).toBe('b') // a->b->c is cheaper (1+5=6) than a->d->c (20+1=21)
  })

  it('is biased toward lower heuristic nodes when one is supplied', () => {
    const graph = lineGraph()
    // A heuristic that makes 'd' look very close from 'a' should make the direct (expensive) edge preferred.
    const next = nextHopToward(graph, 'a', (id) => id === 'd', actualWeight, (id) => (id === 'd' ? 0 : 100))
    expect(next).toBe('d')
  })

  it('returns null when no reachable node satisfies the target', () => {
    const graph = lineGraph()
    const next = nextHopToward(graph, 'a', () => false, uniformWeight)
    expect(next).toBeNull()
  })

  it('never expands through a node isReachable rejects, even if it would otherwise be the shortest route', () => {
    const graph = lineGraph()
    // 'c' is undiscovered — the cheap a->b->c->d route is off-limits, so it must take the pricier direct edge.
    const next = nextHopToward(graph, 'a', (id) => id === 'd', actualWeight, undefined, (id) => id !== 'c')
    expect(next).toBe('d')
  })

  it('cannot target a node isReachable rejects, even as a direct neighbor', () => {
    const graph = lineGraph()
    // 'd' is a direct, cheap neighbor of 'a', but marked unreachable (undiscovered) — must route the long way via 'b'/'c' isn't possible either without going through 'd', so nothing satisfies the target.
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
