import { useState } from 'react'
import { nebulasForGraphSize } from '../../game/currency/rules'
import { withSchedulerSuspended } from '../../game/loop/walkerScheduler'
import { NEBULA_UPGRADES, PRESTIGE_UNLOCK_LEVEL } from '../../game/prestige/rules'
import { costForLevel } from '../../game/upgrades/scaling'
import { sortByUnlockLevel } from '../../game/upgrades/ordering'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { useUiStore } from '../../store/useUiStore'
import { Modal } from '../Modal/Modal'
import shopStyles from '../Shop/Shop.module.css'
import styles from './PrestigeShopModal.module.css'

/** Every Nebula upgrade card, listed by unlock requirement ascending (sortByUnlockLevel) — the same ordering rule as the main shop, driven by each upgrade's own minLevel so it holds whatever the config says. Ties keep this declared order (Reverse Beacon after the Unlock UFO it needs). */
const PRESTIGE_UPGRADE_CARDS = sortByUnlockLevel(
  [
    { id: 'nebula-insight', minLevel: NEBULA_UPGRADES.nebulaInsight.minLevel, Card: NebulaInsightCard },
    { id: 'ftl', minLevel: NEBULA_UPGRADES.ftl.minLevel, Card: FtlCard },
    { id: 'unlock-ufo', minLevel: NEBULA_UPGRADES.unlockUfo.minLevel, Card: UnlockUfoCard },
    { id: 'minimap', minLevel: NEBULA_UPGRADES.minimap.minLevel, Card: MinimapCard },
    { id: 'mutex', minLevel: NEBULA_UPGRADES.mutex.minLevel, Card: MutexCard },
    { id: 'bidirectional', minLevel: NEBULA_UPGRADES.bidirectional.minLevel, Card: BidirectionalCard },
  ],
  (card) => card.minLevel,
)

export function PrestigeShopModal() {
  const prestigeShopOpen = useUiStore((s) => s.prestigeShopOpen)
  const closePrestigeShop = useUiStore((s) => s.closePrestigeShop)
  const prestigeUnlocked = usePrestigeStore((s) => s.lifetimeHighestGraphNodeCount >= PRESTIGE_UNLOCK_LEVEL)

  if (!prestigeShopOpen || !prestigeUnlocked) return null

  return (
    <Modal title="Prestige Shop" onClose={closePrestigeShop} className={styles.purplePanel}>
      <div className={shopStyles.shop}>
        <PrestigeCard />
        {PRESTIGE_UPGRADE_CARDS.map(({ id, Card }) => (
          <Card key={id} />
        ))}
      </div>
    </Modal>
  )
}

/** The purple info box: shows current Nebulas and the projected payout for prestiging right now, plus an explicit "are you sure?" step before actually doing it. */
function PrestigeCard() {
  const [confirming, setConfirming] = useState(false)
  const nebulas = usePrestigeStore((s) => s.nebulas)
  const prestigeCount = usePrestigeStore((s) => s.prestigeCount)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const prestige = useProgressionStore((s) => s.prestige)
  const projectedPayout = nebulasForGraphSize(highestGraphNodeCount)

  function handlePrestige() {
    withSchedulerSuspended(() => {
      prestige()
      useRunStore.getState().resetWithNewGraph()
    })
    setConfirming(false)
  }

  return (
    <div className={styles.prestigeInfoCard}>
      <div className={shopStyles.name}>Nebulas: {nebulas.amount}</div>
      <div className={shopStyles.description}>
        Prestige count: {prestigeCount}. Prestiging now resets currency, upgrades, and the level back to the start — everything else in
        this shop is permanent. You'd earn +{projectedPayout} Nebula{projectedPayout === 1 ? '' : 's'} right now.
      </div>
      {confirming ? (
        <>
          <div className={shopStyles.description}>Are you sure? This resets your current run.</div>
          <div className={shopStyles.buttonRow}>
            <button type="button" className={shopStyles.buyButton} onClick={handlePrestige}>
              Yes, prestige
            </button>
            <button type="button" className={shopStyles.buyButton} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" className={shopStyles.buyButton} onClick={() => setConfirming(true)}>
          Prestige now
        </button>
      )}
    </div>
  )
}

