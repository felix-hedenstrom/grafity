import { describe, expect, it } from 'vitest'
import type { Graph } from '../graph/types'
import {
  computeDiscoveryReward,
  computeGoalBonus,
  computeNodesPerSolve,
  createCurrency,
  earn,
  GOAL_REWARD_PER_NODE,
  REVISIT_REWARD,
  spend,
} from './rules'

function graphWithNodeCount(count: number): Graph {
  return { nodes: Array.from({ length: count }, () => ({}) as Graph['nodes'][number]), edges: [], startNodeId: '', goalNodeId: '', adjacency: {} }
}

describe('currency rules', () => {
  it('starts at zero', () => {
    const currency = createCurrency()
    expect(currency.amount).toBe(0)
    expect(currency.totalEarned).toBe(0)
  })

  it('scales discovery reward with newly discovered node count', () => {
    expect(computeDiscoveryReward(0)).toBe(0)
    expect(computeDiscoveryReward(3)).toBe(3)
  })

  it('scales the goal bonus with the size of the graph', () => {
    expect(computeGoalBonus(graphWithNodeCount(7))).toBe(7 * GOAL_REWARD_PER_NODE)
    expect(computeGoalBonus(graphWithNodeCount(20))).toBe(20 * GOAL_REWARD_PER_NODE)
  })

  it('earn increases both amount and totalEarned, and is a no-op for non-positive amounts', () => {
    const currency = createCurrency()
    const earned = earn(currency, 10)
    expect(earned.amount).toBe(10)
    expect(earned.totalEarned).toBe(10)
    expect(earn(earned, 0)).toBe(earned)
    expect(earn(earned, -5)).toBe(earned)
  })

  it('earn rounds away floating-point drift from repeatedly adding the fractional revisit reward', () => {
    let currency = createCurrency()
    for (let i = 0; i < 3; i++) {
      currency = earn(currency, REVISIT_REWARD)
    }
    expect(currency.amount).toBe(0.3)
  })

  it('spend decreases amount but leaves totalEarned untouched', () => {
    const currency = earn(createCurrency(), 10)
    const spent = spend(currency, 4)
    expect(spent.amount).toBe(6)
    expect(spent.totalEarned).toBe(10)
  })

  it('spend throws when overspending', () => {
    const currency = earn(createCurrency(), 10)
    expect(() => spend(currency, 11)).toThrow()
  })

  it('computeNodesPerSolve is a flat 1 at level 0, plus 1 more per Expansion level', () => {
    expect(computeNodesPerSolve(0, 0)).toBe(1)
    expect(computeNodesPerSolve(1, 0)).toBe(2)
    expect(computeNodesPerSolve(5, 0)).toBe(6)
  })

  it('computeNodesPerSolve applies Amplifier as a compounding multiplier on top of Expansion', () => {
    // Small bases round away a single Amplifier level's 10% — use a large enough base to see it clearly.
    expect(computeNodesPerSolve(20, 1)).toBeGreaterThan(computeNodesPerSolve(20, 0))
    expect(computeNodesPerSolve(20, 5)).toBeGreaterThan(computeNodesPerSolve(20, 1))
  })
})
