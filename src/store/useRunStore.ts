import { create } from 'zustand'
import { createDiscovery, revealAroundNode } from '../game/discovery/reveal'
import type { DiscoveryState } from '../game/discovery/types'
import { generatePlanarGraph } from '../game/graph/generatePlanar'
import type { Graph } from '../game/graph/types'
import type { NodeId } from '../game/graph/types'
import { getStrategy } from '../game/strategies'
import { reverseUfoCount } from '../game/loop/reverseBeacon'
import { createWalker } from '../game/walker/walkerLogic'
import { PRODUCTION_CONFIG } from '../game/config/production'
import { withNeutronStars } from '../game/scannerWiring/neutronStars'
import { computeKeyCount, withKeys } from '../game/keys/keys'
import { isScannerArrayUnlocked } from '../game/scannerWiring/rules'
import type { WalkerState } from '../game/walker/types'
import { usePrestigeStore } from './usePrestigeStore'
import { useProgressionStore } from './useProgressionStore'
import { useScannerWiringStore } from './useScannerWiringStore'

type RunStatus = 'exploring' | 'celebrating'

/** Where a walker is headed and how long the crossing takes — lets the UI animate the glide across the edge's real travel time instead of snapping on arrival. Set by the scheduler at departure, cleared on arrival. `startedAt` (Date.now() at departure) lets callers compute how far across the edge the walker currently is, for things like camera tracking that need a continuous position rather than the discrete currentNodeId. */
export interface WalkerTransit {
  nextNodeId: NodeId
  travelMs: number
  startedAt: number
  /** Speed the walker had entering this edge — mirrors EdgeMotion's entryVelocity, kept here (alongside peakVelocity/accelEndMs/decelStartMs/exitVelocity below) so a live reader (e.g. the Shop's speed gauge) can reconstruct the exact accel/cruise/decel profile via velocityAtElapsedMs without the scheduler needing to publish it anywhere else. */
  entryVelocity: number
  /** The fastest this edge crossing ever gets — see EdgeMotion.peakVelocity. */
  peakVelocity: number
  /** ms into this transit when acceleration stops — see EdgeMotion.accelEndMs. */
  accelEndMs: number
  /** Speed the walker will be moving at the instant it reaches nextNodeId — 0 if it's braking to a stop there, otherwise the velocity carried into the next edge. Computed once at departure (the whole accel/cruise/decel profile for this edge is already fixed then) and committed into walkerSpeeds/walker2Speed on arrival. */
  exitVelocity: number
  /** ms into this transit when braking begins — null if this edge never brakes (carrying speed on into the next edge). Lets the ship visual flip to point backward (retrograde burn) for exactly the braking portion of the crossing. */
  decelStartMs: number | null
}

/** The discover-wait pause a walker is currently sitting through — set by the scheduler in the
 * same commit that clears the walker's transit on arriving at an unvisited node, cleared again at
 * the next departure. Never persisted (transient, like transits). Lets the UI run a rest
 * animation (the discovering orbit) timed to fill the wait exactly, instead of looping blind. */
export interface WalkerRest {
  /** Date.now() at arrival — the moment the pause began. */
  startedAt: number
  /** How long this pause lasts (computeDiscoverWaitMs at the walker's Quick Study level). */
  waitMs: number
}

