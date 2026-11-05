import { computeInsightMultiplier } from '../currency/rules'
import type { Graph, NodeId } from '../graph/types'
import { getEdgeWeight } from '../graph/types'
import { PRODUCTION_CONFIG } from '../config/production'
import { revealAroundNode } from '../discovery/reveal'
import { isExitUnlocked } from '../keys/keys'
import { computeDiscoverWaitMs, computeNextEdgeMotion } from '../speed/rules'
import type { EdgeMotion, SpeedProgression } from '../speed/rules'
import { getStrategy } from '../strategies'
import { computeEffectiveMemoryLevel } from '../strategies/memory'
import { shortestPathToward, uniformWeight } from '../strategies/pathfinding'
import { createWalker } from '../walker/walkerLogic'
import { computeNebulaInsightMultiplier, computeFtlMultiplier } from '../prestige/rules'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { useScannerWiringStore } from '../../store/useScannerWiringStore'
import { currentScannerMultiplier } from './darklyBotScheduler'
import { claimedNodeIds } from './occupancy'
import type { OccupancyEntry } from './occupancy'
import { forwardAndReverseMet, reverseUfoCount } from './reverseBeacon'
import { pulsarOverrideHop } from './pulsarHunter'
import { commitHop, decideNextHop } from './searcherStep'
import { checkAchievements, computeRewardRates } from './sharedEffects'

/** Every searcher's current position/in-flight destination, index-aligned with walkers — the raw material Traffic Control's mutex check claims nodes from. Reverse Beacon walkers are ordinary entries here. */
function searcherOccupancyEntries(runState: ReturnType<typeof useRunStore.getState>): OccupancyEntry[] {
  return runState.walkers.map((w, idx) => ({
    currentNodeId: w.currentNodeId,
    transitTarget: runState.walkerTransits[idx]?.nextNodeId ?? null,
  }))
}

/** The main walker's deterministic route to the real goal once it's known (another searcher found it first, or the Reverse Beacon's two sides met) — reuses the same BFS every strategy's own pathfinding is built on, planning only through nodes already discovered (always enough, since the discovery that revealed/connected the goal is shared). Null if fromNodeId is already the goal. */
function planRedirectPath(graph: Graph, discoveredNodeIds: Set<NodeId>, fromNodeId: NodeId): NodeId[] | null {
  return shortestPathToward(graph, fromNodeId, (id) => id === graph.goalNodeId, uniformWeight, undefined, (id) => discoveredNodeIds.has(id))
}

/** Whether Reverse Beacon currently re-bases half the UFO fleet at the exit — owned AND toggled on. */
function beaconActive(): boolean {
  const prestige = usePrestigeStore.getState()
  return prestige.bidirectionalOwned && prestige.bidirectionalEnabled
}

export interface GameLoopHandle {
  stop(): void
}

type TimerId = ReturnType<typeof setTimeout> | undefined

/**
 * Independent timer chains, one per active walker (plus a celebration hold) — module-level and
 * non-reactive. walkers[0] is always the Spaceship.
 */
let searcherTimers: TimerId[] = []
let celebrationTimer: TimerId
/** Defers the very first dispatch after a graph change by one tick (see reconcile()'s
 * graph-change branch) so React gets to commit a render of the walkers resting at the fresh
 * graph's start node, with no transit yet, before any hop is scheduled — otherwise the walkers'
 * first-ever transit lands in the same batched update as the reset itself, and the UI never
 * shows them anywhere but already mid-flight toward their first hop. */
let initialDispatchTimer: TimerId
let lastSeenGraph: Graph | null = null
let lastSeenStrategyId: string | null = null
let suspended = false

function buildSpeedProgression(progression: ReturnType<typeof useProgressionStore.getState>): SpeedProgression {
  return {
    momentumOwned: progression.momentumOwned,
    elapsedSecondsThisRun: (Date.now() - useRunStore.getState().runStartedAt) / 1000,
    thrustersLevel: progression.thrustersLevel,
  }
}

