import { UPGRADES } from '../upgrades/definitions'
import type { Achievement } from './types'

/** A fun, mostly-silly set of milestones — unlocking is permanent and purely cosmetic, there's no reward beyond the toast and the list. Descriptions stay hidden in the UI until unlocked. */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-solve',
    name: 'Hello, Maze',
    description: "Reached the exit for the first time. Everything from here is just bigger versions of this.",
    check: (ctx) => ctx.highestGraphNodeCount > 7,
  },
  {
    id: 'level-25',
    name: 'Getting Somewhere',
    description: 'Reached level 25. The graph is starting to look like an actual maze.',
    check: (ctx) => ctx.highestGraphNodeCount >= 25,
  },
  {
    id: 'level-100',
    name: 'Triple Digits',
    description: 'Reached level 100. Respectable.',
    check: (ctx) => ctx.highestGraphNodeCount >= 100,
  },
  {
    id: 'level-1000',
    name: 'Off the Charts',
    description: 'Reached level 1000 — and thanks to a smarter camera, you can actually still see it.',
    check: (ctx) => ctx.highestGraphNodeCount >= 1000,
  },
  {
    id: 'level-10000',
    name: 'Beyond the Horizon',
    description: "Reached level 10,000. At this point it's less a maze and more a small country.",
    check: (ctx) => ctx.highestGraphNodeCount >= 10_000,
  },
  {
    id: 'going-in-blind',
    name: 'Going In Blind',
    description: "Reached level 50 without ever switching off Random Walk. Bold strategy.",
    check: (ctx) => ctx.highestGraphNodeCount >= 50 && ctx.activeStrategyId === ctx.defaultStrategyId,
  },
  {
    id: 'algorithm-collector',
    name: 'Algorithm Collector',
    description: 'Own every traversal strategy, from Least Visited to Swarm Search.',
    check: (ctx) => UPGRADES.every((upgrade) => ctx.purchasedUpgradeIds.includes(upgrade.id)),
  },
  {
    id: 'fully-loaded',
    name: 'Fully Loaded',
    description: 'Own Momentum and at least one level in every repeatable upgrade.',
    check: (ctx) =>
      ctx.momentumOwned &&
      ctx.memoryLevel >= 1 &&
      ctx.expansionLevel >= 1 &&
      ctx.amplifierLevel >= 1 &&
      ctx.deepMemoryLevel >= 1 &&
      ctx.searcherLevel >= 1,
  },
  {
    id: 'swarm-tactics',
    name: 'Swarm Tactics',
    description: 'Five searchers exploring at once, all sharing one memory.',
    check: (ctx) => ctx.searcherLevel >= 4,
  },
  {
    id: 'hive-mind',
    name: 'Hive Mind',
    description: 'Ten searchers exploring at once. At this point they basically share a brain.',
    check: (ctx) => ctx.searcherLevel >= 9,
  },
  {
    id: 'elephant-memory',
    name: 'Elephant Memory',
    description: '50 levels of Node Memory — it never forgets.',
    check: (ctx) => ctx.memoryLevel >= 50,
  },
  {
    id: 'meet-in-the-middle',
    name: 'Meet in the Middle',
    description: 'Bought the Reverse Beacon — Spaceship and UFO, one handshake.',
    check: (ctx) => ctx.bidirectionalOwned,
  },
  {
    id: 'insight-hoarder',
    name: 'Insight Hoarder',
    description: 'Sitting on 100,000 Insight at once. Spend some of that.',
    check: (ctx) => ctx.currencyAmount >= 100_000,
  },
  {
    id: 'insight-tycoon',
    name: 'Insight Tycoon',
    description: '10,000,000 Insight banked at once. You could buy anything in the shop twice over.',
    check: (ctx) => ctx.currencyAmount >= 10_000_000,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: '20 levels of FTL — the speed of light is more of a suggestion at this point.',
    check: (ctx) => ctx.ftlLevel >= 20,
  },
  {
    id: 'no-stone-unturned',
    name: 'No Stone Unturned',
    description: 'Fully discovered a graph of at least 500 nodes. Nothing left in the fog.',
    check: (ctx) => ctx.totalNodes >= 500 && ctx.discoveredCount >= ctx.totalNodes,
  },
]
