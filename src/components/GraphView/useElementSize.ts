import { useEffect, useRef, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/**
 * Live pixel size of a DOM element via ResizeObserver — for layout math (matching the SVG
 * viewBox's aspect ratio to the container's actual on-screen shape) that can't be inferred from
 * CSS alone: .graph's height is `70vh`/`max-height: 600px` and its width is `100%`, both of which
 * depend on page layout at render time and can change on window resize.
 *
 * Guards against environments without ResizeObserver (e.g. jsdom in tests without a polyfill) by
 * simply never updating past the zero-size initial state, rather than throwing.
 */
export function useElementSize<T extends Element>(): [React.RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0]
      setSize(box ? { width: box.inlineSize, height: box.blockSize } : { width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
