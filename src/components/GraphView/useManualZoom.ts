import { useCallback, useEffect, useRef, useState } from 'react'
import { MANUAL_MIN_VIEW_SIZE, MAX_VIEW_SIZE } from '../../game/graph/layout'

/** Each wheel "tick" (deltaY ~100 on most mice) scales the window by roughly this fraction —
 * applied as an exponent of deltaY so both slow mouse-wheel clicks and fast trackpad flicks feel
 * proportional rather than the trackpad's much larger deltaY blowing straight through the clamp. */
const ZOOM_SENSITIVITY = 1.0015

function clamp(size: number): number {
  return Math.min(MAX_VIEW_SIZE, Math.max(MANUAL_MIN_VIEW_SIZE, size))
}

/**
 * Lets the player override the camera's automatic zoom level by scrolling — `null` means "follow
 * the automatic window size"; once the player scrolls, this takes over until `resumeAuto` is
 * called. Resets to automatic any time `resetKey` changes (a fresh run/level), the same way
 * useSmoothedBounds snaps on a new graph, so manual zoom never carries over to a graph it was
 * never set for.
 */
export function useManualZoom(resetKey: unknown): { manualSize: number | null; zoomBy: (deltaY: number, currentAutoSize: number) => void; resumeAuto: () => void } {
  const [manualSize, setManualSize] = useState<number | null>(null)
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      setManualSize(null)
    }
  }, [resetKey])

  const zoomBy = useCallback((deltaY: number, currentAutoSize: number) => {
    setManualSize((current) => clamp((current ?? currentAutoSize) * Math.pow(ZOOM_SENSITIVITY, deltaY)))
  }, [])

  const resumeAuto = useCallback(() => setManualSize(null), [])

  return { manualSize, zoomBy, resumeAuto }
}
