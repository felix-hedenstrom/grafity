/**
 * The shape of every tunable balance number in the game, grouped by domain. The live game always
 * runs PRODUCTION_CONFIG (config/production.ts); the balance simulator (src/sim/) can run any
 * GameConfig, so alternate tunings are tried by passing a config — never by editing game code.
 */

/** Cost/gating shape shared by every repeatable (multi-level) upgrade. */
export interface RepeatableBalance {
  baseCost: number
  /** Multiplier applied per level already owned — geometric, not flat (see costForLevel in upgrades/scaling.ts). */
  costGrowth: number
  /** The graph node count the player must have reached at least once before the very first purchase is allowed. */
  minLevel: number
  /** If set, the level this upgrade can never exceed; omitted means uncapped (the rising cost is the throttle). */
  maxLevel?: number
}

/** A repeatable upgrade whose effect is a compounding percentage per level. */
export interface RepeatableWithPercent extends RepeatableBalance {
  percentPerLevel: number
}

/** A one-time unlock: a flat cost plus the graph node count that gates it. */
export interface UnlockBalance {
  cost: number
  minLevel: number
}

export interface GameConfig {
  progression: {
    /** The smallest graph ever generated — a fresh run (and a fresh prestige cycle) starts here. Also the reference node count that graph spacing is anchored to 1x at. */
    startingGraphNodeCount: number
    /** The lifetime-highest graph size a player must reach at least once before the Prestige Shop appears at all. */
    prestigeUnlockLevel: number
    /** Node Memory levels every cycle starts with, for free — the walker remembers at least this many recent nodes from the very first hop. */
    startingMemoryLevel: number
  }
  currency: {
    /** Insight per newly discovered node, before Discovery Bonus. */
    discoveryRewardPerNode: number
    /** Insight per step onto an already-discovered node, before Revisit Bonus. */
    revisitReward: number
    /** Insight per graph node paid out on reaching the exit, before Exit Bonus. */
    goalRewardPerNode: number
    /** How many nodes past the starting graph size a run must reach before prestiging pays out even one Nebula. */
    nebulaPayoutReferenceNodes: number
  }
  speed: {
    /** Floor on any computed tick/travel duration — a presentation-driven minimum so motion stays visible. */
    minTickIntervalMs: number
    /** How long the goal-reached celebration holds walkers in place before the graph resets — roughly matching GraphView's burst/banner CSS animations so they finish playing first. */
    celebrationHoldMs: number
    /** The speed of light IS every walker's top speed; only the FTL prestige upgrade raises it. */
    baseSpeedOfLight: number
    /** How long a walker pauses on a node the first time it visits it, before Quick Study. */
    discoverWaitBaseMs: number
    /** Base acceleration (distance/sec²) before Thrusters/Momentum — tuned as a pair with graph.spacingAtReferenceCount; see PRODUCTION_CONFIG. */
    baseAccelerationDistancePerSecondSquared: number
  }
  graph: {
    /** Fraction of the non-tree Delaunay edges added back on top of the spanning tree, so there's more than one path between nodes. */
    extraEdgeRatio: number
    /** How many random "attractor" points pull/push sampled points during the density warp. */
    warpAttractorCount: number
    /** How strongly each attractor pulls (positive) or pushes (negative) nearby points, as a fraction of the canvas size — higher spreads edge length further apart. */
    warpStrength: number
    /** Falloff radius for an attractor's pull/push, as a fraction of canvas width. */
    warpFalloffRatio: number
    /** Point spacing at the smallest graph (progression.startingGraphNodeCount) — the anchor every other level's spacing scales up from. Tuned as a pair with speed.baseAccelerationDistancePerSecondSquared; see PRODUCTION_CONFIG. */
    spacingAtReferenceCount: number
    /** Poisson-disk sampling undershoots perfect hex-packing density; empirical fudge factor so the generated canvas actually fits close to nodeCount points without excessive retries. */
    packingDensity: number
    /** Width/height ratio of the sampled canvas. */
    aspectRatio: number
    /** How many times samplePointsForCount grows the canvas and retries before padding with uniform points. */
    maxSampleAttempts: number
    /** How steeply point spacing (and so travel distance) grows with nodeCount — super-linear so graph growth alone can't out-race travel time, eventually forcing a prestige. */
    spacingScaleExponent: number
    /** Above this nodeCount, spacing growth picks up the extra exponent below — the other half of the speed-of-light wall. */
    spacingLateKneeNodeCount: number
    /** Extra exponent applied to nodeCount's growth past the knee — effective late-game exponent is spacingScaleExponent + this. */
    spacingLateExtraExponent: number
    /** How many relaxation passes resolveOverlaps runs after warping to restore the minimum spacing. */
    overlapResolveIterations: number
  }
  /** The Scanner Array — an idle Traveling Salesman minigame: one closed loop of wire through every sensor, untangled by Darkly-bot; the more sensors and the cleaner the loop, the more Insight every scan yields. Neutron stars in each level add sensors. See src/game/scannerWiring/. */
  scannerWiring: {
    /** The highest graph size a player must have reached this cycle before the Scanner Array appears at all. */
    unlockLevel: number
    /** Sensors on the board when the array unlocks, wired in a random (tangled) loop. */
    startingSensors: number
    /** Neutron stars placed in every level generated once the array is unlocked — each adds one sensor the first time any walker visits it. */
    neutronStarsPerLevel: number
    /** Insight multiplier per sensor at perfect clarity: the array pays 1 + bonusPerSensor × sensors × clarity^clarityExponent. */
    bonusPerSensor: number
    /** Exponent on clarity (reference ÷ current wire length) — high values make a well-untangled loop worth much more than a merely decent one. */
    clarityExponent: number
    /** Seconds between Darkly-bot's untangling moves before any Servos levels. */
    darklyBotBaseStepSeconds: number
  }
  /** Keys — every level hides k of them on ordinary stars, and the exit stays locked until walkers have visited them all. k = max(1, floor((nodes / referenceNodeCount) ^ countExponent)). See src/game/keys/. */
  keys: {
    /** Node count at which the curve gives exactly 1 key — the starting graph size, so level 1 always has one. */
    referenceNodeCount: number
    /** Growth exponent on nodes / referenceNodeCount — 0.5 is a square-root curve (28 nodes → 2 keys, 63 → 3, 112 → 4). */
    countExponent: number
  }
  upgrades: {
    discoveryBonus: RepeatableWithPercent
    revisitBonus: RepeatableWithPercent
    exitBonus: RepeatableWithPercent
    insightMultiplier: RepeatableWithPercent
    expansion: RepeatableBalance & { nodesPerLevel: number }
    amplifier: RepeatableWithPercent
    /** Momentum — one-time: acceleration compounds by percentPerSecond for every second of the current run, up to maxMultiplier. */
    momentum: UnlockBalance & {
      percentPerSecond: number
      /** The acceleration bonus Momentum grants never exceeds this multiplier. */
      maxMultiplier: number
    }
    /** Quick Study — shrinks the discover wait per level, compounding. */
    discoverWait: RepeatableWithPercent
    thrusters: RepeatableWithPercent
    nodeMemory: RepeatableBalance
    deepMemory: RepeatableWithPercent
    /** Extra Searcher. */
    searcher: RepeatableBalance
    /** Darkly-bot Servos — each level shortens the time between Darkly-bot's moves by percentPerLevel, compounding. */
    darklyBotServos: RepeatableWithPercent
    /** Pulsar Hunter — one-time, toggleable: while a level has uncollected neutron stars, every walker heads for them before following its algorithm. */
    pulsarHunter: UnlockBalance
    /** Exit Avoidance — one-time, toggleable: once the exit is discovered, forward walkers collect any remaining pulsars before taking it. */
    exitAvoidance: UnlockBalance
    /** One-time strategy unlocks, keyed by upgrade id — the ids in buildStrategyUpgrades (upgrades/definitions.ts). */
    strategies: Record<string, UnlockBalance>
  }
  prestige: {
    nebulaInsight: RepeatableWithPercent
    /** FTL — raises the speed of light itself per level, compounding. */
    ftl: RepeatableWithPercent
    minimap: UnlockBalance
    unlockUfo: UnlockBalance
    /** Traffic Control. */
    mutex: UnlockBalance
    /** Reverse Beacon — half the UFOs (rounded up) launch from the exit and search backward with the active algorithm. */
    bidirectional: UnlockBalance
  }
}
