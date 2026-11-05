import type { Rng } from '../../utils/rng'

/**
 * The Scanner Array's wiring board: sensors scattered on a panel, every pair joinable by a
 * straight run of wire (a complete Euclidean graph). The array is ONE closed loop through every
 * sensor — a Traveling Salesman tour, flavored as signal routing — which Darkly-bot keeps
 * untangling while neutron stars out in the levels keep adding sensors to it.
 */

/** A sensor's position on the panel, in board units: x ∈ [0, BOARD_WIDTH], y ∈ [0, BOARD_HEIGHT]. */
export interface Sensor {
  x: number
  y: number
}

export const BOARD_WIDTH = 1
export const BOARD_HEIGHT = 0.75
/** Keeps sensors clear of the panel edge so their glow never clips. */
const BOARD_MARGIN = 0.06
/** Rejection-sampling attempts per sensor before settling for the roomiest candidate seen. */
const PLACEMENT_ATTEMPTS = 60

const USABLE_WIDTH = BOARD_WIDTH - 2 * BOARD_MARGIN
const USABLE_HEIGHT = BOARD_HEIGHT - 2 * BOARD_MARGIN

/** Ideal minimum gap between sensors on a board of this many — shrinks as the board fills up. */
function minSpacingFor(sensorCount: number): number {
  return 0.55 * Math.sqrt((USABLE_WIDTH * USABLE_HEIGHT) / sensorCount)
}

/** One new sensor position clear of the existing ones at the spacing for the grown board — or, on a crowded board, the roomiest of PLACEMENT_ATTEMPTS candidates. */
export function placeSensor(existing: readonly Sensor[], rng: Rng): Sensor {
  const minSpacing = minSpacingFor(existing.length + 1)
  let roomiest: Sensor = { x: 0, y: 0 }
  let roomiestGap = -1
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const candidate = { x: BOARD_MARGIN + rng() * USABLE_WIDTH, y: BOARD_MARGIN + rng() * USABLE_HEIGHT }
    let gap = Infinity
    for (const s of existing) gap = Math.min(gap, Math.hypot(s.x - candidate.x, s.y - candidate.y))
    if (gap >= minSpacing) return candidate
    if (gap > roomiestGap) {
      roomiest = candidate
      roomiestGap = gap
    }
  }
  return roomiest
}

/** Scatters sensorCount sensors over the panel, kept apart so no two overlap visually. */
export function generateBoard(sensorCount: number, rng: Rng): Sensor[] {
  const sensors: Sensor[] = []
  for (let i = 0; i < sensorCount; i++) sensors.push(placeSensor(sensors, rng))
  return sensors
}
