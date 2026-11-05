import type { Rng } from '../../utils/rng'
import type { Sensor } from './board'

/**
 * Wire geometry for the Scanner Array. A wiring is a closed loop given as a visiting order of
 * sensor indices (each index exactly once; the wire runs from the last sensor back to the first).
 * Wire k is the run from order[k] to order[(k + 1) % n].
 */

function wireBetween(a: Sensor, b: Sensor): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Total wire length of the closed loop through order — including the closing run from the last sensor back to the first. */
export function wireLength(order: readonly number[], sensors: readonly Sensor[]): number {
  let total = 0
  for (let i = 0; i < order.length; i++) {
    total += wireBetween(sensors[order[i]], sensors[order[(i + 1) % order.length]])
  }
  return total
}

/** Whether order is a full wiring of the board: every sensor exactly once. */
export function isCompleteWiring(order: readonly number[], sensorCount: number): boolean {
  return order.length === sensorCount && new Set(order).size === sensorCount && order.every((i) => i >= 0 && i < sensorCount)
}

/** Swaps wires i < j the only way that keeps a single loop: reverse the stretch between them — a 2-opt move (geometrically, uncrossing two wires). */
export function swapWires(order: readonly number[], i: number, j: number): number[] {
  return [...order.slice(0, i + 1), ...order.slice(i + 1, j + 1).reverse(), ...order.slice(j + 1)]
}

/**
 * Darkly-bot's single move: find the one 2-opt swap that shortens the loop the most and apply it.
 * Returns null when no swap helps — a 2-opt local optimum, which is often but NOT always as good as
 * the reference, so the bot idles there until a new sensor shakes things up.
 */
export function twoOptStep(order: readonly number[], sensors: readonly Sensor[]): number[] | null {
  const move = findTwoOptMove(order, sensors)
  return move === null ? null : swapWires(order, move.i, move.j)
}

/** The wire pair twoOptStep would swap next (wires i < j), or null at a local optimum — lets the UI animate the upcoming move before it lands. */
export function findTwoOptMove(order: readonly number[], sensors: readonly Sensor[]): { i: number; j: number } | null {
  const n = order.length
  if (n < 4) return null
  let bestGain = 1e-12
  let bestI = -1
  let bestJ = -1
  for (let i = 0; i < n - 1; i++) {
    const a = sensors[order[i]]
    const b = sensors[order[i + 1]]
    // j stops one short of wrapping onto edge i itself when i === 0.
    for (let j = i + 2; j < (i === 0 ? n - 1 : n); j++) {
      const c = sensors[order[j]]
      const d = sensors[order[(j + 1) % n]]
      const gain = wireBetween(a, b) + wireBetween(c, d) - wireBetween(a, c) - wireBetween(b, d)
      if (gain > bestGain) {
        bestGain = gain
        bestI = i
        bestJ = j
      }
    }
  }
  return bestI < 0 ? null : { i: bestI, j: bestJ }
}

/**
 * A 2-opt move named by the sensors it touches rather than loop positions: uncross wire a→b and
 * wire c→d into a→c and b→d. Positions shift whenever a sensor is spliced in, but these ids don't —
 * so a swap that's mid-animation survives a new sensor arriving.
 */
export interface WireSwap {
  a: number
  b: number
  c: number
  d: number
}

/** The sensor-id form of findTwoOptMove's wire pair (i < j) in order. */
export function swapFor(order: readonly number[], move: { i: number; j: number }): WireSwap {
  const n = order.length
  return { a: order[move.i], b: order[move.i + 1], c: order[move.j], d: order[(move.j + 1) % n] }
}

/** Where swap's two wires sit in order now (i < j, ready for swapWires), or null if either wire no longer exists. */
export function resolveSwap(order: readonly number[], swap: WireSwap): { i: number; j: number } | null {
  const n = order.length
  const first = order.indexOf(swap.a)
  const second = order.indexOf(swap.c)
  if (first < 0 || second < 0 || order[(first + 1) % n] !== swap.b || order[(second + 1) % n] !== swap.d) return null
  // 2-opt is symmetric in its two wires, so either may come first in the loop.
  return first < second ? { i: first, j: second } : { i: second, j: first }
}

/** A random visiting order of sensors 0..n-1 (Fisher–Yates) — the tangled wiring a fresh array starts with. */
export function shuffledWiring(n: number, rng: Rng): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1))
    ;[order[i], order[k]] = [order[k], order[i]]
  }
  return order
}

/**
 * Splices sensorIndex into the loop at a random position — how a new sensor joins Darkly-bot's
 * wiring, tangle and all. Given avoid (the swap Darkly-bot is mid-way through), it never splits
 * either of that swap's wires, so the move in flight can still finish.
 */
