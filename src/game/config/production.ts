import type { GameConfig } from './types'

/**
 * The balance the live game actually ships with — every game function defaults to this config, so
 * the game itself never threads a config around. The balance simulator (src/sim/) overrides parts
 * of it (see mergeConfig) to try alternate tunings without touching this file.
 *
 * Pacing model (tuned via the simulator): the ship is meant to feel fast — the speed of light sits
 * far above what a cycle-1 ship reaches, so travel is acceleration-limited (early rest-to-rest edge
 * time ≈ 2·√(d/a)) and c only binds in later prestige cycles, where FTL earns its keep. Cycle
 * length comes from the economy instead: node growth (Expansion/Amplifier pricing), the spacing
 * knee as the prestige wall, and the Scanner Array — the wiring mini-game whose signal clarity
 * multiplies Insight — as the second plate a player keeps spinning alongside the ship.
 */
export const PRODUCTION_CONFIG: GameConfig = {
  progression: {
    startingGraphNodeCount: 7,
    prestigeUnlockLevel: 20,
    startingMemoryLevel: 1,
  },
  currency: {
    discoveryRewardPerNode: 2,
    revisitReward: 0.2,
    goalRewardPerNode: 10,
    nebulaPayoutReferenceNodes: 7,
  },
  speed: {
    minTickIntervalMs: 150,
    celebrationHoldMs: 1500,
    baseSpeedOfLight: 600,
    discoverWaitBaseMs: 4000,
    baseAccelerationDistancePerSecondSquared: 4.7,
  },
  graph: {
    extraEdgeRatio: 0.4,
    warpAttractorCount: 5,
    warpStrength: 1.4,
    warpFalloffRatio: 0.4,
    spacingAtReferenceCount: 150,
    packingDensity: 0.75,
    aspectRatio: 4 / 3,
    maxSampleAttempts: 6,
    spacingScaleExponent: 1.55,
    spacingLateKneeNodeCount: 55,
    spacingLateExtraExponent: 0.9,
    overlapResolveIterations: 24,
  },
  scannerWiring: {
    unlockLevel: 10,
    startingSensors: 5,
    neutronStarsPerLevel: 3,
    bonusPerSensor: 0.04,
    clarityExponent: 4,
    darklyBotBaseStepSeconds: 30,
  },
  // √-curve: 1 key up to 27 nodes, 2 from 28, 3 from 63, 4 from 112. Each extra key costs less
  // than the last for an exploring ship (the run ends once the last of k+1 random targets is found).
  keys: {
    referenceNodeCount: 7,
    countExponent: 0.5,
  },
  upgrades: {
    // Income-margin invariant: every compounding income upgrade's costGrowth must exceed
    // 1 + percentPerLevel, or each level pays for the next and income self-finances — the sim
    // measures runaway 100x cycles (graphs to n=3000) the moment any of these cross the line.
    // That margin, not a hard cap, is what lets Expansion stay uncapped below.
    discoveryBonus: { percentPerLevel: 0.15, baseCost: 25, costGrowth: 1.45, minLevel: 5 },
    revisitBonus: { percentPerLevel: 0.15, baseCost: 25, costGrowth: 1.45, minLevel: 12 },
    exitBonus: { percentPerLevel: 0.15, baseCost: 50, costGrowth: 1.45, minLevel: 15 },
    insightMultiplier: { percentPerLevel: 0.15, baseCost: 100, costGrowth: 1.5, minLevel: 20 },
    // Uncapped on purpose: with the income margin above holding, a steep geometric cost is enough
    // to bound per-solve graph growth (sim: max cycle ~23h at growth 2.6, vs unbounded at 1.4).
    expansion: { nodesPerLevel: 1, baseCost: 250, costGrowth: 2.6, minLevel: 20 },
    // Capped because bigger graphs pay bigger exit bonuses, which can fund further Amplifier
    // levels faster than any finite cost-growth rate could throttle — a hard level cap is the only
    // lever that actually bounds per-solve graph growth.
    amplifier: { percentPerLevel: 0.1, baseCost: 2500, costGrowth: 1.8, minLevel: 80, maxLevel: 10 },
    // 2^(1/300) - 1 ≈ 0.0023: reaches the ×2 cap after ~5 minutes of a run.
    momentum: { cost: 500, minLevel: 18, percentPerSecond: 0.0023, maxMultiplier: 2 },
    discoverWait: { percentPerLevel: 0.05, baseCost: 55, costGrowth: 1.1, minLevel: 9 },
    thrusters: { percentPerLevel: 0.04, baseCost: 30, costGrowth: 1.1, minLevel: 11, maxLevel: 25 },
    nodeMemory: { baseCost: 100, costGrowth: 1.15, minLevel: 0 },
    deepMemory: { percentPerLevel: 0.2, baseCost: 2000, costGrowth: 1.3, minLevel: 80 },
    searcher: { baseCost: 500, costGrowth: 1.5, minLevel: 35 },
    darklyBotServos: { percentPerLevel: 0.15, baseCost: 300, costGrowth: 1.6, minLevel: 13, maxLevel: 15 },
    pulsarHunter: { cost: 120, minLevel: 14 },
    exitAvoidance: { cost: 80, minLevel: 16 },
    strategies: {
      'least-visited-star': { cost: 150, minLevel: 17 },
      bfs: { cost: 650, minLevel: 50 },
      dfs: { cost: 1100, minLevel: 80 },
      pheromone: { cost: 1800, minLevel: 105 },
      'greedy-frontier': { cost: 2400, minLevel: 130 },
      dijkstra: { cost: 5000, minLevel: 210 },
      compass: { cost: 7200, minLevel: 270 },
      'a-star': { cost: 10200, minLevel: 340 },
      swarm: { cost: 20000, minLevel: 550 },
    },
  },
  // Costs/minLevels here are placeholders, tuned against the balance simulator in src/sim/.
  prestige: {
    nebulaInsight: { percentPerLevel: 0.1, baseCost: 5, costGrowth: 1.5, minLevel: 0 },
    ftl: { percentPerLevel: 0.1, baseCost: 8, costGrowth: 1.75, minLevel: 0 },
    minimap: { cost: 1, minLevel: 0 },
    unlockUfo: { cost: 3, minLevel: 30 },
    mutex: { cost: 4, minLevel: 45 },
    bidirectional: { cost: 6, minLevel: 60 },
  },
}
