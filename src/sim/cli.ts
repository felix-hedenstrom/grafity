/**
 * Prints mean/median/p10/p90 prestige-cycle time (in hours) across many seeded simulated
 * playthroughs. Run via: nix develop --command npm run sim -- [runCount] [diminishingReturnsRatio] [--config path.json]
 *
 * --config points at a deep-partial GameConfig JSON file (see sim-configs/example.json); its values
 * are merged over PRODUCTION_CONFIG, so a tweak file only states what it changes — the way to try
 * an alternate balance without touching game code.
 *
 */
import { readFileSync } from 'node:fs'
import { mergeConfig } from '../game/config/merge'
import type { DeepPartial } from '../game/config/merge'
import { PRODUCTION_CONFIG } from '../game/config/production'
import type { GameConfig } from '../game/config/types'
import { DEFAULT_DIMINISHING_RETURNS_RATIO, simulateOneCycle } from './runSimulation'

declare const process: { argv: string[] }

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[index]
}

interface CliArgs {
  runCount: number
  diminishingReturnsRatio: number
  configPath: string | null
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = []
  let configPath: string | null = null
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config') {
      configPath = argv[++i] ?? null
      if (configPath === null) throw new Error('--config requires a file path')
    } else {
      positional.push(argv[i])
    }
  }
  return {
    runCount: Number(positional[0] ?? 200),
    diminishingReturnsRatio: Number(positional[1] ?? DEFAULT_DIMINISHING_RETURNS_RATIO),
    configPath,
  }
}

function loadConfig(configPath: string | null): GameConfig {
  if (configPath === null) return PRODUCTION_CONFIG
  const override = JSON.parse(readFileSync(configPath, 'utf8')) as DeepPartial<GameConfig>
  return mergeConfig(PRODUCTION_CONFIG, override)
}

function main(): void {
  const { runCount, diminishingReturnsRatio, configPath } = parseArgs(process.argv)
  const config = loadConfig(configPath)

  const cycleHours: number[] = []
  let totalSolves = 0
  let totalFinalNodes = 0
  let totalSensors = 0
  let totalClarity = 0
  let totalScannerMultiplier = 0

  for (let seed = 1; seed <= runCount; seed++) {
    const result = simulateOneCycle(seed, diminishingReturnsRatio, config)
    cycleHours.push(result.cycleMs / 3_600_000)
    totalSolves += result.solves
    totalFinalNodes += result.finalGraphNodeCount
    totalSensors += result.finalSensors
    totalClarity += result.finalClarity
    totalScannerMultiplier += result.finalScannerMultiplier
  }

  cycleHours.sort((a, b) => a - b)
  const mean = cycleHours.reduce((sum, h) => sum + h, 0) / cycleHours.length

  console.log(
    `Runs: ${runCount}, diminishing-returns ratio: ${diminishingReturnsRatio}x, config: ${configPath ?? 'production'}`,
  )
  console.log(`Mean cycle time:   ${mean.toFixed(2)}h`)
  console.log(`Median cycle time: ${percentile(cycleHours, 0.5).toFixed(2)}h`)
  console.log(`p10 cycle time:    ${percentile(cycleHours, 0.1).toFixed(2)}h`)
  console.log(`p90 cycle time:    ${percentile(cycleHours, 0.9).toFixed(2)}h`)
  console.log(`Mean solves/cycle: ${(totalSolves / runCount).toFixed(1)}`)
  console.log(`Mean final graph size: ${(totalFinalNodes / runCount).toFixed(0)} nodes`)
  console.log(`Mean final scanner sensors: ${(totalSensors / runCount).toFixed(1)}`)
  console.log(`Mean final scanner clarity: ${((totalClarity / runCount) * 100).toFixed(1)}%`)
  console.log(`Mean final scanner multiplier: ×${(totalScannerMultiplier / runCount).toFixed(2)}`)
}

main()