/**
 * The rocket-style accel/cruise/decel profile for one edge crossing, via computeNextEdgeMotion
 * (shared with the offline balance simulator so the two can't drift apart) — with the speed of
 * light raised by the permanent cross-prestige FTL multiplier, which stays out of speed/rules.ts
 * so that module remains pure and ignorant of the Prestige Shop. mustStop is true when nextNodeId
 * is unvisited — the walker needs to actually arrive and decide what's next, so it brakes to a
 * full stop; false lets it carry its speed straight through an already-visited node into the next
 * edge.
 */
function computeEdgeMotionWithNebula(progression: SpeedProgression, v0: number, edgeWeight: number, mustStop: boolean): EdgeMotion {
  const speedOfLight = PRODUCTION_CONFIG.speed.baseSpeedOfLight * computeFtlMultiplier(usePrestigeStore.getState().ftlLevel)
  return computeNextEdgeMotion(progression, v0, edgeWeight, mustStop, PRODUCTION_CONFIG, speedOfLight)
}

function clearSearcherTimersFrom(startIndex: number): void {
  for (let i = startIndex; i < searcherTimers.length; i++) {
    if (searcherTimers[i] !== undefined) clearTimeout(searcherTimers[i])
  }
}

function stopSearcherTimers(): void {
  clearSearcherTimersFrom(0)
  searcherTimers = searcherTimers.map(() => undefined)
}

function stopAll(): void {
  stopSearcherTimers()
  if (celebrationTimer !== undefined) {
    clearTimeout(celebrationTimer)
    celebrationTimer = undefined
  }
  if (initialDispatchTimer !== undefined) {
    clearTimeout(initialDispatchTimer)
    initialDispatchTimer = undefined
  }
}

/** The main walker (i === 0) only: if a route to the real goal is already known — another searcher
 * found it, or the Reverse Beacon's two sides met — follow it hop by hop instead of consulting the
 * active strategy. redirectPath always starts at the walker's current node, so index 1 is the
 * next hop. */
function redirectedNextHop(redirectPath: NodeId[] | null): NodeId | null {
  return redirectPath && redirectPath.length > 1 ? redirectPath[1] : null
}

