/**
 * Headless replay of the core run loop (graph generation, pathfinding, speed, currency) without
 * React/Zustand/timers, so many playthroughs can be simulated fast and deterministically. Used to
 * balance how long a prestige cycle takes on average — see src/sim/cli.ts.
 *
 * Travel time uses the exact same rocket-style accel/cruise/decel physics as the live scheduler
 * (src/game/loop/walkerScheduler.ts), via the shared computeNextEdgeMotion (src/game/speed/rules.ts)
 * — entry velocity carries from one edge into the next, braking only when the destination node is
 * unvisited — so this simulator can't silently drift away from how the real game actually moves.
 *
 * Deliberately simulates a single walker only, starting every cycle from zero permanent Nebula
 * bonuses and with Unlock UFO (now a Nebula-only Prestige Shop purchase, see
 * src/game/prestige/rules.ts) never owned — Extra Searcher/Main Walker Speed/UFO Speed/Traffic
 * Control/Reverse Beacon are therefore never reachable in this baseline, exactly like a player's
 * very first cycle. That's the slowest, most representative cycle to tune against: later cycles
 * only get faster once Nebula-shop bonuses accumulate.
 *
 * The Scanner Array (src/game/scannerWiring/) runs alongside on the same cycle clock via
 * SimScanner (./simScanner.ts) — Darkly-bot exactly, plus one sensor per neutron star the walker
 * collects — and its multiplier scales every Insight credit, exactly like the live walkerScheduler.
 */
import {
  computeDiscoveryRewardPerNode,
  computeGoalRewardPerNode,
  computeInsightMultiplier,
  computeNodesPerSolve,
  computeRevisitReward,
  createCurrency,
  earn,
  spend,
} from '../game/currency/rules'
import type { CurrencyState } from '../game/currency/types'
import type { GameConfig } from '../game/config/types'
import { PRODUCTION_CONFIG } from '../game/config/production'
import { generatePlanarGraph } from '../game/graph/generatePlanar'
import { getEdgeWeight } from '../game/graph/types'
import { createDiscovery } from '../game/discovery/reveal'
import { commitHop, decideNextHop } from '../game/loop/searcherStep'
import type { RewardRates } from '../game/loop/searcherStep'
import { computeDiscoverWaitMs, computeNextEdgeMotion } from '../game/speed/rules'
import type { SpeedProgression } from '../game/speed/rules'
import { getStrategy } from '../game/strategies'
import { computeEffectiveMemoryLevel } from '../game/strategies/memory'
import { buildStrategyUpgrades, buildUpgradeInfos, DEFAULT_STRATEGY_ID } from '../game/upgrades/definitions'
import type { UpgradeInfos } from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'
import type { RepeatableUpgradeInfo } from '../game/upgrades/scaling'
import type { UpgradeDefinition } from '../game/upgrades/types'
import { createWalker } from '../game/walker/walkerLogic'
import type { Rng } from '../utils/rng'
import { mulberry32 } from '../utils/rng'
import { isScannerArrayUnlocked } from '../game/scannerWiring/rules'
import { SimScanner } from './simScanner'
import { withNeutronStars } from '../game/scannerWiring/neutronStars'
import { computeKeyCount, withKeys } from '../game/keys/keys'
import { pulsarOverrideHop } from '../game/loop/pulsarHunter'

/** Once a solve takes this many times longer than the cycle's early-game baseline, a rational player has clearly hit diminishing returns and would prestige — see Part C of the balance plan. */
export const DEFAULT_DIMINISHING_RETURNS_RATIO = 5


/** The baseline a solve's duration is compared against is the average of the first this-many solves, not just the first one — a single early solve is noisy enough (lucky short edges, an early discover-wait) to trip or never trip the ratio check on its own. */
const BASELINE_SOLVE_COUNT = 20

/** Safety valve for exploratory/baseline runs where the ratio never trips (e.g. before tuning) — without this an unbounded loop keeps growing the graph until the Poisson-disk sampler fails on an absurd node count. */
const MAX_GRAPH_NODE_COUNT = 3_000

interface SimState {
  currency: CurrencyState
  purchasedUpgradeIds: string[]
  activeStrategyId: string
  momentumOwned: boolean
  memoryLevel: number
  expansionLevel: number
  amplifierLevel: number
  deepMemoryLevel: number
  discoverWaitLevel: number
  thrustersLevel: number
  insightMultiplierLevel: number
  discoveryBonusLevel: number
  revisitBonusLevel: number
  exitBonusLevel: number
  darklyBotServosLevel: number
  pulsarHunterOwned: boolean
  exitAvoidanceOwned: boolean
}

