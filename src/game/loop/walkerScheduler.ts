import { computeGoalBonus, computeInsightMultiplier } from '../currency/rules'
import type { Graph, NodeId } from '../graph/types'
import { getEdgeWeight } from '../graph/types'
import { computeDiscoverWaitMs, computeEdgeTravelMs, MIN_TICK_INTERVAL_MS, CELEBRATION_HOLD_MS } from '../speed/rules'
import type { SpeedProgression } from '../speed/rules'
import { bidirectionalSearch, getStrategy } from '../strategies'
import { computeEffectiveMemoryLevel } from '../strategies/memory'
import { createWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { commitBidirectionalHop, decideBidirectionalHop, hasMet } from './bidirectionalStep'
import { commitHop, decideNextHop } from './searcherStep'
import { checkAchievements, computeRewardRates } from './sharedEffects'

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

function buildSpeedProgression(progression: ReturnType<typeof useProgressionStore.getState>): SpeedProgression {
  return {
    quickStepsLevel: progression.quickStepsLevel,
    momentumLevel: progression.momentumLevel,
    elapsedSecondsThisRun: (Date.now() - useRunStore.getState().runStartedAt) / 1000,
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

function departSearcher(i: number): void {
  const runState = useRunStore.getState()
  if (runState.status !== 'exploring') return
  const walker = runState.walkers[i]
  if (!walker || walker.hasReachedGoal) return

  const progression = useProgressionStore.getState()
  const strategy = getStrategy(progression.activeStrategyId)
  const memoryLevel = computeEffectiveMemoryLevel(progression.memoryLevel, progression.deepMemoryLevel, strategy.memoryMultiplier)

  const { nextNodeId, memory } = decideNextHop({
    graph: runState.graph,
    discovery: runState.discovery,
    walker,
    strategy,
    memory: runState.strategyMemories[i],
    memoryLevel,
    sharedRecentPath: runState.sharedRecentPath,
  })

  useRunStore.setState((s) => ({
    strategyMemories: s.strategyMemories.map((m, idx) => (idx === i ? memory : m)),
    sharedRecentPath: [...s.sharedRecentPath, walker.currentNodeId],
  }))

  const edgeWeight = getEdgeWeight(runState.graph, walker.currentNodeId, nextNodeId)
  const travelMs = computeEdgeTravelMs(buildSpeedProgression(progression), edgeWeight)
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

  useRunStore.setState((s) => ({
    walkers: s.walkers.map((w, idx) => (idx === i ? result.walker : w)),
    discovery: result.discovery,
    status: result.goalReached ? 'celebrating' : s.status,
  }))

  if (result.currencyEarned > 0) {
    progression.earnCurrency(result.currencyEarned * computeInsightMultiplier(progression.insightMultiplierLevel))
  }
  if (result.goalReached) progression.growGraph()
  checkAchievements(result.discovery, runState.graph.nodes.length)

  if (result.goalReached) return // the setState above already flipped status to 'celebrating', which stops every other walker's timer via reconcile()

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

function declareBidirectionalMet(progression: ReturnType<typeof useProgressionStore.getState>): void {
  const rewardRates = computeRewardRates(progression)
  const goalBonus = computeGoalBonus(useRunStore.getState().graph, rewardRates.goalPerNode)
  progression.earnCurrency(goalBonus * computeInsightMultiplier(progression.insightMultiplierLevel))
  progression.growGraph()
  useRunStore.setState({ status: 'celebrating' })
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
    declareBidirectionalMet(useProgressionStore.getState())
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
  const travelMs = computeEdgeTravelMs(buildSpeedProgression(progression), edgeWeight)
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
    declareBidirectionalMet(progression)
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
      strategyMemories: [],
      sharedRecentPath: [],
      loadedStrategyId: strategyId,
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
    strategyMemories: walkers.map(() => strategy.createMemory?.()),
    sharedRecentPath: [],
    loadedStrategyId: strategyId,
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

function reconcile(): void {
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
  if (!isBidirectional) {
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
