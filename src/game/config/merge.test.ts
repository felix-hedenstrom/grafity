import { describe, expect, it } from 'vitest'
import { computeDiscoveryRewardPerNode } from '../currency/rules'
import { mergeConfig } from './merge'
import { PRODUCTION_CONFIG } from './production'

describe('mergeConfig', () => {
  it('returns values identical to the base when the override is empty', () => {
    expect(mergeConfig(PRODUCTION_CONFIG, {})).toEqual(PRODUCTION_CONFIG)
  })

  it('replaces an overridden leaf without touching its siblings', () => {
    const merged = mergeConfig(PRODUCTION_CONFIG, { speed: { baseSpeedOfLight: 90 } })
    expect(merged.speed.baseSpeedOfLight).toBe(90)
    expect(merged.speed.minTickIntervalMs).toBe(PRODUCTION_CONFIG.speed.minTickIntervalMs)
    expect(merged.currency).toEqual(PRODUCTION_CONFIG.currency)
  })

  it('merges nested partials per-key, including the strategies record', () => {
    const merged = mergeConfig(PRODUCTION_CONFIG, {
      upgrades: { momentum: { cost: 40 }, strategies: { bfs: { cost: 999, minLevel: 1 } } },
    })
    expect(merged.upgrades.momentum.cost).toBe(40)
    expect(merged.upgrades.momentum.percentPerSecond).toBe(PRODUCTION_CONFIG.upgrades.momentum.percentPerSecond)
    expect(merged.upgrades.strategies.bfs).toEqual({ cost: 999, minLevel: 1 })
    expect(merged.upgrades.strategies.dijkstra).toEqual(PRODUCTION_CONFIG.upgrades.strategies.dijkstra)
  })

  it('never mutates the base config', () => {
    const before = JSON.parse(JSON.stringify(PRODUCTION_CONFIG))
    mergeConfig(PRODUCTION_CONFIG, { graph: { spacingAtReferenceCount: 1 } })
    expect(PRODUCTION_CONFIG).toEqual(before)
  })

  it('an overridden config actually reaches the balance functions', () => {
    const merged = mergeConfig(PRODUCTION_CONFIG, { currency: { discoveryRewardPerNode: 5 } })
    expect(computeDiscoveryRewardPerNode(0, merged)).toBe(5)
    expect(computeDiscoveryRewardPerNode(0)).toBe(PRODUCTION_CONFIG.currency.discoveryRewardPerNode)
  })
})