function createSimState(config: GameConfig): SimState {
  return {
    currency: createCurrency(),
    purchasedUpgradeIds: [],
    activeStrategyId: DEFAULT_STRATEGY_ID,
    momentumOwned: false,
    memoryLevel: config.progression.startingMemoryLevel,
    expansionLevel: 0,
    amplifierLevel: 0,
    deepMemoryLevel: 0,
    discoverWaitLevel: 0,
    thrustersLevel: 0,
    insightMultiplierLevel: 0,
    discoveryBonusLevel: 0,
    revisitBonusLevel: 0,
    exitBonusLevel: 0,
    darklyBotServosLevel: 0,
    pulsarHunterOwned: false,
    exitAvoidanceOwned: false,
  }
}

/** The strategy-unlock list is ordered weakest-to-strongest by construction (buildStrategyUpgrades keeps a fixed id order, not a cost sort). */
function bestOwnedStrategyId(purchasedUpgradeIds: string[], upgrades: UpgradeDefinition[]): string {
  const owned = upgrades.filter((u) => purchasedUpgradeIds.includes(u.id))
  return owned.length > 0 ? (owned[owned.length - 1].strategyId as string) : DEFAULT_STRATEGY_ID
}

interface Candidate {
  cost: number
  apply: () => void
}

/** The sim's own catalogs, built once per cycle from whatever config is being tried — the live game's module-level UPGRADES/UPGRADE_INFOS are production-bound, so the sim never touches them. */
interface SimCatalog {
  upgrades: UpgradeDefinition[]
  infos: UpgradeInfos
  momentum: GameConfig['upgrades']['momentum']
  pulsarHunter: GameConfig['upgrades']['pulsarHunter']
  exitAvoidance: GameConfig['upgrades']['exitAvoidance']
}

/** Every upgrade a greedy player could buy right now, Nebula/UFO-gated ones excluded entirely (see module docstring). */
function buildCandidates(state: SimState, graphNodeCount: number, catalog: SimCatalog): Candidate[] {
  const candidates: Candidate[] = []

  for (const upgrade of catalog.upgrades) {
    if (state.purchasedUpgradeIds.includes(upgrade.id)) continue
    if (graphNodeCount < upgrade.minLevel) continue
    candidates.push({ cost: upgrade.cost, apply: () => state.purchasedUpgradeIds.push(upgrade.id) })
  }

  function repeatable(level: number, info: RepeatableUpgradeInfo, apply: () => void) {
    if (level === 0 && graphNodeCount < info.minLevel) return
    if (info.maxLevel !== undefined && level >= info.maxLevel) return
    candidates.push({ cost: costForLevel(info, level), apply })
  }

  const infos = catalog.infos
  repeatable(state.discoveryBonusLevel, infos.discoveryBonus, () => state.discoveryBonusLevel++)
  repeatable(state.revisitBonusLevel, infos.revisitBonus, () => state.revisitBonusLevel++)
  repeatable(state.exitBonusLevel, infos.exitBonus, () => state.exitBonusLevel++)
  repeatable(state.insightMultiplierLevel, infos.insightMultiplier, () => state.insightMultiplierLevel++)
  repeatable(state.memoryLevel, infos.nodeMemory, () => state.memoryLevel++)
  repeatable(state.deepMemoryLevel, infos.deepMemory, () => state.deepMemoryLevel++)
  repeatable(state.expansionLevel, infos.expansion, () => state.expansionLevel++)
  repeatable(state.amplifierLevel, infos.amplifier, () => state.amplifierLevel++)
  repeatable(state.discoverWaitLevel, infos.discoverWait, () => state.discoverWaitLevel++)
  repeatable(state.thrustersLevel, infos.thrusters, () => state.thrustersLevel++)
  repeatable(state.darklyBotServosLevel, infos.darklyBotServos, () => state.darklyBotServosLevel++)
  const momentum = catalog.momentum
  if (!state.momentumOwned && graphNodeCount >= momentum.minLevel) {
    candidates.push({ cost: momentum.cost, apply: () => (state.momentumOwned = true) })
  }
  const pulsarHunter = catalog.pulsarHunter
  if (!state.pulsarHunterOwned && graphNodeCount >= pulsarHunter.minLevel) {
    candidates.push({ cost: pulsarHunter.cost, apply: () => (state.pulsarHunterOwned = true) })
  }
  if (!state.exitAvoidanceOwned && graphNodeCount >= catalog.exitAvoidance.minLevel) {
    candidates.push({ cost: catalog.exitAvoidance.cost, apply: () => (state.exitAvoidanceOwned = true) })
  }

  return candidates
}