export interface RunState {
  graph: Graph
  /** Every active searcher running the current strategy, always length 1 + searcherLevel — walkers[0] is the Spaceship (origin 'start'); while Reverse Beacon is active, the tail of the array holds the exit-side UFOs (origin 'goal'). */
  walkers: WalkerState[]
  /** In-flight transit info for each entry in walkers, index-aligned — null while a walker is sitting still (discovering or waiting). */
  walkerTransits: (WalkerTransit | null)[]
  /** Each walker's current speed (distance/sec) right now — 0 while sitting still, otherwise the velocity it's carrying into (or reached during) its active transit. Lets a walker that blows through an already-visited node keep its momentum into the next edge instead of re-accelerating from a stop, index-aligned with walkers. */
  walkerSpeeds: number[]
  /** The discover-wait pause each walker is currently sitting through, index-aligned with walkers — null while traveling, on a revisit (no wait), or once the pause's departure has fired. */
  walkerRests: (WalkerRest | null)[]
  discovery: DiscoveryState
  /** Per-walker scratch state (e.g. DFS's backtracking stack), index-aligned with walkers — never pooled. */
  strategyMemories: unknown[]
  /** One cross-walker scratch object shared by every walker on the loaded strategy (pheromone trails, swarm claims) — created by the strategy's createSharedMemory(), reset alongside strategyMemories on strategy switch and new graphs. Undefined for strategies that declare none. */
  strategySharedMemory: unknown
  /** The pooled Node Memory window every searcher shares — what makes "Extra Searcher" searchers share memory instead of each remembering their own trail. */
  sharedRecentPath: NodeId[]
  /** Which strategy strategyMemories/sharedRecentPath belong to — lets the scheduler detect a strategy switch and start fresh instead of handing it another strategy's leftover memory. */
  loadedStrategyId: string
  /** 'celebrating' holds the walkers at the exit for a fixed hold so the UI has time to show it before the graph resets. */
  status: RunStatus
  /** Wall-clock timestamp (Date.now()) the current run began — Momentum compounds on real elapsed time, not step count. */
  runStartedAt: number
  /** Set once a non-main walker (or Reverse Beacon's two sides meeting) has found a route to the real goal before the main walker did — walkers[0] then follows this deterministically, ignoring its strategy, until it reaches the goal. Null the rest of the time. */
  redirectPath: NodeId[] | null
  resetWithNewGraph: () => void
}

function freshRun(): Pick<
  RunState,
  | 'graph'
  | 'walkers'
  | 'walkerTransits'
  | 'walkerSpeeds'
  | 'walkerRests'
  | 'discovery'
  | 'strategyMemories'
  | 'strategySharedMemory'
  | 'sharedRecentPath'
  | 'loadedStrategyId'
  | 'status'
  | 'runStartedAt'
  | 'redirectPath'
> {
  const progression = useProgressionStore.getState()
  const prestige = usePrestigeStore.getState()
  const scanner = useScannerWiringStore.getState()
  const neutronStarCount = isScannerArrayUnlocked(progression.highestGraphNodeCount, scanner.sensors.length)
    ? PRODUCTION_CONFIG.scannerWiring.neutronStarsPerLevel
    : 0
  const graph = withKeys(
    withNeutronStars(generatePlanarGraph(progression.graphNodeCount), neutronStarCount, Math.random),
    computeKeyCount(progression.graphNodeCount),
    Math.random,
  )
  const searcherCount = 1 + progression.searcherLevel
  // Reverse Beacon: the last ceil(searcherLevel/2) UFOs launch from the exit instead — the
  // Spaceship (index 0) always launches from the start.
  const reverseCount = reverseUfoCount(progression.searcherLevel, prestige.bidirectionalOwned && prestige.bidirectionalEnabled)

  const discovery =
    reverseCount > 0
      ? revealAroundNode(createDiscovery(graph, graph.startNodeId), graph, graph.goalNodeId).discovery
      : createDiscovery(graph, graph.startNodeId)

  return {
    graph,
    walkers: Array.from({ length: searcherCount }, (_, i) =>
      i >= searcherCount - reverseCount ? createWalker(graph.goalNodeId, 'goal') : createWalker(graph.startNodeId),
    ),
    walkerTransits: Array.from({ length: searcherCount }, () => null),
    walkerSpeeds: Array.from({ length: searcherCount }, () => 0),
    walkerRests: Array.from({ length: searcherCount }, () => null),
    discovery,
    strategyMemories: [],
    strategySharedMemory: getStrategy(progression.activeStrategyId).createSharedMemory?.(),
    sharedRecentPath: [],
    loadedStrategyId: progression.activeStrategyId,
    status: 'exploring',
    runStartedAt: Date.now(),
    redirectPath: null,
  }
}

export const RUN_SAVE_KEY = 'grafity-run-save-v1'
/** Fraction of the graph's total nodes the main walker must hop across (revisits included) before another save fires. */
const SAVE_INTERVAL_STEPS_FRACTION = 0.2

