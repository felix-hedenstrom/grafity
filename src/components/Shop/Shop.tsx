import { Children, isValidElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ACHIEVEMENTS } from '../../game/achievements/definitions'
import {
  computeDiscoveryRewardPerNode,
  computeGoalRewardPerNode,
  computeInsightMultiplier,
  computeNodesPerSolve,
  computeRevisitReward,
} from '../../game/currency/rules'
import {
  computeAcceleration,
  computeDiscoverWaitMs,
  computeMomentumMultiplier,
  velocityAtElapsedMs,
} from '../../game/speed/rules'
import type { WalkerTransit } from '../../store/useRunStore'
import { getStrategy } from '../../game/strategies'
import { PRODUCTION_CONFIG } from '../../game/config/production'
import { computeEffectiveMemoryLevel } from '../../game/strategies/memory'
import { DEFAULT_STRATEGY_ID, EXIT_AVOIDANCE, MOMENTUM, PULSAR_HUNTER, UPGRADE_INFOS, UPGRADES } from '../../game/upgrades/definitions'
import { computeDarklyBotStepMs, isScannerArrayUnlocked } from '../../game/scannerWiring/rules'
import { sortByUnlockLevel } from '../../game/upgrades/ordering'
import { costForLevel, type RepeatableUpgradeInfo } from '../../game/upgrades/scaling'
import { useNow } from '../../hooks/useNow'
import { useAchievementStore } from '../../store/useAchievementStore'
import { computeFtlMultiplier } from '../../game/prestige/rules'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { useScannerWiringStore } from '../../store/useScannerWiringStore'
import styles from './Shop.module.css'

/**
 * The single not-yet-owned algorithm to reveal next, in ascending unlock-level order (cost breaks
 * ties) — only one locked card is ever shown at a time, so the shop doesn't dump every algorithm
 * on a new player at once. Random Walk is always available and isn't part of this progression.
 */
function getNextLockedUpgradeId(purchasedUpgradeIds: string[]): string | undefined {
  return sortByUnlockLevel(
    [...UPGRADES].sort((a, b) => a.cost - b.cost),
    (upgrade) => upgrade.minLevel,
  ).find((upgrade) => !purchasedUpgradeIds.includes(upgrade.id))?.id
}

/** A shop card's unlock requirement — RepeatableUpgradeCard carries it on info, UpgradeCard on minLevel; Random Walk (no requirement) counts as 0. */
function cardUnlockLevel(card: ReactElement): number {
  const props = card.props as { info?: RepeatableUpgradeInfo; minLevel?: number }
  return props.info?.minLevel ?? props.minLevel ?? 0
}

/** Renders a tab's upgrade cards sorted by unlock requirement, ascending (see sortByUnlockLevel) — every tab's purchasable cards go through this, so the order holds whatever the config says and wherever a new card is added. */
function UnlockOrdered({ children }: { children: ReactNode }) {
  const cards = Children.toArray(children).filter(isValidElement)
  return <>{sortByUnlockLevel(cards, cardUnlockLevel)}</>
}

/** Whether a repeatable's NEXT level is currently affordable and (for the very first level) level-unlocked. */
function canAffordRepeatable(info: RepeatableUpgradeInfo, level: number, currencyAmount: number, highestLevel: number): boolean {
  if (level === 0 && highestLevel < info.minLevel) return false
  return currencyAmount >= costForLevel(info, level)
}

/** Whether a one-time upgrade (Minimap) is currently affordable and level-unlocked, and not already owned. */
function canAffordOneTime(upgrade: { cost: number; minLevel: number }, owned: boolean, currencyAmount: number, highestLevel: number): boolean {
  if (owned) return false
  if (highestLevel < upgrade.minLevel) return false
  return currencyAmount >= upgrade.cost
}

