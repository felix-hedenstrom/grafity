import {
  AMPLIFIER_BASE_COST,
  AMPLIFIER_COST_GROWTH,
  DISCOVERY_BONUS_BASE_COST,
  DISCOVERY_BONUS_COST_GROWTH,
  DISCOVERY_BONUS_PERCENT_PER_LEVEL,
  EXIT_BONUS_BASE_COST,
  EXIT_BONUS_COST_GROWTH,
  EXIT_BONUS_PERCENT_PER_LEVEL,
  EXPANSION_BASE_COST,
  EXPANSION_COST_GROWTH,
  EXPANSION_NODES_PER_LEVEL,
  INSIGHT_MULTIPLIER_BASE_COST,
  INSIGHT_MULTIPLIER_COST_GROWTH,
  INSIGHT_MULTIPLIER_PERCENT_PER_LEVEL,
  REVISIT_BONUS_BASE_COST,
  REVISIT_BONUS_COST_GROWTH,
  REVISIT_BONUS_PERCENT_PER_LEVEL,
} from '../currency/rules'
import { CLARITY_COST } from '../graph/layout'
import {
  MOMENTUM_BASE_COST,
  MOMENTUM_COST_GROWTH,
  MOMENTUM_MAX_MULTIPLIER,
  MOMENTUM_PERCENT_PER_LEVEL,
  QUICK_STEPS_BASE_COST,
  QUICK_STEPS_COST_GROWTH,
  QUICK_STEPS_SPEED_PER_LEVEL,
} from '../speed/rules'
import { aStar } from '../strategies/aStar'
import { bidirectionalSearch } from '../strategies/bidirectionalSearch'
import { breadthFirstSearch } from '../strategies/breadthFirstSearch'
import { depthFirstSearch } from '../strategies/depthFirstSearch'
import { dijkstra } from '../strategies/dijkstra'
import { greedyFrontier } from '../strategies/greedyFrontier'
import { leastVisited } from '../strategies/leastVisited'
import {
  DEEP_MEMORY_BASE_COST,
  DEEP_MEMORY_COST_GROWTH,
  DEEP_MEMORY_PERCENT_PER_LEVEL,
  NODE_MEMORY_BASE_COST,
  NODE_MEMORY_COST_GROWTH,
} from '../strategies/memory'
import { randomWalk } from '../strategies/randomWalk'
import { SEARCHER_BASE_COST, SEARCHER_COST_GROWTH } from '../walker/rules'
import type { RepeatableUpgradeInfo } from './scaling'
import type { UpgradeDefinition } from './types'

export const DEFAULT_STRATEGY_ID = randomWalk.id

/** Unlock a traversal strategy — mutually exclusive, picked via the shop's Use/Active toggle. Ordered by cost, which is also unlock order under progressive reveal. */
export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'least-visited',
    name: 'Least Visited',
    description: 'Always heads toward whichever neighbor it has stepped on the fewest times so far — spreads exploration out instead of clumping.',
    cost: 150,
    minLevel: 15,
    strategyId: leastVisited.id,
  },
  {
    id: 'bfs',
    name: 'Breadth-First Search',
    description: 'Always heads toward whichever unexplored node is fewest hops away, ignoring edge weight entirely — explores outward in rings.',
    cost: 250,
    minLevel: 20,
    strategyId: breadthFirstSearch.id,
  },
  {
    id: 'dfs',
    name: 'Depth-First Search',
    description: 'Systematically explores one branch at a time and backtracks properly on dead ends.',
    cost: 400,
    minLevel: 30,
    strategyId: depthFirstSearch.id,
  },
  {
    id: 'greedy-frontier',
    name: 'Greedy Frontier',
    description: 'Always heads toward whichever neighbor opens up the most unexplored territory.',
    cost: 900,
    minLevel: 50,
    strategyId: greedyFrontier.id,
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    description: "Weighs each edge by its real cost rather than counting hops — finds the genuinely cheapest route to whatever's nearest unexplored.",
    cost: 1800,
    minLevel: 75,
    strategyId: dijkstra.id,
  },
  {
    id: 'a-star',
    name: 'A*',
    description: "The walker can see the exit now — beelines straight for it along the cheapest weighted route, using the graph's layout as a heuristic instead of exploring outward first.",
    cost: 3600,
    minLevel: 120,
    strategyId: aStar.id,
  },
  {
    id: 'bidirectional',
    name: 'Bidirectional Search',
    description: 'Two walkers — one from the start, one from the exit — searching toward each other until they meet in the middle. Always exactly two, from opposite ends.',
    cost: 7200,
    minLevel: 200,
    strategyId: bidirectionalSearch.id,
  },
]

/** Quick Steps is repeatable — each purchase adds a flat amount to the base travel speed, uncapped. */
export const QUICK_STEPS_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Quick Steps',
  description: `+${QUICK_STEPS_SPEED_PER_LEVEL} edges/sec travel speed per purchase.`,
  baseCost: QUICK_STEPS_BASE_COST,
  costGrowth: QUICK_STEPS_COST_GROWTH,
  minLevel: 10,
}

const momentumPercentPerLevel = MOMENTUM_PERCENT_PER_LEVEL * 100
const momentumMaxPercent = Math.round((MOMENTUM_MAX_MULTIPLIER - 1) * 100)

/** Momentum is repeatable (not a plain UpgradeDefinition) — each purchase stacks another level, uncapped; the rising cost is what throttles it. */
export const MOMENTUM_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Momentum',
  description: `+${momentumPercentPerLevel}% compounding speed per second in the graph per purchase (resets each run) — caps at +${momentumMaxPercent}%.`,
  baseCost: MOMENTUM_BASE_COST,
  costGrowth: MOMENTUM_COST_GROWTH,
  minLevel: 8,
}

