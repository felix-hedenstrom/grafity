import { useState } from 'react'
import { ACHIEVEMENTS } from '../../game/achievements/definitions'
import {
  AMPLIFIER_PERCENT_PER_LEVEL,
  computeDiscoveryRewardPerNode,
  computeGoalRewardPerNode,
  computeInsightMultiplier,
  computeNodesPerSolve,
  computeRevisitReward,
  EXPANSION_NODES_PER_LEVEL,
} from '../../game/currency/rules'
import {
  BASE_DISTANCE_PER_SECOND,
  computeDiscoverWaitMs,
  computeDistancePerSecond,
  computeMomentumMultiplier,
  computeUfoSpeedRatio,
  QUICK_STEPS_PERCENT_PER_LEVEL,
  UFO_SPEED_MAX_LEVEL,
} from '../../game/speed/rules'
import { getStrategy } from '../../game/strategies'
import { computeEffectiveMemoryLevel, DEEP_MEMORY_PERCENT_PER_LEVEL } from '../../game/strategies/memory'
import {
  AMPLIFIER_UPGRADE_INFO,
  CLARITY_UPGRADE,
  DEEP_MEMORY_UPGRADE_INFO,
  DEFAULT_STRATEGY_ID,
  DISCOVER_WAIT_UPGRADE_INFO,
  DISCOVERY_BONUS_UPGRADE_INFO,
  EXIT_BONUS_UPGRADE_INFO,
  EXPANSION_UPGRADE_INFO,
  INSIGHT_MULTIPLIER_UPGRADE_INFO,
  MAIN_WALKER_SPEED_UPGRADE_INFO,
  MINIMAP_UPGRADE,
  MOMENTUM_UPGRADE_INFO,
  NODE_MEMORY_UPGRADE_INFO,
  QUICK_STEPS_UPGRADE_INFO,
  REVISIT_BONUS_UPGRADE_INFO,
  SEARCHER_UPGRADE_INFO,
  UFO_SPEED_UPGRADE_INFO,
  UPGRADES,
} from '../../game/upgrades/definitions'
import { costForLevel, type RepeatableUpgradeInfo } from '../../game/upgrades/scaling'
import { useNow } from '../../hooks/useNow'
import { useAchievementStore } from '../../store/useAchievementStore'
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

/** Whether a repeatable's NEXT level is currently affordable and (for the very first level) level-unlocked. */
function canAffordRepeatable(info: RepeatableUpgradeInfo, level: number, currencyAmount: number, highestLevel: number): boolean {
  if (level === 0 && highestLevel < info.minLevel) return false
  return currencyAmount >= costForLevel(info, level)
}

/** Whether a one-time upgrade (Clarity, Minimap) is currently affordable and level-unlocked, and not already owned. */
function canAffordOneTime(upgrade: { cost: number; minLevel: number }, owned: boolean, currencyAmount: number, highestLevel: number): boolean {
  if (owned) return false
  if (highestLevel < upgrade.minLevel) return false
  return currencyAmount >= upgrade.cost
}

const TABS = ['Algorithms', 'Insight', 'Memory', 'Growth', 'Speed', 'Display', 'Achievements'] as const
type Tab = (typeof TABS)[number]