function departSearcher(i: number): void {
  const runState = useRunStore.getState()
  if (runState.status !== 'exploring') return
  const walker = runState.walkers[i]
  if (!walker || walker.hasReachedGoal) return
  // The Spaceship was resting on the locked exit when a UFO collected the last key: it's already
  // there, so land on it again in place and win, instead of hopping off and coming back.
  if (i === 0 && walker.currentNodeId === runState.graph.goalNodeId && isExitUnlocked(runState.graph, runState.discovery)) {
    arriveSearcher(0, walker.currentNodeId)
    return
  }

  const progression = useProgressionStore.getState()
  // Pulsar Hunter / Exit Avoidance outrank everything else, including a known route to the exit:
  // uncollected pulsars first, then the redirect or the algorithm. Forward walkers keep off the
  // exit while either is steering, so neither can end the run early.
  const huntHop = pulsarOverrideHop(runState.graph, runState.discovery, walker, {
    pulsarHunter: progression.pulsarHunterOwned && progression.pulsarHunterEnabled,
    exitAvoidance: progression.exitAvoidanceOwned && progression.exitAvoidanceEnabled,
  })
  // A hunt detour leaves the Spaceship off its planned exit route — re-plan from where it actually is.
  let redirectPath = runState.redirectPath
  if (i === 0 && huntHop === null && redirectPath && redirectPath[0] !== walker.currentNodeId) {
    redirectPath = planRedirectPath(runState.graph, runState.discovery.discoveredNodeIds, walker.currentNodeId)
    useRunStore.setState({ redirectPath })
  }
  const redirectedHop = i === 0 ? redirectedNextHop(redirectPath) : null
  const excludedNodeIds = usePrestigeStore.getState().mutexEnabled ? claimedNodeIds(searcherOccupancyEntries(runState), i) : undefined

  let nextNodeId: NodeId
  let applyDecision: (() => void) | null = null
  if (huntHop !== null) {
    nextNodeId = huntHop
    const fromNodeId = walker.currentNodeId
    applyDecision = () => useRunStore.setState((s) => ({ sharedRecentPath: [...s.sharedRecentPath, fromNodeId] }))
  } else if (redirectedHop !== null) {
    nextNodeId = redirectedHop
  } else {
    const strategy = getStrategy(progression.activeStrategyId)
    const memoryLevel = computeEffectiveMemoryLevel(progression.memoryLevel, progression.deepMemoryLevel, strategy.memoryMultiplier)

    const decided = decideNextHop({
      graph: runState.graph,
      discovery: runState.discovery,
      walker,
      strategy,
      memory: runState.strategyMemories[i],
      memoryLevel,
      sharedRecentPath: runState.sharedRecentPath,
      excludedNodeIds,
      walkerIndex: i,
      sharedMemory: runState.strategySharedMemory,
    })
    nextNodeId = decided.nextNodeId
    applyDecision = () =>
      useRunStore.setState((s) => ({
        strategyMemories: s.strategyMemories.map((m, idx) => (idx === i ? decided.memory : m)),
        sharedRecentPath: [...s.sharedRecentPath, walker.currentNodeId],
      }))
  }

  // Traffic Control: every neighbor is currently claimed by another walker (fully boxed in) — wait
  // a tick and re-decide rather than departing into a collision. Strategies already steer away from
  // excludedNodeIds themselves; this is just the backstop for when no unclaimed neighbor exists at all.
  if (excludedNodeIds?.has(nextNodeId)) {
    searcherTimers[i] = setTimeout(() => departSearcher(i), PRODUCTION_CONFIG.speed.minTickIntervalMs)
    return
  }
  applyDecision?.()

  const edgeWeight = getEdgeWeight(runState.graph, walker.currentNodeId, nextNodeId)
  const mustStop = !runState.discovery.visitedNodeIds.has(nextNodeId)
  const v0 = runState.walkerSpeeds[i] ?? 0
  const motion = computeEdgeMotionWithNebula(buildSpeedProgression(progression), v0, edgeWeight, mustStop)
  useRunStore.setState((s) => ({
    walkerTransits: s.walkerTransits.map((t, idx) => (idx === i ? { nextNodeId, startedAt: Date.now(), ...motion } : t)),
    walkerRests: s.walkerRests.map((r, idx) => (idx === i ? null : r)),
  }))
  searcherTimers[i] = setTimeout(() => arriveSearcher(i, nextNodeId), motion.travelMs)
}

