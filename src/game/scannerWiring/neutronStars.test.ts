import { describe, expect, it } from 'vitest'
import { generatePlanarGraph } from '../graph/generatePlanar'
import { mulberry32 } from '../../utils/rng'
import { pickNeutronStars, withNeutronStars } from './neutronStars'

describe('neutron stars', () => {
  it('picks exactly n distinct stars, never the start or goal', () => {
    const graph = generatePlanarGraph(40, mulberry32(1))
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickNeutronStars(graph, 3, mulberry32(seed))
      expect(new Set(picked).size).toBe(3)
      expect(picked).not.toContain(graph.startNodeId)
      expect(picked).not.toContain(graph.goalNodeId)
    }
  })

  it('caps at the non-beacon node count on tiny graphs', () => {
    const graph = generatePlanarGraph(4, mulberry32(2))
    expect(pickNeutronStars(graph, 10, mulberry32(3))).toHaveLength(2)
  })

  it('flags the picked nodes and nothing else', () => {
    const graph = withNeutronStars(generatePlanarGraph(30, mulberry32(4)), 3, mulberry32(5))
    expect(graph.nodes.filter((n) => n.isNeutronStar)).toHaveLength(3)
    expect(withNeutronStars(graph, 0, mulberry32(5))).toBe(graph)
  })
})
