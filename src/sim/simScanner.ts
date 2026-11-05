/**
 * The Scanner Array on the sim's cycle clock: the same plain-data array the live store keeps
 * (src/game/scannerWiring/array.ts) — a tangled 5-sensor loop at unlock, Darkly-bot making one
 * 2-opt move every computeDarklyBotStepMs, and one more sensor per collected neutron star.
 */
import type { GameConfig } from '../game/config/types'
import { addSensor, botStep, createScannerArray, currentWireLength } from '../game/scannerWiring/array'
import type { ScannerArrayState } from '../game/scannerWiring/array'
import { computeClarity, computeDarklyBotStepMs, computeScannerMultiplier } from '../game/scannerWiring/rules'
import type { Rng } from '../utils/rng'

export class SimScanner {
  private array: ScannerArrayState
  /** Cycle time of Darkly-bot's next move — Infinity until the array unlocks, or while stuck at a local optimum. */
  private nextBotStepAtMs = Infinity
  private servosLevel = 0
  private unlocked = false
  private readonly rng: Rng
  private readonly config: GameConfig

  constructor(rng: Rng, config: GameConfig) {
    this.rng = rng
    this.config = config
    this.array = createScannerArray(rng, config)
  }

  /** Called once the cycle reaches the unlock level (idempotent) — Darkly-bot starts working from this moment. */
  unlock(nowMs: number): void {
    if (this.unlocked) return
    this.unlocked = true
    this.nextBotStepAtMs = nowMs + this.stepMs()
  }

  get isUnlocked(): boolean {
    return this.unlocked
  }

  get sensorCount(): number {
    return this.array.sensors.length
  }

  get clarity(): number {
    return computeClarity(this.array.referenceLength, currentWireLength(this.array))
  }

  multiplier(): number {
    if (!this.unlocked) return 1
    return computeScannerMultiplier(this.array.sensors.length, this.clarity, this.config)
  }

  /** A neutron star was collected at nowMs (after advanceTo(nowMs)): add a sensor and wake Darkly-bot if it was idle. */
  collectNeutronStar(nowMs: number): void {
    this.array = addSensor(this.array, this.rng)
    if (this.nextBotStepAtMs === Infinity) this.nextBotStepAtMs = nowMs + this.stepMs()
  }

  /** Plays out every Darkly-bot move that lands before nowMs. */
  advanceTo(nowMs: number, servosLevel: number): void {
    this.servosLevel = servosLevel
    while (this.nextBotStepAtMs <= nowMs) {
      const next = botStep(this.array)
      if (next === null) {
        this.nextBotStepAtMs = Infinity // stuck until the next sensor arrives
        return
      }
      this.array = next
      this.nextBotStepAtMs += this.stepMs()
    }
  }

  private stepMs(): number {
    return computeDarklyBotStepMs(this.servosLevel, this.config)
  }
}
