import { useEffect, useRef, useState } from 'react'
import type { GraphBounds } from '../../game/graph/layout'

const DURATION_MS = 350

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** Ease-out — fast at first, settling smoothly into the target rather than arriving at a constant speed. */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/**
 * Smoothly chases `target` instead of snapping straight to it — the raw camera window from
 * computeViewBounds recenters on the walkers' average position every single tick once a graph is
 * large enough to be windowed, and jumping the SVG viewBox there instantly read as a jarring
 * teleport rather than the walker simply moving. Each time the target changes mid-flight, this
 * blends onward from wherever it currently is (not back to the start), so a steady stream of
 * per-tick target updates reads as one continuous glide rather than a series of resets.
 *
 * `resetKey` identifies the current graph/run — when it changes, the old target (centered on the
 * previous graph's exit point) has nothing to do with the new one, so this snaps straight to the
 * new target instead of gliding across two unrelated graphs.
 */
export function useSmoothedBounds(target: GraphBounds, resetKey: unknown): GraphBounds {
  const [displayed, setDisplayed] = useState(target)
  const displayedRef = useRef(target)
  displayedRef.current = displayed
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    const isReset = resetKeyRef.current !== resetKey
    resetKeyRef.current = resetKey

    if (isReset) {
      setDisplayed(target)
      return
    }

    const from = displayedRef.current
    let startTime: number | null = null
    let rafId: number

    function step(timestamp: number) {
      if (startTime === null) startTime = timestamp
      const t = Math.min(1, (timestamp - startTime) / DURATION_MS)
      const eased = easeOutQuad(t)
      setDisplayed({
        minX: lerp(from.minX, target.minX, eased),
        minY: lerp(from.minY, target.minY, eased),
        width: lerp(from.width, target.width, eased),
        height: lerp(from.height, target.height, eased),
      })
      if (t < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)

    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.minX, target.minY, target.width, target.height, resetKey])

  return displayed
}