const TABS = ['Algorithms', 'Insight', 'Algorithm Improvements', 'Growth', 'Speed', 'Scanner', 'Achievements'] as const
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
  const discoverWaitLevel = useProgressionStore((s) => s.discoverWaitLevel)
  const momentumOwned = useProgressionStore((s) => s.momentumOwned)
  const searcherLevel = useProgressionStore((s) => s.searcherLevel)
  const thrustersLevel = useProgressionStore((s) => s.thrustersLevel)
  const insightMultiplierLevel = useProgressionStore((s) => s.insightMultiplierLevel)
  const discoveryBonusLevel = useProgressionStore((s) => s.discoveryBonusLevel)
  const revisitBonusLevel = useProgressionStore((s) => s.revisitBonusLevel)
  const exitBonusLevel = useProgressionStore((s) => s.exitBonusLevel)
  const unlockUfoOwned = usePrestigeStore((s) => s.unlockUfoOwned)
  const darklyBotServosLevel = useProgressionStore((s) => s.darklyBotServosLevel)
  const pulsarHunterOwned = useProgressionStore((s) => s.pulsarHunterOwned)
  const exitAvoidanceOwned = useProgressionStore((s) => s.exitAvoidanceOwned)

  const amount = currency.amount
  const nextLockedUpgradeId = getNextLockedUpgradeId(purchasedUpgradeIds)
  const nextLockedUpgrade = UPGRADES.find((u) => u.id === nextLockedUpgradeId)

  return {
    Algorithms: nextLockedUpgrade && canAffordOneTime(nextLockedUpgrade, false, amount, highestGraphNodeCount) ? 1 : 0,
    Insight:
      Number(canAffordRepeatable(UPGRADE_INFOS.discoveryBonus, discoveryBonusLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(UPGRADE_INFOS.revisitBonus, revisitBonusLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(UPGRADE_INFOS.exitBonus, exitBonusLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(UPGRADE_INFOS.insightMultiplier, insightMultiplierLevel, amount, highestGraphNodeCount)),
    'Algorithm Improvements':
      Number(canAffordRepeatable(UPGRADE_INFOS.nodeMemory, memoryLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(UPGRADE_INFOS.deepMemory, deepMemoryLevel, amount, highestGraphNodeCount)) +
      Number(canAffordOneTime(PULSAR_HUNTER, pulsarHunterOwned, amount, highestGraphNodeCount)) +
      Number(canAffordOneTime(EXIT_AVOIDANCE, exitAvoidanceOwned, amount, highestGraphNodeCount)),
    Growth:
      Number(canAffordRepeatable(UPGRADE_INFOS.expansion, expansionLevel, amount, highestGraphNodeCount)) +
      Number(canAffordRepeatable(UPGRADE_INFOS.amplifier, amplifierLevel, amount, highestGraphNodeCount)),
    Speed:
      Number(canAffordRepeatable(UPGRADE_INFOS.discoverWait, discoverWaitLevel, amount, highestGraphNodeCount)) +
      Number(canAffordOneTime(MOMENTUM, momentumOwned, amount, highestGraphNodeCount)) +
      Number(unlockUfoOwned && canAffordRepeatable(UPGRADE_INFOS.searcher, searcherLevel, amount, highestGraphNodeCount)) +
      Number(
        thrustersLevel < UPGRADE_INFOS.thrusters.maxLevel! && canAffordRepeatable(UPGRADE_INFOS.thrusters, thrustersLevel, amount, highestGraphNodeCount),
      ),
    Scanner:
      Number(
        darklyBotServosLevel < UPGRADE_INFOS.darklyBotServos.maxLevel! &&
          canAffordRepeatable(UPGRADE_INFOS.darklyBotServos, darklyBotServosLevel, amount, highestGraphNodeCount),
      ),
  }
}

/** The Scanner tab (Darkly-bot Servos) stays hidden until the Scanner Array itself is unlocked — see isScannerArrayUnlocked. */
function useScannerUnlocked(): boolean {
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const sensorCount = useScannerWiringStore((s) => s.sensors.length)
  return isScannerArrayUnlocked(highestGraphNodeCount, sensorCount)
}

export function Shop() {
  const [selectedTab, setSelectedTab] = useState<Tab>('Algorithms')
  const unlockedCount = useAchievementStore((s) => s.unlockedIds.length)
  const purchasableCounts = usePurchasableCounts()
  const scannerUnlocked = useScannerUnlocked()
  const visibleTabs = TABS.filter((tab) => tab !== 'Scanner' || scannerUnlocked)
  // A prestige can re-lock the Scanner tab while it's selected — fall back rather than show a hidden tab.
  const activeTab = visibleTabs.includes(selectedTab) ? selectedTab : 'Algorithms'

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {visibleTabs.map((tab) => {
          const purchasableCount = purchasableCounts[tab] ?? 0
          const label =
            tab === 'Achievements' ? `${tab} (${unlockedCount}/${ACHIEVEMENTS.length})` : purchasableCount > 0 ? `${tab} (${purchasableCount})` : tab
          return (
            <button
              key={tab}
              type="button"
              className={[styles.tabButton, tab === activeTab ? styles.tabButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setSelectedTab(tab)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className={styles.tabContent}>
        {activeTab === 'Algorithms' && <AlgorithmsTab />}
        {activeTab === 'Insight' && <InsightTab />}
        {activeTab === 'Algorithm Improvements' && <AlgorithmImprovementsTab />}
        {activeTab === 'Growth' && <GrowthTab />}
        {activeTab === 'Speed' && <SpeedTab />}
        {activeTab === 'Scanner' && <ScannerTab />}
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
      <UnlockOrdered>
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
      </UnlockOrdered>
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
      <UnlockOrdered>
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.discoveryBonus}
          level={discoveryBonusLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseDiscoveryBonusLevel}
        />
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.revisitBonus}
          level={revisitBonusLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseRevisitBonusLevel}
        />
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.exitBonus}
          level={exitBonusLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseExitBonusLevel}
        />
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.insightMultiplier}
          level={insightMultiplierLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseInsightMultiplierLevel}
        />
      </UnlockOrdered>
    </div>
  )
}

function AlgorithmImprovementsTab() {
  const currency = useProgressionStore((s) => s.currency)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const purchaseMemoryLevel = useProgressionStore((s) => s.purchaseMemoryLevel)
  const purchaseDeepMemoryLevel = useProgressionStore((s) => s.purchaseDeepMemoryLevel)
  const pulsarHunterOwned = useProgressionStore((s) => s.pulsarHunterOwned)
  const pulsarHunterEnabled = useProgressionStore((s) => s.pulsarHunterEnabled)
  const purchasePulsarHunter = useProgressionStore((s) => s.purchasePulsarHunter)
  const togglePulsarHunter = useProgressionStore((s) => s.togglePulsarHunter)
  const exitAvoidanceOwned = useProgressionStore((s) => s.exitAvoidanceOwned)
  const exitAvoidanceEnabled = useProgressionStore((s) => s.exitAvoidanceEnabled)
  const purchaseExitAvoidance = useProgressionStore((s) => s.purchaseExitAvoidance)
  const toggleExitAvoidance = useProgressionStore((s) => s.toggleExitAvoidance)

  const strategy = getStrategy(activeStrategyId)
  const deepMultiplier = (1 + PRODUCTION_CONFIG.upgrades.deepMemory.percentPerLevel) ** deepMemoryLevel
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
      <UnlockOrdered>
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.nodeMemory}
          level={memoryLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseMemoryLevel}
        />
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.deepMemory}
          level={deepMemoryLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseDeepMemoryLevel}
        />
        <UpgradeCard
          name={PULSAR_HUNTER.name}
          description={PULSAR_HUNTER.description}
          isActive={pulsarHunterOwned && pulsarHunterEnabled}
          cost={pulsarHunterOwned ? undefined : PULSAR_HUNTER.cost}
          canAfford={currency.amount >= PULSAR_HUNTER.cost}
          onBuy={pulsarHunterOwned ? undefined : purchasePulsarHunter}
          onUse={togglePulsarHunter}
          isToggle
          minLevel={PULSAR_HUNTER.minLevel}
          highestLevel={highestGraphNodeCount}
        />
        <UpgradeCard
          name={EXIT_AVOIDANCE.name}
          description={EXIT_AVOIDANCE.description}
          isActive={exitAvoidanceOwned && exitAvoidanceEnabled}
          cost={exitAvoidanceOwned ? undefined : EXIT_AVOIDANCE.cost}
          canAfford={currency.amount >= EXIT_AVOIDANCE.cost}
          onBuy={exitAvoidanceOwned ? undefined : purchaseExitAvoidance}
          onUse={toggleExitAvoidance}
          isToggle
          minLevel={EXIT_AVOIDANCE.minLevel}
          highestLevel={highestGraphNodeCount}
        />
      </UnlockOrdered>
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

  const amplifierMultiplier = (1 + PRODUCTION_CONFIG.upgrades.amplifier.percentPerLevel) ** amplifierLevel
  const nodesPerSolve = computeNodesPerSolve(expansionLevel, amplifierLevel)

  return (
    <div className={styles.shop}>
      <StatCard
        title="How growth works"
        lines={[
          { label: 'Base, per solve', value: '+1 node' },
          { label: 'Expansion bonus', value: `+${expansionLevel * PRODUCTION_CONFIG.upgrades.expansion.nodesPerLevel} nodes` },
          { label: 'Amplifier bonus', value: `×${amplifierMultiplier.toFixed(2)}` },
          { label: 'Nodes per solve', value: `${nodesPerSolve}`, isTotal: true },
        ]}
      />
      <UnlockOrdered>
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.expansion}
          level={expansionLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseExpansionLevel}
        />
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.amplifier}
          level={amplifierLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseAmplifierLevel}
        />
      </UnlockOrdered>
    </div>
  )
}

