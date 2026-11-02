import { beforeEach, describe, expect, it } from 'vitest'
import { createCurrency, earn } from '../game/currency/rules'
import { CLARITY_MAX_LEVEL } from '../game/graph/layout'
import {
  AMPLIFIER_UPGRADE_INFO,
  CLARITY_UPGRADE,
  DEEP_MEMORY_UPGRADE_INFO,
  DEFAULT_STRATEGY_ID,
  DISCOVERY_BONUS_UPGRADE_INFO,
  EXIT_BONUS_UPGRADE_INFO,
  EXPANSION_UPGRADE_INFO,
  INSIGHT_MULTIPLIER_UPGRADE_INFO,
  MINIMAP_UPGRADE,
  MOMENTUM_UPGRADE_INFO,
  NODE_MEMORY_UPGRADE_INFO,
  QUICK_STEPS_UPGRADE_INFO,
  REVISIT_BONUS_UPGRADE_INFO,
  SEARCHER_UPGRADE_INFO,
  UPGRADES,
} from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from './useProgressionStore'

/** Above every upgrade's minLevel (Bidirectional's 200 is the highest) — clears the level gate so tests unrelated to gating aren't blocked by it. */
const LEVEL_GATE_CLEARED = 10_000

beforeEach(() => {
  useProgressionStore.setState({
    currency: createCurrency(),
    purchasedUpgradeIds: [],
    activeStrategyId: DEFAULT_STRATEGY_ID,
    graphNodeCount: STARTING_GRAPH_NODE_COUNT,
    highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
    momentumLevel: 0,
    memoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    quickStepsLevel: 0,
    searcherLevel: 0,
    clarityLevel: 0,
    discoveryBonusLevel: 0,
    revisitBonusLevel: 0,
    exitBonusLevel: 0,
    insightMultiplierLevel: 0,
    minimapEnabled: true,
  })
})

