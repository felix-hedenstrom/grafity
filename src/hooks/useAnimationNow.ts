import { useEffect, useState } from 'react'

/** Date.now(), re-rendering every animation frame while enabled — for continuous visual motion (e.g. the Scanner Array's morphing wires). */
export function useAnimationNow(enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    let frame = requestAnimationFrame(function loop() {
      setNow(Date.now())
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [enabled])
  return now
}
