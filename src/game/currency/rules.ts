import type { Graph } from '../graph/types'
import type { CurrencyState } from './types'

export const DISCOVERY_REWARD_PER_NODE = 1
export const REVISIT_REWARD = 0.1
export const GOAL_REWARD_PER_NODE = 10

/** Discovery Bonus is repeatable — each purchase raises the discovery reward rate by another 20%, compounding, uncapped. */
export const DISCOVERY_BONUS_PERCENT_PER_LEVEL = 0.2
export const DISCOVERY_BONUS_BASE_COST = 15
export const DISCOVERY_BONUS_COST_GROWTH = 1.2

/** Revisit Bonus is repeatable — each purchase raises the revisit reward rate by another 20%, compounding, uncapped. */
export const REVISIT_BONUS_PERCENT_PER_LEVEL = 0.2
export const REVISIT_BONUS_BASE_COST = 15
export const REVISIT_BONUS_COST_GROWTH = 1.2

/** Exit Bonus is repeatable — each purchase raises the exit reward rate by another 20%, compounding, uncapped. */
export const EXIT_BONUS_PERCENT_PER_LEVEL = 0.2
export const EXIT_BONUS_BASE_COST = 30
export const EXIT_BONUS_COST_GROWTH = 1.25

export function computeDiscoveryRewardPerNode(discoveryBonusLevel: number): number {
  return DISCOVERY_REWARD_PER_NODE * (1 + DISCOVERY_BONUS_PERCENT_PER_LEVEL) ** discoveryBonusLevel
}

export function computeRevisitReward(revisitBonusLevel: number): number {
  return REVISIT_REWARD * (1 + REVISIT_BONUS_PERCENT_PER_LEVEL) ** revisitBonusLevel
}

export function computeGoalRewardPerNode(exitBonusLevel: number): number {
  return GOAL_REWARD_PER_NODE * (1 + EXIT_BONUS_PERCENT_PER_LEVEL) ** exitBonusLevel
}

/** Expansion is repeatable — each purchase adds one more node to the graph every time the walker reaches the exit (base is a flat +1), uncapped. */
export const EXPANSION_NODES_PER_LEVEL = 1
export const EXPANSION_BASE_COST = 250
/** Each level costs this much more than the last — geometric, not flat. */
export const EXPANSION_COST_GROWTH = 1.2

/** Amplifier is repeatable and expensive — each purchase multiplies the whole per-solve node gain by another 10%, compounding, uncapped. */
export const AMPLIFIER_PERCENT_PER_LEVEL = 0.1
export const AMPLIFIER_BASE_COST = 800
export const AMPLIFIER_COST_GROWTH = 1.25

/** Insight Multiplier is repeatable — each purchase multiplies ALL Insight earned (discovery, revisit, and exit rewards alike) by another 15%, compounding, uncapped. */
export const INSIGHT_MULTIPLIER_PERCENT_PER_LEVEL = 0.15
export const INSIGHT_MULTIPLIER_BASE_COST = 60
export const INSIGHT_MULTIPLIER_COST_GROWTH = 1.3

/** How much every Insight reward is scaled by right now (1 = no bonus yet) — applied once, where currency is actually credited, rather than threaded through every reward calculation. */
export function computeInsightMultiplier(insightMultiplierLevel: number): number {
  return (1 + INSIGHT_MULTIPLIER_PERCENT_PER_LEVEL) ** insightMultiplierLevel
}

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

export function computeDiscoveryReward(newlyDiscoveredNodeCount: number, rewardPerNode = DISCOVERY_REWARD_PER_NODE): number {
  return newlyDiscoveredNodeCount * rewardPerNode
}

/** Scales with graph size so the reward keeps pace as completions grow the graph — a bigger exit is worth more. */
export function computeGoalBonus(graph: Graph, rewardPerNode = GOAL_REWARD_PER_NODE): number {
  return graph.nodes.length * rewardPerNode
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