function MinimapCard() {
  const nebulaAmount = usePrestigeStore((s) => s.nebulas.amount)
  const lifetimeHighest = usePrestigeStore((s) => s.lifetimeHighestGraphNodeCount)
  const owned = usePrestigeStore((s) => s.minimapOwned)
  const enabled = usePrestigeStore((s) => s.minimapEnabled)
  const purchase = usePrestigeStore((s) => s.purchaseMinimap)
  const toggle = usePrestigeStore((s) => s.toggleMinimap)
  const levelLocked = !owned && lifetimeHighest < NEBULA_UPGRADES.minimap.minLevel

  return (
    <div className={[shopStyles.card, owned && enabled ? shopStyles.activeCard : ''].filter(Boolean).join(' ')}>
      <div className={shopStyles.name}>{NEBULA_UPGRADES.minimap.name}</div>
      <div className={shopStyles.description}>{NEBULA_UPGRADES.minimap.description}</div>
      {owned ? (
        <button type="button" className={shopStyles.buyButton} onClick={toggle}>
          {enabled ? 'On' : 'Off'}
        </button>
      ) : levelLocked ? (
        <button type="button" className={shopStyles.buyButton} disabled>
          {`Unlocks at level ${NEBULA_UPGRADES.minimap.minLevel}`}
        </button>
      ) : (
        <button type="button" className={shopStyles.buyButton} disabled={nebulaAmount < NEBULA_UPGRADES.minimap.cost} onClick={purchase}>
          {`Buy — ${NEBULA_UPGRADES.minimap.cost} Nebula${NEBULA_UPGRADES.minimap.cost === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}

function UnlockUfoCard() {
  const nebulaAmount = usePrestigeStore((s) => s.nebulas.amount)
  const lifetimeHighest = usePrestigeStore((s) => s.lifetimeHighestGraphNodeCount)
  const owned = usePrestigeStore((s) => s.unlockUfoOwned)
  const purchase = usePrestigeStore((s) => s.purchaseUnlockUfo)
  const levelLocked = !owned && lifetimeHighest < NEBULA_UPGRADES.unlockUfo.minLevel

  if (!owned && lifetimeHighest < NEBULA_UPGRADES.unlockUfo.minLevel * 1.5) return null

  return (
    <div className={[shopStyles.card, owned ? shopStyles.activeCard : ''].filter(Boolean).join(' ')}>
      <div className={shopStyles.name}>{NEBULA_UPGRADES.unlockUfo.name}</div>
      <div className={shopStyles.description}>{NEBULA_UPGRADES.unlockUfo.description}</div>
      {owned ? (
        <button type="button" className={shopStyles.buyButton} disabled>
          Owned
        </button>
      ) : levelLocked ? (
        <button type="button" className={shopStyles.buyButton} disabled>
          {`Unlocks at level ${NEBULA_UPGRADES.unlockUfo.minLevel}`}
        </button>
      ) : (
        <button type="button" className={shopStyles.buyButton} disabled={nebulaAmount < NEBULA_UPGRADES.unlockUfo.cost} onClick={purchase}>
          {`Buy — ${NEBULA_UPGRADES.unlockUfo.cost} Nebulas`}
        </button>
      )}
    </div>
  )
}

function MutexCard() {
  const nebulaAmount = usePrestigeStore((s) => s.nebulas.amount)
  const lifetimeHighest = usePrestigeStore((s) => s.lifetimeHighestGraphNodeCount)
  const owned = usePrestigeStore((s) => s.mutexOwned)
  const enabled = usePrestigeStore((s) => s.mutexEnabled)
  const purchase = usePrestigeStore((s) => s.purchaseMutex)
  const toggle = usePrestigeStore((s) => s.toggleMutex)
  const levelLocked = !owned && lifetimeHighest < NEBULA_UPGRADES.mutex.minLevel

  return (
    <div className={[shopStyles.card, owned && enabled ? shopStyles.activeCard : ''].filter(Boolean).join(' ')}>
      <div className={shopStyles.name}>{NEBULA_UPGRADES.mutex.name}</div>
      <div className={shopStyles.description}>{NEBULA_UPGRADES.mutex.description}</div>
      {owned ? (
        <button type="button" className={shopStyles.buyButton} onClick={toggle}>
          {enabled ? 'On' : 'Off'}
        </button>
      ) : levelLocked ? (
        <button type="button" className={shopStyles.buyButton} disabled>
          {`Unlocks at level ${NEBULA_UPGRADES.mutex.minLevel}`}
        </button>
      ) : (
        <button type="button" className={shopStyles.buyButton} disabled={nebulaAmount < NEBULA_UPGRADES.mutex.cost} onClick={purchase}>
          {`Buy — ${NEBULA_UPGRADES.mutex.cost} Nebulas`}
        </button>
      )}
    </div>
  )
}

/** Reverse Beacon — hidden until the player is within reach of its gate (same rule as UnlockUfoCard), and buyable only once Unlock UFO is owned, since it re-bases UFOs that otherwise don't exist. */
function BidirectionalCard() {
  const nebulaAmount = usePrestigeStore((s) => s.nebulas.amount)
  const lifetimeHighest = usePrestigeStore((s) => s.lifetimeHighestGraphNodeCount)
  const owned = usePrestigeStore((s) => s.bidirectionalOwned)
  const enabled = usePrestigeStore((s) => s.bidirectionalEnabled)
  const ufoOwned = usePrestigeStore((s) => s.unlockUfoOwned)
  const purchase = usePrestigeStore((s) => s.purchaseBidirectional)
  const toggle = usePrestigeStore((s) => s.toggleBidirectional)
  const levelLocked = !owned && lifetimeHighest < NEBULA_UPGRADES.bidirectional.minLevel

  if (!owned && lifetimeHighest < NEBULA_UPGRADES.bidirectional.minLevel * 1.5) return null

  return (
    <div className={[shopStyles.card, owned && enabled ? shopStyles.activeCard : ''].filter(Boolean).join(' ')}>
      <div className={shopStyles.name}>{NEBULA_UPGRADES.bidirectional.name}</div>
      <div className={shopStyles.description}>{NEBULA_UPGRADES.bidirectional.description}</div>
      {owned ? (
        <button type="button" className={shopStyles.buyButton} onClick={toggle}>
          {enabled ? 'On' : 'Off'}
        </button>
      ) : levelLocked ? (
        <button type="button" className={shopStyles.buyButton} disabled>
          {`Unlocks at level ${NEBULA_UPGRADES.bidirectional.minLevel}`}
        </button>
      ) : !ufoOwned ? (
        <button type="button" className={shopStyles.buyButton} disabled>
          Requires Unlock UFO
        </button>
      ) : (
        <button
          type="button"
          className={shopStyles.buyButton}
          disabled={nebulaAmount < NEBULA_UPGRADES.bidirectional.cost}
          onClick={purchase}
        >
          {`Buy — ${NEBULA_UPGRADES.bidirectional.cost} Nebulas`}
        </button>
      )}
    </div>
  )
}

function NebulaInsightCard() {
  const nebulaAmount = usePrestigeStore((s) => s.nebulas.amount)
  const level = usePrestigeStore((s) => s.nebulaInsightLevel)
  const purchase = usePrestigeStore((s) => s.purchaseNebulaInsightLevel)
  const cost = costForLevel(NEBULA_UPGRADES.nebulaInsight, level)

  return (
    <div className={shopStyles.card}>
      <div className={shopStyles.name}>
        {NEBULA_UPGRADES.nebulaInsight.name} (Lv {level})
      </div>
      <div className={shopStyles.description}>{NEBULA_UPGRADES.nebulaInsight.description}</div>
      <button type="button" className={shopStyles.buyButton} disabled={nebulaAmount < cost} onClick={purchase}>
        {`Buy — ${cost} Nebulas`}
      </button>
    </div>
  )
}

function FtlCard() {
  const nebulaAmount = usePrestigeStore((s) => s.nebulas.amount)
  const level = usePrestigeStore((s) => s.ftlLevel)
  const purchase = usePrestigeStore((s) => s.purchaseFtlLevel)
  const cost = costForLevel(NEBULA_UPGRADES.ftl, level)

  return (
    <div className={shopStyles.card}>
      <div className={shopStyles.name}>
        {NEBULA_UPGRADES.ftl.name} (Lv {level})
      </div>
      <div className={shopStyles.description}>{NEBULA_UPGRADES.ftl.description}</div>
      <button type="button" className={shopStyles.buyButton} disabled={nebulaAmount < cost} onClick={purchase}>
        {`Buy — ${cost} Nebulas`}
      </button>
    </div>
  )
}