function arriveSearcher(i: number, nextNodeId: NodeId): void {
  const runState = useRunStore.getState()
  if (runState.status !== 'exploring') return
  const walker = runState.walkers[i]
  if (!walker) return

  const progression = useProgressionStore.getState()
  const result = commitHop({
    graph: runState.graph,
    discovery: runState.discovery,
    walker,
    nextNodeId,
    rewardRates: computeRewardRates(progression),
    // A Reverse Beacon walker standing on the exit it launched from is not a win — its arrival at
    // "the goal" is meaningless; only the meet (below) or the Spaceship's own landing ends anything.
    goalNodeId: walker.origin === 'goal' ? '' : undefined,
  })

  // Only the main walker (i === 0) actually reaching the goal ends the run. Any other searcher
  // reaching it — or a start-side and exit-side walker meeting — just reveals that a route exists;
  // every other walker then disappears and the main walker beelines there itself, via redirectPath.
  const mainWalkerWon = i === 0 && result.goalReached
  const updatedWalkers = runState.walkers.map((w, idx) => (idx === i ? result.walker : w))
  // The route counts as known once a forward walker has stood on the exit, or the Beacon's two sides
  // have met. (Not "the exit is visited": Reverse Beacon UFOs launch there, which marks it visited.)
  // Both checks read walker paths, so a route found while the exit was still locked kicks in the
  // moment the last key is collected.
  const goalNodeId = runState.graph.goalNodeId
  const exitFoundByOthers =
    !mainWalkerWon &&
    !runState.redirectPath &&
    isExitUnlocked(runState.graph, result.discovery) &&
    (updatedWalkers.some((w) => w.origin === 'start' && w.path.includes(goalNodeId)) || forwardAndReverseMet(runState.graph, updatedWalkers))
  const exitVelocity = runState.walkerTransits[i]?.exitVelocity ?? 0
  const waitMs = result.wasAlreadyVisited ? 0 : computeDiscoverWaitMs(progression.discoverWaitLevel)
  // The rest record lands in the same commit that clears the transit, so the UI never sees a
  // discovering stop without knowing how long it lasts. Only a real pause gets one — revisits
  // (waitMs 0) and the winning hop (celebration, not discovery) rest without a record.
  const rest = waitMs > 0 && !mainWalkerWon ? { startedAt: Date.now(), waitMs } : null
  // A discovering walker stands still — even if it came in too hot to fully brake on a short edge,
  // it doesn't keep that speed through the pause. Only revisits carry their speed straight through.
  const arrivalSpeed = waitMs > 0 ? 0 : exitVelocity

  useRunStore.setState((s) => {
    const walkers = s.walkers.map((w, idx) => (idx === i ? result.walker : w))
    const walkerTransits = s.walkerTransits.map((t, idx) => (idx === i ? null : t))
    const walkerSpeeds = s.walkerSpeeds.map((v, idx) => (idx === i ? arrivalSpeed : v))
    const walkerRests = s.walkerRests.map((r, idx) => (idx === i ? rest : r))

    if (!exitFoundByOthers) {
      // Consume one hop of the main walker's redirect path as it lands, so the next departure
      // reads the next one; cleared outright once it actually reaches the goal.
      const redirectPath =
        mainWalkerWon || !s.redirectPath ? null : i === 0 && s.redirectPath.length > 1 ? s.redirectPath.slice(1) : s.redirectPath
      return {
        walkers,
        walkerTransits,
        walkerSpeeds,
        walkerRests,
        discovery: result.discovery,
        status: mainWalkerWon ? 'celebrating' : s.status,
        redirectPath,
      }
    }

    const main = walkers[0]
    const redirectPath = s.redirectPath ?? (main ? planRedirectPath(s.graph, result.discovery.discoveredNodeIds, main.currentNodeId) : null)
    return {
      walkers: main ? [main] : [],
      walkerTransits: main ? [walkerTransits[0]] : [],
      walkerSpeeds: main ? [walkerSpeeds[0]] : [],
      walkerRests: main ? [walkerRests[0]] : [],
      strategyMemories: s.strategyMemories.slice(0, 1),
      discovery: result.discovery,
      redirectPath,
    }
  })

  // Neutron star: the first walker (Spaceship or UFO) to land on one adds a sensor to the Scanner Array.
  if (!result.wasAlreadyVisited && runState.graph.nodes.find((n) => n.id === nextNodeId)?.isNeutronStar) {
    useScannerWiringStore.getState().addSensor()
  }
  if (result.currencyEarned > 0) {
    const nebulaMultiplier = computeNebulaInsightMultiplier(usePrestigeStore.getState().nebulaInsightLevel)
    progression.earnCurrency(result.currencyEarned * computeInsightMultiplier(progression.insightMultiplierLevel) * nebulaMultiplier * currentScannerMultiplier())
  }
  if (mainWalkerWon) {
    // Grow the graph before checking achievements, so size-based milestones (e.g. "Hello, Maze")
    // unlock on this winning hop instead of waiting for the first hop into the next level.
    progression.growGraph()
    checkAchievements(result.discovery, runState.graph.nodes.length)
    return // the setState above already flipped status to 'celebrating', which stops every other walker's timer via reconcile()
  }
  checkAchievements(result.discovery, runState.graph.nodes.length)
  if (exitFoundByOthers) {
    clearSearcherTimersFrom(1) // every walker but the main one just vanished
    // The arriving walker may itself have been deleted (i !== 0) — but if the MAIN walker is the one
    // whose arrival triggered the meet, its timer chain must continue onto the redirect path.
    if (i === 0) searcherTimers[0] = setTimeout(() => departSearcher(0), waitMs)
    return
  }

  searcherTimers[i] = setTimeout(() => departSearcher(i), waitMs)
}

