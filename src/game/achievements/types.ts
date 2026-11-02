/** Everything an achievement's check() might need, pulled from both progression and run state so achievements don't depend on either store's exact shape. */
export interface AchievementContext {
  highestGraphNodeCount: number
  purchasedUpgradeIds: string[]
  activeStrategyId: string
  defaultStrategyId: string
  momentumLevel: number
  memoryLevel: number
  deepMemoryLevel: number
  expansionLevel: number
  amplifierLevel: number
  quickStepsLevel: number
  searcherLevel: number
  clarityLevel: number
  currencyAmount: number
  discoveredCount: number
  totalNodes: number
}

export interface Achievement {
  id: string
  name: string
  /** Shown only once unlocked — kept secret beforehand so finding out what triggered it is part of the fun. */
  description: string
  check(ctx: AchievementContext): boolean
}
