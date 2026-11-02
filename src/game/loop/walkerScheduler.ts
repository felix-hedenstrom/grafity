import { computeInsightMultiplier } from '../currency/rules'
import type { Graph, NodeId } from '../graph/types'
import { getEdgeWeight } from '../graph/types'
import { computeDiscoverWaitMs, computeEdgeTravelMs, MIN_TICK_INTERVAL_MS, CELEBRATION_HOLD_MS } from '../speed/rules'
import type { SpeedProgression } from '../speed/rules'
import { bidirectionalSearch, getStrategy } from '../strategies'
import { computeEffectiveMemoryLevel } from '../strategies/memory'
import { shortestPathToward, uniformWeight } from '../strategies/pathfinding'
import { createWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { commitBidirectionalHop, decideBidirectionalHop, hasMet } from './bidirectionalStep'
import { commitHop, decideNextHop } from './searcherStep'
import { checkAchievements, computeRewardRates } from './sharedEffects'

/** The main walker's deterministic route to the real goal once it's known (another walker found it first, or Bidirectional's two halves met) — reuses the same BFS every strategy's own pathfinding is built on, planning only through nodes already discovered (always enough, since the discovery that revealed/connected the goal is shared). Null if fromNodeId is already the goal. */
function planRedirectPath(graph: Graph, discoveredNodeIds: Set<NodeId>, fromNodeId: NodeId): NodeId[] | null {
  return shortestPathToward(graph, fromNodeId, (id) => id === graph.goalNodeId, uniformWeight, undefined, (id) => discoveredNodeIds.has(id))
}

export interface GameLoopHandle {
  stop(): void
}

type TimerId = ReturnType<typeof setTimeout> | undefined
type BidirectionalSlot = 'forward' | 'reverse'

/**
 * Independent timer chains, one per active walker (plus walker2 for Bidirectional, plus a
 * celebration hold) — module-level and non-reactive. Bidirectional's forward walker always lives
 * at searcherTimers[0] (walkers[0] is always the forward walker, regardless of strategy), so
 * switching into/out of Bidirectional can hand its in-flight timer off cleanly instead of
 * restarting it.
 */
let searcherTimers: TimerId[] = []
let walker2Timer: TimerId
let celebrationTimer: TimerId
let lastSeenGraph: Graph | null = null
let lastSeenStrategyId: string | null = null
let lastSeenHasWalker2 = false
let suspended = false

function buildSpeedProgression(progression: ReturnType<typeof useProgressionStore.getState>): SpeedProgression {
  return {
    quickStepsLevel: progression.quickStepsLevel,
    momentumLevel: progression.momentumLevel,
    elapsedSecondsThisRun: (Date.now() - useRunStore.getState().runStartedAt) / 1000,
    mainWalkerSpeedLevel: progression.mainWalkerSpeedLevel,
    ufoSpeedLevel: progression.ufoSpeedLevel,
  }
}

function clearSearcherTimersFrom(startIndex: number): void {
  for (let i = startIndex; i < searcherTimers.length; i++) {
    if (searcherTimers[i] !== undefined) clearTimeout(searcherTimers[i])
  }
}

function stopSearcherTimers(): void {
  clearSearcherTimersFrom(0)
  searcherTimers = searcherTimers.map(() => undefined)
  if (walker2Timer !== undefined) {
    clearTimeout(walker2Timer)
    walker2Timer = undefined
  }
}

function stopAll(): void {
  stopSearcherTimers()
  if (celebrationTimer !== undefined) {
    clearTimeout(celebrationTimer)
    celebrationTimer = undefined
  }
}

// ---- regular (non-bidirectional) searchers ----

/** The main walker (i === 0) only: if a route to the real goal is already known — another searcher
 * found it, or Bidirectional's two halves met — follow it hop by hop instead of consulting the
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

  const progression = useProgressionStore.getState()
  const redirectedHop = i === 0 ? redirectedNextHop(runState.redirectPath) : null

  let nextNodeId: NodeId
  if (redirectedHop !== null) {
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
    })
    nextNodeId = decided.nextNodeId

    useRunStore.setState((s) => ({
      strategyMemories: s.strategyMemories.map((m, idx) => (idx === i ? decided.memory : m)),
      sharedRecentPath: [...s.sharedRecentPath, walker.currentNodeId],
    }))
  }

  const edgeWeight = getEdgeWeight(runState.graph, walker.currentNodeId, nextNodeId)
  const travelMs = computeEdgeTravelMs(buildSpeedProgression(progression), edgeWeight, i === 0)
  useRunStore.setState((s) => ({
    walkerTransits: s.walkerTransits.map((t, idx) => (idx === i ? { nextNodeId, travelMs } : t)),
  }))
  searcherTimers[i] = setTimeout(() => arriveSearcher(i, nextNodeId), travelMs)
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
  })

  // Only the main walker (i === 0) actually reaching the goal ends the run. Any other searcher
  // reaching it just reveals that a route exists — every other walker then disappears and the
  // main walker beelines there itself, via redirectPath.
  const mainWalkerWon = i === 0 && result.goalReached
  const otherWalkerFoundExit = i !== 0 && result.goalReached

  useRunStore.setState((s) => {
    const walkers = s.walkers.map((w, idx) => (idx === i ? result.walker : w))
    const walkerTransits = s.walkerTransits.map((t, idx) => (idx === i ? null : t))

    if (!otherWalkerFoundExit) {
      // Consume one hop of the main walker's redirect path as it lands, so the next departure
      // reads the next one; cleared outright once it actually reaches the goal.
      const redirectPath =
        mainWalkerWon || !s.redirectPath ? null : i === 0 && s.redirectPath.length > 1 ? s.redirectPath.slice(1) : s.redirectPath
      return {
        walkers,
        walkerTransits,
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
      strategyMemories: s.strategyMemories.slice(0, 1),
      discovery: result.discovery,
      redirectPath,
    }
  })

  if (result.currencyEarned > 0) {
    progression.earnCurrency(result.currencyEarned * computeInsightMultiplier(progression.insightMultiplierLevel))
  }
  checkAchievements(result.discovery, runState.graph.nodes.length)

  if (mainWalkerWon) {
    progression.growGraph()
    return // the setState above already flipped status to 'celebrating', which stops every other walker's timer via reconcile()
  }
  if (otherWalkerFoundExit) {
    clearSearcherTimersFrom(1) // every walker but the main one just vanished
    return
  }

  const waitMs = result.wasAlreadyVisited ? 0 : computeDiscoverWaitMs(progression.discoverWaitLevel)
  searcherTimers[i] = setTimeout(() => departSearcher(i), waitMs)
}

function growSearchers(desiredCount: number): void {
  const runState = useRunStore.getState()
  const strategy = getStrategy(useProgressionStore.getState().activeStrategyId)
  const startIndex = runState.walkers.length
  const additional = Array.from({ length: desiredCount - startIndex }, () => createWalker(runState.graph.startNodeId))

  while (searcherTimers.length < desiredCount) searcherTimers.push(undefined)

  useRunStore.setState((s) => ({
    walkers: [...s.walkers, ...additional],
    walkerTransits: [...s.walkerTransits, ...additional.map(() => null)],
    strategyMemories: [...s.strategyMemories, ...additional.map(() => strategy.createMemory?.())],
  }))

  for (let i = startIndex; i < desiredCount; i++) departSearcher(i)
}

// ---- bidirectional ----

function getBidirectionalWalker(slot: BidirectionalSlot): WalkerState | null {
  const runState = useRunStore.getState()
  return slot === 'forward' ? (runState.walkers[0] ?? null) : runState.walker2
}

function setBidirectionalTimer(slot: BidirectionalSlot, id: TimerId): void {
  if (slot === 'forward') searcherTimers[0] = id
  else walker2Timer = id
}

/**
 * The two halves meeting (or both stalling with nothing left to explore) only proves a route
 * exists — it doesn't mean the main (forward) walker is standing on the real goal node, so it no
 * longer celebrates immediately. Instead the reverse walker disappears, and the forward walker
 * gets handed a redirectPath and starts beelining for the actual goal via the normal searcher
 * timer chain (departSearcher), exactly like a non-main walker finding the exit in regular mode.
 */
function declareBidirectionalPathFound(): void {
  const runState = useRunStore.getState()
  const forward = runState.walkers[0]
  if (!forward) return

  if (walker2Timer !== undefined) {
    clearTimeout(walker2Timer)
    walker2Timer = undefined
  }
  if (searcherTimers[0] !== undefined) {
    clearTimeout(searcherTimers[0])
    searcherTimers[0] = undefined
  }

  const redirectPath = planRedirectPath(runState.graph, runState.discovery.discoveredNodeIds, forward.currentNodeId)
  useRunStore.setState({ walker2: null, walker2Transit: null, redirectPath })
  departSearcher(0)
}

/** Nothing unvisited is reachable from this side. If the other side is equally stuck, there's no territory left between them — call it met rather than retry forever; otherwise the other side may still open up new territory, so retry this side shortly. */
function handleBidirectionalStall(slot: BidirectionalSlot): void {
  const runState = useRunStore.getState()
  const forward = runState.walkers[0]
  const reverse = runState.walker2
  if (!forward || !reverse) return

  const otherSlot: BidirectionalSlot = slot === 'forward' ? 'reverse' : 'forward'
  const otherWalker = otherSlot === 'forward' ? forward : reverse
  const otherNext = decideBidirectionalHop(runState.graph, runState.discovery, otherWalker)
  if (otherNext === null) {
    declareBidirectionalPathFound()
    return
  }
  setBidirectionalTimer(slot, setTimeout(() => departBidirectional(slot), MIN_TICK_INTERVAL_MS))
}

function departBidirectional(slot: BidirectionalSlot): void {
  const runState = useRunStore.getState()
  const walker = getBidirectionalWalker(slot)
  if (runState.status !== 'exploring' || !walker) return

  const nextNodeId = decideBidirectionalHop(runState.graph, runState.discovery, walker)
  if (nextNodeId === null) {
    handleBidirectionalStall(slot)
    return
  }

  const progression = useProgressionStore.getState()
  const edgeWeight = getEdgeWeight(runState.graph, walker.currentNodeId, nextNodeId)
  const travelMs = computeEdgeTravelMs(buildSpeedProgression(progression), edgeWeight, slot === 'forward')
  useRunStore.setState((s) =>
    slot === 'forward'
      ? { walkerTransits: s.walkerTransits.map((t, idx) => (idx === 0 ? { nextNodeId, travelMs } : t)) }
      : { walker2Transit: { nextNodeId, travelMs } },
  )
  setBidirectionalTimer(slot, setTimeout(() => arriveBidirectional(slot, nextNodeId), travelMs))
}

function arriveBidirectional(slot: BidirectionalSlot, nextNodeId: NodeId): void {
  const runState = useRunStore.getState()
  const walker = getBidirectionalWalker(slot)
  if (runState.status !== 'exploring' || !walker) return

  const progression = useProgressionStore.getState()
  const result = commitBidirectionalHop({
    graph: runState.graph,
    discovery: runState.discovery,
    walker,
    nextNodeId,
    rewardRates: computeRewardRates(progression),
  })

  useRunStore.setState((s) => ({
    walkers: slot === 'forward' ? [result.walker] : s.walkers,
    walker2: slot === 'reverse' ? result.walker : s.walker2,
    walkerTransits: slot === 'forward' ? s.walkerTransits.map((t, idx) => (idx === 0 ? null : t)) : s.walkerTransits,
    walker2Transit: slot === 'reverse' ? null : s.walker2Transit,
    discovery: result.discovery,
  }))

  if (result.currencyEarned > 0) {
    progression.earnCurrency(result.currencyEarned * computeInsightMultiplier(progression.insightMultiplierLevel))
  }
  checkAchievements(result.discovery, runState.graph.nodes.length)

  const after = useRunStore.getState()
  const forward = after.walkers[0]
  const reverse = after.walker2
  if (forward && reverse && hasMet(after.graph, forward, reverse)) {
    declareBidirectionalPathFound()
    return
  }

  const waitMs = result.wasAlreadyVisited ? 0 : computeDiscoverWaitMs(progression.discoverWaitLevel)
  setBidirectionalTimer(slot, setTimeout(() => departBidirectional(slot), waitMs))
}

// ---- strategy switching ----

function switchStrategy(strategyId: string): void {
  const runState = useRunStore.getState()
  const progression = useProgressionStore.getState()
  const strategy = getStrategy(strategyId)
  const isBidirectional = strategyId === bidirectionalSearch.id
  const wasBidirectional = runState.walker2 !== null

  if (isBidirectional) {
    clearSearcherTimersFrom(1) // bidirectional only ever uses index 0
    const forwardPos = runState.walkers[0]?.currentNodeId ?? runState.graph.startNodeId
    const walker2Pos = runState.walker2?.currentNodeId ?? runState.graph.goalNodeId
    const hadForwardTimer = searcherTimers[0] !== undefined
    searcherTimers = [searcherTimers[0]]

    useRunStore.setState({
      walkers: [createWalker(forwardPos)],
      walker2: createWalker(walker2Pos),
      walkerTransits: [null],
      walker2Transit: null,
      strategyMemories: [],
      sharedRecentPath: [],
      loadedStrategyId: strategyId,
      redirectPath: null,
    })

    lastSeenHasWalker2 = true
    if (!hadForwardTimer) departBidirectional('forward')
    if (walker2Timer === undefined) departBidirectional('reverse')
    return
  }

  const desiredSearcherCount = 1 + progression.searcherLevel
  const oldWalkers = runState.walkers
  const walkers = Array.from({ length: desiredSearcherCount }, (_, i) => createWalker(oldWalkers[i]?.currentNodeId ?? runState.graph.startNodeId))

  if (wasBidirectional && walker2Timer !== undefined) {
    clearTimeout(walker2Timer)
    walker2Timer = undefined
  }
  const previousTimers = searcherTimers
  searcherTimers = Array.from({ length: desiredSearcherCount }, (_, i) => previousTimers[i])
  clearSearcherTimersFrom(desiredSearcherCount)

  useRunStore.setState({
    walkers,
    walker2: null,
    walkerTransits: walkers.map(() => null),
    walker2Transit: null,
    strategyMemories: walkers.map(() => strategy.createMemory?.()),
    sharedRecentPath: [],
    loadedStrategyId: strategyId,
    redirectPath: null,
  })

  lastSeenHasWalker2 = false
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
  }, CELEBRATION_HOLD_MS)
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
    lastSeenHasWalker2 = runState.walker2 !== null
    searcherTimers = runState.walker2 ? [undefined] : new Array(runState.walkers.length).fill(undefined)

    // A graph can be observed for the first time already 'celebrating' (e.g. the scheduler
    // (re)starting mid-celebration) — don't depart anyone in that case, just hold.
    if (runState.status === 'celebrating') {
      startCelebrationTimer()
      return
    }

    if (runState.walker2) {
      departBidirectional('forward')
      departBidirectional('reverse')
    } else {
      for (let i = 0; i < runState.walkers.length; i++) departSearcher(i)
    }
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

  const isBidirectional = progression.activeStrategyId === bidirectionalSearch.id
  if (!isBidirectional && !runState.redirectPath) {
    // Once the exit is already known and the main walker is beelining toward it, the hunt phase
    // for this graph is over — no point growing the searcher pool further.
    const desiredSearcherCount = 1 + progression.searcherLevel
    if (runState.walkers.length < desiredSearcherCount) {
      growSearchers(desiredSearcherCount)
      return
    }
  }

  const hasWalker2 = runState.walker2 !== null
  if (hasWalker2 !== lastSeenHasWalker2) {
    lastSeenHasWalker2 = hasWalker2
    if (hasWalker2) departBidirectional('reverse')
    else if (walker2Timer !== undefined) {
      clearTimeout(walker2Timer)
      walker2Timer = undefined
    }
  }
}

/** Starts one independent real-time movement cycle per active walker, driven purely by each edge's own weight/speed — no shared clock, so nothing waits on anything else. Safe to call repeatedly (e.g. across tests); resets all scheduler state on each call. */
export function startWalkerScheduler(): GameLoopHandle {
  searcherTimers = []
  walker2Timer = undefined
  celebrationTimer = undefined
  lastSeenGraph = null
  lastSeenStrategyId = null
  lastSeenHasWalker2 = false

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
