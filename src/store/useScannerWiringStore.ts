import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addSensor, applySwap, createScannerArray } from '../game/scannerWiring/array'
import type { ScannerArrayState } from '../game/scannerWiring/array'
import { findTwoOptMove, swapFor } from '../game/scannerWiring/wiring'
import type { WireSwap } from '../game/scannerWiring/wiring'

interface ScannerWiringState extends ScannerArrayState {
  /** Date.now() when Darkly-bot's current step interval began, and how long it lasts — transient (never persisted), set by the scheduler so the modal can animate the upcoming move across the whole interval. */
  stepStartedAt: number
  stepDurationMs: number
  /** The swap Darkly-bot locked in at the start of this step and commits at its end — transient. Null while it's stuck at a local optimum. */
  pendingSwap: WireSwap | null
  /** Starts a step interval: picks the best 2-opt swap on the loop as it stands and locks it in, so a sensor arriving mid-step can't change the move being animated. */
  beginStep: (durationMs: number) => void
  /** A neutron star was collected: one more sensor, spliced into Darkly-bot's loop at a random spot that leaves the pending swap's wires intact. */
  addSensor: () => void
  /** Darkly-bot's move: commits the pending 2-opt swap. Returns false when there was nothing to commit. */
  darklyBotStep: () => boolean
  /** Back to a fresh 5-sensor tangled array — prestige and hard reset. */
  reset: () => void
}

function arrayOf(state: ScannerWiringState): ScannerArrayState {
  return { sensors: state.sensors, order: state.order, referenceOrder: state.referenceOrder, referenceLength: state.referenceLength }
}

export const useScannerWiringStore = create<ScannerWiringState>()(
  persist(
    (set, get) => ({
      ...createScannerArray(Math.random),
      stepStartedAt: Date.now(),
      stepDurationMs: 0,
      pendingSwap: null,

      beginStep: (durationMs) => {
        const { order, sensors } = get()
        const move = findTwoOptMove(order, sensors)
        set({ stepStartedAt: Date.now(), stepDurationMs: durationMs, pendingSwap: move === null ? null : swapFor(order, move) })
      },

      addSensor: () => set(addSensor(arrayOf(get()), Math.random, get().pendingSwap)),

      darklyBotStep: () => {
        const swap = get().pendingSwap
        const next = swap === null ? null : applySwap(arrayOf(get()), swap)
        set({ ...(next ?? {}), pendingSwap: null })
        return next !== null
      },

      reset: () => set({ ...createScannerArray(Math.random), pendingSwap: null }),
    }),
    {
      name: 'grafity-scanner-v1',
      version: 2,
      partialize: (state) => arrayOf(state),
      // v1 was the hand-drawn, calibrate-and-replace board — nothing in it maps onto the growing idle array, so start fresh.
      migrate: () => createScannerArray(Math.random),
    },
  ),
)
