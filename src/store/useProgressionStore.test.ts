import { beforeEach, describe, expect, it } from 'vitest'
import { createCurrency, earn } from '../game/currency/rules'
import { PRODUCTION_CONFIG } from '../game/config/production'
import { DEFAULT_STRATEGY_ID, UPGRADE_INFOS, UPGRADES } from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'
import { usePrestigeStore } from './usePrestigeStore'
import { STARTING_GRAPH_NODE_COUNT, STARTING_MEMORY_LEVEL, useProgressionStore } from './useProgressionStore'

/** Above every upgrade's minLevel (Swarm Search's 550 is the highest) — clears the level gate so tests unrelated to gating aren't blocked by it. */
const LEVEL_GATE_CLEARED = 10_000

beforeEach(() => {
  useProgressionStore.setState({
    currency: createCurrency(),
    purchasedUpgradeIds: [],
    activeStrategyId: DEFAULT_STRATEGY_ID,
    graphNodeCount: STARTING_GRAPH_NODE_COUNT,
    highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
    momentumOwned: false,
    memoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    searcherLevel: 0,
    discoveryBonusLevel: 0,
    revisitBonusLevel: 0,
    exitBonusLevel: 0,
    insightMultiplierLevel: 0,
  })
  usePrestigeStore.getState().resetPrestige()
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
    ['purchaseMemoryLevel', 'memoryLevel', UPGRADE_INFOS.nodeMemory] as const,
    ['purchaseExpansionLevel', 'expansionLevel', UPGRADE_INFOS.expansion] as const,
    ['purchaseAmplifierLevel', 'amplifierLevel', UPGRADE_INFOS.amplifier] as const,
    ['purchaseDeepMemoryLevel', 'deepMemoryLevel', UPGRADE_INFOS.deepMemory] as const,
    ['purchaseDiscoveryBonusLevel', 'discoveryBonusLevel', UPGRADE_INFOS.discoveryBonus] as const,
    ['purchaseRevisitBonusLevel', 'revisitBonusLevel', UPGRADE_INFOS.revisitBonus] as const,
    ['purchaseExitBonusLevel', 'exitBonusLevel', UPGRADE_INFOS.exitBonus] as const,
    ['purchaseInsightMultiplierLevel', 'insightMultiplierLevel', UPGRADE_INFOS.insightMultiplier] as const,
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

    // Node Memory is intentionally ungated (minLevel: 0) so it's purchasable right from the
    // start of a fresh run — this case has nothing to assert for it.
    it.skipIf(info.minLevel <= STARTING_GRAPH_NODE_COUNT)('refuses the first purchase below its level requirement, even with enough currency', () => {
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

  describe('purchaseMemoryLevel', () => {
    it('is purchasable at the very start of a fresh run, with no level grind required', () => {
      expect(UPGRADE_INFOS.nodeMemory.minLevel).toBeLessThanOrEqual(STARTING_GRAPH_NODE_COUNT)
      useProgressionStore.setState({
        currency: earn(createCurrency(), costForLevel(UPGRADE_INFOS.nodeMemory, 0)),
        highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
      })

      expect(useProgressionStore.getState().purchaseMemoryLevel()).toBe(true)
      expect(useProgressionStore.getState().memoryLevel).toBe(1)
    })
  })

  describe('purchaseSearcherLevel', () => {
    it('refuses while Unlock UFO is unowned, even with enough currency and level', () => {
      useProgressionStore.setState({
        currency: earn(createCurrency(), costForLevel(UPGRADE_INFOS.searcher, 0)),
        highestGraphNodeCount: LEVEL_GATE_CLEARED,
      })

      expect(useProgressionStore.getState().purchaseSearcherLevel()).toBe(false)
      expect(useProgressionStore.getState().searcherLevel).toBe(0)
    })

    it('stacks levels once Unlock UFO is owned, deducting a geometrically increasing cost each time', () => {
      usePrestigeStore.setState({ unlockUfoOwned: true })
      const level0Cost = costForLevel(UPGRADE_INFOS.searcher, 0)
      const level1Cost = costForLevel(UPGRADE_INFOS.searcher, 1)
      useProgressionStore.setState({
        currency: earn(createCurrency(), level0Cost + level1Cost),
        highestGraphNodeCount: LEVEL_GATE_CLEARED,
      })

      expect(useProgressionStore.getState().purchaseSearcherLevel()).toBe(true)
      expect(useProgressionStore.getState().searcherLevel).toBe(1)
      expect(useProgressionStore.getState().purchaseSearcherLevel()).toBe(true)
      expect(useProgressionStore.getState().searcherLevel).toBe(2)
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
    usePrestigeStore.setState({ unlockUfoOwned: true })
    useProgressionStore.setState({
      currency: earn(
        createCurrency(),
        upgrade.cost +
          PRODUCTION_CONFIG.upgrades.momentum.cost +
          costForLevel(UPGRADE_INFOS.nodeMemory, 0) +
          costForLevel(UPGRADE_INFOS.expansion, 0) +
          costForLevel(UPGRADE_INFOS.amplifier, 0) +
          costForLevel(UPGRADE_INFOS.deepMemory, 0) +
          costForLevel(UPGRADE_INFOS.searcher, 0) +
          costForLevel(UPGRADE_INFOS.discoveryBonus, 0) +
          costForLevel(UPGRADE_INFOS.revisitBonus, 0) +
          costForLevel(UPGRADE_INFOS.exitBonus, 0) +
          costForLevel(UPGRADE_INFOS.insightMultiplier, 0),
      ),
      highestGraphNodeCount: LEVEL_GATE_CLEARED,
    })
    useProgressionStore.getState().purchaseUpgrade(upgrade.id)
    useProgressionStore.getState().purchaseMomentum()
    useProgressionStore.getState().purchaseMemoryLevel()
    useProgressionStore.getState().purchaseExpansionLevel()
    useProgressionStore.getState().purchaseAmplifierLevel()
    useProgressionStore.getState().purchaseDeepMemoryLevel()
    useProgressionStore.getState().purchaseSearcherLevel()
    useProgressionStore.getState().purchaseDiscoveryBonusLevel()
    useProgressionStore.getState().purchaseRevisitBonusLevel()
    useProgressionStore.getState().purchaseExitBonusLevel()
    useProgressionStore.getState().purchaseInsightMultiplierLevel()
    useProgressionStore.getState().growGraph()

    useProgressionStore.getState().resetProgress()

    const state = useProgressionStore.getState()
    expect(state.currency.amount).toBe(0)
    expect(state.purchasedUpgradeIds).toEqual([])
    expect(state.activeStrategyId).toBe(DEFAULT_STRATEGY_ID)
    expect(state.graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
    expect(state.highestGraphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
    expect(state.momentumOwned).toBe(false)
    expect(state.memoryLevel).toBe(STARTING_MEMORY_LEVEL)
    expect(state.expansionLevel).toBe(0)
    expect(state.amplifierLevel).toBe(0)
    expect(state.deepMemoryLevel).toBe(0)
    expect(state.searcherLevel).toBe(0)
    expect(state.discoveryBonusLevel).toBe(0)
    expect(state.revisitBonusLevel).toBe(0)
    expect(state.exitBonusLevel).toBe(0)
    expect(state.insightMultiplierLevel).toBe(0)
  })

  describe('prestige', () => {
    it('pays out Nebulas via usePrestigeStore based on highestGraphNodeCount, then resets like resetProgress', () => {
      usePrestigeStore.setState({ unlockUfoOwned: true })
      useProgressionStore.setState({
        currency: earn(createCurrency(), 1000),
        highestGraphNodeCount: 107,
        graphNodeCount: 107,
        momentumOwned: true,
      })

      useProgressionStore.getState().prestige()

      const state = useProgressionStore.getState()
      expect(state.currency.amount).toBe(0)
      expect(state.graphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
      expect(state.highestGraphNodeCount).toBe(STARTING_GRAPH_NODE_COUNT)
      expect(state.momentumOwned).toBe(false)

      const prestige = usePrestigeStore.getState()
      expect(prestige.nebulas.amount).toBeGreaterThan(0)
      expect(prestige.prestigeCount).toBe(1)
      expect(prestige.lifetimeHighestGraphNodeCount).toBeGreaterThanOrEqual(107)
    })
  })
})

describe('purchaseMomentum', () => {
  const { cost, minLevel } = PRODUCTION_CONFIG.upgrades.momentum

  it('is a one-time unlock for 500 Insight at level 18', () => {
    expect(cost).toBe(500)
    expect(minLevel).toBe(18)
  })

  it('buys once, deducting its cost, then refuses a second purchase', () => {
    useProgressionStore.setState({ currency: earn(createCurrency(), cost * 2), highestGraphNodeCount: minLevel })
    expect(useProgressionStore.getState().purchaseMomentum()).toBe(true)
    expect(useProgressionStore.getState().momentumOwned).toBe(true)
    expect(useProgressionStore.getState().currency.amount).toBe(cost)
    expect(useProgressionStore.getState().purchaseMomentum()).toBe(false)
    expect(useProgressionStore.getState().currency.amount).toBe(cost)
  })

  it('refuses below its level requirement, even with enough currency', () => {
    useProgressionStore.setState({ currency: earn(createCurrency(), cost), highestGraphNodeCount: minLevel - 1 })
    expect(useProgressionStore.getState().purchaseMomentum()).toBe(false)
    expect(useProgressionStore.getState().momentumOwned).toBe(false)
  })

  it('refuses when it cannot be afforded', () => {
    useProgressionStore.setState({ currency: earn(createCurrency(), cost - 1), highestGraphNodeCount: minLevel })
    expect(useProgressionStore.getState().purchaseMomentum()).toBe(false)
    expect(useProgressionStore.getState().momentumOwned).toBe(false)
  })
})

describe('grafity-save-v1 migration', () => {
  /** Seeds a v0 persisted save and forces zustand to rehydrate it through the store's migrate(). */
  async function rehydrateV0(state: Record<string, unknown>): Promise<void> {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state, version: 0 }))
    await useProgressionStore.persist.rehydrate()
  }

  it('strips the removed bidirectional algorithm, refunds its 20000 Insight, and moves its user onto A*', async () => {
    await rehydrateV0({
      currency: { amount: 123 },
      purchasedUpgradeIds: ['bfs', 'a-star', 'bidirectional'],
      activeStrategyId: 'bidirectional',
    })

    const state = useProgressionStore.getState()
    expect(state.purchasedUpgradeIds).toEqual(['bfs', 'a-star'])
    expect(state.currency.amount).toBe(20123)
    expect(state.activeStrategyId).toBe('a-star')
  })

  it('strips the removed Least Visited Path, refunds 300, and falls back to Least Visited', async () => {
    await rehydrateV0({
      currency: { amount: 0 },
      purchasedUpgradeIds: ['least-visited-star', 'least-visited-path'],
      activeStrategyId: 'least-visited-path',
    })

    const state = useProgressionStore.getState()
    expect(state.purchasedUpgradeIds).toEqual(['least-visited-star'])
    expect(state.currency.amount).toBe(300)
    expect(state.activeStrategyId).toBe('least-visited-star')
  })

  it('leaves a save without the removed algorithms untouched', async () => {
    await rehydrateV0({
      currency: { amount: 50 },
      purchasedUpgradeIds: ['bfs'],
      activeStrategyId: 'bfs',
    })

    const state = useProgressionStore.getState()
    expect(state.purchasedUpgradeIds).toEqual(['bfs'])
    expect(state.currency.amount).toBe(50)
    expect(state.activeStrategyId).toBe('bfs')
  })
})

describe('repeatable Momentum migration', () => {
  it('turns any owned v2 Momentum level into the one-time unlock, and drops the old field', async () => {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { momentumLevel: 3 }, version: 2 }))
    await useProgressionStore.persist.rehydrate()
    expect(useProgressionStore.getState().momentumOwned).toBe(true)
    expect('momentumLevel' in useProgressionStore.getState()).toBe(false)
  })

  it('leaves Momentum unowned for a v2 save at level 0', async () => {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { momentumLevel: 0 }, version: 2 }))
    await useProgressionStore.persist.rehydrate()
    expect(useProgressionStore.getState().momentumOwned).toBe(false)
  })
})

describe('starting Node Memory', () => {
  it('a fresh cycle starts with the free Node Memory level, and prestige keeps granting it', () => {
    useProgressionStore.getState().resetProgress()
    expect(useProgressionStore.getState().memoryLevel).toBe(STARTING_MEMORY_LEVEL)
    expect(STARTING_MEMORY_LEVEL).toBeGreaterThanOrEqual(1)

    useProgressionStore.setState({ memoryLevel: 7 })
    useProgressionStore.getState().prestige()
    expect(useProgressionStore.getState().memoryLevel).toBe(STARTING_MEMORY_LEVEL)
  })

  it('tops up a v1 save that predates the free level, without touching higher levels', async () => {
    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { memoryLevel: 0 }, version: 1 }))
    await useProgressionStore.persist.rehydrate()
    expect(useProgressionStore.getState().memoryLevel).toBe(STARTING_MEMORY_LEVEL)

    localStorage.setItem('grafity-save-v1', JSON.stringify({ state: { memoryLevel: 5 }, version: 1 }))
    await useProgressionStore.persist.rehydrate()
    expect(useProgressionStore.getState().memoryLevel).toBe(5)
  })
})
