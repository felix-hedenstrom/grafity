import { currentWireLength } from '../scannerWiring/array'
import { computeClarity, computeDarklyBotStepMs, computeScannerMultiplier, isScannerArrayUnlocked } from '../scannerWiring/rules'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useScannerWiringStore } from '../../store/useScannerWiringStore'
import type { GameLoopHandle } from './walkerScheduler'

/** The Scanner Array's live Insight multiplier, read from the stores — applied where Insight is credited, alongside the Nebula multiplier. 1 until the array unlocks. */
export function currentScannerMultiplier(): number {
  const wiring = useScannerWiringStore.getState()
  if (!isScannerArrayUnlocked(useProgressionStore.getState().highestGraphNodeCount, wiring.sensors.length)) return 1
  return computeScannerMultiplier(wiring.sensors.length, computeClarity(wiring.referenceLength, currentWireLength(wiring)))
}

/**
 * Darkly-bot's timer chain: once the Scanner Array is unlocked it makes one 2-opt untangling move
 * every computeDarklyBotStepMs, re-reading the Servos level each step so a purchase takes effect on
 * the next move. When stuck at a local optimum it simply keeps idling at the same cadence — the
 * next neutron star's sensor gives it something new to untangle.
 */
export function startDarklyBotScheduler(): GameLoopHandle {
  let timer: ReturnType<typeof setTimeout> | undefined

  function scheduleNext(): void {
    const stepMs = computeDarklyBotStepMs(useProgressionStore.getState().darklyBotServosLevel)
    useScannerWiringStore.getState().beginStep(stepMs)
    timer = setTimeout(tick, stepMs)
  }

  function tick(): void {
    const wiring = useScannerWiringStore.getState()
    if (isScannerArrayUnlocked(useProgressionStore.getState().highestGraphNodeCount, wiring.sensors.length)) wiring.darklyBotStep()
    scheduleNext()
  }

  scheduleNext()
  return {
    stop: () => {
      if (timer !== undefined) clearTimeout(timer)
    },
  }
}
