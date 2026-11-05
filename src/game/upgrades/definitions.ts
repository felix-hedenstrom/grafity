import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'
import { aStar } from '../strategies/aStar'
import { breadthFirstSearch } from '../strategies/breadthFirstSearch'
import { compass } from '../strategies/compass'
import { depthFirstSearch } from '../strategies/depthFirstSearch'
import { dijkstra } from '../strategies/dijkstra'
import { greedyFrontier } from '../strategies/greedyFrontier'
import { leastVisitedStar } from '../strategies/leastVisitedStar'
import { pheromone } from '../strategies/pheromone'
import { randomWalk } from '../strategies/randomWalk'
import { swarmSearch } from '../strategies/swarmSearch'
import type { RepeatableUpgradeInfo } from './scaling'
import type { UpgradeDefinition } from './types'

export const DEFAULT_STRATEGY_ID = randomWalk.id

/** Each strategy unlock's identity — cost/minLevel come from config.upgrades.strategies, keyed by id. */
const STRATEGY_UPGRADES = [
  {
    id: 'least-visited-star',
    name: 'Least Visited',
    description: 'Always heads toward whichever neighbor it has stepped on the fewest times so far — spreads exploration out instead of clumping.',
    strategyId: leastVisitedStar.id,
  },
  {
    id: 'bfs',
    name: 'Breadth-First Search',
    description: 'Always heads toward whichever unexplored node is fewest hops away, ignoring edge weight entirely — explores outward in rings.',
    strategyId: breadthFirstSearch.id,
  },
  {
    id: 'dfs',
    name: 'Depth-First Search',
    description: 'Systematically explores one branch at a time and backtracks properly on dead ends.',
    strategyId: depthFirstSearch.id,
  },
  {
    id: 'pheromone',
    name: 'Pheromone Trails',
    description:
      'Every ship leaves a fading trail on each route it flies, and every ship steers toward the faintest trail it can see — the fleet naturally spreads out without ever talking. The first algorithm that genuinely gets better with every extra UFO.',
    strategyId: pheromone.id,
  },
  {
    id: 'greedy-frontier',
    name: 'Greedy Frontier',
    description: 'Always heads toward whichever neighbor opens up the most unexplored territory.',
    strategyId: greedyFrontier.id,
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    description: "Weighs each edge by its real cost rather than counting hops — finds the genuinely cheapest route to whatever's nearest unexplored.",
    strategyId: dijkstra.id,
  },
  {
    id: 'compass',
    name: 'Compass',
    description: 'A needle that points at the exit the moment it comes into view — charges straight toward it as the crow flies, never mind how long the edges on the way there actually are. Fast, bold, occasionally very wrong.',
    strategyId: compass.id,
  },
  {
    id: 'a-star',
    name: 'A*',
    description: "The Spaceship can see the exit now — beelines straight for it along the cheapest weighted route, using the graph's layout as a heuristic instead of exploring outward first.",
    strategyId: aStar.id,
  },
  {
    id: 'swarm',
    name: 'Swarm Search',
    description:
      "The whole fleet coordinates: each ship claims its own slice of the unexplored frontier and sweeps it in parallel, and the moment anyone spots the exit, everyone's work becomes the Spaceship's route. A* with backup.",
    strategyId: swarmSearch.id,
  },
] as const
// Bidirectional Search used to sit above A* here as the top algorithm — it's now Reverse Beacon,
// a permanent Nebula-priced modifier in the Prestige Shop that works with EVERY algorithm; see
// src/game/prestige/rules.ts (NEBULA_UPGRADES) and src/game/loop/reverseBeacon.ts.

/** Unlock a traversal strategy — mutually exclusive, picked via the shop's Use/Active toggle. Array order is weakest-to-strongest (the sim's bestOwnedStrategyId relies on it), which the production costs also follow; an override config's costs might not. */
export function buildStrategyUpgrades(config: GameConfig = PRODUCTION_CONFIG): UpgradeDefinition[] {
  return STRATEGY_UPGRADES.map((upgrade) => {
    const balance = config.upgrades.strategies[upgrade.id]
    if (!balance) throw new Error(`config.upgrades.strategies is missing '${upgrade.id}'`)
    return { ...upgrade, cost: balance.cost, minLevel: balance.minLevel }
  })
}

