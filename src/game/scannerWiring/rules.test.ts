import { describe, expect, it } from 'vitest'
import { PRODUCTION_CONFIG } from '../config/production'
import { computeClarity, computeDarklyBotStepMs, computeScannerMultiplier, isScannerArrayUnlocked } from './rules'

const { bonusPerSensor, startingSensors, unlockLevel, darklyBotBaseStepSeconds } = PRODUCTION_CONFIG.scannerWiring

describe('scanner wiring rules', () => {
  it('clarity is reference ÷ current length, capped at 1', () => {
    expect(computeClarity(10, 10)).toBe(1)
    expect(computeClarity(10, 20)).toBeCloseTo(0.5)
    expect(computeClarity(10, 9)).toBe(1)
    expect(computeClarity(10, 0)).toBe(0)
  })

  it('the multiplier scales with sensors and steeply with clarity', () => {
    expect(computeScannerMultiplier(5, 0)).toBe(1)
    expect(computeScannerMultiplier(5, 1)).toBeCloseTo(1 + 5 * bonusPerSensor)
    expect(computeScannerMultiplier(10, 1)).toBeGreaterThan(computeScannerMultiplier(5, 1))
    expect(computeScannerMultiplier(5, 0.9)).toBeLessThan(computeScannerMultiplier(5, 0.99))
  })

  it('unlocks at unlockLevel, and stays unlocked once sensors were gathered', () => {
    expect(isScannerArrayUnlocked(unlockLevel - 1, startingSensors)).toBe(false)
    expect(isScannerArrayUnlocked(unlockLevel, startingSensors)).toBe(true)
    expect(isScannerArrayUnlocked(unlockLevel - 1, startingSensors + 1)).toBe(true)
  })

  it('Servos shorten Darkly-bot step time', () => {
    expect(computeDarklyBotStepMs(0)).toBe(darklyBotBaseStepSeconds * 1000)
    expect(computeDarklyBotStepMs(3)).toBeLessThan(computeDarklyBotStepMs(2))
  })
})
