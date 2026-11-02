export interface UpgradeDefinition {
  id: string
  name: string
  description: string
  cost: number
  /** The level (graph node count) the player must have reached at least once before this can be purchased, regardless of currency. */
  minLevel: number
  /** Present for upgrades that unlock a traversal strategy; absent for other kinds (e.g. speed upgrades), which just need to be owned. */
  strategyId?: string
}