export interface SavedRunState {
  graph: Graph
  walkers: WalkerState[]
  discoveredNodeIds: NodeId[]
  discoveredEdgeIds: string[]
  visitedNodeIds: NodeId[]
  strategyMemories: unknown[]
  strategySharedMemory?: unknown
  sharedRecentPath: NodeId[]
  loadedStrategyId: string
  runStartedAt: number
  redirectPath: NodeId[] | null
}

/** The JSON-safe projection of a run — Sets spread to arrays, transient transit/rest/speed state dropped. Shared by the localStorage autosave and the Options export feature. */
export function toSavedRunState(state: RunState): SavedRunState {
  return {
    graph: state.graph,
    walkers: state.walkers,
    discoveredNodeIds: [...state.discovery.discoveredNodeIds],
    discoveredEdgeIds: [...state.discovery.discoveredEdgeIds],
    visitedNodeIds: [...state.discovery.visitedNodeIds],
    strategyMemories: state.strategyMemories,
    strategySharedMemory: state.strategySharedMemory,
    sharedRecentPath: state.sharedRecentPath,
    loadedStrategyId: state.loadedStrategyId,
    runStartedAt: state.runStartedAt,
    redirectPath: state.redirectPath,
  }
}

function saveRun(state: RunState): void {
  localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(toSavedRunState(state)))
}

function clearSavedRun(): void {
  localStorage.removeItem(RUN_SAVE_KEY)
}

/** Restores a save from localStorage, rebuilding its Sets and resetting mid-flight transit state (meaningless after a reload — the scheduler re-dispatches every walker from a stop). Returns null if there's no save, or it's malformed. */
function loadSavedRun(): ReturnType<typeof freshRun> | null {
  const raw = localStorage.getItem(RUN_SAVE_KEY)
  if (!raw) return null

  try {
    const saved = JSON.parse(raw) as SavedRunState
    const searcherCount = saved.walkers.length

    return {
      graph: saved.graph,
      // Saves from before Reverse Beacon predate walker origins — everyone launched from the
      // start. (Old Bidirectional saves also carried a `walker2` key; it's simply ignored — the
      // strategy no longer exists, and the scheduler re-dispatches from walkers alone.)
      walkers: saved.walkers.map((w) => ({ ...w, origin: w.origin ?? 'start' })),
      walkerTransits: Array.from({ length: searcherCount }, () => null),
      walkerSpeeds: Array.from({ length: searcherCount }, () => 0),
      walkerRests: Array.from({ length: searcherCount }, () => null),
      discovery: {
        discoveredNodeIds: new Set(saved.discoveredNodeIds),
        discoveredEdgeIds: new Set(saved.discoveredEdgeIds),
        visitedNodeIds: new Set(saved.visitedNodeIds),
      },
      strategyMemories: saved.strategyMemories,
      strategySharedMemory: saved.strategySharedMemory ?? getStrategy(saved.loadedStrategyId).createSharedMemory?.(),
      sharedRecentPath: saved.sharedRecentPath,
      loadedStrategyId: saved.loadedStrategyId,
      status: 'exploring',
      runStartedAt: saved.runStartedAt,
      redirectPath: saved.redirectPath,
    }
  } catch {
    return null
  }
}

const initialState = import.meta.hot?.data.runState ?? loadSavedRun() ?? freshRun()

/** How many SAVE_INTERVAL_STEPS_FRACTION-of-total-nodes multiples of the main walker's hop count have already been saved — starts wherever the restored (or fresh) run already is, so hydration never immediately re-triggers a save. */
let lastSavedBucket = Math.floor(
  initialState.walkers[0].stepsTaken / (SAVE_INTERVAL_STEPS_FRACTION * initialState.graph.nodes.length),
)

export const useRunStore = create<RunState>(() => ({
  ...initialState,
  resetWithNewGraph: () => {
    clearSavedRun()
    lastSavedBucket = 0
    useRunStore.setState(freshRun())
  },
}))

useRunStore.subscribe(() => {
  const state = useRunStore.getState()
  const bucket = Math.floor(state.walkers[0].stepsTaken / (SAVE_INTERVAL_STEPS_FRACTION * state.graph.nodes.length))
  if (bucket > lastSavedBucket) {
    lastSavedBucket = bucket
    saveRun(state)
  }
})

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose((data) => {
    data.runState = useRunStore.getState()
  })
}
