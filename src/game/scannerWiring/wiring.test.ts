import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import { addSensor, applySwap, botStep, createScannerArray, currentWireLength } from './array'
import { generateBoard } from './board'
import type { Sensor } from './board'
import {
  findTwoOptMove,
  improveReference,
  insertAtRandom,
  insertCheapest,
  isCompleteWiring,
  nearestNeighborWiring,
  resolveSwap,
  swapFor,
  shuffledWiring,
  swapWires,
  twoOptStep,
  wireLength,
} from './wiring'

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))
}

/** Brute force: every loop starting at sensor 0 — the exact optimum, for small boards only. */
function bruteForceOptimal(sensors: Sensor[]): number {
  const rest = sensors.map((_, i) => i).slice(1)
  return Math.min(...permutations(rest).map((p) => wireLength([0, ...p], sensors)))
}

describe('scanner wiring geometry', () => {
  it('measures a closed loop, including the run back to the first sensor', () => {
    const square: Sensor[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    expect(wireLength([0, 1, 2, 3], square)).toBeCloseTo(4)
    expect(wireLength([0, 2, 1, 3], square)).toBeCloseTo(2 + 2 * Math.SQRT2)
  })

  it('recognizes complete wirings only', () => {
    expect(isCompleteWiring([2, 0, 1], 3)).toBe(true)
    expect(isCompleteWiring([0, 1], 3)).toBe(false)
    expect(isCompleteWiring([0, 1, 1], 3)).toBe(false)
  })

  it('swapping two wires keeps one loop and undoes itself', () => {
    const order = [0, 1, 2, 3, 4, 5, 6]
    const swapped = swapWires(order, 1, 4)
    expect(swapped).toEqual([0, 1, 4, 3, 2, 5, 6])
    expect(swapWires(swapped, 1, 4)).toEqual(order)
  })

  it('shuffles and splices into complete wirings', () => {
    const rng = mulberry32(3)
    const order = shuffledWiring(12, rng)
    expect(isCompleteWiring(order, 12)).toBe(true)
    expect(isCompleteWiring(insertAtRandom(order, 12, rng), 13)).toBe(true)
    const sensors = generateBoard(13, rng)
    expect(isCompleteWiring(insertCheapest(order, 12, sensors), 13)).toBe(true)
    expect(isCompleteWiring(nearestNeighborWiring(sensors), 13)).toBe(true)
  })

  it('the reference search finds the true optimum on small boards', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sensors = generateBoard(5 + (seed % 4), mulberry32(seed))
      const reference = improveReference(nearestNeighborWiring(sensors), sensors)
      expect(isCompleteWiring(reference, sensors.length)).toBe(true)
      expect(wireLength(reference, sensors)).toBeCloseTo(bruteForceOptimal(sensors), 6)
    }
  })

  it('a 2-opt step always strictly shortens the wiring, and stalls only at a local optimum', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const sensors = generateBoard(30, mulberry32(seed))
      let order = shuffledWiring(30, mulberry32(seed + 100))
      for (let step = 0; step < 2000; step++) {
        const next = twoOptStep(order, sensors)
        if (next === null) break
        expect(isCompleteWiring(next, sensors.length)).toBe(true)
        expect(wireLength(next, sensors)).toBeLessThan(wireLength(order, sensors))
        order = next
      }
      expect(twoOptStep(order, sensors)).toBeNull()
    }
  })

  it('the move the modal animates is exactly the one Darkly-bot commits', () => {
    const sensors = generateBoard(25, mulberry32(9))
    const order = shuffledWiring(25, mulberry32(10))
    const move = findTwoOptMove(order, sensors)!
    expect(move.i).toBeLessThan(move.j)
    expect(swapWires(order, move.i, move.j)).toEqual(twoOptStep(order, sensors))
  })

  it('keeps generated sensors on the board, even when crowded', () => {
    const sensors = generateBoard(200, mulberry32(7))
    expect(sensors).toHaveLength(200)
    for (const s of sensors) {
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(1)
      expect(s.y).toBeGreaterThan(0)
      expect(s.y).toBeLessThan(0.75)
    }
  })
})

describe('scanner array', () => {
  it('starts with 5 sensors, grows by one per neutron star, and clarity never exceeds 1', () => {
    const rng = mulberry32(11)
    let array = createScannerArray(rng)
    expect(array.sensors).toHaveLength(5)
    for (let i = 0; i < 40; i++) {
      array = addSensor(array, rng)
      for (let step = 0; step < 5; step++) array = botStep(array) ?? array
      expect(isCompleteWiring(array.order, array.sensors.length)).toBe(true)
      expect(isCompleteWiring(array.referenceOrder, array.sensors.length)).toBe(true)
      expect(array.referenceLength).toBeLessThanOrEqual(currentWireLength(array) + 1e-12)
    }
    expect(array.sensors).toHaveLength(45)
  })

  it('Darkly-bot eventually stalls, at or above the reference', () => {
    let array = createScannerArray(mulberry32(5))
    const rng = mulberry32(6)
    for (let i = 0; i < 25; i++) array = addSensor(array, rng)
    for (;;) {
      const next = botStep(array)
      if (next === null) break
      array = next
    }
    expect(currentWireLength(array)).toBeGreaterThanOrEqual(array.referenceLength - 1e-12)
  })
})

describe('a swap in flight survives a new sensor', () => {
  it('never splits the pending swap, and commits the same move it was animating', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed)
      let array = createScannerArray(rng)
      for (let i = 0; i < 8; i++) array = addSensor(array, rng)
      const move = findTwoOptMove(array.order, array.sensors)
      if (move === null) continue
      const swap = swapFor(array.order, move)
      const before = new Set(edgesOf(swapWires(array.order, move.i, move.j)))

      const grown = addSensor(array, rng, swap)
      expect(isCompleteWiring(grown.order, grown.sensors.length)).toBe(true)
      expect(resolveSwap(grown.order, swap)).not.toBeNull()

      const committed = applySwap(grown, swap)!
      // Same uncrossing: dropping the new sensor's two wires (and restoring the one it split) gives the pre-insertion result.
      const newSensor = grown.sensors.length - 1
      const after = new Set(edgesOf(committed.order).filter((e) => !e.split('-').includes(String(newSensor))))
      const k = grown.order.indexOf(newSensor)
      const n = grown.order.length
      const prev = grown.order[(k - 1 + n) % n]
      const next = grown.order[(k + 1) % n]
      after.add(edgeKey(prev, next))
      expect(after).toEqual(before)
    }
  })
})

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

function edgesOf(order: readonly number[]): string[] {
  return order.map((s, k) => edgeKey(s, order[(k + 1) % order.length]))
}
