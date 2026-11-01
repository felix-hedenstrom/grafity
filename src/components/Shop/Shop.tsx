import { BIDIRECTIONAL_THEOREM_COST, computeCostMultiplier } from '../../game/prestige/rules'
import { bidirectionalSearch } from '../../game/strategies'
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
} from '../../game/upgrades/definitions'
import { costForLevel, type RepeatableUpgradeInfo } from '../../game/upgrades/scaling'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import styles from './Shop.module.css'

/**
 * The single not-yet-owned algorithm to reveal next, in ascending cost order — only one locked
 * card is ever shown at a time, so the shop doesn't dump every algorithm on a new player at once.
 * Random Walk is always available and isn't part of this progression.
 */
function getNextLockedUpgradeId(purchasedUpgradeIds: string[]): string | undefined {
  return [...UPGRADES]
    .sort((a, b) => a.cost - b.cost)
    .find((upgrade) => !purchasedUpgradeIds.includes(upgrade.id))?.id
}

export function Shop() {
  const currency = useProgressionStore((s) => s.currency)
  const theorems = useProgressionStore((s) => s.theorems)
  const purchasedUpgradeIds = useProgressionStore((s) => s.purchasedUpgradeIds)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const bidirectionalUnlocked = useProgressionStore((s) => s.bidirectionalUnlocked)
  const momentumLevel = useProgressionStore((s) => s.momentumLevel)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const expansionLevel = useProgressionStore((s) => s.expansionLevel)
  const amplifierLevel = useProgressionStore((s) => s.amplifierLevel)
  const quickStepsLevel = useProgressionStore((s) => s.quickStepsLevel)
  const deeperRootsLevel = useProgressionStore((s) => s.deeperRootsLevel)
  const cheapProofsLevel = useProgressionStore((s) => s.cheapProofsLevel)
  const headStartLevel = useProgressionStore((s) => s.headStartLevel)
  const graphNodeCount = useProgressionStore((s) => s.graphNodeCount)
  const unlockedLevels = useProgressionStore((s) => s.unlockedLevels)
  const purchaseUpgrade = useProgressionStore((s) => s.purchaseUpgrade)
  const purchaseMomentumLevel = useProgressionStore((s) => s.purchaseMomentumLevel)
  const purchaseMemoryLevel = useProgressionStore((s) => s.purchaseMemoryLevel)
  const purchaseDeepMemoryLevel = useProgressionStore((s) => s.purchaseDeepMemoryLevel)
  const purchaseExpansionLevel = useProgressionStore((s) => s.purchaseExpansionLevel)
  const purchaseAmplifierLevel = useProgressionStore((s) => s.purchaseAmplifierLevel)
  const purchaseQuickStepsLevel = useProgressionStore((s) => s.purchaseQuickStepsLevel)
  const purchaseDeeperRootsLevel = useProgressionStore((s) => s.purchaseDeeperRootsLevel)
  const purchaseCheapProofsLevel = useProgressionStore((s) => s.purchaseCheapProofsLevel)
  const purchaseHeadStartLevel = useProgressionStore((s) => s.purchaseHeadStartLevel)
  const purchaseBidirectional = useProgressionStore((s) => s.purchaseBidirectional)
  const theoremsAvailable = useProgressionStore((s) => s.theoremsAvailable)
  const recompile = useProgressionStore((s) => s.recompile)
  const setActiveStrategy = useProgressionStore((s) => s.setActiveStrategy)
  const selectLevel = useProgressionStore((s) => s.selectLevel)
  const resetWithNewGraph = useRunStore((s) => s.resetWithNewGraph)

  const nextLockedUpgradeId = getNextLockedUpgradeId(purchasedUpgradeIds)
  const currentLevelIndex = unlockedLevels.indexOf(graphNodeCount)
  const costMultiplier = computeCostMultiplier(cheapProofsLevel)
  const insightCost = (baseCost: number) => Math.round(baseCost * costMultiplier)
  const pendingTheorems = theoremsAvailable()

  function goToLevel(nodeCount: number) {
    selectLevel(nodeCount)
    resetWithNewGraph()
  }

  function handleRecompile() {
    if (recompile()) resetWithNewGraph()
  }

  return (
    <div>
      <h2 className={styles.sectionHeading}>Level</h2>
      <div className={styles.shop}>
        <div className={styles.card}>
          <div className={styles.name}>
            Level {currentLevelIndex + 1} / {unlockedLevels.length}
          </div>
          <div className={styles.description}>
            {graphNodeCount} nodes. Replay any level you've already unlocked, or jump back to the frontier.
          </div>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.buyButton}
              disabled={currentLevelIndex <= 0}
              onClick={() => goToLevel(unlockedLevels[currentLevelIndex - 1])}
            >
              ◀ Prev
            </button>
            <button
              type="button"
              className={styles.buyButton}
              disabled={currentLevelIndex >= unlockedLevels.length - 1}
              onClick={() => goToLevel(unlockedLevels[currentLevelIndex + 1])}
            >
              Next ▶
            </button>
          </div>
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Algorithms</h2>
      <div className={styles.shop}>
        <UpgradeCard
          name="Random Walk"
          description="Picks a random edge every step. No pattern, no memory — the baseline every other upgrade improves on."
          isActive={activeStrategyId === DEFAULT_STRATEGY_ID}
          onUse={() => setActiveStrategy(DEFAULT_STRATEGY_ID)}
        />
        {UPGRADES.filter((upgrade) => purchasedUpgradeIds.includes(upgrade.id) || upgrade.id === nextLockedUpgradeId).map(
          (upgrade) => {
            const owned = purchasedUpgradeIds.includes(upgrade.id)
            const isActive = activeStrategyId === upgrade.strategyId
            const cost = insightCost(upgrade.cost)
            const affordable = currency.amount >= cost

            return (
              <UpgradeCard
                key={upgrade.id}
                name={upgrade.name}
                description={upgrade.description}
                isActive={isActive}
                onUse={owned ? () => setActiveStrategy(upgrade.strategyId as string) : undefined}
                cost={owned ? undefined : cost}
                canAfford={affordable}
                onBuy={owned ? undefined : () => purchaseUpgrade(upgrade.id)}
              />
            )
          },
        )}
      </div>

      <h2 className={styles.sectionHeading}>Memory</h2>
      <div className={styles.shop}>
        <RepeatableUpgradeCard
          info={NODE_MEMORY_UPGRADE_INFO}
          level={memoryLevel}
          currencyAmount={currency.amount}
          costMultiplier={costMultiplier}
          onBuy={() => purchaseMemoryLevel()}
        />
        <RepeatableUpgradeCard
          info={DEEP_MEMORY_UPGRADE_INFO}
          level={deepMemoryLevel}
          currencyAmount={currency.amount}
          costMultiplier={costMultiplier}
          onBuy={() => purchaseDeepMemoryLevel()}
        />
      </div>

      <h2 className={styles.sectionHeading}>Growth</h2>
      <div className={styles.shop}>
        <RepeatableUpgradeCard
          info={EXPANSION_UPGRADE_INFO}
          level={expansionLevel}
          currencyAmount={currency.amount}
          costMultiplier={costMultiplier}
          onBuy={() => purchaseExpansionLevel()}
        />
        <RepeatableUpgradeCard
          info={AMPLIFIER_UPGRADE_INFO}
          level={amplifierLevel}
          currencyAmount={currency.amount}
          costMultiplier={costMultiplier}
          onBuy={() => purchaseAmplifierLevel()}
        />
      </div>

      <h2 className={styles.sectionHeading}>Speed</h2>
      <div className={styles.shop}>
        <RepeatableUpgradeCard
          info={QUICK_STEPS_UPGRADE_INFO}
          level={quickStepsLevel}
          currencyAmount={currency.amount}
          costMultiplier={costMultiplier}
          onBuy={() => purchaseQuickStepsLevel()}
        />
        <RepeatableUpgradeCard
          info={MOMENTUM_UPGRADE_INFO}
          level={momentumLevel}
          currencyAmount={currency.amount}
          costMultiplier={costMultiplier}
          onBuy={() => purchaseMomentumLevel()}
        />
      </div>

      <h2 className={styles.sectionHeading}>Prestige</h2>
      <div className={styles.shop}>
        <div className={[styles.card, styles.prestigeCard].filter(Boolean).join(' ')}>
          <div className={styles.name}>Recompile — {theorems.amount} Theorems</div>
          <div className={styles.description}>
            Wipes the current graph, Insight, and every Insight-side level (Node Memory, Momentum, Expansion…) back to
            the start. Algorithm unlocks, Theorems, and every upgrade below survive. Recompiling now would earn{' '}
            <strong>{pendingTheorems}</strong> Theorem{pendingTheorems === 1 ? '' : 's'}.
          </div>
          <button type="button" className={styles.buyButton} disabled={pendingTheorems <= 0} onClick={handleRecompile}>
            {pendingTheorems > 0 ? `Recompile — +${pendingTheorems} Theorems` : 'Explore further first'}
          </button>
        </div>

        <UpgradeCard
          name="Bidirectional Search"
          description="Two walkers — one from the start, one from the exit — searching toward each other until they meet in the middle. A reward for completing the loop once, not a day-one purchase."
          isActive={activeStrategyId === bidirectionalSearch.id}
          onUse={bidirectionalUnlocked ? () => setActiveStrategy(bidirectionalSearch.id) : undefined}
          cost={bidirectionalUnlocked ? undefined : BIDIRECTIONAL_THEOREM_COST}
          canAfford={theorems.amount >= BIDIRECTIONAL_THEOREM_COST}
          onBuy={bidirectionalUnlocked ? undefined : () => purchaseBidirectional()}
          costUnit="Th"
        />

        <TheoremUpgradeCard
          info={DEEPER_ROOTS_UPGRADE_INFO}
          level={deeperRootsLevel}
          theoremsAmount={theorems.amount}
          onBuy={() => purchaseDeeperRootsLevel()}
        />
        <TheoremUpgradeCard
          info={CHEAP_PROOFS_UPGRADE_INFO}
          level={cheapProofsLevel}
          theoremsAmount={theorems.amount}
          onBuy={() => purchaseCheapProofsLevel()}
        />
        <TheoremUpgradeCard
          info={HEAD_START_UPGRADE_INFO}
          level={headStartLevel}
          theoremsAmount={theorems.amount}
          onBuy={() => purchaseHeadStartLevel()}
        />
      </div>
    </div>
  )
}

