import { evaluateAchievements } from '../achievements/evaluate'
import type { AchievementContext } from '../achievements/types'
import { computeDiscoveryRewardPerNode, computeGoalRewardPerNode, computeRevisitReward } from '../currency/rules'
import type { DiscoveryState } from '../discovery/types'
import { DEFAULT_STRATEGY_ID } from '../upgrades/definitions'
import { useAchievementStore } from '../../store/useAchievementStore'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import type { RewardRates } from './searcherStep'

/** The currently-effective reward rates, reflecting however many Discovery/Revisit/Exit Bonus levels are owned. */
export function computeRewardRates(progression: ReturnType<typeof useProgressionStore.getState>): RewardRates {
  return {
    discoveryPerNode: computeDiscoveryRewardPerNode(progression.discoveryBonusLevel),
    revisit: computeRevisitReward(progression.revisitBonusLevel),
    goalPerNode: computeGoalRewardPerNode(progression.exitBonusLevel),
  }
}

/** Checks every achievement against the latest state and unlocks any that newly qualify — called after every committed hop, once progression has settled (currency earned, graph grown), so a milestone crossed this hop unlocks immediately. */
export function checkAchievements(discovery: DiscoveryState, totalNodes: number): void {
  const progression = useProgressionStore.getState()
  const prestige = usePrestigeStore.getState()
  const ctx: AchievementContext = {
    highestGraphNodeCount: prestige.lifetimeHighestGraphNodeCount,
    purchasedUpgradeIds: progression.purchasedUpgradeIds,
    activeStrategyId: progression.activeStrategyId,
    defaultStrategyId: DEFAULT_STRATEGY_ID,
    momentumOwned: progression.momentumOwned,
    memoryLevel: progression.memoryLevel,
    deepMemoryLevel: progression.deepMemoryLevel,
    expansionLevel: progression.expansionLevel,
    amplifierLevel: progression.amplifierLevel,
    searcherLevel: progression.searcherLevel,
    ftlLevel: prestige.ftlLevel,
    bidirectionalOwned: prestige.bidirectionalOwned,
    currencyAmount: progression.currency.amount,
    discoveredCount: discovery.discoveredNodeIds.size,
    totalNodes,
  }
  const newly = evaluateAchievements(ctx, useAchievementStore.getState().unlockedIds)
  if (newly.length > 0) useAchievementStore.getState().unlockMany(newly)
}
