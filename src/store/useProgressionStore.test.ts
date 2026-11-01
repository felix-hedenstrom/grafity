import { beforeEach, describe, expect, it } from 'vitest'
import { createCurrency, earn } from '../game/currency/rules'
import { BIDIRECTIONAL_THEOREM_COST, CHEAP_PROOFS_PERCENT_PER_LEVEL } from '../game/prestige/rules'
import { bidirectionalSearch } from '../game/strategies'
import {
  AMPLIFIER_UPGRADE_INFO,
  CHEAP_PROOFS_UPGRADE_INFO,
  DEEP_MEMORY_UPGRADE_INFO,
  DEEPER_ROOTS_UPGRADE_INFO,
  DEFAULT_STRATEGY_ID,
  EXPANSION_UPGRADE_INFO,
  HEAD_START_UPGRADE_INFO,
  MOMENTUM_UPGRADE_INFO,
  NODE_MEMORY_UPGRADE_INFO,
  QUICK_STEPS_UPGRADE_INFO,
  UPGRADES,
} from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'
import { STARTING_GRAPH_NODE_COUNT, useProgressionStore } from './useProgressionStore'

beforeEach(() => {
  useProgressionStore.setState({
    currency: createCurrency(),
    theorems: createCurrency(),
    purchasedUpgradeIds: [],
    activeStrategyId: DEFAULT_STRATEGY_ID,
    bidirectionalUnlocked: false,
    graphNodeCount: STARTING_GRAPH_NODE_COUNT,
    unlockedLevels: [STARTING_GRAPH_NODE_COUNT],
    momentumLevel: 0,
    memoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    quickStepsLevel: 0,
    deeperRootsLevel: 0,
    cheapProofsLevel: 0,
    headStartLevel: 0,
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

  it('purchases an upgrade once affordable, deducting cost and activating its strategy', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost) })

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
  ])('%s', (actionName, levelField, info) => {
    it('stacks levels, deducting a geometrically increasing cost each time', () => {
      const level0Cost = costForLevel(info, 0)
      const level1Cost = costForLevel(info, 1)
      expect(level1Cost).toBeGreaterThan(level0Cost) // costs rise, not flat

      useProgressionStore.setState({ currency: earn(createCurrency(), level0Cost + level1Cost) })

      expect(useProgressionStore.getState()[actionName]()).toBe(true)
      expect(useProgressionStore.getState()[levelField]).toBe(1)
      expect(useProgressionStore.getState()[actionName]()).toBe(true)
      expect(useProgressionStore.getState()[levelField]).toBe(2)
      expect(useProgressionStore.getState().currency.amount).toBe(0)
    })

    it('refuses when currency runs out — no level cap to hit instead', () => {
      useProgressionStore.setState({ currency: createCurrency() })
      expect(useProgressionStore.getState()[actionName]()).toBe(false)
      expect(useProgressionStore.getState()[levelField]).toBe(0)
    })
  })

  it('growGraph advances the frontier by the Expansion+Amplifier amount when played at the frontier', () => {
    useProgressionStore.getState().growGraph()
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1)

    useProgressionStore.setState({ expansionLevel: 2 })
    useProgressionStore.getState().growGraph()
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1 + 3)
  })

  it('growGraph records each new frontier size in unlockedLevels', () => {
    useProgressionStore.getState().growGraph()
    useProgressionStore.getState().growGraph()
    expect(useProgressionStore.getState().unlockedLevels).toEqual([
      STARTING_GRAPH_NODE_COUNT,
      STARTING_GRAPH_NODE_COUNT + 1,
      STARTING_GRAPH_NODE_COUNT + 2,
    ])
  })

  it('growGraph does not advance the frontier when replaying an already-unlocked, non-frontier level', () => {
    useProgressionStore.getState().growGraph() // frontier is now STARTING+1
    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT) // go back to the first level

    useProgressionStore.getState().growGraph() // "solving" the old level again

    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT) // unchanged
    expect(useProgressionStore.getState().unlockedLevels).toEqual([STARTING_GRAPH_NODE_COUNT, STARTING_GRAPH_NODE_COUNT + 1]) // unchanged
  })

  it('selectLevel switches to any already-unlocked level but refuses an unreached size', () => {
    useProgressionStore.getState().growGraph() // unlocks STARTING+1

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT + 1)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1)

    useProgressionStore.getState().selectLevel(STARTING_GRAPH_NODE_COUNT + 999)
    expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT + 1) // unchanged, never unlocked
  })

  it('refuses to purchase the same upgrade twice', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost * 2) })
    useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    const boughtAgain = useProgressionStore.getState().purchaseUpgrade(upgrade.id)

    expect(boughtAgain).toBe(false)
    expect(useProgressionStore.getState().purchasedUpgradeIds).toEqual([upgrade.id])
  })

  it('does not auto-switch strategy on a second purchase, only the first', () => {
    const [first, second] = UPGRADES
    useProgressionStore.setState({ currency: earn(createCurrency(), first.cost + second.cost) })

    useProgressionStore.getState().purchaseUpgrade(first.id)
    expect(useProgressionStore.getState().activeStrategyId).toBe(first.strategyId)

    useProgressionStore.getState().purchaseUpgrade(second.id)
    expect(useProgressionStore.getState().activeStrategyId).toBe(first.strategyId) // unchanged
  })

  it('setActiveStrategy switches between owned strategies but refuses an unowned one', () => {
    const upgrade = UPGRADES[0]
    useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost) })
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
          costForLevel(QUICK_STEPS_UPGRADE_INFO, 0),
      ),
    })
    useProgressionStore.getState().purchaseUpgrade(upgrade.id)
    useProgressionStore.getState().purchaseMomentumLevel()
    useProgressionStore.getState().purchaseMemoryLevel()
    useProgressionStore.getState().purchaseExpansionLevel()
    useProgressionStore.getState().purchaseAmplifierLevel()
    useProgressionStore.getState().purchaseDeepMemoryLevel()
    useProgressionStore.getState().purchaseQuickStepsLevel()
    useProgressionStore.getState().growGraph()

    useProgressionStore.getState().resetProgress()

    const state = useProgressionStore.getState()
    expect(state.currency.amount).toBe(0)
    expect(state.purchasedUpgradeIds).toEqual([])
    expect(state.activeStrategyId).toBe(DEFAULT_STRATEGY_ID)
    expect(state.graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
    expect(state.unlockedLevels).toEqual([STARTING_GRAPH_NODE_COUNT])
    expect(state.momentumLevel).toBe(0)
    expect(state.memoryLevel).toBe(0)
    expect(state.expansionLevel).toBe(0)
    expect(state.amplifierLevel).toBe(0)
    expect(state.deepMemoryLevel).toBe(0)
    expect(state.quickStepsLevel).toBe(0)
  })

  describe('Cheap Proofs discount', () => {
    it('reduces every Insight-side cost by the configured percent per level', () => {
      const info = MOMENTUM_UPGRADE_INFO
      useProgressionStore.setState({ cheapProofsLevel: 1 })
      const discountedCost = costForLevel(info, 0) * (1 - CHEAP_PROOFS_PERCENT_PER_LEVEL)

      useProgressionStore.setState({ currency: earn(createCurrency(), Math.round(discountedCost)) })

      expect(useProgressionStore.getState().purchaseMomentumLevel()).toBe(true)
      expect(useProgressionStore.getState().currency.amount).toBeCloseTo(0, 0)
    })

    it('does not discount the Theorem-side meta-upgrades', () => {
      useProgressionStore.setState({ cheapProofsLevel: 5, theorems: earn(createCurrency(), costForLevel(DEEPER_ROOTS_UPGRADE_INFO, 0) - 1) })
      // One short of full price — should still fail, proving no discount applied here.
      expect(useProgressionStore.getState().purchaseDeeperRootsLevel()).toBe(false)
    })
  })

  describe('theoremsAvailable / recompile', () => {
    it('is zero until the frontier has grown past the starting size', () => {
      expect(useProgressionStore.getState().theoremsAvailable()).toBe(0)
      expect(useProgressionStore.getState().recompile()).toBe(false)
    })

    it('grants theorems and resets run-scoped levels, keeping unlocks and theorems', () => {
      const upgrade = UPGRADES[0]
      useProgressionStore.setState({
        unlockedLevels: [STARTING_GRAPH_NODE_COUNT, STARTING_GRAPH_NODE_COUNT + 16], // sqrt(16) = 4 theorems
        graphNodeCount: STARTING_GRAPH_NODE_COUNT + 16,
        currency: earn(createCurrency(), upgrade.cost + costForLevel(MOMENTUM_UPGRADE_INFO, 0)),
      })
      useProgressionStore.getState().purchaseUpgrade(upgrade.id)
      useProgressionStore.getState().purchaseMomentumLevel()

      expect(useProgressionStore.getState().theoremsAvailable()).toBe(4)
      expect(useProgressionStore.getState().recompile()).toBe(true)

      const state = useProgressionStore.getState()
      expect(state.theorems.amount).toBe(4)
      expect(state.currency.amount).toBe(0)
      expect(state.graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
      expect(state.unlockedLevels).toEqual([STARTING_GRAPH_NODE_COUNT])
      expect(state.momentumLevel).toBe(0)
      expect(state.purchasedUpgradeIds).toEqual([upgrade.id]) // kept
      expect(state.activeStrategyId).toBe(upgrade.strategyId) // kept
    })
  })

  describe('Theorem meta-upgrades', () => {
    it('purchaseDeeperRootsLevel raises the starting graph size recompile resets to, and survives the recompile', () => {
      useProgressionStore.setState({ theorems: earn(createCurrency(), costForLevel(DEEPER_ROOTS_UPGRADE_INFO, 0)) })
      expect(useProgressionStore.getState().purchaseDeeperRootsLevel()).toBe(true)
      expect(useProgressionStore.getState().deeperRootsLevel).toBe(1)

      // Grow the frontier enough to afford a recompile.
      useProgressionStore.setState({
        unlockedLevels: [STARTING_GRAPH_NODE_COUNT, STARTING_GRAPH_NODE_COUNT + 16],
        graphNodeCount: STARTING_GRAPH_NODE_COUNT + 16,
      })
      expect(useProgressionStore.getState().recompile()).toBe(true)

      const state = useProgressionStore.getState()
      expect(state.graphNodeCount).toBeGreaterThan(STARTING_GRAPH_NODE_COUNT) // boosted by Deeper Roots
      expect(state.deeperRootsLevel).toBe(1) // meta-upgrade level itself survives too

      // resetProgress is the nuclear option — it wipes Theorem meta-upgrades too, unlike recompile.
      state.resetProgress()
      expect(useProgressionStore.getState().deeperRootsLevel).toBe(0)
      expect(useProgressionStore.getState().graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
    })

    it('purchaseHeadStartLevel grants free starting Insight on the next recompile', () => {
      useProgressionStore.setState({ theorems: earn(createCurrency(), costForLevel(HEAD_START_UPGRADE_INFO, 0)) })
      useProgressionStore.getState().purchaseHeadStartLevel()

      useProgressionStore.setState({
        unlockedLevels: [STARTING_GRAPH_NODE_COUNT, STARTING_GRAPH_NODE_COUNT + 16],
        graphNodeCount: STARTING_GRAPH_NODE_COUNT + 16,
      })
      useProgressionStore.getState().recompile()

      expect(useProgressionStore.getState().currency.amount).toBeGreaterThan(0)
    })

    it('purchaseCheapProofsLevel stacks and refuses without enough theorems', () => {
      expect(useProgressionStore.getState().purchaseCheapProofsLevel()).toBe(false)

      useProgressionStore.setState({ theorems: earn(createCurrency(), costForLevel(CHEAP_PROOFS_UPGRADE_INFO, 0)) })
      expect(useProgressionStore.getState().purchaseCheapProofsLevel()).toBe(true)
      expect(useProgressionStore.getState().cheapProofsLevel).toBe(1)
    })
  })

  describe('purchaseBidirectional', () => {
    it('refuses without enough theorems, and does not unlock the strategy', () => {
      expect(useProgressionStore.getState().purchaseBidirectional()).toBe(false)
      expect(useProgressionStore.getState().bidirectionalUnlocked).toBe(false)
      expect(useProgressionStore.getState().setActiveStrategy(bidirectionalSearch.id))
      expect(useProgressionStore.getState().activeStrategyId).toBe(DEFAULT_STRATEGY_ID) // unchanged, not owned
    })

    it('unlocks and auto-activates on a fresh save, spending theorems', () => {
      useProgressionStore.setState({ theorems: earn(createCurrency(), 100) })

      expect(useProgressionStore.getState().purchaseBidirectional()).toBe(true)

      const state = useProgressionStore.getState()
      expect(state.bidirectionalUnlocked).toBe(true)
      expect(state.activeStrategyId).toBe(bidirectionalSearch.id)
      expect(state.theorems.amount).toBe(100 - BIDIRECTIONAL_THEOREM_COST)
    })

    it('does not auto-activate if a strategy is already owned', () => {
      const upgrade = UPGRADES[0]
      useProgressionStore.setState({ currency: earn(createCurrency(), upgrade.cost), theorems: earn(createCurrency(), 100) })
      useProgressionStore.getState().purchaseUpgrade(upgrade.id)

      useProgressionStore.getState().purchaseBidirectional()

      expect(useProgressionStore.getState().activeStrategyId).toBe(upgrade.strategyId) // unchanged
      expect(useProgressionStore.getState().bidirectionalUnlocked).toBe(true) // still unlocked, just not active
    })
  })
})
