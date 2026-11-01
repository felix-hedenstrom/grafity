import { AMPLIFIER_BASE_COST, AMPLIFIER_COST_GROWTH, EXPANSION_BASE_COST, EXPANSION_COST_GROWTH, EXPANSION_NODES_PER_LEVEL } from '../currency/rules'
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
    description: 'Always heads toward whichever neighbor it has stepped on the fewest times so far — spreads exploration out instead of clumping. Leans harder on history, so it gets double the usual cut of Node Memory.',
    cost: 150,
    strategyId: leastVisited.id,
  },
  {
    id: 'bfs',
    name: 'Breadth-First Search',
    description: 'Always heads toward whichever unexplored node is fewest hops away, ignoring edge weight entirely — explores outward in rings.',
    cost: 250,
    strategyId: breadthFirstSearch.id,
  },
  {
    id: 'dfs',
    name: 'Depth-First Search',
    description:
      'Systematically explores one branch at a time and backtracks properly on dead ends — guaranteed to eventually reach the exit, as long as Node Memory covers the whole graph.',
    cost: 400,
    strategyId: depthFirstSearch.id,
  },
  {
    id: 'greedy-frontier',
    name: 'Greedy Frontier',
    description: 'Always heads toward whichever neighbor opens up the most unexplored territory.',
    cost: 900,
    strategyId: greedyFrontier.id,
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    description: "Like Breadth-First Search, but weighs each edge by its actual cost instead of counting hops — finds the genuinely cheapest route to whatever's nearest unexplored.",
    cost: 1800,
    strategyId: dijkstra.id,
  },
  {
    id: 'a-star',
    name: 'A*',
    description: "The walker can see the exit now — beelines straight for it along the cheapest weighted route, using the graph's layout as a heuristic instead of exploring outward first.",
    cost: 3600,
    strategyId: aStar.id,
  },
  {
    id: 'bidirectional',
    name: 'Bidirectional Search',
    description: 'Two walkers — one from the start, one from the exit — searching toward each other until they meet in the middle. Always exactly two, from opposite ends.',
    cost: 7200,
    strategyId: bidirectionalSearch.id,
  },
]

/** Quick Steps is repeatable — each purchase adds a flat amount to the base travel speed, uncapped. */
export const QUICK_STEPS_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Quick Steps',
  description: `+${QUICK_STEPS_SPEED_PER_LEVEL} edges/sec base speed per purchase, before Momentum.`,
  baseCost: QUICK_STEPS_BASE_COST,
  costGrowth: QUICK_STEPS_COST_GROWTH,
}

const momentumPercentPerLevel = MOMENTUM_PERCENT_PER_LEVEL * 100
const momentumMaxPercent = Math.round((MOMENTUM_MAX_MULTIPLIER - 1) * 100)

/** Momentum is repeatable (not a plain UpgradeDefinition) — each purchase stacks another level, uncapped; the rising cost is what throttles it. */
export const MOMENTUM_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Momentum',
  description: `+${momentumPercentPerLevel}% compounding speed per second in the graph per purchase (resets each run) — caps at +${momentumMaxPercent}%.`,
  baseCost: MOMENTUM_BASE_COST,
  costGrowth: MOMENTUM_COST_GROWTH,
}

/**
 * Node Memory is a passive stat, not a strategy of its own — it caps how many of the walker's
 * most recent nodes ANY active strategy can remember and avoid revisiting (DFS's backtracking
 * stack included). At 0 levels, nothing is remembered at all.
 */
export const NODE_MEMORY_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Node Memory',
  description:
    "Every strategy remembers one more recent step per purchase — DFS's stack included. At 0, nothing's remembered; forced revisits favor the oldest node.",
  baseCost: NODE_MEMORY_BASE_COST,
  costGrowth: NODE_MEMORY_COST_GROWTH,
}

const deepMemoryPercent = Math.round(DEEP_MEMORY_PERCENT_PER_LEVEL * 100)

/** Deep Memory is expensive and repeatable — each purchase multiplies the effective Node Memory level, compounding. A late-game power spike for Node Memory specifically. */
export const DEEP_MEMORY_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Deep Memory',
  description: `Multiplies your effective Node Memory level by ${deepMemoryPercent}% per purchase, compounding. Expensive.`,
  baseCost: DEEP_MEMORY_BASE_COST,
  costGrowth: DEEP_MEMORY_COST_GROWTH,
}

/** Expansion is repeatable — each purchase adds one more node to the graph every time the walker reaches the exit, uncapped. */
export const EXPANSION_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Expansion',
  description: `+${EXPANSION_NODES_PER_LEVEL} node per solve per purchase, on top of the usual +1.`,
  baseCost: EXPANSION_BASE_COST,
  costGrowth: EXPANSION_COST_GROWTH,
}

/** Amplifier is repeatable and expensive — each purchase multiplies the entire per-solve node gain, compounding. */
export const AMPLIFIER_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Amplifier',
  description: "Multiplies the entire per-solve node gain per purchase, compounding — not just Expansion's flat bonus. Expensive.",
  baseCost: AMPLIFIER_BASE_COST,
  costGrowth: AMPLIFIER_COST_GROWTH,
}

/** Extra Searcher is repeatable — each purchase adds one more walker running the active strategy, all sharing discovery and a pooled Node Memory window. Doesn't affect Bidirectional Search, which is always exactly its own two. */
export const SEARCHER_UPGRADE_INFO: RepeatableUpgradeInfo = {
  name: 'Extra Searcher',
  description: '+1 searcher exploring simultaneously per purchase, sharing Node Memory with the rest.',
  baseCost: SEARCHER_BASE_COST,
  costGrowth: SEARCHER_COST_GROWTH,
}
