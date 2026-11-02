import { describe, expect, it } from 'vitest'
import { UPGRADES } from '../upgrades/definitions'
import { ACHIEVEMENTS } from './definitions'
import { evaluateAchievements } from './evaluate'
import type { AchievementContext } from './types'

function baseContext(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    highestGraphNodeCount: 7,
    purchasedUpgradeIds: [],
    activeStrategyId: 'random-walk',
    defaultStrategyId: 'random-walk',
    momentumLevel: 0,
    memoryLevel: 0,
    deepMemoryLevel: 0,
    expansionLevel: 0,
    amplifierLevel: 0,
    quickStepsLevel: 0,
    searcherLevel: 0,
    clarityLevel: 0,
    currencyAmount: 0,
    discoveredCount: 0,
    totalNodes: 7,
    ...overrides,
  }
}

describe('ACHIEVEMENTS', () => {
  it('has a unique id for every achievement', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('evaluateAchievements', () => {
  it('returns nothing for a fresh context with every achievement already at its baseline', () => {
    expect(evaluateAchievements(baseContext(), [])).toEqual([])
  })

  it('unlocks first-solve once the highest level reached exceeds the starting size', () => {
    const newly = evaluateAchievements(baseContext({ highestGraphNodeCount: 8 }), [])
    expect(newly).toContain('first-solve')
  })

  it('never re-returns an id already in unlockedIds, even if its condition still holds', () => {
    const ctx = baseContext({ highestGraphNodeCount: 8 })
    expect(evaluateAchievements(ctx, ['first-solve'])).not.toContain('first-solve')
  })

  it('unlocks going-in-blind only while still on the default strategy past level 50', () => {
    const onDefault = baseContext({ highestGraphNodeCount: 50, activeStrategyId: 'random-walk' })
    expect(evaluateAchievements(onDefault, [])).toContain('going-in-blind')

    const switched = baseContext({ highestGraphNodeCount: 50, activeStrategyId: 'dfs' })
    expect(evaluateAchievements(switched, [])).not.toContain('going-in-blind')
  })

  it('unlocks algorithm-collector only once every strategy upgrade is owned', () => {
    const allButOne = baseContext({ purchasedUpgradeIds: UPGRADES.slice(0, -1).map((u) => u.id) })
    expect(evaluateAchievements(allButOne, [])).not.toContain('algorithm-collector')

    const all = baseContext({ purchasedUpgradeIds: UPGRADES.map((u) => u.id) })
    expect(evaluateAchievements(all, [])).toContain('algorithm-collector')
  })

  it('unlocks fully-loaded only once every repeatable has at least level 1', () => {
    const missingOne = baseContext({
      momentumLevel: 1,
      memoryLevel: 1,
      expansionLevel: 1,
      amplifierLevel: 1,
      deepMemoryLevel: 1,
      quickStepsLevel: 1,
      searcherLevel: 1,
      clarityLevel: 0, // the one holdout
    })
    expect(evaluateAchievements(missingOne, [])).not.toContain('fully-loaded')

    const allLeveled = baseContext({
      momentumLevel: 1,
      memoryLevel: 1,
      expansionLevel: 1,
      amplifierLevel: 1,
      deepMemoryLevel: 1,
      quickStepsLevel: 1,
      searcherLevel: 1,
      clarityLevel: 1,
    })
    expect(evaluateAchievements(allLeveled, [])).toContain('fully-loaded')
  })

  it('unlocks no-stone-unturned only once a large-enough graph is fully discovered', () => {
    const smallFull = baseContext({ totalNodes: 100, discoveredCount: 100 })
    expect(evaluateAchievements(smallFull, [])).not.toContain('no-stone-unturned')

    const bigFull = baseContext({ totalNodes: 500, discoveredCount: 500 })
    expect(evaluateAchievements(bigFull, [])).toContain('no-stone-unturned')

    const bigPartial = baseContext({ totalNodes: 500, discoveredCount: 499 })
    expect(evaluateAchievements(bigPartial, [])).not.toContain('no-stone-unturned')
  })

  it('can return multiple newly-qualifying achievements from one evaluation', () => {
    const ctx = baseContext({ highestGraphNodeCount: 100 })
    const newly = evaluateAchievements(ctx, [])
    expect(newly).toContain('first-solve')
    expect(newly).toContain('level-25')
    expect(newly).toContain('level-100')
  })
})
