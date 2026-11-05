import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import { generatePlanarGraph } from '../graph/generatePlanar'
import type { Graph, NodeId } from '../graph/types'
import { withNeutronStars } from '../scannerWiring/neutronStars'
import { createWalker } from '../walker/walkerLogic'
import { mulberry32 } from '../../utils/rng'
import { exitAvoidanceNextHop, pulsarHuntNextHop } from './pulsarHunter'
import { commitHop } from './searcherStep'

/** Every node reachable from the start without stepping on the exit. */
function reachableAvoidingExit(graph: Graph): Set<NodeId> {
  const seen = new Set<NodeId>([graph.startNodeId])
  const queue = [graph.startNodeId]
  while (queue.length > 0) {
    for (const next of graph.adjacency[queue.shift()!]) {
      if (next === graph.goalNodeId || seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

describe('Pulsar Hunter', () => {
  it('collects every pulsar from a fresh level without ever touching the exit', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const graph = withNeutronStars(generatePlanarGraph(20 + seed * 3, mulberry32(seed)), 3, mulberry32(seed + 500))
      let discovery = createDiscovery(graph, graph.startNodeId)
      let walker = createWalker(graph.startNodeId)
      for (let step = 0; step < graph.nodes.length * 4; step++) {
        const next = pulsarHuntNextHop(graph, discovery, walker.currentNodeId, graph.goalNodeId)
        if (next === null) break
        expect(graph.adjacency[walker.currentNodeId]).toContain(next)
        const result = commitHop({ graph, discovery, walker, nextNodeId: next })
        discovery = result.discovery
        walker = result.walker
      }
      expect(discovery.visitedNodeIds.has(graph.goalNodeId)).toBe(false)
      // The only pulsars the hunt may leave behind are ones walled off behind the exit itself.
      const reachable = reachableAvoidingExit(graph)
      for (const pulsar of graph.nodes.filter((n) => n.isNeutronStar && reachable.has(n.id))) {
        expect(discovery.visitedNodeIds.has(pulsar.id), `seed ${seed}: ${pulsar.id}`).toBe(true)
      }
    }
  })

  it('never ping-pongs, even when the hunt picks up mid-level after random wandering', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed + 900)
      const graph = withNeutronStars(generatePlanarGraph(40 + seed, mulberry32(seed)), 3, mulberry32(seed + 700))
      let discovery = createDiscovery(graph, graph.startNodeId)
      let walker = createWalker(graph.startNodeId)
      const wander = (n: number) => {
        for (let k = 0; k < n; k++) {
          const options = graph.adjacency[walker.currentNodeId].filter((id) => id !== graph.goalNodeId)
          const result = commitHop({ graph, discovery, walker, nextNodeId: options[Math.floor(rng() * options.length)] })
          discovery = result.discovery
          walker = result.walker
        }
      }
      wander(Math.floor(rng() * 15))
      let hops = 0
      for (;;) {
        const next = pulsarHuntNextHop(graph, discovery, walker.currentNodeId, graph.goalNodeId)
        if (next === null) break
        const result = commitHop({ graph, discovery, walker, nextNodeId: next })
        discovery = result.discovery
        walker = result.walker
        // Each hunt target is a not-yet-visited star, so the hunt can never take longer than one full route per star.
        expect(++hops, `seed ${seed}`).toBeLessThan(graph.nodes.length * graph.nodes.length)
      }
      const reachable = reachableAvoidingExit(graph)
      for (const pulsar of graph.nodes.filter((n) => n.isNeutronStar && reachable.has(n.id))) {
        expect(discovery.visitedNodeIds.has(pulsar.id), `seed ${seed}: ${pulsar.id}`).toBe(true)
      }
    }
  })

  it('Exit Avoidance only steps in once the exit has been discovered', () => {
    const graph = withNeutronStars(generatePlanarGraph(40, mulberry32(8)), 3, mulberry32(9))
    const fresh = createDiscovery(graph, graph.startNodeId)
    expect(exitAvoidanceNextHop(graph, fresh, graph.startNodeId)).toBeNull()
    const exitSeen = { ...fresh, discoveredNodeIds: new Set([...fresh.discoveredNodeIds, graph.goalNodeId]) }
    expect(exitAvoidanceNextHop(graph, exitSeen, graph.startNodeId)).toBe(pulsarHuntNextHop(graph, exitSeen, graph.startNodeId, graph.goalNodeId))
  })

  it('stands down once there is nothing to hunt', () => {
    const graph = generatePlanarGraph(20, mulberry32(3))
    expect(pulsarHuntNextHop(graph, createDiscovery(graph, graph.startNodeId), graph.startNodeId, graph.goalNodeId)).toBeNull()
  })
})