/** The origin for each newly added walker slot: reverse until the Reverse Beacon quota is filled, forward after. */
function newWalkerOrigins(existingReverseCount: number, desiredReverseCount: number, addCount: number): ('start' | 'goal')[] {
  return Array.from({ length: addCount }, (_, k) => (existingReverseCount + k < desiredReverseCount ? 'goal' : 'start'))
}

function growSearchers(desiredCount: number): void {
  const runState = useRunStore.getState()
  const strategy = getStrategy(useProgressionStore.getState().activeStrategyId)
  const startIndex = runState.walkers.length
  const desiredReverse = reverseUfoCount(desiredCount - 1, beaconActive())
  const existingReverse = runState.walkers.filter((w) => w.origin === 'goal').length
  const origins = newWalkerOrigins(existingReverse, desiredReverse, desiredCount - startIndex)
  const additional = origins.map((origin) => createWalker(origin === 'goal' ? runState.graph.goalNodeId : runState.graph.startNodeId, origin))

  while (searcherTimers.length < desiredCount) searcherTimers.push(undefined)

  useRunStore.setState((s) => ({
    walkers: [...s.walkers, ...additional],
    walkerTransits: [...s.walkerTransits, ...additional.map(() => null)],
    walkerSpeeds: [...s.walkerSpeeds, ...additional.map(() => 0)],
    walkerRests: [...s.walkerRests, ...additional.map(() => null)],
    strategyMemories: [...s.strategyMemories, ...additional.map(() => strategy.createMemory?.())],
    // The first exit-side walker this run lifts the fog around its launch pad, same as freshRun does.
    discovery:
      existingReverse === 0 && origins.includes('goal')
        ? revealAroundNode(s.discovery, s.graph, s.graph.goalNodeId).discovery
        : s.discovery,
  }))

  for (let i = startIndex; i < desiredCount; i++) departSearcher(i)
}

// ---- strategy switching ----

function switchStrategy(strategyId: string): void {
  const runState = useRunStore.getState()
  const progression = useProgressionStore.getState()
  const strategy = getStrategy(strategyId)

  const oldWalkers = runState.walkers
  // While the Spaceship is beelining along a known exit route the UFOs are already gone — a swap
  // keeps that route and doesn't bring them back (same rule as reconcile's growth guard).
  const desiredSearcherCount = runState.redirectPath ? oldWalkers.length : 1 + progression.searcherLevel
  const desiredReverse = reverseUfoCount(progression.searcherLevel, beaconActive())
  const keptReverse = oldWalkers.slice(0, desiredSearcherCount).filter((w) => w.origin === 'goal').length
  const origins = newWalkerOrigins(keptReverse, desiredReverse, Math.max(0, desiredSearcherCount - oldWalkers.length))
  // Surviving walkers restart in place (position AND origin preserved — the beacon split only
  // rebalances on new slots or a fresh graph); brand-new slots fill the reverse quota first.
  const walkers = Array.from({ length: desiredSearcherCount }, (_, i) => {
    const existing = oldWalkers[i]
    if (existing) return createWalker(existing.currentNodeId, existing.origin)
    const origin = origins[i - oldWalkers.length]
    return createWalker(origin === 'goal' ? runState.graph.goalNodeId : runState.graph.startNodeId, origin)
  })

  const previousTimers = searcherTimers
  searcherTimers = Array.from({ length: desiredSearcherCount }, (_, i) => previousTimers[i])
  clearSearcherTimersFrom(desiredSearcherCount)

  // Surviving walkers keep their in-flight transit, speed and discover rest — their pending timers
  // are kept too, so they finish the current hop smoothly and only the NEXT hop uses the new strategy.
  const kept = (i: number) => i < oldWalkers.length
  useRunStore.setState((s) => ({
    walkers,
    walkerTransits: walkers.map((_, i) => (kept(i) ? (s.walkerTransits[i] ?? null) : null)),
    walkerSpeeds: walkers.map((_, i) => (kept(i) ? (s.walkerSpeeds[i] ?? 0) : 0)),
    walkerRests: walkers.map((_, i) => (kept(i) ? (s.walkerRests[i] ?? null) : null)),
    strategyMemories: walkers.map(() => strategy.createMemory?.()),
    strategySharedMemory: strategy.createSharedMemory?.(),
    sharedRecentPath: [],
    loadedStrategyId: strategyId,
    redirectPath: s.redirectPath,
    discovery:
      keptReverse === 0 && walkers.some((w) => w.origin === 'goal')
        ? revealAroundNode(s.discovery, s.graph, s.graph.goalNodeId).discovery
        : s.discovery,
  }))

  for (let i = 0; i < desiredSearcherCount; i++) {
    if (searcherTimers[i] === undefined) departSearcher(i)
  }
}

