import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'
import type { Graph } from '../graph/types'
import type { CurrencyState } from './types'

/** Discovery Bonus is repeatable — each purchase raises the discovery reward rate by another percentPerLevel, compounding, uncapped. Cost grows faster than the reward itself, so it isn't a permanent breakeven. */
export function computeDiscoveryRewardPerNode(discoveryBonusLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return config.currency.discoveryRewardPerNode * (1 + config.upgrades.discoveryBonus.percentPerLevel) ** discoveryBonusLevel
}

/** Revisit Bonus is repeatable — each purchase raises the revisit reward rate by another percentPerLevel, compounding, uncapped. */
export function computeRevisitReward(revisitBonusLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return config.currency.revisitReward * (1 + config.upgrades.revisitBonus.percentPerLevel) ** revisitBonusLevel
}

/** Exit Bonus is repeatable — each purchase raises the exit reward rate by another percentPerLevel, compounding, uncapped. */
export function computeGoalRewardPerNode(exitBonusLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return config.currency.goalRewardPerNode * (1 + config.upgrades.exitBonus.percentPerLevel) ** exitBonusLevel
}

/** How much every Insight reward is scaled by right now (1 = no bonus yet) — applied once, where currency is actually credited, rather than threaded through every reward calculation. */
export function computeInsightMultiplier(insightMultiplierLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return (1 + config.upgrades.insightMultiplier.percentPerLevel) ** insightMultiplierLevel
}

/** How many nodes a solve adds to the next graph: a flat 1 plus nodesPerLevel more per Expansion level, then multiplied by Amplifier's compounding bonus. amplifierLevel is clamped to its maxLevel here too (not just at purchase time) as a safety net against the exact runaway that cap exists to prevent. */
export function computeNodesPerSolve(expansionLevel: number, amplifierLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  const { expansion, amplifier } = config.upgrades
  const base = 1 + expansionLevel * expansion.nodesPerLevel
  const multiplier = (1 + amplifier.percentPerLevel) ** Math.min(amplifierLevel, amplifier.maxLevel ?? Infinity)
  return Math.max(1, Math.round(base * multiplier))
}

/** Nebulas earned on prestige, as a function of how far this run's graph ever grew — sqrt-shaped so payout keeps rising without exploding as high scores climb. Placeholder curve, tuned against the balance simulator in src/sim/. */
export function nebulasForGraphSize(highestGraphNodeCount: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return Math.max(0, Math.floor(Math.sqrt(Math.max(0, highestGraphNodeCount - config.currency.nebulaPayoutReferenceNodes))))
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

export function computeDiscoveryReward(newlyDiscoveredNodeCount: number, rewardPerNode = PRODUCTION_CONFIG.currency.discoveryRewardPerNode): number {
  return newlyDiscoveredNodeCount * rewardPerNode
}

/** Scales with graph size so the reward keeps pace as completions grow the graph — a bigger exit is worth more. */
export function computeGoalBonus(graph: Graph, rewardPerNode = PRODUCTION_CONFIG.currency.goalRewardPerNode): number {
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
