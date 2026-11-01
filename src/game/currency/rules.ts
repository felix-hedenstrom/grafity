import type { Graph } from '../graph/types'
import type { CurrencyState } from './types'

export const DISCOVERY_REWARD_PER_NODE = 1
export const REVISIT_REWARD = 0.1
export const GOAL_REWARD_PER_NODE = 10

/** Expansion is repeatable — each purchase adds one more node to the graph every time the walker reaches the exit (base is a flat +1), uncapped. */
export const EXPANSION_NODES_PER_LEVEL = 1
export const EXPANSION_BASE_COST = 250
/** Each level costs this much more than the last — geometric, not flat. */
export const EXPANSION_COST_GROWTH = 1.2

/** Amplifier is repeatable and expensive — each purchase multiplies the whole per-solve node gain by another 10%, compounding, uncapped. */
export const AMPLIFIER_PERCENT_PER_LEVEL = 0.1
export const AMPLIFIER_BASE_COST = 800
export const AMPLIFIER_COST_GROWTH = 1.25

/** How many nodes a solve adds to the next graph: a flat 1 plus 1 more per Expansion level, then multiplied by Amplifier's compounding bonus. */
export function computeNodesPerSolve(expansionLevel: number, amplifierLevel: number): number {
  const base = 1 + expansionLevel * EXPANSION_NODES_PER_LEVEL
  const multiplier = (1 + AMPLIFIER_PERCENT_PER_LEVEL) ** amplifierLevel
  return Math.max(1, Math.round(base * multiplier))
}

/** Currency amounts round to this many decimal places on every change, so the fractional revisit reward can't accumulate floating-point drift. */
const DECIMAL_PLACES = 2

function round(amount: number): number {
  const factor = 10 ** DECIMAL_PLACES
  return Math.round(amount * factor) / factor
}

export function createCurrency(): CurrencyState {
  return { amount: 0, totalEarned: 0 }
}

export function computeDiscoveryReward(newlyDiscoveredNodeCount: number): number {
  return newlyDiscoveredNodeCount * DISCOVERY_REWARD_PER_NODE
}

/** Scales with graph size so the reward keeps pace as completions grow the graph — a bigger exit is worth more. */
export function computeGoalBonus(graph: Graph): number {
  return graph.nodes.length * GOAL_REWARD_PER_NODE
}

export function earn(currency: CurrencyState, amount: number): CurrencyState {
  if (amount <= 0) return currency
  return { amount: round(currency.amount + amount), totalEarned: round(currency.totalEarned + amount) }
}

export function spend(currency: CurrencyState, amount: number): CurrencyState {
  if (amount > currency.amount) {
    throw new Error(`Cannot spend ${amount}, only ${currency.amount} available`)
  }
  return { ...currency, amount: round(currency.amount - amount) }
}
