/** Everything an achievement's check() might need, pulled from progression, run, and prestige state so achievements don't depend on any one store's exact shape. highestGraphNodeCount comes from usePrestigeStore's lifetime field (not useProgressionStore's resettable one), so thresholds already crossed stay reachable across prestige resets. */
export interface AchievementContext {
  highestGraphNodeCount: number
  purchasedUpgradeIds: string[]
  activeStrategyId: string
  defaultStrategyId: string
  momentumOwned: boolean
  memoryLevel: number
  deepMemoryLevel: number
  expansionLevel: number
  amplifierLevel: number
  searcherLevel: number
  ftlLevel: number
  /** Whether Reverse Beacon (the Prestige Shop's bidirectional modifier) has ever been bought. */
  bidirectionalOwned: boolean
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
