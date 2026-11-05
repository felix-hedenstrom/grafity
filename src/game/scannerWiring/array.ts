import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'
import type { Rng } from '../../utils/rng'
import { generateBoard, placeSensor } from './board'
import type { Sensor } from './board'
import { improveReference, insertAtRandom, insertCheapest, nearestNeighborWiring, resolveSwap, shuffledWiring, swapWires, twoOptStep, wireLength } from './wiring'
import type { WireSwap } from './wiring'

/**
 * The Scanner Array's whole state as plain data, shared by the live store and the balance sim:
 * the sensors, Darkly-bot's live loop through them, and a reference loop (2-opt + Or-opt local
 * search, kept warm as sensors arrive) that clarity is measured against.
 */
export interface ScannerArrayState {
  sensors: Sensor[]
  /** Darkly-bot's live wiring — starts shuffled, every new sensor is spliced in at a random spot. */
  order: number[]
  referenceOrder: number[]
  referenceLength: number
}

/** A fresh array: startingSensors sensors in a random, tangled loop. */
export function createScannerArray(rng: Rng, config: GameConfig = PRODUCTION_CONFIG): ScannerArrayState {
  const sensors = generateBoard(config.scannerWiring.startingSensors, rng)
  const order = shuffledWiring(sensors.length, rng)
  const referenceOrder = improveReference(nearestNeighborWiring(sensors), sensors)
  return withClampedReference({ sensors, order, referenceOrder, referenceLength: wireLength(referenceOrder, sensors) })
}

/** A neutron star's payout: one sensor at a random free spot, spliced into Darkly-bot's loop at a random position (making a fresh tangle), while the reference absorbs it at its cheapest spot and re-optimizes. */
export function addSensor(state: ScannerArrayState, rng: Rng, avoid?: WireSwap | null): ScannerArrayState {
  const sensors = [...state.sensors, placeSensor(state.sensors, rng)]
  const index = sensors.length - 1
  const order = insertAtRandom(state.order, index, rng, avoid)
  const referenceOrder = improveReference(insertCheapest(state.referenceOrder, index, sensors), sensors)
  return withClampedReference({ sensors, order, referenceOrder, referenceLength: wireLength(referenceOrder, sensors) })
}

/** Darkly-bot's move: one 2-opt untangling of the live loop. Null when it's stuck at a local optimum (it idles until the next sensor arrives). */
export function botStep(state: ScannerArrayState): ScannerArrayState | null {
  const order = twoOptStep(state.order, state.sensors)
  if (order === null) return null
  return withClampedReference({ ...state, order })
}

/** Commits a swap planned earlier (and animated since) to the live loop. Null if its wires no longer exist. */
export function applySwap(state: ScannerArrayState, swap: WireSwap): ScannerArrayState | null {
  const move = resolveSwap(state.order, swap)
  if (move === null) return null
  return withClampedReference({ ...state, order: swapWires(state.order, move.i, move.j) })
}

/** Darkly-bot can occasionally beat the heuristic reference — adopt its loop then, so clarity never exceeds 1. */
function withClampedReference(state: ScannerArrayState): ScannerArrayState {
  const length = wireLength(state.order, state.sensors)
  if (length >= state.referenceLength) return state
  return { ...state, referenceOrder: [...state.order], referenceLength: length }
}

export function currentWireLength(state: ScannerArrayState): number {
  return wireLength(state.order, state.sensors)
}
