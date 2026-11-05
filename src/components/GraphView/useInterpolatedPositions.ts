import { useEffect, useRef, useState } from 'react'
import type { GraphNode, NodeId } from '../../game/graph/types'
import type { WalkerTransit } from '../../store/useRunStore'

export interface WalkerPositionInput {
  currentNodeId: NodeId
  transit: WalkerTransit | null
  /** Speed the walker had entering this transit (0 if it departed at rest) — together with
   * transit.exitVelocity, picks which of the four curve shapes below the hop follows. Defaults to
   * 0 for callers that don't track per-walker velocity (e.g. a fixed camera target). */
  v0?: number
}

function linear(t: number): number {
  return t
}

function easeIn(t: number): number {
  return t * t
}

function easeOut(t: number): number {
  return t * (2 - t)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

/** Picks the curve shape for this hop from the two endpoints of its velocity profile: v0 (speed
 * entering the edge) and exitVelocity (speed reaching the far node — 0 if braking to a stop).
 * This IS the walker's on-screen motion, not an approximation of one: WalkerToken renders at the
 * positions this hook computes. */
function easingFor(v0: number, exitVelocity: number): (t: number) => number {
  if (v0 === 0) return exitVelocity === 0 ? easeInOut : easeIn
  return exitVelocity === 0 ? easeOut : linear
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function nodePos(id: NodeId, nodesById: Map<NodeId, GraphNode>): { x: number; y: number } {
  const node = nodesById.get(id)
  return { x: node?.x ?? 0, y: node?.y ?? 0 }
}

/**
 * Continuously-updating (x, y) per walker — the single authority on where each walker is on
 * screen. WalkerToken's translate(), the reveal-line endpoint, and the camera focus all read this
 * same value each frame, which is what keeps them pixel-locked to each other: any time the ship's
 * position is animated by a second mechanism (as with the old CSS transform transition), the two
 * clocks/curves inevitably drift apart mid-hop.
 */
export function useInterpolatedPositions(inputs: WalkerPositionInput[], nodesById: Map<NodeId, GraphNode>): { x: number; y: number }[] {
  const computeAll = () =>
    inputs.map(({ currentNodeId, transit, v0 }) => {
      const from = nodePos(currentNodeId, nodesById)
      if (!transit) return from
      const to = nodePos(transit.nextNodeId, nodesById)
      const t = Math.min(1, (Date.now() - transit.startedAt) / transit.travelMs)
      const eased = easingFor(v0 ?? 0, transit.exitVelocity)(t)
      return { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased) }
    })

  const [positions, setPositions] = useState(computeAll)
  const latest = useRef(computeAll)
  latest.current = computeAll

  const hasActiveTransit = inputs.some((input) => input.transit !== null)

  useEffect(() => {
    setPositions(latest.current())
    if (!hasActiveTransit) return

    let rafId: number
    const step = () => {
      setPositions(latest.current())
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, nodesById, hasActiveTransit])

  return positions
}