/** The instantaneous speed right now — walking the actual accel/cruise/decel profile of the given transit if one is active, or the walker's resting speed (0 unless mid-pass-through) otherwise. */
function liveSpeed(transit: WalkerTransit | null, atRestSpeed: number, now: number, acceleration: number): number {
  if (!transit) return atRestSpeed
  return velocityAtElapsedMs(transit, now - transit.startedAt, acceleration)
}

function SpeedTab() {
  const currency = useProgressionStore((s) => s.currency)
  const discoverWaitLevel = useProgressionStore((s) => s.discoverWaitLevel)
  const momentumOwned = useProgressionStore((s) => s.momentumOwned)
  const searcherLevel = useProgressionStore((s) => s.searcherLevel)
  const thrustersLevel = useProgressionStore((s) => s.thrustersLevel)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const unlockUfoOwned = usePrestigeStore((s) => s.unlockUfoOwned)
  const ftlLevel = usePrestigeStore((s) => s.ftlLevel)
  const purchaseDiscoverWaitLevel = useProgressionStore((s) => s.purchaseDiscoverWaitLevel)
  const purchaseMomentum = useProgressionStore((s) => s.purchaseMomentum)
  const purchaseSearcherLevel = useProgressionStore((s) => s.purchaseSearcherLevel)
  const purchaseThrustersLevel = useProgressionStore((s) => s.purchaseThrustersLevel)
  const runStartedAt = useRunStore((s) => s.runStartedAt)
  const walkers = useRunStore((s) => s.walkers)
  const walkerTransits = useRunStore((s) => s.walkerTransits)
  const walkerSpeeds = useRunStore((s) => s.walkerSpeeds)

  const now = useNow()
  const elapsedSecondsThisRun = (now - runStartedAt) / 1000
  const momentumMultiplier = computeMomentumMultiplier(momentumOwned, elapsedSecondsThisRun)
  const speedOfLight = PRODUCTION_CONFIG.speed.baseSpeedOfLight * computeFtlMultiplier(ftlLevel)
  const discoverWaitMs = computeDiscoverWaitMs(discoverWaitLevel)
  const acceleration = computeAcceleration(thrustersLevel, momentumOwned, elapsedSecondsThisRun)

  // A UFO is any walker past walkers[0] — Reverse Beacon UFOs included, they're ordinary pool entries.
  const ufoTransit = walkers.length > 1 ? (walkerTransits[1] ?? null) : null
  const ufoAtRestSpeed = walkers.length > 1 ? (walkerSpeeds[1] ?? 0) : 0
  const mainSpeedLive = liveSpeed(walkerTransits[0] ?? null, walkerSpeeds[0] ?? 0, now, acceleration)
  const ufoSpeedLive = liveSpeed(ufoTransit, ufoAtRestSpeed, now, acceleration)
  const hasUfo = walkers.length > 1

  return (
    <div className={styles.shop}>
      <StatCard
        title="How speed is calculated"
        lines={[
          { label: 'Momentum (this run)', value: `×${momentumMultiplier.toFixed(2)}` },
          { label: 'Acceleration', value: `${acceleration.toFixed(1)} distance/sec²`, isTotal: true },
          { label: 'Speed (Spaceship)', value: `${mainSpeedLive.toFixed(1)} distance/sec`, isTotal: true },
          ...(unlockUfoOwned && hasUfo ? [{ label: 'Speed (UFOs)', value: `${ufoSpeedLive.toFixed(1)} distance/sec`, isTotal: true }] : []),
          { label: 'Top speed (speed of light)', value: `${speedOfLight.toFixed(1)} distance/sec`, isTotal: true },
          { label: 'Discover wait', value: `${Math.round(discoverWaitMs)}ms`, isTotal: true },
        ]}
      />
      <UnlockOrdered>
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.thrusters}
          level={thrustersLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseThrustersLevel}
        />
        <UpgradeCard
          name={MOMENTUM.name}
          description={MOMENTUM.description}
          isActive={momentumOwned}
          cost={momentumOwned ? undefined : MOMENTUM.cost}
          canAfford={currency.amount >= MOMENTUM.cost}
          onBuy={momentumOwned ? undefined : purchaseMomentum}
          minLevel={MOMENTUM.minLevel}
          highestLevel={highestGraphNodeCount}
        />
        <RepeatableUpgradeCard
          info={UPGRADE_INFOS.discoverWait}
          level={discoverWaitLevel}
          currencyAmount={currency.amount}
          highestLevel={highestGraphNodeCount}
          onBuy={purchaseDiscoverWaitLevel}
        />
        {unlockUfoOwned && (
          <RepeatableUpgradeCard
            info={UPGRADE_INFOS.searcher}
            level={searcherLevel}
            currencyAmount={currency.amount}
            highestLevel={highestGraphNodeCount}
            onBuy={purchaseSearcherLevel}
          />
        )}
      </UnlockOrdered>
    </div>
  )
}

