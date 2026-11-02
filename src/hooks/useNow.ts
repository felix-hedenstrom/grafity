import { useEffect, useState } from 'react'

/** The current wall-clock time, re-rendering on an interval — for displays that need to tick forward with real time between game ticks (e.g. Momentum's time-based bonus), not just on state changes. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
