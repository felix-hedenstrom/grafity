export interface RepeatableUpgradeInfo {
  name: string
  description: string
  baseCost: number
  /** Multiplier applied per level already owned — e.g. 1.15 means each level costs 15% more than the last, not a flat fee. No level cap: the rising cost is what throttles it. */
  costGrowth: number
  /** The level (graph node count) the player must have reached at least once before the very first purchase is allowed, regardless of currency. Only gates level 0 -> 1; later levels are cost-gated only. */
  minLevel: number
}

/** The price of the next level, given how many are already owned — geometric, like most incremental games, not flat or linear. */
export function costForLevel(info: RepeatableUpgradeInfo, currentLevel: number): number {
  return Math.round(info.baseCost * info.costGrowth ** currentLevel)
}