function ScannerTab() {
  const currency = useProgressionStore((s) => s.currency)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const darklyBotServosLevel = useProgressionStore((s) => s.darklyBotServosLevel)
  const purchaseDarklyBotServosLevel = useProgressionStore((s) => s.purchaseDarklyBotServosLevel)

  return (
    <div className={styles.shop}>
      <StatCard
        title="Darkly-bot"
        lines={[{ label: 'Time between moves', value: `${(computeDarklyBotStepMs(darklyBotServosLevel) / 1000).toFixed(1)}s`, isTotal: true }]}
      />
      <RepeatableUpgradeCard
        info={UPGRADE_INFOS.darklyBotServos}
        level={darklyBotServosLevel}
        currencyAmount={currency.amount}
        highestLevel={highestGraphNodeCount}
        onBuy={purchaseDarklyBotServosLevel}
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
  /** Set for upgrades like Minimap/Traffic Control where onUse flips a true on/off flag, rather than selecting a strategy — keeps the button clickable (and relabeled On/Off) instead of disabling once active. */
  isToggle?: boolean
}

function UpgradeCard({ name, description, isActive, onUse, cost, canAfford, onBuy, minLevel, highestLevel, isToggle }: UpgradeCardProps) {
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
      ) : isToggle ? (
        <button type="button" className={styles.buyButton} onClick={onUse}>
          {isActive ? 'On' : 'Off'}
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
