import { beforeEach, describe, expect, it } from 'vitest'
import { earn } from '../game/currency/rules'
import { NEBULA_UPGRADES } from '../game/prestige/rules'
import { costForLevel } from '../game/upgrades/scaling'
import { usePrestigeStore } from './usePrestigeStore'

const LEVEL_GATE_CLEARED = 10_000

beforeEach(() => {
  usePrestigeStore.getState().resetPrestige()
})

describe('usePrestigeStore', () => {
  it('starts with zero Nebulas and nothing owned', () => {
    const state = usePrestigeStore.getState()
    expect(state.nebulas.amount).toBe(0)
    expect(state.prestigeCount).toBe(0)
    expect(state.minimapOwned).toBe(false)
    expect(state.unlockUfoOwned).toBe(false)
    expect(state.mutexOwned).toBe(false)
  })

  it('recordPrestige earns Nebulas, bumps prestigeCount, and advances the lifetime high score', () => {
    usePrestigeStore.getState().recordPrestige(5, 100)
    let state = usePrestigeStore.getState()
    expect(state.nebulas.amount).toBe(5)
    expect(state.prestigeCount).toBe(1)
    expect(state.lifetimeHighestGraphNodeCount).toBe(100)

    // A smaller run afterward doesn't lower the lifetime high score.
    usePrestigeStore.getState().recordPrestige(2, 50)
    state = usePrestigeStore.getState()
    expect(state.nebulas.amount).toBe(7)
    expect(state.prestigeCount).toBe(2)
    expect(state.lifetimeHighestGraphNodeCount).toBe(100)
  })

  it('bumpLifetimeHighest only ever increases the lifetime high score', () => {
    usePrestigeStore.getState().bumpLifetimeHighest(50)
    expect(usePrestigeStore.getState().lifetimeHighestGraphNodeCount).toBe(50)
    usePrestigeStore.getState().bumpLifetimeHighest(20)
    expect(usePrestigeStore.getState().lifetimeHighestGraphNodeCount).toBe(50)
    usePrestigeStore.getState().bumpLifetimeHighest(80)
    expect(usePrestigeStore.getState().lifetimeHighestGraphNodeCount).toBe(80)
  })

  describe.each([
    ['purchaseMinimap', 'minimapOwned', NEBULA_UPGRADES.minimap] as const,
    ['purchaseUnlockUfo', 'unlockUfoOwned', NEBULA_UPGRADES.unlockUfo] as const,
    ['purchaseMutex', 'mutexOwned', NEBULA_UPGRADES.mutex] as const,
  ])('%s', (actionName, ownedField, upgrade) => {
    it('buys the permanent unlock once affordable and level-cleared, refusing a second purchase', () => {
      usePrestigeStore.setState({ nebulas: earn(usePrestigeStore.getState().nebulas, upgrade.cost), lifetimeHighestGraphNodeCount: LEVEL_GATE_CLEARED })

      expect(usePrestigeStore.getState()[actionName]()).toBe(true)
      expect(usePrestigeStore.getState()[ownedField]).toBe(true)
      expect(usePrestigeStore.getState().nebulas.amount).toBe(0)

      expect(usePrestigeStore.getState()[actionName]()).toBe(false)
    })

    it('refuses below its lifetime level requirement, even with enough Nebulas', () => {
      usePrestigeStore.setState({
        nebulas: earn(usePrestigeStore.getState().nebulas, upgrade.cost),
        lifetimeHighestGraphNodeCount: upgrade.minLevel - 1,
      })

      expect(usePrestigeStore.getState()[actionName]()).toBe(false)
      expect(usePrestigeStore.getState()[ownedField]).toBe(false)
    })

    it('refuses without enough Nebulas', () => {
      usePrestigeStore.setState({ lifetimeHighestGraphNodeCount: LEVEL_GATE_CLEARED })
      expect(usePrestigeStore.getState()[actionName]()).toBe(false)
      expect(usePrestigeStore.getState()[ownedField]).toBe(false)
    })
  })

  it('toggleMinimap/toggleMutex flip their enabled flags independent of ownership', () => {
    const before = usePrestigeStore.getState().minimapEnabled
    usePrestigeStore.getState().toggleMinimap()
    expect(usePrestigeStore.getState().minimapEnabled).toBe(!before)

    const beforeMutex = usePrestigeStore.getState().mutexEnabled
    usePrestigeStore.getState().toggleMutex()
    expect(usePrestigeStore.getState().mutexEnabled).toBe(!beforeMutex)
  })

  describe.each([
    ['purchaseNebulaInsightLevel', 'nebulaInsightLevel', NEBULA_UPGRADES.nebulaInsight] as const,
    ['purchaseFtlLevel', 'ftlLevel', NEBULA_UPGRADES.ftl] as const,
  ])('%s', (actionName, levelField, info) => {
    it('stacks levels, deducting a geometrically increasing Nebula cost each time', () => {
      const level0Cost = costForLevel(info, 0)
      const level1Cost = costForLevel(info, 1)
      expect(level1Cost).toBeGreaterThan(level0Cost)
      usePrestigeStore.setState({ nebulas: earn(usePrestigeStore.getState().nebulas, level0Cost + level1Cost) })

      expect(usePrestigeStore.getState()[actionName]()).toBe(true)
      expect(usePrestigeStore.getState()[levelField]).toBe(1)
      expect(usePrestigeStore.getState()[actionName]()).toBe(true)
      expect(usePrestigeStore.getState()[levelField]).toBe(2)
      expect(usePrestigeStore.getState().nebulas.amount).toBe(0)
    })

    it('refuses without enough Nebulas', () => {
      expect(usePrestigeStore.getState()[actionName]()).toBe(false)
      expect(usePrestigeStore.getState()[levelField]).toBe(0)
    })
  })

  it('purchaseFtlLevel has no max level — keeps succeeding far past the old cap while affordable', () => {
    const level = 40
    usePrestigeStore.setState({
      ftlLevel: level,
      nebulas: earn(usePrestigeStore.getState().nebulas, costForLevel(NEBULA_UPGRADES.ftl, level)),
    })
    expect(usePrestigeStore.getState().purchaseFtlLevel()).toBe(true)
    expect(usePrestigeStore.getState().ftlLevel).toBe(level + 1)
  })

  it('resetPrestige wipes Nebulas, prestige count, and every permanent purchase', () => {
    usePrestigeStore.setState({
      nebulas: earn(usePrestigeStore.getState().nebulas, 1000),
      lifetimeHighestGraphNodeCount: LEVEL_GATE_CLEARED,
    })
    usePrestigeStore.getState().purchaseNebulaInsightLevel()
    usePrestigeStore.getState().recordPrestige(3, 50)

    usePrestigeStore.getState().resetPrestige()

    const state = usePrestigeStore.getState()
    expect(state.nebulas.amount).toBe(0)
    expect(state.prestigeCount).toBe(0)
    expect(state.lifetimeHighestGraphNodeCount).toBe(7)
    expect(state.nebulaInsightLevel).toBe(0)
  })
})