export interface UpgradeInfos {
  /** Quick Study — each purchase shrinks how long a walker pauses the first time it visits a node, compounding, uncapped. Revisits are always instant, unaffected by this. */
  discoverWait: RepeatableUpgradeInfo
  /** Node Memory is a passive stat, not a strategy of its own — it caps how many of the walker's most recent nodes ANY active strategy can remember and avoid revisiting (DFS's backtracking stack included). At 0 levels, nothing is remembered at all. */
  nodeMemory: RepeatableUpgradeInfo
  /** Deep Memory is expensive and repeatable — each purchase multiplies the effective Node Memory level, compounding. A late-game power spike for Node Memory specifically. */
  deepMemory: RepeatableUpgradeInfo
  /** Expansion is repeatable — each purchase adds more nodes to the graph every time the walker reaches the exit, uncapped. */
  expansion: RepeatableUpgradeInfo
  /** Amplifier is repeatable and expensive — each purchase multiplies the entire per-solve node gain, compounding. */
  amplifier: RepeatableUpgradeInfo
  /** Discovery Bonus is repeatable — each purchase raises the reward for discovering a new node, compounding. */
  discoveryBonus: RepeatableUpgradeInfo
  /** Revisit Bonus is repeatable — each purchase raises the reward for stepping onto an already-discovered node, compounding. */
  revisitBonus: RepeatableUpgradeInfo
  /** Exit Bonus is repeatable — each purchase raises the reward for reaching the exit, compounding. */
  exitBonus: RepeatableUpgradeInfo
  /** Insight Multiplier is repeatable and expensive — each purchase multiplies all Insight earned, compounding. */
  insightMultiplier: RepeatableUpgradeInfo
  /** Extra Searcher is repeatable — each purchase adds one more walker running the active strategy, all sharing discovery and a pooled Node Memory window. While Reverse Beacon is active, half the UFOs (rounded up) launch from the exit instead of the start. */
  searcher: RepeatableUpgradeInfo
  /** Thrusters is repeatable and applies to every walker (Spaceship and UFOs alike) — it speeds up how fast a walker ramps up to its top speed and brakes into a stop, distinct from Momentum, which boosts the same acceleration over time rather than the speed-of-light ceiling. */
  thrusters: RepeatableUpgradeInfo
  /** Darkly-bot Servos is repeatable (capped) — each purchase shortens the time between Darkly-bot's untangling moves on the Scanner Array, compounding. Only purchasable once Darkly-bot itself is owned. */
  darklyBotServos: RepeatableUpgradeInfo
}

/** Every repeatable upgrade's shop entry for a given balance config — costs, gates, and the description percentages all derive from config, so an override config's shop copy stays truthful automatically. */
export function buildUpgradeInfos(config: GameConfig = PRODUCTION_CONFIG): UpgradeInfos {
  const u = config.upgrades
  const pct = (fraction: number) => Math.round(fraction * 100)
  return {
    discoverWait: {
      name: 'Quick Study',
      description: `-${u.discoverWait.percentPerLevel * 100}% time spent pausing at a newly discovered node per purchase, compounding.`,
      baseCost: u.discoverWait.baseCost,
      costGrowth: u.discoverWait.costGrowth,
      minLevel: u.discoverWait.minLevel,
    },
    nodeMemory: {
      name: 'Node Memory',
      description: '+1 remembered step per purchase, avoiding revisits.',
      baseCost: u.nodeMemory.baseCost,
      costGrowth: u.nodeMemory.costGrowth,
      minLevel: u.nodeMemory.minLevel,
    },
    deepMemory: {
      name: 'Deep Memory',
      description: `Multiplies how much is remembered by ${pct(u.deepMemory.percentPerLevel)}% per purchase, compounding.`,
      baseCost: u.deepMemory.baseCost,
      costGrowth: u.deepMemory.costGrowth,
      minLevel: u.deepMemory.minLevel,
    },
    expansion: {
      name: 'Expansion',
      description: `+${u.expansion.nodesPerLevel} node per solve per purchase.`,
      baseCost: u.expansion.baseCost,
      costGrowth: u.expansion.costGrowth,
      minLevel: u.expansion.minLevel,
    },
    amplifier: {
      name: 'Amplifier',
      description: 'Multiplies per-solve node gain per purchase, compounding.',
      baseCost: u.amplifier.baseCost,
      costGrowth: u.amplifier.costGrowth,
      minLevel: u.amplifier.minLevel,
      maxLevel: u.amplifier.maxLevel,
    },
    discoveryBonus: {
      name: 'Discovery Bonus',
      description: `+${pct(u.discoveryBonus.percentPerLevel)}% Insight per newly discovered node per purchase, compounding.`,
      baseCost: u.discoveryBonus.baseCost,
      costGrowth: u.discoveryBonus.costGrowth,
      minLevel: u.discoveryBonus.minLevel,
    },
    revisitBonus: {
      name: 'Revisit Bonus',
      description: `+${pct(u.revisitBonus.percentPerLevel)}% Insight per revisit per purchase, compounding.`,
      baseCost: u.revisitBonus.baseCost,
      costGrowth: u.revisitBonus.costGrowth,
      minLevel: u.revisitBonus.minLevel,
    },
    exitBonus: {
      name: 'Exit Bonus',
      description: `+${pct(u.exitBonus.percentPerLevel)}% Insight on exit per purchase, compounding.`,
      baseCost: u.exitBonus.baseCost,
      costGrowth: u.exitBonus.costGrowth,
      minLevel: u.exitBonus.minLevel,
    },
    insightMultiplier: {
      name: 'Insight Multiplier',
      description: `+${pct(u.insightMultiplier.percentPerLevel)}% Insight earned per purchase, compounding.`,
      baseCost: u.insightMultiplier.baseCost,
      costGrowth: u.insightMultiplier.costGrowth,
      minLevel: u.insightMultiplier.minLevel,
    },
    searcher: {
      name: 'Extra Searcher',
      description: '+1 searcher exploring simultaneously per purchase.',
      baseCost: u.searcher.baseCost,
      costGrowth: u.searcher.costGrowth,
      minLevel: u.searcher.minLevel,
    },
    thrusters: {
      name: 'Thrusters',
      description: `+${pct(u.thrusters.percentPerLevel)}% acceleration per purchase — the Spaceship ramps up and brakes faster.`,
      baseCost: u.thrusters.baseCost,
      costGrowth: u.thrusters.costGrowth,
      minLevel: u.thrusters.minLevel,
      maxLevel: u.thrusters.maxLevel,
    },
    darklyBotServos: {
      name: 'Darkly-bot Servos',
      description: `Darkly-bot untangles ${pct(u.darklyBotServos.percentPerLevel)}% faster per purchase, compounding.`,
      baseCost: u.darklyBotServos.baseCost,
      costGrowth: u.darklyBotServos.costGrowth,
      minLevel: u.darklyBotServos.minLevel,
      maxLevel: u.darklyBotServos.maxLevel,
    },
  }
}