/** Repeatedly buys whichever currently-unlocked upgrade is cheapest, until nothing affordable is left — the "greedy cheapest-first" player policy. */
function greedyPurchaseAll(state: SimState, graphNodeCount: number, catalog: SimCatalog): void {
  for (;;) {
    const affordable = buildCandidates(state, graphNodeCount, catalog).filter((c) => c.cost <= state.currency.amount)
    if (affordable.length === 0) return
    affordable.sort((a, b) => a.cost - b.cost)
    affordable[0].apply()
    state.currency = spend(state.currency, affordable[0].cost)
    state.activeStrategyId = bestOwnedStrategyId(state.purchasedUpgradeIds, catalog.upgrades)
  }
}

function rewardRatesFor(state: SimState, config: GameConfig): RewardRates {
  return {
    discoveryPerNode: computeDiscoveryRewardPerNode(state.discoveryBonusLevel, config),
    revisit: computeRevisitReward(state.revisitBonusLevel, config),
    goalPerNode: computeGoalRewardPerNode(state.exitBonusLevel, config),
  }
}

export interface CycleResult {
  /** Total simulated wall-clock time for the whole cycle, in ms, from a fresh level 7 graph to the diminishing-returns prestige point. */
  cycleMs: number
  solves: number
  finalGraphNodeCount: number
  /** Scanner Array state when the cycle ends: sensors gathered from neutron stars, and how clean Darkly-bot has the loop. */
  finalSensors: number
  finalClarity: number
  finalScannerMultiplier: number
}

function scannerSummary(scanner: SimScanner, nowMs: number, servosLevel: number): Pick<CycleResult, 'finalSensors' | 'finalClarity' | 'finalScannerMultiplier'> {
  scanner.advanceTo(nowMs, servosLevel)
  return { finalSensors: scanner.sensorCount, finalClarity: scanner.clarity, finalScannerMultiplier: scanner.multiplier() }
}