describe('useProgressionStore', () => {
  it('starts with zero currency, no upgrades, and the default strategy', () => {
    const state = useProgressionStore.getState()
    expect(state.currency.amount).toBe(0)
    expect(state.purchasedUpgradeIds).toEqual([])
    expect(state.activeStrategyId).toBe(DEFAULT_STRATEGY_ID)
  })

  it('earnCurrency accumulates into currency.amount', () => {
    useProgressionStore.getState().earnCurrency(10)
    useProgressionStore.getState().earnCurrency(5)
    expect(useProgressionStore.getState().currency.amount).toBe(15)
  })

  it('rejects purchasing an upgrade without enough currency', () => {
    const upgrade = UPGRADES[0]
    const bought = useProgressionStore.getState().purchaseUpgrade(upgrade.id)
    expect(bought).toBe(false)
    expect(useProgressionStore.getState().purchasedUpgradeIds).toEqual([])
  })

  it('rejects purchasing an upgrade below its level requirement, even with enough currency', () => {
    const upgrade = UPGRADES[0]
    expect(upgrade.minLevel).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT) // premise: this upgrade is actually gated
    useProgressionStore.setState({
      currency: earn(createCurrency(), upgrade.cost),
      highestGraphNodeCount: upgrade.minLevel - 1,
    })

    const bought = useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    expect(bought).toBe(false)
    expect(useProgressionStore.getState().purchasedUpgradeIds).toEqual([])
  })

  it('purchases an upgrade once affordable, deducting cost and activating its strategy', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost), highestGraphNodeCount: LEVEL_GATE_CLEARED })

    const bought = useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    expect(bought).toBe(true)
    const state = useProgressionStore.getState()
    expect(state.currency.amount).toBe(0)
    expect(state.purchasedUpgradeIds).toEqual([upgrade.id])
    expect(state.activeStrategyId).toBe(upgrade.strategyId)
  })

  describe.each([
    ['purchaseMomentumLevel', 'momentumLevel', MOMENTUM_UPGRADE_INFO] as const,
    ['purchaseMemoryLevel', 'memoryLevel', NODE_MEMORY_UPGRADE_INFO] as const,
    ['purchaseExpansionLevel', 'expansionLevel', EXPANSION_UPGRADE_INFO] as const,
    ['purchaseAmplifierLevel', 'amplifierLevel', AMPLIFIER_UPGRADE_INFO] as const,
    ['purchaseDeepMemoryLevel', 'deepMemoryLevel', DEEP_MEMORY_UPGRADE_INFO] as const,
    ['purchaseQuickStepsLevel', 'quickStepsLevel', QUICK_STEPS_UPGRADE_INFO] as const,
    ['purchaseSearcherLevel', 'searcherLevel', SEARCHER_UPGRADE_INFO] as const,
    ['purchaseDiscoveryBonusLevel', 'discoveryBonusLevel', DISCOVERY_BONUS_UPGRADE_INFO] as const,
    ['purchaseRevisitBonusLevel', 'revisitBonusLevel', REVISIT_BONUS_UPGRADE_INFO] as const,
    ['purchaseExitBonusLevel', 'exitBonusLevel', EXIT_BONUS_UPGRADE_INFO] as const,
    ['purchaseInsightMultiplierLevel', 'insightMultiplierLevel', INSIGHT_MULTIPLIER_UPGRADE_INFO] as const,
  ])('%s', (actionName, levelField, info) => {
    it('stacks levels, deducting a geometrically increasing cost each time', () => {
      const level0Cost = costForLevel(info, 0)
      const level1Cost = costForLevel(info, 1)
      expect(level1Cost).toBeGreaterThan(level0Cost) // costs rise, not flat

      useProgressionStore.setState({
        currency: earn(createCurrency(), level0Cost + level1Cost),
        highestGraphNodeCount: LEVEL_GATE_CLEARED,
      })

      expect(useProgressionStore.getState()[actionName]()).toBe(true)
      expect(useProgressionStore.getState()[levelField]).toBe(1)
      expect(useProgressionStore.getState()[actionName]()).toBe(true)
      expect(useProgressionStore.getState()[levelField]).toBe(2)
      expect(useProgressionStore.getState().currency.amount).toBe(0)
    })

    it('refuses when currency runs out — no level cap to hit instead', () => {
      useProgressionStore.setState({ currency: createCurrency(), highestGraphNodeCount: LEVEL_GATE_CLEARED })
      expect(useProgressionStore.getState()[actionName]()).toBe(false)
      expect(useProgressionStore.getState()[levelField]).toBe(0)
    })

    it('refuses the first purchase below its level requirement, even with enough currency', () => {
      expect(info.minLevel).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT) // premise: this upgrade is actually gated
      useProgressionStore.setState({
        currency: earn(createCurrency(), costForLevel(info, 0)),
        highestGraphNodeCount: info.minLevel - 1,
      })

      expect(useProgressionStore.getState()[actionName]()).toBe(false)
      expect(useProgressionStore.getState()[levelField]).toBe(0)
    })

    it('does not re-gate later levels once the first purchase has cleared the requirement', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), costForLevel(info, 0) + costForLevel(info, 1)),
        highestGraphNodeCount: info.minLevel, // clears the gate exactly once, for the first purchase only
      })
      expect(useProgressionStore.getState()[actionName]()).toBe(true)

      // Nothing lowers highestGraphNodeCount in practice, but the gate is defined to only ever
      // check level 0 -> 1 — later purchases should be cost-gated only, never level-gated again.
      useProgressionStore.setState({ highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT })
      expect(useProgressionStore.getState()[actionName]()).toBe(true)
      expect(useProgressionStore.getState()[levelField]).toBe(2)
    })
  })

  describe('purchaseClarity', () => {
    it('jumps straight to CLARITY_MAX_LEVEL on purchase, a one-time buy rather than a stacking level', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), CLARITY_UPGRADE.cost),
        highestGraphNodeCount: LEVEL_GATE_CLEARED,
      })

      expect(useProgressionStore.getState().purchaseClarity()).toBe(true)

      const state = useProgressionStore.getState()
      expect(state.clarityLevel).toBe(CLARITY_MAX_LEVEL)
      expect(state.currency.amount).toBe(0)
    })

    it('refuses a second purchase once already owned', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), CLARITY_UPGRADE.cost * 2),
        highestGraphNodeCount: LEVEL_GATE_CLEARED,
      })
      useProgressionStore.getState().purchaseClarity()

      expect(useProgressionStore.getState().purchaseClarity()).toBe(false)
      expect(useProgressionStore.getState().clarityLevel).toBe(CLARITY_MAX_LEVEL) // unchanged, not doubled
    })

    it('refuses below its level requirement, even with enough currency', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), CLARITY_UPGRADE.cost),
        highestGraphNodeCount: CLARITY_UPGRADE.minLevel - 1,
      })

      expect(useProgressionStore.getState().purchaseClarity()).toBe(false)
      expect(useProgressionStore.getState().clarityLevel).toBe(0)
    })
  })

  describe('purchaseMinimap / toggleMinimap', () => {
    it('adds minimap to purchasedUpgradeIds on purchase, and refuses a second purchase', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), MINIMAP_UPGRADE.cost),
        highestGraphNodeCount: LEVEL_GATE_CLEARED,
      })

      expect(useProgressionStore.getState().purchaseMinimap()).toBe(true)
      expect(useProgressionStore.getState().purchasedUpgradeIds).toContain(MINIMAP_UPGRADE.id)

      expect(useProgressionStore.getState().purchaseMinimap()).toBe(false)
    })

    it('refuses below its level requirement, even with enough currency', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), MINIMAP_UPGRADE.cost),
        highestGraphNodeCount: MINIMAP_UPGRADE.minLevel - 1,
      })

      expect(useProgressionStore.getState().purchaseMinimap()).toBe(false)
      expect(useProgressionStore.getState().purchasedUpgradeIds).not.toContain(MINIMAP_UPGRADE.id)
    })

    it('toggleMinimap flips minimapEnabled back and forth, independent of ownership', () => {
      const before = useProgressionStore.getState().minimapEnabled
      useProgressionStore.getState().toggleMinimap()
      expect(useProgressionStore.getState().minimapEnabled).toBe(!before)
      useProgressionStore.getState().toggleMinimap()
      expect(useProgressionStore.getState().minimapEnabled).toBe(before)
    })
  })

  it('growGraph advances graphNodeCount by the Expansion+Amplifier amount, which IS the level', () => {
    useProgressionStore.getState().growGraph()
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1)

    useProgressionStore.setState({ expansionLevel: 2 })
    useProgressionStore.getState().growGraph()
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1 + 3)
  })

  it('growGraph tracks the highest level ever reached', () => {
    useProgressionStore.getState().growGraph()
    useProgressionStore.getState().growGraph()
    expect(useProgressionStore.getState().highestGraphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 2)
  })

  it('growGraph keeps advancing from wherever the current level is, even below the highest reached', () => {
    useProgressionStore.getState().growGraph() // now at STARTING+1, highest STARTING+1
    useProgressionStore.getState().growGraph() // now at STARTING+2, highest STARTING+2
    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT) // replay from the start

    useProgressionStore.getState().growGraph() // solving the replayed level climbs forward again

    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1)
    expect(useProgressionStore.getState().highestGraphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 2) // unchanged — hasn't passed the old high yet
  })

  it('selectLevel jumps to any level from the start up to the highest reached, and no further', () => {
    useProgressionStore.getState().growGraph() // highest is now STARTING+1

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT + 1)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1)

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT + 999)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1) // unchanged, past the highest reached

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT - 1)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1) // unchanged, below the floor
  })

  it('refuses to purchase the same upgrade twice', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost * 2), highestGraphNodeCount: LEVEL_GATE_CLEARED })
    useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    const boughtAgain = useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    expect(boughtAgain).toBe(false)
    expect(useProgressionStore.getState().purchasedUpgradeIds).toEqual([upgrade.id])
  })

  it('does not auto-switch strategy on a second purchase, only the first', () => {
    const [first, second] = UPGRADES
    useProgressionStore.setState({
      currency: earn(createCurrency(), first.cost + second.cost),
      highestGraphNodeCount: LEVEL_GATE_CLEARED,
    })

    useProgressionStore.getState().purchaseUpgrade(first.id)
    expect(useProgressionStore.getState().activeStrategyId).toBe(first.strategyId)

    useProgressionStore.getState().purchaseUpgrade(second.id)
    expect(useProgressionStore.getState().activeStrategyId).toBe(first.strategyId) // unchanged
  })

  it('setActiveStrategy switches between owned strategies but refuses an unowned one', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost), highestGraphNodeCount: LEVEL_GATE_CLEARED })
    useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    useProgressionStore.getState().setActiveStrategy(DEFAULT_STRATEGY_ID)
    expect(useProgressionStore.getState().activeStrategyId).toBe(DEFAULT_STRATEGY_ID)

    useProgressionStore.getState().setActiveStrategy(upgrade.strategyId as string)
    expect(useProgressionStore.getState().activeStrategyId).toBe(upgrade.strategyId)

    const unownedUpgrade = UPGRADES[1]
    useProgressionStore.getState().setActiveStrategy(unownedUpgrade.strategyId as string)
    expect(useProgressionStore.getState().activeStrategyId).toBe(upgrade.strategyId) // unchanged, not owned
  })

  it('resetProgress restores currency, upgrades, strategy, levels, and every repeatable level to their starting values', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({
      currency: earn(
        createCurrency(),
        upgrade.cost +
          costForLevel(MOMENTUM_UPGRADE_INFO, 0) +
          costForLevel(NODE_MEMORY_UPGRADE_INFO, 0) +
          costForLevel(EXPANSION_UPGRADE_INFO, 0) +
          costForLevel(AMPLIFIER_UPGRADE_INFO, 0) +
          costForLevel(DEEP_MEMORY_UPGRADE_INFO, 0) +
          costForLevel(QUICK_STEPS_UPGRADE_INFO, 0) +
          costForLevel(SEARCHER_UPGRADE_INFO, 0) +
          costForLevel(DISCOVERY_BONUS_UPGRADE_INFO, 0) +
          costForLevel(REVISIT_BONUS_UPGRADE_INFO, 0) +
          costForLevel(EXIT_BONUS_UPGRADE_INFO, 0) +
          costForLevel(INSIGHT_MULTIPLIER_UPGRADE_INFO, 0) +
          CLARITY_UPGRADE.cost +
          MINIMAP_UPGRADE.cost,
      ),
      highestGraphNodeCount: LEVEL_GATE_CLEARED,
    })
    useProgressionStore.getState().purchaseUpgrade(upgrade.id)
    useProgressionStore.getState().purchaseMomentumLevel()
    useProgressionStore.getState().purchaseMemoryLevel()
    useProgressionStore.getState().purchaseExpansionLevel()
    useProgressionStore.getState().purchaseAmplifierLevel()
    useProgressionStore.getState().purchaseDeepMemoryLevel()
    useProgressionStore.getState().purchaseQuickStepsLevel()
    useProgressionStore.getState().purchaseSearcherLevel()
    useProgressionStore.getState().purchaseDiscoveryBonusLevel()
    useProgressionStore.getState().purchaseRevisitBonusLevel()
    useProgressionStore.getState().purchaseExitBonusLevel()
    useProgressionStore.getState().purchaseInsightMultiplierLevel()
    useProgressionStore.getState().purchaseClarity()
    useProgressionStore.getState().purchaseMinimap()
    useProgressionStore.getState().toggleMinimap() // now false, to confirm reset restores the default (true)
    useProgressionStore.getState().growGraph()

    useProgressionStore.getState().resetProgress()

    const state = useProgressionStore.getState()
    expect(state.currency.amount).toBe(0)
    expect(state.purchasedUpgradeIds).toEqual([])
    expect(state.activeStrategyId).toBe(DEFAULT_STRATEGY_ID)
    expect(state.graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
    expect(state.highestGraphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
    expect(state.momentumLevel).toBe(0)
    expect(state.memoryLevel).toBe(0)
    expect(state.expansionLevel).toBe(0)
    expect(state.amplifierLevel).toBe(0)
    expect(state.deepMemoryLevel).toBe(0)
    expect(state.quickStepsLevel).toBe(0)
    expect(state.searcherLevel).toBe(0)
    expect(state.discoveryBonusLevel).toBe(0)
    expect(state.revisitBonusLevel).toBe(0)
    expect(state.exitBonusLevel).toBe(0)
    expect(state.insightMultiplierLevel).toBe(0)
    expect(state.clarityLevel).toBe(0)
    expect(state.minimapEnabled).toBe(true)
  })
})