/**
 * Node Memory is a passive stat, not a strategy of its own — it caps how many of the walker's
 * most recent nodes ANY active strategy can remember and avoid revisiting (DFS's backtracking
 * stack included). At 0 levels, nothing is remembered at all.
 */
export const NODE_MEMORY_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Node Memory',
  description: '+1 remembered step per purchase, avoiding revisits.',
  baseCost: NODE_MEMORY_BASE_COST,
  costGrowth: NODE_MEMORY_COST_GROWTH,
  minLevel: 12,
}

const deepMemoryPercent = Math.round(DEEP_MEMORY_PERCENT_PER_LEVEL * 100)

/** Deep Memory is expensive and repeatable — each purchase multiplies the effective Node Memory level, compounding. A late-game power spike for Node Memory specifically. */
export const DEEP_MEMORY_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Deep Memory',
  description: `Multiplies how much is remembered by ${deepMemoryPercent}% per purchase, compounding.`,
  baseCost: DEEP_MEMORY_BASE_COST,
  costGrowth: DEEP_MEMORY_COST_GROWTH,
  minLevel: 80,
}

/** Expansion is repeatable — each purchase adds one more node to the graph every time the walker reaches the exit, uncapped. */
export const EXPANSION_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Expansion',
  description: `+${EXPANSION_NODES_PER_LEVEL} node per solve per purchase.`,
  baseCost: EXPANSION_BASE_COST,
  costGrowth: EXPANSION_COST_GROWTH,
  minLevel: 20,
}

/** Amplifier is repeatable and expensive — each purchase multiplies the entire per-solve node gain, compounding. */
export const AMPLIFIER_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Amplifier',
  description: 'Multiplies per-solve node gain per purchase, compounding.',
  baseCost: AMPLIFIER_BASE_COST,
  costGrowth: AMPLIFIER_COST_GROWTH,
  minLevel: 45,
}

const discoveryBonusPercent = Math.round(DISCOVERY_BONUS_PERCENT_PER_LEVEL * 100)

/** Discovery Bonus is repeatable — each purchase raises the reward for discovering a new node, compounding. */
export const DISCOVERY_BONUS_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Discovery Bonus',
  description: `+${discoveryBonusPercent}% Insight per newly discovered node per purchase, compounding.`,
  baseCost: DISCOVERY_BONUS_BASE_COST,
  costGrowth: DISCOVERY_BONUS_COST_GROWTH,
  minLevel: 15,
}

const revisitBonusPercent = Math.round(REVISIT_BONUS_PERCENT_PER_LEVEL * 100)

/** Revisit Bonus is repeatable — each purchase raises the reward for stepping onto an already-discovered node, compounding. */
export const REVISIT_BONUS_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Revisit Bonus',
  description: `+${revisitBonusPercent}% Insight per revisit per purchase, compounding.`,
  baseCost: REVISIT_BONUS_BASE_COST,
  costGrowth: REVISIT_BONUS_COST_GROWTH,
  minLevel: 15,
}

const exitBonusPercent = Math.round(EXIT_BONUS_PERCENT_PER_LEVEL * 100)

/** Exit Bonus is repeatable — each purchase raises the reward for reaching the exit, compounding. */
export const EXIT_BONUS_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Exit Bonus',
  description: `+${exitBonusPercent}% Insight on exit per purchase, compounding.`,
  baseCost: EXIT_BONUS_BASE_COST,
  costGrowth: EXIT_BONUS_COST_GROWTH,
  minLevel: 25,
}

const insightMultiplierPercent = Math.round(INSIGHT_MULTIPLIER_PERCENT_PER_LEVEL * 100)

/** Insight Multiplier is repeatable and expensive — each purchase multiplies all Insight earned, compounding. */
export const INSIGHT_MULTIPLIER_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Insight Multiplier',
  description: `+${insightMultiplierPercent}% Insight earned per purchase, compounding.`,
  baseCost: INSIGHT_MULTIPLIER_BASE_COST,
  costGrowth: INSIGHT_MULTIPLIER_COST_GROWTH,
  minLevel: 40,
}

/** Extra Searcher is repeatable — each purchase adds one more walker running the active strategy, all sharing discovery and a pooled Node Memory window. Doesn't affect Bidirectional Search, which is always exactly its own two. */
export const SEARCHER_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Extra Searcher',
  description: '+1 searcher exploring simultaneously per purchase.',
  baseCost: SEARCHER_BASE_COST,
  costGrowth: SEARCHER_COST_GROWTH,
  minLevel: 35,
}

/** Clarity is a one-time, on/off unlock — buying it jumps straight to max spacing, keeping the graph legible instead of a tangled hairball as it grows. */
export const CLARITY_UPGRADE: UpgradeDefinition = {
  id: 'clarity',
  name: 'Clarity',
  description: 'Spreads nodes farther apart, untangling the graph as it grows.',
  cost: CLARITY_COST,
  minLevel: 25,
}

/** Minimap is a one-time unlock (not repeatable) — once owned it can be toggled on or off freely, no further purchase needed. */
export const MINIMAP_UPGRADE: UpgradeDefinition = {
  id: 'minimap',
  name: 'Minimap',
  description: 'A small overview of the whole graph, shown once the camera has to zoom in close.',
  cost: 400,
  minLevel: 40,
}
