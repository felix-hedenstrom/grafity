import type { Rng } from '../../utils/rng'
import { randomInt } from '../../utils/rng'

export interface Point {
  x: number
  y: number
}

const DEFAULT_CANDIDATE_ATTEMPTS = 30

/**
 * Bridson's algorithm: samples points across a width x height rectangle such that no two points
 * are closer than minDistance, with no large empty gaps either — a "blue noise" distribution that
 * reads as evenly spread rather than clumped (uniform random sampling clumps by chance) or rigidly
 * gridded. Point count isn't specified directly; it falls out of how many points fit at that
 * spacing, roughly (width * height) / minDistance² times a packing-density constant.
 */
export function samplePoissonDisk(width: number, height: number, minDistance: number, rng: Rng, k = DEFAULT_CANDIDATE_ATTEMPTS): Point[] {
  const cellSize = minDistance / Math.SQRT2
  const gridWidth = Math.max(1, Math.ceil(width / cellSize))
  const gridHeight = Math.max(1, Math.ceil(height / cellSize))
  const grid: (Point | undefined)[] = new Array(gridWidth * gridHeight)

  const points: Point[] = []
  const active: Point[] = []

  const cellOf = (p: Point) => ({ gx: Math.floor(p.x / cellSize), gy: Math.floor(p.y / cellSize) })

  function isFarEnoughFromExisting(p: Point): boolean {
    const { gx, gy } = cellOf(p)
    const minGx = Math.max(0, gx - 2)
    const maxGx = Math.min(gridWidth - 1, gx + 2)
    const minGy = Math.max(0, gy - 2)
    const maxGy = Math.min(gridHeight - 1, gy + 2)
    for (let yy = minGy; yy <= maxGy; yy++) {
      for (let xx = minGx; xx <= maxGx; xx++) {
        const neighbor = grid[yy * gridWidth + xx]
        if (!neighbor) continue
        const dx = neighbor.x - p.x
        const dy = neighbor.y - p.y
        if (dx * dx + dy * dy < minDistance * minDistance) return false
      }
    }
    return true
  }

  function addPoint(p: Point): void {
    points.push(p)
    active.push(p)
    const { gx, gy } = cellOf(p)
    grid[gy * gridWidth + gx] = p
  }

  addPoint({ x: rng() * width, y: rng() * height })

  while (active.length > 0) {
    const activeIndex = randomInt(rng, active.length)
    const origin = active[activeIndex]
    let placedCandidate = false

    for (let attempt = 0; attempt < k; attempt++) {
      const angle = rng() * Math.PI * 2
      const radius = minDistance * (1 + rng()) // in [minDistance, 2*minDistance)
      const candidate = { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius }
      if (candidate.x < 0 || candidate.x >= width || candidate.y < 0 || candidate.y >= height) continue
      if (!isFarEnoughFromExisting(candidate)) continue
      addPoint(candidate)
      placedCandidate = true
      break
    }

    if (!placedCandidate) {
      active.splice(activeIndex, 1)
    }
  }

  return points
}
