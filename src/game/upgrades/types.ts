export interface UpgradeDefinition {
  id: string
  name: string
  description: string
  cost: number
  /** Present for upgrades that unlock a traversal strategy; absent for other kinds (e.g. speed upgrades), which just need to be owned. */
  strategyId?: string
}