export function insertAtRandom(order: readonly number[], sensorIndex: number, rng: Rng, avoid?: WireSwap | null): number[] {
  const n = order.length
  const move = avoid ? resolveSwap(order, avoid) : null
  let at: number
  if (move === null) {
    at = Math.floor(rng() * (n + 1))
  } else {
    // Slot k + 1 splits wire k; slots 0 and n both split the closing wire n - 1.
    const splits = (slot: number, wire: number) => slot === wire + 1 || (wire === n - 1 && slot === 0)
    const slots = Array.from({ length: n + 1 }, (_, slot) => slot).filter((slot) => !splits(slot, move.i) && !splits(slot, move.j))
    at = slots.length === 0 ? Math.floor(rng() * (n + 1)) : slots[Math.floor(rng() * slots.length)]
  }
  return [...order.slice(0, at), sensorIndex, ...order.slice(at)]
}

/** Splices sensorIndex in where it adds the least wire — the warm start that keeps the reference loop current as sensors arrive. */
export function insertCheapest(order: readonly number[], sensorIndex: number, sensors: readonly Sensor[]): number[] {
  const n = order.length
  if (n < 2) return [...order, sensorIndex]
  const s = sensors[sensorIndex]
  let bestAt = 0
  let bestCost = Infinity
  for (let k = 0; k < n; k++) {
    const a = sensors[order[k]]
    const b = sensors[order[(k + 1) % n]]
    const cost = wireBetween(a, s) + wireBetween(s, b) - wireBetween(a, b)
    if (cost < bestCost) {
      bestCost = cost
      bestAt = k + 1
    }
  }
  return [...order.slice(0, bestAt), sensorIndex, ...order.slice(bestAt)]
}

/** Greedy nearest-neighbor loop from sensor 0 — the starting point for the reference search on a fresh board. */
export function nearestNeighborWiring(sensors: readonly Sensor[]): number[] {
  if (sensors.length === 0) return []
  const unvisited = new Set(sensors.map((_, i) => i))
  const order = [0]
  unvisited.delete(0)
  while (unvisited.size > 0) {
    const last = sensors[order[order.length - 1]]
    let nearest = -1
    let nearestDistance = Infinity
    for (const i of unvisited) {
      const distance = wireBetween(last, sensors[i])
      if (distance < nearestDistance) {
        nearest = i
        nearestDistance = distance
      }
    }
    order.push(nearest)
    unvisited.delete(nearest)
  }
  return order
}

/** One Or-opt move: relocate a run of 1–3 consecutive sensors (either direction) to wherever it saves the most wire. Returns null when no relocation helps. */
function orOptStep(order: readonly number[], sensors: readonly Sensor[]): number[] | null {
  const n = order.length
  if (n < 5) return null
  let bestGain = 1e-12
  let best: number[] | null = null
  for (let length = 1; length <= 3; length++) {
    for (let start = 0; start < n; start++) {
      // Rotate so the segment sits at the front: [segment..., rest...], the loop closing rest → segment.
      const rotated = [...order.slice(start), ...order.slice(0, start)]
      const segment = rotated.slice(0, length)
      const rest = rotated.slice(length)
      const first = sensors[segment[0]]
      const last = sensors[segment[length - 1]]
      const prev = sensors[rest[rest.length - 1]]
      const next = sensors[rest[0]]
      const removed = wireBetween(prev, first) + wireBetween(last, next) - wireBetween(prev, next)
      // Re-insert between rest[k] and rest[k+1]; k = rest.length - 1 would be the gap it came from.
      for (let k = 0; k < rest.length - 1; k++) {
        const a = sensors[rest[k]]
        const b = sensors[rest[k + 1]]
        const forward = wireBetween(a, first) + wireBetween(last, b) - wireBetween(a, b)
        const reversed = wireBetween(a, last) + wireBetween(first, b) - wireBetween(a, b)
        const gain = removed - Math.min(forward, reversed)
        if (gain > bestGain) {
          bestGain = gain
          const placed = forward <= reversed ? segment : [...segment].reverse()
          best = [...rest.slice(0, k + 1), ...placed, ...rest.slice(k + 1)]
        }
      }
    }
  }
  return best
}

/**
 * The local search behind the clarity reference: 2-opt and Or-opt moves until neither finds
 * anything. Strictly stronger than Darkly-bot's plain 2-opt, so the bot usually settles a little
 * short of it.
 */
export function improveReference(order: readonly number[], sensors: readonly Sensor[]): number[] {
  let current = [...order]
  for (;;) {
    const next = twoOptStep(current, sensors) ?? orOptStep(current, sensors)
    if (next === null) return current
    current = next
  }
}
