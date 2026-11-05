// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCurrency } from '../../game/currency/rules'
import { PRODUCTION_CONFIG } from '../../game/config/production'
import { NEBULA_UPGRADES } from '../../game/prestige/rules'
import { EXIT_AVOIDANCE, PULSAR_HUNTER, UPGRADE_INFOS, UPGRADES } from '../../game/upgrades/definitions'
import { sortByUnlockLevel } from '../../game/upgrades/ordering'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useUiStore } from '../../store/useUiStore'
import { PrestigeShopModal } from '../PrestigeShopModal/PrestigeShopModal'
import { Shop } from './Shop'

/**
 * Guards the shop ordering rule: in every tab (and the Prestige Shop), upgrade cards appear in
 * ascending unlock-requirement order. State is set so every card is visible at once.
 */

/** Card name → unlock requirement, for every upgrade the shops can show. */
const UNLOCK_LEVEL_BY_NAME = new Map<string, number>([
  ['Random Walk', 0],
  ...UPGRADES.map((u) => [u.name, u.minLevel] as [string, number]),
  ...Object.values(UPGRADE_INFOS).map((info) => [info.name, info.minLevel] as [string, number]),
  [PULSAR_HUNTER.name, PULSAR_HUNTER.minLevel],
  [EXIT_AVOIDANCE.name, EXIT_AVOIDANCE.minLevel],
  ...Object.values(NEBULA_UPGRADES).map((u) => [u.name, u.minLevel] as [string, number]),
])

/** Upgrade card names in DOM order — stat/info cards (not in the table) are skipped. Repeatable cards render as "Name (Lv N)". */
function upgradeCardNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class*="name"]')]
    .map((el) => (el.textContent ?? '').replace(/^🏆 /, '').replace(/ \(Lv \d+\)$/, ''))
    .filter((name) => UNLOCK_LEVEL_BY_NAME.has(name))
}

function expectAscending(names: string[]): void {
  const levels = names.map((name) => UNLOCK_LEVEL_BY_NAME.get(name)!)
  expect(names, `unlock levels ${levels.join(', ')}`).toEqual(sortByUnlockLevel(names, (name) => UNLOCK_LEVEL_BY_NAME.get(name)!))
}

beforeEach(() => {
  useProgressionStore.setState({
    highestGraphNodeCount: 100_000,
    graphNodeCount: 100_000,
    purchasedUpgradeIds: UPGRADES.map((u) => u.id),
    currency: createCurrency(),
  })
  usePrestigeStore.setState({ unlockUfoOwned: true, lifetimeHighestGraphNodeCount: 100_000 })
})

afterEach(cleanup)

describe('shop ordering', () => {
  it('sortByUnlockLevel sorts ascending and keeps declared order on ties', () => {
    const items = [
      { id: 'a', level: 30 },
      { id: 'b', level: 5 },
      { id: 'c', level: 30 },
      { id: 'd', level: 0 },
    ]
    expect(sortByUnlockLevel(items, (i) => i.level).map((i) => i.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('lists every main-shop tab by unlock requirement, ascending', () => {
    const { container } = render(<Shop />)
    const tabs = ['Algorithms', 'Insight', 'Algorithm Improvements', 'Growth', 'Speed', 'Scanner']
    let checkedCards = 0
    for (const tab of tabs) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${tab}`) }))
      const names = upgradeCardNames(container)
      expect(names.length, `${tab} tab shows upgrade cards`).toBeGreaterThan(0)
      expectAscending(names)
      checkedCards += names.length
    }
    expect(checkedCards).toBeGreaterThanOrEqual(UPGRADES.length + 1 + Object.keys(UPGRADE_INFOS).length + 2)
  })

  it('hides the Scanner tab until the Scanner Array unlocks', () => {
    useProgressionStore.setState({ highestGraphNodeCount: PRODUCTION_CONFIG.scannerWiring.unlockLevel - 1 })
    const { unmount } = render(<Shop />)
    expect(screen.queryByRole('button', { name: /^Scanner/ })).toBeNull()
    unmount()

    useProgressionStore.setState({ highestGraphNodeCount: PRODUCTION_CONFIG.scannerWiring.unlockLevel })
    render(<Shop />)
    fireEvent.click(screen.getByRole('button', { name: /^Scanner/ }))
    expect(screen.getByText(/Darkly-bot Servos/)).toBeTruthy()
  })

  it('lists the Prestige Shop by unlock requirement, ascending', () => {
    useUiStore.setState({ prestigeShopOpen: true })
    const { container } = render(<PrestigeShopModal />)
    const names = upgradeCardNames(container)
    expect(names).toHaveLength(Object.keys(NEBULA_UPGRADES).length)
    expectAscending(names)
  })
})
