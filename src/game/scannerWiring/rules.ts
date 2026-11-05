import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'

/** Signal clarity of the array's current wiring: reference ÷ current wire length, so 1 means as clean as the reference loop. */
export function computeClarity(referenceLength: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(1, referenceLength / length)
}

/** The Scanner Array's Insight multiplier: every sensor is worth bonusPerSensor at perfect clarity, scaled by clarity^clarityExponent — so a big, well-untangled array pays far more than a big tangled one. */
export function computeScannerMultiplier(sensorCount: number, clarity: number, config: GameConfig = PRODUCTION_CONFIG): number {
  const { bonusPerSensor, clarityExponent } = config.scannerWiring
  return 1 + bonusPerSensor * sensorCount * clarity ** clarityExponent
}

/** Milliseconds between Darkly-bot's untangling moves — each Servos level shortens it by percentPerLevel, compounding. */
export function computeDarklyBotStepMs(servosLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return config.scannerWiring.darklyBotBaseStepSeconds * 1000 * (1 - config.upgrades.darklyBotServos.percentPerLevel) ** servosLevel
}

/** Whether the Scanner Array is open to the player this cycle — the Hud button, the Scanner shop tab, Darkly-bot and neutron stars all key off this. Sensors already gathered keep it open even if the player jumps back to a smaller level. */
export function isScannerArrayUnlocked(highestGraphNodeCount: number, sensorCount: number, config: GameConfig = PRODUCTION_CONFIG): boolean {
  return highestGraphNodeCount >= config.scannerWiring.unlockLevel || sensorCount > config.scannerWiring.startingSensors
}
