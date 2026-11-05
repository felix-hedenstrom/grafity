import { describe, expect, it } from 'vitest'
import { mergeConfig } from '../config/merge'
import { PRODUCTION_CONFIG } from '../config/production'
import { createDiscovery, revealAroundNode } from '../discovery/reveal'
import { generatePlanarGraph } from '../graph/generatePlanar'
import type { Graph } from '../graph/types'
import { commitHop, decideNextHop } from '../loop/searcherStep'
import type { TraversalStrategy } from '../strategies/types'
import { createWalker } from '../walker/walkerLogic'
import { mulberry32 } from '../../utils/rng'
import { computeKeyCount, forwardTargetNodeId, isExitUnlocked, pickKeys, remainingKeyIds, withKeys } from './keys'

/** start(0,0) — A(60,0) — goal(120,0), plus K1(30,40) hanging off start and K2(60,30) hanging off A. */
function keyedGraph(): Graph {
  const adjacency = { start: ['A', 'K1'], A: ['start', 'goal', 'K2'], goal: ['A'], K1: ['start'], K2: ['A'] }
  const pos: Record<string, [number, number]> = { start: [0, 0], A: [60, 0], goal: [120, 0], K1: [30, 40], K2: [60, 30] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({
      id,
      isStart: id === 'start',
      isGoal: id === 'goal',
      isKey: id === 'K1' || id === 'K2',
      x: pos[id][0],
      y: pos[id][1],
    })),
    edges: [],
    startNodeId: 'start',
    goalNodeId: 'goal',
    adjacency,
  }
}

function recordTarget(seen: (string | undefined)[]): TraversalStrategy {
  return {
    id: 'record',
    name: 'Record',
    memoryMultiplier: 1,
    chooseNextNode: (ctx) => {
      seen.push(ctx.targetNodeId)
      return ctx.graph.adjacency[ctx.walker.currentNodeId][0]
    },
  }
}

describe('computeKeyCount', () => {
  it('follows the square-root curve, starting at exactly 1 key', () => {
    const table: [number, number][] = [
      [7, 1],
      [27, 1],
      [28, 2],
      [62, 2],
      [63, 3],
      [111, 3],
      [112, 4],
      [175, 5],
      [700, 10],
    ]
    for (const [nodes, keys] of table) expect(computeKeyCount(nodes), `${nodes} nodes`).toBe(keys)
  })

  it('never drops below 1, even below the reference size', () => {
    expect(computeKeyCount(3)).toBe(1)
  })

  it('reads its curve from the config', () => {
    const flatter = mergeConfig(PRODUCTION_CONFIG, { keys: { countExponent: 0.25 } })
    expect(computeKeyCount(112, flatter)).toBe(2)
  })
})

describe('pickKeys / withKeys', () => {
  it('never places a key on the start, the goal or a neutron star, and never twice on one node', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base = generatePlanarGraph(40, mulberry32(seed))
      const graph = { ...base, nodes: base.nodes.map((n, i) => (i % 3 === 0 && !n.isStart && !n.isGoal ? { ...n, isNeutronStar: true } : n)) }
      const picked = pickKeys(graph, 5, mulberry32(seed + 99))
      expect(new Set(picked).size).toBe(5)
      for (const id of picked) {
        const node = graph.nodes.find((n) => n.id === id)!
        expect(node.isStart || node.isGoal || node.isNeutronStar).toBeFalsy()
      }
    }
  })

  it("prefers stars that aren't next to the start", () => {
    const graph = keyedGraph()
    // Eligible: A and K1 border the start; K2 doesn't. One key must land on K2.
    for (let seed = 1; seed <= 20; seed++) expect(pickKeys(graph, 1, mulberry32(seed))).toEqual(['K2'])
  })

  it("falls back to the start's neighbors when the farther pool runs out, and caps at the eligible count", () => {
    const picked = pickKeys(keyedGraph(), 10, mulberry32(1))
    expect(picked[0]).toBe('K2')
    expect(new Set(picked)).toEqual(new Set(['K2', 'A', 'K1']))
  })

  it('flags exactly the picked nodes', () => {
    const base = generatePlanarGraph(30, mulberry32(7))
    const keyed = withKeys(base, 2, mulberry32(8))
    expect(keyed.nodes.filter((n) => n.isKey)).toHaveLength(2)
    expect(withKeys(base, 0, mulberry32(8))).toBe(base)
  })
})

