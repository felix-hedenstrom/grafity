import { useCallback, useEffect, useRef, useState } from 'react'

/** Each wheel "tick" (deltaY ~100 on most mice) scales the window by roughly this fraction —
 * applied as an exponent of deltaY so both slow mouse-wheel clicks and fast trackpad flicks feel
 * proportional rather than the trackpad's much larger deltaY blowing straight through the clamp. */
const ZOOM_SENSITIVITY = 1.0015

/**
 * Lets the player override the camera's automatic zoom level by scrolling — `null` means "follow
 * the automatic window size"; once the player scrolls, this takes over until `resumeAuto` is
 * called. Resets to automatic any time `resetKey` changes (a fresh run/level), the same way
 * useSmoothedBounds snaps on a new graph, so manual zoom never carries over to a graph it was
 * never set for.
 *
 * The clamp bounds come from the caller rather than fixed constants: both scale with the graph's
 * spacing (viewScale), and `maxSize` additionally covers the whole graph's extent so the player
 * can always zoom all the way out to a full-map overview, however large the graph has grown.
 */
export function useManualZoom(
  resetKey: unknown,
  minSize: number,
  maxSize: number,
): { manualSize: number | null; zoomBy: (deltaY: number, currentAutoSize: number) => void; resumeAuto: () => void } {
  const [manualSize, setManualSize] = useState<number | null>(null)
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      setManualSize(null)
    }
  }, [resetKey])

  const zoomBy = useCallback(
    (deltaY: number, currentAutoSize: number) => {
      setManualSize((current) => Math.min(maxSize, Math.max(minSize, (current ?? currentAutoSize) * Math.pow(ZOOM_SENSITIVITY, deltaY))))
    },
    [minSize, maxSize],
  )

  const resumeAuto = useCallback(() => setManualSize(null), [])

  return { manualSize, zoomBy, resumeAuto }
}
