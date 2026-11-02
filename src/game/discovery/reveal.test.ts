import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import { generatePlanarGraph } from '../graph/generatePlanar'
import { createDiscovery, revealAroundNode } from './reveal'

describe('revealAroundNode', () => {
  it('discovers the given node and its direct neighbors (radius 1)', () => {
    const graph = generatePlanarGraph(10, mulberry32(1))
    const empty = { discoveredNodeIds: new Set<string>(), discoveredEdgeIds: new Set<string>(), visitedNodeIds: new Set<string>() }
    const { discovery } = revealAroundNode(empty, graph, graph.startNodeId)

    expect(discovery.discoveredNodeIds.has(graph.startNodeId)).toBe(true)
    expect(discovery.visitedNodeIds.has(graph.startNodeId)).toBe(true)
    for (const neighbor of graph.adjacency[graph.startNodeId]) {
      expect(discovery.discoveredNodeIds.has(neighbor)).toBe(true)
    }
  })

  it('does not reveal nodes two hops away', () => {
    const graph = generatePlanarGraph(10, mulberry32(1))
    const discovery = createDiscovery(graph, graph.startNodeId)
    const directNeighbors = new Set(graph.adjacency[graph.startNodeId])

    for (const node of graph.nodes) {
      const isWithinRadiusOne = node.id === graph.startNodeId || directNeighbors.has(node.id)
      if (!isWithinRadiusOne) {
        expect(discovery.discoveredNodeIds.has(node.id)).toBe(false)
      }
    }
  })

  it('reports how many nodes were newly discovered this call, counting zero on a pure revisit', () => {
    const graph = generatePlanarGraph(10, mulberry32(1))
    const first = revealAroundNode(
      { discoveredNodeIds: new Set(), discoveredEdgeIds: new Set(), visitedNodeIds: new Set() },
      graph,
      graph.startNodeId,
    )
    expect(first.newlyDiscoveredNodeCount).toBeGreaterThan(0)

    const second = revealAroundNode(first.discovery, graph, graph.startNodeId)
    expect(second.newlyDiscoveredNodeCount).toBe(0)
  })

  it('never mutates the discovery state passed in', () => {
    const graph = generatePlanarGraph(10, mulberry32(1))
    const original = createDiscovery(graph, graph.startNodeId)
    const originalSize = original.discoveredNodeIds.size

    const neighbor = graph.adjacency[graph.startNodeId][0]
    revealAroundNode(original, graph, neighbor)

    expect(original.discoveredNodeIds.size).toBe(originalSize)
  })
})