interface UpgradeCardProps {
  name: string
  description: string
  isActive: boolean
  onUse?: () => void
  cost?: number
  canAfford?: boolean
  onBuy?: () => void
  /** Appended after the cost number — e.g. "Th" for Theorem-priced items. Omit for the default (Insight, no suffix). */
  costUnit?: string
}

function UpgradeCard({ name, description, isActive, onUse, cost, canAfford, onBuy, costUnit }: UpgradeCardProps) {
  return (
    <div className={[styles.card, isActive ? styles.activeCard : ''].filter(Boolean).join(' ')}>
      <div className={styles.name}>{name}</div>
      <div className={styles.description}>{description}</div>
      {onBuy ? (
        <button type="button" className={styles.buyButton} disabled={!canAfford} onClick={onBuy}>
          {`Buy — ${cost}${costUnit ? ` ${costUnit}` : ''}`}
        </button>
      ) : (
        <button type="button" className={styles.buyButton} disabled={isActive} onClick={onUse}>
          {isActive ? 'Active' : 'Use'}
        </button>
      )}
    </div>
  )
}

interface RepeatableUpgradeCardProps {
  info: RepeatableUpgradeInfo
  level: number
  currencyAmount: number
  costMultiplier: number
  onBuy: () => void
}

/** A passive stat with no owned/unowned identity, just a level — cost rises geometrically with each purchase, then Cheap Proofs' flat discount is applied on top. No level cap; the rising cost is what throttles it. */
function RepeatableUpgradeCard({ info, level, currencyAmount, costMultiplier, onBuy }: RepeatableUpgradeCardProps) {
  const cost = Math.round(costForLevel(info, level) * costMultiplier)

  return (
    <div className={styles.card}>
      <div className={styles.name}>
        {info.name} (Lv {level})
      </div>
      <div className={styles.description}>{info.description}</div>
      <button type="button" className={styles.buyButton} disabled={currencyAmount < cost} onClick={onBuy}>
        {`Buy — ${cost}`}
      </button>
    </div>
  )
}

interface TheoremUpgradeCardProps {
  info: RepeatableUpgradeInfo
  level: number
  theoremsAmount: number
  onBuy: () => void
}

/** Same shape as RepeatableUpgradeCard, but priced and paid in Theorems — no Cheap Proofs discount applies here. */
function TheoremUpgradeCard({ info, level, theoremsAmount, onBuy }: TheoremUpgradeCardProps) {
  const cost = costForLevel(info, level)

  return (
    <div className={styles.card}>
      <div className={styles.name}>
        {info.name} (Lv {level})
      </div>
      <div className={styles.description}>{info.description}</div>
      <button type="button" className={styles.buyButton} disabled={theoremsAmount < cost} onClick={onBuy}>
        {`Buy — ${cost} Th`}
      </button>
    </div>
  )
}