/** Simulates one full prestige cycle: fresh state at the config's startingGraphNodeCount, greedily buying upgrades after every hop, until a solve takes diminishingReturnsRatio times longer than the cycle's first solve. Pass a merged config (see config/merge.ts) to try an alternate balance without touching game code. */
export function simulateOneCycle(
  seed: number,
  diminishingReturnsRatio = DEFAULT_DIMINISHING_RETURNS_RATIO,
  config: GameConfig = PRODUCTION_CONFIG,
): CycleResult {
  const rng: Rng = mulberry32(seed)
  const state = createSimState(config)
  const catalog: SimCatalog = { upgrades: buildStrategyUpgrades(config), infos: buildUpgradeInfos(config), momentum: config.upgrades.momentum, pulsarHunter: config.upgrades.pulsarHunter, exitAvoidance: config.upgrades.exitAvoidance }
  // Its own rng stream (board + neutron star placement), so the Scanner Array never perturbs the graph sequence a seed produces.
  const scannerRng = mulberry32(seed + 1_000_003)
  const scanner = new SimScanner(scannerRng, config)
  // Keys get their own stream too, so adding or retuning them never shifts the graphs or the scanner a seed produces.
  const keyRng = mulberry32(seed + 2_000_003)
  let graphNodeCount = config.progression.startingGraphNodeCount
  let cycleMs = 0
  const earlySolveDurationsMs: number[] = []
  let baselineMs: number | null = null
  let solves = 0

  for (;;) {
    // The live Hud button appears the moment highestGraphNodeCount reaches the unlock level — i.e. when this graph starts.
    if (isScannerArrayUnlocked(graphNodeCount, scanner.sensorCount, config)) scanner.unlock(cycleMs)
    const neutronStarCount = scanner.isUnlocked ? config.scannerWiring.neutronStarsPerLevel : 0
    const graph = withKeys(
      withNeutronStars(generatePlanarGraph(graphNodeCount, rng, config), neutronStarCount, scannerRng),
      computeKeyCount(graphNodeCount, config),
      keyRng,
    )
    const neutronStarIds = new Set(graph.nodes.filter((n) => n.isNeutronStar).map((n) => n.id))
    let discovery = createDiscovery(graph, graph.startNodeId)
    let walker = createWalker(graph.startNodeId)
    let strategyMemory = getStrategy(state.activeStrategyId).createMemory?.()
    let loadedStrategyId = state.activeStrategyId
    let sharedMemory = getStrategy(state.activeStrategyId).createSharedMemory?.()
    const sharedRecentPath: string[] = []
    let runElapsedMs = 0
    let v0 = 0

    while (!walker.hasReachedGoal) {
      const strategy = getStrategy(state.activeStrategyId)
      // Mirror the live scheduler's switchStrategy: shared scratch never carries across strategies.
      if (state.activeStrategyId !== loadedStrategyId) {
        loadedStrategyId = state.activeStrategyId
        strategyMemory = strategy.createMemory?.()
        sharedMemory = strategy.createSharedMemory?.()
      }
      const memoryLevel = computeEffectiveMemoryLevel(state.memoryLevel, state.deepMemoryLevel, strategy.memoryMultiplier, config)
      // Like the live scheduler: Pulsar Hunter / Exit Avoidance (always switched on once bought) outrank the algorithm.
      const huntHop = pulsarOverrideHop(graph, discovery, walker, { pulsarHunter: state.pulsarHunterOwned, exitAvoidance: state.exitAvoidanceOwned })
      let nextNodeId: string
      if (huntHop !== null) {
        nextNodeId = huntHop
      } else {
        const decided = decideNextHop({
          graph,
          discovery,
          walker,
          strategy,
          memory: strategyMemory,
          memoryLevel,
          sharedRecentPath,
          walkerIndex: 0,
          sharedMemory,
        })
        strategyMemory = decided.memory
        nextNodeId = decided.nextNodeId
      }
      sharedRecentPath.push(walker.currentNodeId)

      const edgeWeight = getEdgeWeight(graph, walker.currentNodeId, nextNodeId)
      const mustStop = !discovery.visitedNodeIds.has(nextNodeId)
      const speedProgression: SpeedProgression = {
        momentumOwned: state.momentumOwned,
        elapsedSecondsThisRun: runElapsedMs / 1000,
        thrustersLevel: state.thrustersLevel,
      }
      const motion = computeNextEdgeMotion(speedProgression, v0, edgeWeight, mustStop, config)
      v0 = motion.exitVelocity
      runElapsedMs += motion.travelMs
      cycleMs += motion.travelMs

      const result = commitHop({ graph, discovery, walker, nextNodeId, rewardRates: rewardRatesFor(state, config) })
      if (!result.wasAlreadyVisited && neutronStarIds.has(nextNodeId)) {
        scanner.advanceTo(cycleMs, state.darklyBotServosLevel)
        scanner.collectNeutronStar(cycleMs)
      }
      discovery = result.discovery
      walker = result.walker

      if (result.currencyEarned > 0) {
        scanner.advanceTo(cycleMs, state.darklyBotServosLevel)
        state.currency = earn(state.currency, result.currencyEarned * computeInsightMultiplier(state.insightMultiplierLevel, config) * scanner.multiplier())
      }

      // Like the live scheduler: the winning hop gets no scan pause — the celebration hold (added per solve below) replaces it.
      const waitMs = result.wasAlreadyVisited || result.goalReached ? 0 : computeDiscoverWaitMs(state.discoverWaitLevel, config)
      runElapsedMs += waitMs
      cycleMs += waitMs
      // Like the live scheduler: a discovering walker stands still, even if it came in too hot to fully brake.
      if (waitMs > 0) v0 = 0

      greedyPurchaseAll(state, graphNodeCount, catalog)
    }

    cycleMs += config.speed.celebrationHoldMs
    solves++

    if (baselineMs === null) {
      earlySolveDurationsMs.push(runElapsedMs)
      if (earlySolveDurationsMs.length >= BASELINE_SOLVE_COUNT) {
        baselineMs = earlySolveDurationsMs.reduce((sum, ms) => sum + ms, 0) / earlySolveDurationsMs.length
      }
    } else if (runElapsedMs / baselineMs >= diminishingReturnsRatio) {
      return { cycleMs, solves, finalGraphNodeCount: graphNodeCount, ...scannerSummary(scanner, cycleMs, state.darklyBotServosLevel) }
    }

    graphNodeCount += computeNodesPerSolve(state.expansionLevel, state.amplifierLevel, config)
    if (graphNodeCount >= MAX_GRAPH_NODE_COUNT) {
      return { cycleMs, solves, finalGraphNodeCount: graphNodeCount, ...scannerSummary(scanner, cycleMs, state.darklyBotServosLevel) }
    }
  }
}
