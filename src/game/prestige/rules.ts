import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'
import type { RepeatableUpgradeInfo } from '../upgrades/scaling'
import type { UpgradeDefinition } from '../upgrades/types'

/** The lifetime-highest graph size a player must reach at least once before the Prestige Shop appears at all — keeps the whole mechanic out of sight until a player is deep enough in for it to be relevant. Always the production value in the live game; the sim reads its own config directly. */
export const PRESTIGE_UNLOCK_LEVEL = PRODUCTION_CONFIG.progression.prestigeUnlockLevel

export interface NebulaUpgrades {
  /** Permanent, Nebula-priced versions of the one-time Research unlocks — bought once from the Prestige Shop and never lost to a prestige reset. minLevel gates against lifetimeHighestGraphNodeCount (which never resets), not the current cycle's highestGraphNodeCount, since these are meant to be earned once across a player's whole history. */
  minimap: UpgradeDefinition
  unlockUfo: UpgradeDefinition
  mutex: UpgradeDefinition
  /** Reverse Beacon — a modifier, not an algorithm: it re-bases half the UFO fleet at the exit, all still running whatever algorithm is active. Requires Unlock UFO (there's nothing to re-base otherwise). */
  bidirectional: UpgradeDefinition
  /** Nebula Insight is repeatable — each purchase raises ALL Insight earned on every future run, compounding, uncapped. */
  nebulaInsight: RepeatableUpgradeInfo
  /** FTL is repeatable and uncapped — each purchase raises the speed of light itself (the hard top-speed cap, speed.baseSpeedOfLight), compounding. Below the cap it does nothing to actual travel speed; the steep cost growth is what keeps the cap a meaningful wall. */
  ftl: RepeatableUpgradeInfo
}

/** The Prestige Shop's catalog for a given balance config — costs/minLevels/rates all come from config.prestige, tuned against the balance simulator in src/sim/. */
export function buildNebulaUpgrades(config: GameConfig = PRODUCTION_CONFIG): NebulaUpgrades {
  return {
    minimap: {
      id: 'minimap',
      name: 'Minimap',
      description: 'A small overview of the whole graph, shown once the camera has to zoom in close. Permanent.',
      cost: config.prestige.minimap.cost,
      minLevel: config.prestige.minimap.minLevel,
    },
    unlockUfo: {
      id: 'unlock-ufo',
      name: 'Unlock UFO',
      description: 'Allows a UFO to join the search — required before Extra Searcher can be bought. Permanent.',
      cost: config.prestige.unlockUfo.cost,
      minLevel: config.prestige.unlockUfo.minLevel,
    },
    mutex: {
      id: 'mutex',
      name: 'Traffic Control',
      description: 'Walkers can no longer pass through or land on a node another walker is currently using. Permanent.',
      cost: config.prestige.mutex.cost,
      minLevel: config.prestige.mutex.minLevel,
    },
    bidirectional: {
      id: 'bidirectional',
      name: 'Reverse Beacon',
      description:
        'Half your UFOs (rounded up) launch from the exit and search backward, running the same algorithm as everyone else. The moment the two searches touch, the route is known — the Spaceship beelines straight for the exit. Takes effect next warp. Permanent.',
      cost: config.prestige.bidirectional.cost,
      minLevel: config.prestige.bidirectional.minLevel,
    },
    nebulaInsight: {
      name: 'Nebula Insight',
      description: `+${Math.round(config.prestige.nebulaInsight.percentPerLevel * 100)}% Insight earned every run, permanently, per purchase.`,
      baseCost: config.prestige.nebulaInsight.baseCost,
      costGrowth: config.prestige.nebulaInsight.costGrowth,
      minLevel: config.prestige.nebulaInsight.minLevel,
    },
    ftl: {
      name: 'FTL',
      description: `+${Math.round(config.prestige.ftl.percentPerLevel * 100)}% to the speed of light, permanently, per purchase.`,
      baseCost: config.prestige.ftl.baseCost,
      costGrowth: config.prestige.ftl.costGrowth,
      minLevel: config.prestige.ftl.minLevel,
    },
  }
}

/** The live game's Prestige Shop catalog — always the production balance. */
export const NEBULA_UPGRADES = buildNebulaUpgrades()

/** How much every Insight reward is permanently scaled by, from Nebula Insight alone (1 = no bonus yet) — combined with the per-run Insight Multiplier at the point currency is credited. */
export function computeNebulaInsightMultiplier(level: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return (1 + config.prestige.nebulaInsight.percentPerLevel) ** level
}

/** How much the speed of light (speed.baseSpeedOfLight) is permanently scaled by, from FTL alone (1 = no bonus yet) — applied to the cap at the point a walker's motion is computed (walkerScheduler), never to the walker's own speed. */
export function computeFtlMultiplier(level: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return (1 + config.prestige.ftl.percentPerLevel) ** level
}