describe('lock state', () => {
  it('unlocks the exit once every key is visited', () => {
    const graph = keyedGraph()
    let discovery = createDiscovery(graph, 'start')
    expect(isExitUnlocked(graph, discovery)).toBe(false)
    expect(remainingKeyIds(graph, discovery)).toEqual(['K1', 'K2'])
    discovery = revealAroundNode(discovery, graph, 'K1').discovery
    expect(remainingKeyIds(graph, discovery)).toEqual(['K2'])
    discovery = revealAroundNode(discovery, graph, 'K2').discovery
    expect(isExitUnlocked(graph, discovery)).toBe(true)
  })

  it('treats a graph without keys (e.g. an old save) as unlocked', () => {
    const graph = { ...keyedGraph(), nodes: keyedGraph().nodes.map((n) => ({ ...n, isKey: false })) }
    expect(isExitUnlocked(graph, createDiscovery(graph, 'start'))).toBe(true)
  })
})

describe('forwardTargetNodeId', () => {
  it('aims at the nearest discovered key, then the next, then the exit', () => {
    const graph = keyedGraph()
    let discovery = revealAroundNode(createDiscovery(graph, 'start'), graph, 'A').discovery // K1 and K2 both discovered
    expect(forwardTargetNodeId(graph, discovery, 'start')).toBe('K1')
    expect(forwardTargetNodeId(graph, discovery, 'A')).toBe('K2')
    discovery = revealAroundNode(discovery, graph, 'K2').discovery
    expect(forwardTargetNodeId(graph, discovery, 'A')).toBe('K1')
    discovery = revealAroundNode(discovery, graph, 'K1').discovery
    expect(forwardTargetNodeId(graph, discovery, 'A')).toBe('goal')
  })

  it('picks an undiscovered key rather than the locked exit when no key is in sight yet', () => {
    const graph = keyedGraph()
    const discovery = { discoveredNodeIds: new Set(['start', 'A', 'goal']), discoveredEdgeIds: new Set<string>(), visitedNodeIds: new Set(['start']) }
    expect(forwardTargetNodeId(graph, discovery, 'start')).toBe('K1')
  })
})

describe('searcherStep with keys', () => {
  it("does not win on a locked exit", () => {
    const graph = keyedGraph()
    const discovery = revealAroundNode(createDiscovery(graph, 'start'), graph, 'A').discovery
    const result = commitHop({ graph, discovery, walker: { ...createWalker('A'), path: ['start', 'A'] }, nextNodeId: 'goal' })
    expect(result.goalReached).toBe(false)
    expect(result.walker.hasReachedGoal).toBe(false)
    expect(result.walker.currentNodeId).toBe('goal')
    expect(result.currencyEarned).toBeLessThan(PRODUCTION_CONFIG.currency.goalRewardPerNode)
  })

  it('wins on the exit once every key is visited', () => {
    const graph = keyedGraph()
    let discovery = createDiscovery(graph, 'start')
    for (const id of ['K1', 'A', 'K2']) discovery = revealAroundNode(discovery, graph, id).discovery
    const result = commitHop({ graph, discovery, walker: createWalker('A'), nextNodeId: 'goal' })
    expect(result.goalReached).toBe(true)
  })

  it('hands forward walkers the key as their target, and Reverse Beacon walkers the start', () => {
    const graph = keyedGraph()
    const discovery = revealAroundNode(createDiscovery(graph, 'start'), graph, 'A').discovery
    const seen: (string | undefined)[] = []
    const base = { graph, discovery, strategy: recordTarget(seen), memory: undefined, memoryLevel: 0, sharedRecentPath: [] }
    decideNextHop({ ...base, walker: createWalker('A') })
    decideNextHop({ ...base, walker: createWalker('goal', 'goal') })
    expect(seen).toEqual(['K2', 'start'])
  })
})