/** The live game's catalogs — always the production balance; the sim builds its own from an override config. */
export const UPGRADES = buildStrategyUpgrades()
export const UPGRADE_INFOS = buildUpgradeInfos()

// Minimap, Unlock UFO, and Traffic Control used to live here as one-time Insight-priced
// unlocks — they're now permanent, Nebula-priced purchases in the Prestige Shop; see
// src/game/prestige/rules.ts (NEBULA_UPGRADES).

/** Momentum — a one-time Speed unlock: every walker's acceleration compounds for each second of the current run, up to its cap (see computeMomentumMultiplier in speed/rules.ts). */
export const MOMENTUM = {
  name: 'Momentum',
  description: `+${Math.round(PRODUCTION_CONFIG.upgrades.momentum.percentPerSecond * 10000) / 100}% compounding acceleration per second in the graph (resets each run) — caps at +${Math.round((PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier - 1) * 100)}%.`,
  cost: PRODUCTION_CONFIG.upgrades.momentum.cost,
  minLevel: PRODUCTION_CONFIG.upgrades.momentum.minLevel,
}

/** Pulsar Hunter — a one-time, toggleable algorithm improvement: while a level still has uncollected neutron stars, every walker detours to collect them before following its algorithm (see game/loop/pulsarHunter.ts). */
export const PULSAR_HUNTER = {
  name: 'Pulsar Hunter',
  description: 'Works with any algorithm: while a pulsar is still shining in this level, ships go collect it first — then carry on as usual.',
  cost: PRODUCTION_CONFIG.upgrades.pulsarHunter.cost,
  minLevel: PRODUCTION_CONFIG.upgrades.pulsarHunter.minLevel,
}

/** Exit Avoidance — a one-time, toggleable algorithm improvement: the algorithm explores as usual, but once the exit is discovered, forward walkers collect every remaining pulsar before taking it (see game/loop/pulsarHunter.ts). */
export const EXIT_AVOIDANCE = {
  name: 'Exit Avoidance',
  description: 'Works with any algorithm: ships keep clear of the exit until every pulsar in the level has been collected.',
  cost: PRODUCTION_CONFIG.upgrades.exitAvoidance.cost,
  minLevel: PRODUCTION_CONFIG.upgrades.exitAvoidance.minLevel,
}