// ---- top-level reconciliation ----

function startCelebrationTimer(): void {
  if (celebrationTimer !== undefined) return
  stopSearcherTimers()
  celebrationTimer = setTimeout(() => {
    celebrationTimer = undefined
    useRunStore.getState().resetWithNewGraph()
  }, PRODUCTION_CONFIG.speed.celebrationHoldMs)
}

/**
 * Runs fn with reconcile() disabled, then reconciles once at the end against the final state.
 * Used when a caller needs to mutate both useRunStore and useProgressionStore (e.g. a hard
 * reset) — without this, reconcile would fire synchronously inside the first set() call and see
 * a transient, inconsistent mix of new-progression/old-graph (or vice versa), scheduling walker
 * timers against state that's about to be discarded by the second call.
 */
export function withSchedulerSuspended(fn: () => void): void {
  suspended = true
  fn()
  suspended = false
  reconcile()
}

function reconcile(): void {
  if (suspended) return
  const runState = useRunStore.getState()
  const progression = useProgressionStore.getState()

  if (runState.graph !== lastSeenGraph) {
    stopAll()
    lastSeenGraph = runState.graph
    lastSeenStrategyId = progression.activeStrategyId
    searcherTimers = new Array(runState.walkers.length).fill(undefined)

    // A graph can be observed for the first time already 'celebrating' (e.g. the scheduler
    // (re)starting mid-celebration) — don't depart anyone in that case, just hold.
    if (runState.status === 'celebrating') {
      startCelebrationTimer()
      return
    }

    initialDispatchTimer = setTimeout(() => {
      initialDispatchTimer = undefined
      for (let i = 0; i < runState.walkers.length; i++) departSearcher(i)
    }, 0)
    return
  }

  if (runState.status === 'celebrating') {
    startCelebrationTimer()
    return
  }

  if (progression.activeStrategyId !== lastSeenStrategyId) {
    lastSeenStrategyId = progression.activeStrategyId
    switchStrategy(progression.activeStrategyId)
    return
  }

  if (!runState.redirectPath) {
    // Once the exit is already known and the main walker is beelining toward it, the hunt phase
    // for this graph is over — no point growing the searcher pool further.
    const desiredSearcherCount = 1 + progression.searcherLevel
    if (runState.walkers.length < desiredSearcherCount) {
      growSearchers(desiredSearcherCount)
    }
  }
}

/** Starts one independent real-time movement cycle per active walker, driven purely by each edge's own weight/speed — no shared clock, so nothing waits on anything else. Safe to call repeatedly (e.g. across tests); resets all scheduler state on each call. */
export function startWalkerScheduler(): GameLoopHandle {
  searcherTimers = []
  celebrationTimer = undefined
  initialDispatchTimer = undefined
  lastSeenGraph = null
  lastSeenStrategyId = null

  reconcile()
  const unsubRun = useRunStore.subscribe(reconcile)
  const unsubProgression = useProgressionStore.subscribe(reconcile)

  return {
    stop: () => {
      unsubRun()
      unsubProgression()
      stopAll()
    },
  }
}