/** How many upgrades are currently purchasable in each tab — drives the "(N)" badge, omitted entirely when N is 0. */
function usePurchasableCounts(): Partial<Record<Tab, number>> {
  const currency = useProgressionStore((s) => s.currency)
  const purchasedUpgradeIds = useProgressionStore((s) => s.purchasedUpgradeIds)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const expansionLevel = useProgressionStore((s) => s.expansionLevel)
  const amplifierLevel = useProgressionStore((s) => s.amplifierLevel)
  const quickStepsLevel = useProgressionStore((s) => s.quickStepsLevel)
  const discoverWaitLevel = useProgressionStore((s) => s.discoverWaitLevel)
  const momentumLevel = useProgressionStore((s) => s.momentumLevel)
  const searcherLevel = useProgressionStore((s) => s.searcherLevel)
  const mainWalkerSpeedLevel = useProgressionStore((s) => s.mainWalkerSpeedLevel)
  const ufoSpeedLevel = useProgressionStore((s) => s.ufoSpeedLevel)
  const clarityLevel = useProgressionStore((s) => s.clarityLevel)
  const insightMultiplierLevel = useProgressionStore((s) => s.insightMultiplierLevel)
  const discoveryBonusLevel = useProgressionStore((s) => s.discoveryBonusLevel)
  const revisitBonusLevel = useProgressionStore((s) => s.revisitBonusLevel)
  const exitBonusLevel = useProgressionStore((s) => s.exitBonusLevel)

  const amount = currency.amount
  const nextLockedUpgradeId = getNextLockedUpgradeId(purchasedUpgradeIds)
  const nextLockedUpgrade = UPGRADES.find((u) => u.id === nextLockedUpgradeId)

  return {
    Algorithms: nextLockedUpgrade && canAffordOneTime(nextLockedUpgrade, false, amount, highestGraphNodeCount) ? 1 : 0,
    Insight:
      Number(canAffordRepeatable(DISCOVERY_BONUS_UPGRADE_INFO, discoveryBonusLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(REVISIT_BONUS_UPGRADE_INFO, revisitBonusLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(EXIT_BONUS_UPGRADE_INFO, exitBonusLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(INSIGHT_MULTIPLIER_UPGRADE_INFO, insightMultiplierLevel, amount, highestGraphNodeCount)),
    Memory:
      Number(canAffordRepeatable(NODE_MEMORY_UPGRADE_INFO, memoryLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(DEEP_MEMORY_UPGRADE_INFO, deepMemoryLevel, amount, highestGraphNodeCount)),
    Growth:
      Number(canAffordRepeatable(EXPANSION_UPGRADE_INFO, expansionLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(AMPLIFIER_UPGRADE_INFO, amplifierLevel, amount, highestGraphNodeCount)),
    Speed:
      Number(canAffordRepeatable(QUICK_STEPS_UPGRADE_INFO, quickStepsLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(DISCOVER_WAIT_UPGRADE_INFO, discoverWaitLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(MOMENTUM_UPGRADE_INFO, momentumLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(SEARCHER_UPGRADE_INFO, searcherLevel, amount, highestGraphNodeCount)) +
      Number(
        (mainWalkerSpeedLevel > 0 || searcherLevel > 0) &&
          canAffordRepeatable(MAIN_WALKER_SPEED_UPGRADE_INFO, mainWalkerSpeedLevel, amount, highestGraphNodeCount),
      ) +
      Number(ufoSpeedLevel < UFO_SPEED_MAX_LEVEL && canAffordRepeatable(UFO_SPEED_UPGRADE_INFO, ufoSpeedLevel, amount, highestGraphNodeCount)),
    Display:
      Number(canAffordOneTime(CLARITY_UPGRADE, clarityLevel > 0, amount, highestGraphNodeCount)) +
      Number(canAffordOneTime(MINIMAP_UPGRADE, purchasedUpgradeIds.includes(MINIMAP_UPGRADE.id), amount, highestGraphNodeCount)),
  }
}

export function Shop() {
  const [activeTab, setActiveTab] = useState<Tab>('Algorithms')
  const unlockedCount = useAchievementStore((s) => s.unlockedIds.length)
  const purchasableCounts = usePurchasableCounts()

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {TABS.map((tab) => {
          const purchasableCount = purchasableCounts[tab] ?? 0
          const label =
            tab === 'Achievements' ? `${tab} (${unlockedCount}/${ACHIEVEMENTS.length})` : purchasableCount > 0 ? `${tab} (${purchasableCount})` : tab
          return (
            <button
              key={tab}
              type="button"
              className={[styles.tabButton, tab === activeTab ? styles.tabButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className={styles.tabContent}>
        {activeTab === 'Algorithms' && <AlgorithmsTab />}
        {activeTab === 'Insight' && <InsightTab />}
        {activeTab === 'Memory' && <MemoryTab />}
        {activeTab === 'Growth' && <GrowthTab />}
        {activeTab === 'Speed' && <SpeedTab />}
        {activeTab === 'Display' && <DisplayTab />}
        {activeTab === 'Achievements' && <AchievementsTab />}
      </div>
    </div>
  )
}

function AlgorithmsTab() {
  const currency = useProgressionStore((s) => s.currency)
  const purchasedUpgradeIds = useProgressionStore((s) => s.purchasedUpgradeIds)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseUpgrade = useProgressionStore((s) => s.purchaseUpgrade)
  const setActiveStrategy = useProgressionStore((s) => s.setActiveStrategy)

  const nextLockedUpgradeId = getNextLockedUpgradeId(purchasedUpgradeIds)

  return (
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
          const affordable = currency.amount >= upgrade.cost

          return (
            <UpgradeCard
              key={upgrade.id}
              name={upgrade.name}
              description={upgrade.description}
              isActive={isActive}
              onUse={owned ? () => setActiveStrategy(upgrade.strategyId as string) : undefined}
              cost={owned ? undefined : upgrade.cost}
              canAfford={affordable}
              onBuy={owned ? undefined : () => purchaseUpgrade(upgrade.id)}
              minLevel={upgrade.minLevel}
              highestLevel={highestGraphNodeCount}
            />
          )
        },
      )}
    </div>
  )
}

function InsightTab() {
  const currency = useProgressionStore((s) => s.currency)
  const discoveryBonusLevel = useProgressionStore((s) => s.discoveryBonusLevel)
  const revisitBonusLevel = useProgressionStore((s) => s.revisitBonusLevel)
  const exitBonusLevel = useProgressionStore((s) => s.exitBonusLevel)
  const insightMultiplierLevel = useProgressionStore((s) => s.insightMultiplierLevel)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseDiscoveryBonusLevel = useProgressionStore((s) => s.purchaseDiscoveryBonusLevel)
  const purchaseRevisitBonusLevel = useProgressionStore((s) => s.purchaseRevisitBonusLevel)
  const purchaseExitBonusLevel = useProgressionStore((s) => s.purchaseExitBonusLevel)
  const purchaseInsightMultiplierLevel = useProgressionStore((s) => s.purchaseInsightMultiplierLevel)

  const discoveryReward = computeDiscoveryRewardPerNode(discoveryBonusLevel)
  const revisitReward = computeRevisitReward(revisitBonusLevel)
  const goalReward = computeGoalRewardPerNode(exitBonusLevel)
  const multiplier = computeInsightMultiplier(insightMultiplierLevel)

  return (
    <div className={styles.shop}>
      <StatCard
        title="How Insight is earned"
        lines={[
          { label: 'Per node discovered', value: `+${discoveryReward.toFixed(2)}` },
          { label: 'Per revisit', value: `+${revisitReward.toFixed(2)}` },
          { label: 'Per node, on exit', value: `+${goalReward.toFixed(2)}` },
          { label: 'Overall multiplier', value: `×${multiplier.toFixed(2)}`, isTotal: true },
        ]}
      />
      <RepeatableUpgradeCard
        info={DISCOVERY_BONUS_UPGRADE_INFO}
        level={discoveryBonusLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseDiscoveryBonusLevel}
      />
      <RepeatableUpgradeCard
        info={REVISIT_BONUS_UPGRADE_INFO}
        level={revisitBonusLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseRevisitBonusLevel}
      />
      <RepeatableUpgradeCard
        info={EXIT_BONUS_UPGRADE_INFO}
        level={exitBonusLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseExitBonusLevel}
      />
      <RepeatableUpgradeCard
        info={INSIGHT_MULTIPLIER_UPGRADE_INFO}
        level={insightMultiplierLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseInsightMultiplierLevel}
      />
    </div>
  )
}

function MemoryTab() {
  const currency = useProgressionStore((s) => s.currency)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseMemoryLevel = useProgressionStore((s) => s.purchaseMemoryLevel)
  const purchaseDeepMemoryLevel = useProgressionStore((s) => s.purchaseDeepMemoryLevel)

  const strategy = getStrategy(activeStrategyId)
  const deepMultiplier = (1 + DEEP_MEMORY_PERCENT_PER_LEVEL) ** deepMemoryLevel
  const effectiveMemoryLevel = computeEffectiveMemoryLevel(memoryLevel, deepMemoryLevel, strategy.memoryMultiplier)

  return (
    <div className={styles.shop}>
      <StatCard
        title="Current Memory"
        lines={[
          { label: 'Node Memory level', value: `${memoryLevel}` },
          { label: 'Deep Memory bonus', value: `×${deepMultiplier.toFixed(2)}` },
          { label: `${strategy.name} multiplier`, value: `×${strategy.memoryMultiplier}` },
          { label: 'Steps remembered', value: `${effectiveMemoryLevel}`, isTotal: true },
        ]}
      />
      <RepeatableUpgradeCard
        info={NODE_MEMORY_UPGRADE_INFO}
        level={memoryLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseMemoryLevel}
      />
      <RepeatableUpgradeCard
        info={DEEP_MEMORY_UPGRADE_INFO}
        level={deepMemoryLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseDeepMemoryLevel}
      />
    </div>
  )
}

function GrowthTab() {
  const currency = useProgressionStore((s) => s.currency)
  const expansionLevel = useProgressionStore((s) => s.expansionLevel)
  const amplifierLevel = useProgressionStore((s) => s.amplifierLevel)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseExpansionLevel = useProgressionStore((s) => s.purchaseExpansionLevel)
  const purchaseAmplifierLevel = useProgressionStore((s) => s.purchaseAmplifierLevel)

  const amplifierMultiplier = (1 + AMPLIFIER_PERCENT_PER_LEVEL) ** amplifierLevel
  const nodesPerSolve = computeNodesPerSolve(expansionLevel, amplifierLevel)

  return (
    <div className={styles.shop}>
      <StatCard
        title="How growth works"
        lines={[
          { label: 'Base, per solve', value: '+1 node' },
          { label: 'Expansion bonus', value: `+${expansionLevel * EXPANSION_NODES_PER_LEVEL} nodes` },
          { label: 'Amplifier bonus', value: `×${amplifierMultiplier.toFixed(2)}` },
          { label: 'Nodes per solve', value: `${nodesPerSolve}`, isTotal: true },
        ]}
      />
      <RepeatableUpgradeCard
        info={EXPANSION_UPGRADE_INFO}
        level={expansionLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseExpansionLevel}
      />
      <RepeatableUpgradeCard
        info={AMPLIFIER_UPGRADE_INFO}
        level={amplifierLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseAmplifierLevel}
      />
    </div>
  )
}

function SpeedTab() {
  const currency = useProgressionStore((s) => s.currency)
  const quickStepsLevel = useProgressionStore((s) => s.quickStepsLevel)
  const discoverWaitLevel = useProgressionStore((s) => s.discoverWaitLevel)
  const momentumLevel = useProgressionStore((s) => s.momentumLevel)
  const searcherLevel = useProgressionStore((s) => s.searcherLevel)
  const mainWalkerSpeedLevel = useProgressionStore((s) => s.mainWalkerSpeedLevel)
  const ufoSpeedLevel = useProgressionStore((s) => s.ufoSpeedLevel)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseQuickStepsLevel = useProgressionStore((s) => s.purchaseQuickStepsLevel)
  const purchaseDiscoverWaitLevel = useProgressionStore((s) => s.purchaseDiscoverWaitLevel)
  const purchaseMomentumLevel = useProgressionStore((s) => s.purchaseMomentumLevel)
  const purchaseSearcherLevel = useProgressionStore((s) => s.purchaseSearcherLevel)
  const purchaseMainWalkerSpeedLevel = useProgressionStore((s) => s.purchaseMainWalkerSpeedLevel)
  const purchaseUfoSpeedLevel = useProgressionStore((s) => s.purchaseUfoSpeedLevel)
  const runStartedAt = useRunStore((s) => s.runStartedAt)

  const now = useNow()
  const elapsedSecondsThisRun = (now - runStartedAt) / 1000
  const quickStepsMultiplier = (1 + QUICK_STEPS_PERCENT_PER_LEVEL) ** quickStepsLevel
  const momentumMultiplier = computeMomentumMultiplier(momentumLevel, elapsedSecondsThisRun)
  const ufoSpeedRatio = computeUfoSpeedRatio(ufoSpeedLevel)
  const mainWalkerDistancePerSecond = computeDistancePerSecond({ quickStepsLevel, momentumLevel, elapsedSecondsThisRun, mainWalkerSpeedLevel }, true)
  const ufoDistancePerSecond = computeDistancePerSecond(
    { quickStepsLevel, momentumLevel, elapsedSecondsThisRun, mainWalkerSpeedLevel, ufoSpeedLevel },
    false,
  )
  const discoverWaitMs = computeDiscoverWaitMs(discoverWaitLevel)

  return (
    <div className={styles.shop}>
      <StatCard
        title="How speed is calculated"
        lines={[
          { label: 'Base speed', value: `${BASE_DISTANCE_PER_SECOND.toFixed(1)} distance/sec` },
          { label: 'Quick Steps', value: `×${quickStepsMultiplier.toFixed(2)}` },
          { label: 'Momentum (this run)', value: `×${momentumMultiplier.toFixed(2)}` },
          { label: 'UFO speed ratio', value: `${Math.round(ufoSpeedRatio * 100)}% of Spaceship speed` },
          { label: 'Current speed (Spaceship)', value: `${mainWalkerDistancePerSecond.toFixed(1)} distance/sec`, isTotal: true },
          { label: 'Current speed (UFOs)', value: `${ufoDistancePerSecond.toFixed(1)} distance/sec`, isTotal: true },
          { label: 'Discover wait', value: `${Math.round(discoverWaitMs)}ms`, isTotal: true },
        ]}
      />
      <RepeatableUpgradeCard
        info={MOMENTUM_UPGRADE_INFO}
        level={momentumLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseMomentumLevel}
      />
      <RepeatableUpgradeCard
        info={QUICK_STEPS_UPGRADE_INFO}
        level={quickStepsLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseQuickStepsLevel}
      />
      <RepeatableUpgradeCard
        info={DISCOVER_WAIT_UPGRADE_INFO}
        level={discoverWaitLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseDiscoverWaitLevel}
      />
      <RepeatableUpgradeCard
        info={SEARCHER_UPGRADE_INFO}
        level={searcherLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseSearcherLevel}
      />
      <RepeatableUpgradeCard
        info={MAIN_WALKER_SPEED_UPGRADE_INFO}
        level={mainWalkerSpeedLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseMainWalkerSpeedLevel}
        extraLock={{ locked: searcherLevel === 0, message: 'Requires Extra Searcher' }}
      />
      <RepeatableUpgradeCard
        info={UFO_SPEED_UPGRADE_INFO}
        level={ufoSpeedLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseUfoSpeedLevel}
      />
    </div>
  )
}

function DisplayTab() {
  const currency = useProgressionStore((s) => s.currency)
  const clarityLevel = useProgressionStore((s) => s.clarityLevel)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseClarity = useProgressionStore((s) => s.purchaseClarity)
  const minimapOwned = useProgressionStore((s) => s.purchasedUpgradeIds.includes(MINIMAP_UPGRADE.id))
  const minimapEnabled = useProgressionStore((s) => s.minimapEnabled)
  const purchaseMinimap = useProgressionStore((s) => s.purchaseMinimap)
  const toggleMinimap = useProgressionStore((s) => s.toggleMinimap)
  const clarityOwned = clarityLevel > 0

  return (
    <div className={styles.shop}>
      <UpgradeCard
        name={CLARITY_UPGRADE.name}
        description={CLARITY_UPGRADE.description}
        isActive={clarityOwned}
        onUse={undefined}
        cost={clarityOwned ? undefined : CLARITY_UPGRADE.cost}
        canAfford={currency.amount >= CLARITY_UPGRADE.cost}
        onBuy={clarityOwned ? undefined : purchaseClarity}
        minLevel={CLARITY_UPGRADE.minLevel}
        highestLevel={highestGraphNodeCount}
      />
      <UpgradeCard
        name={MINIMAP_UPGRADE.name}
        description={MINIMAP_UPGRADE.description}
        isActive={minimapEnabled}
        onUse={minimapOwned ? toggleMinimap : undefined}
        cost={minimapOwned ? undefined : MINIMAP_UPGRADE.cost}
        canAfford={currency.amount >= MINIMAP_UPGRADE.cost}
        onBuy={minimapOwned ? undefined : purchaseMinimap}
        minLevel={MINIMAP_UPGRADE.minLevel}
        highestLevel={highestGraphNodeCount}
      />
    </div>
  )
}

function AchievementsTab() {
  const unlockedIds = useAchievementStore((s) => s.unlockedIds)

  return (
    <div className={styles.shop}>
      {ACHIEVEMENTS.map((achievement) => {
        const unlocked = unlockedIds.includes(achievement.id)
        return (
          <div
            key={achievement.id}
            className={[styles.card, unlocked ? styles.activeCard : styles.lockedCard].filter(Boolean).join(' ')}
          >
            <div className={styles.name}>
              {unlocked ? '🏆 ' : ''}
              {achievement.name}
            </div>
            {unlocked && <div className={styles.description}>{achievement.description}</div>}
          </div>
        )
      })}
    </div>
  )
}

interface StatLine {
  label: string
  value: string
  isTotal?: boolean
}

interface StatCardProps {
  title: string
  lines: StatLine[]
}

/** A read-only breakdown of how some current number is actually computed — no buy button, just shows the math. */
function StatCard({ title, lines }: StatCardProps) {
  return (
    <div className={[styles.card, styles.statCard].join(' ')}>
      <div className={styles.name}>{title}</div>
      <div className={styles.statLines}>
        {lines.map((line) => (
          <div key={line.label} className={[styles.statLine, line.isTotal ? styles.statLineTotal : ''].filter(Boolean).join(' ')}>
            <span>{line.label}</span>
            <span>{line.value}</span>
          </div>
        ))}
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
  /** The level (graph node count) that must have been reached at least once to buy this — absent for Random Walk, which has no cost. */
  minLevel?: number
  highestLevel?: number
}

function UpgradeCard({ name, description, isActive, onUse, cost, canAfford, onBuy, minLevel, highestLevel }: UpgradeCardProps) {
  const levelLocked = minLevel !== undefined && (highestLevel ?? 0) < minLevel
  if (minLevel !== undefined && minLevel > (highestLevel ?? 0) * 1.5) return null

  return (
    <div className={[styles.card, isActive ? styles.activeCard : ''].filter(Boolean).join(' ')}>
      <div className={styles.name}>{name}</div>
      <div className={styles.description}>{description}</div>
      {onBuy ? (
        levelLocked ? (
          <button type="button" className={styles.buyButton} disabled>
            {`Unlocks at level ${minLevel}`}
          </button>
        ) : (
          <button type="button" className={styles.buyButton} disabled={!canAfford} onClick={onBuy}>
            {`Buy — ${cost}`}
          </button>
        )
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
  highestLevel: number
  onBuy: () => void
  /** An extra first-purchase-only gate beyond minLevel — e.g. Main Walker Speed requiring Extra Searcher to already be owned, since it has nothing to speed up otherwise. Ignored once level > 0. */
  extraLock?: { locked: boolean; message: string }
}

/** A passive stat with no owned/unowned identity, just a level — cost rises geometrically with each purchase. Uncapped unless info.maxLevel is set (e.g. UFO Speed), in which case the buy button becomes a disabled "Maxed" state once reached. minLevel (and extraLock, if given) only gate the very first purchase; once owned, further levels are cost-gated only. */
function RepeatableUpgradeCard({ info, level, currencyAmount, highestLevel, onBuy, extraLock }: RepeatableUpgradeCardProps) {
  const maxed = info.maxLevel !== undefined && level >= info.maxLevel
  const cost = maxed ? 0 : costForLevel(info, level)
  const levelLocked = level === 0 && highestLevel < info.minLevel
  const extraLocked = level === 0 && (extraLock?.locked ?? false)
  if (level === 0 && info.minLevel > highestLevel * 1.5) return null

  return (
    <div className={styles.card}>
      <div className={styles.name}>
        {info.name} (Lv {level})
      </div>
      <div className={styles.description}>{info.description}</div>
      {maxed ? (
        <button type="button" className={styles.buyButton} disabled>
          Maxed
        </button>
      ) : levelLocked || extraLocked ? (
        <button type="button" className={styles.buyButton} disabled>
          {levelLocked ? `Unlocks at level ${info.minLevel}` : extraLock?.message}
        </button>
      ) : (
        <button type="button" className={styles.buyButton} disabled={currencyAmount < cost} onClick={onBuy}>
          {`Buy — ${cost}`}
        </button>
      )}
    </div>
  )
}
