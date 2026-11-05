// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WalkerToken } from './WalkerToken'

/** The .heading group — the first child <g> of the outer .position group, whose transform the
 * discovering orbit owns while active (selected structurally since CSS-module class names aren't
 * resolved under the test css pipeline). */
function headingEl(container: HTMLElement): SVGGElement {
  const el = container.querySelector('svg > g > g')
  if (!el) throw new Error('heading group not found')
  return el as SVGGElement
}

const restingProps = { x: 10, y: 20, travelMs: 0, angle: 45, nodeRadius: 10 }

/** Whether any flame rig is currently firing (vitest resolves CSS-module keys to their names). */
function flamesActive(container: HTMLElement): boolean {
  return container.querySelector('[class*="flameActive"]') != null
}

afterEach(cleanup)

describe('WalkerToken discovering orbit', () => {
  it('writes the orbit transform imperatively (and suspends the heading transition) while a rest with a known wait is active', () => {
    const { container } = render(
      <svg>
        <WalkerToken {...restingProps} restStartedAt={Date.now()} restWaitMs={4000} />
      </svg>,
    )
    const heading = headingEl(container)
    // The hook's first frame lands synchronously in the activation commit: a translate+rotate
    // pair (the spiral), with the class transition suspended so per-frame writes don't smear.
    expect(heading.style.transform).toMatch(/translate\(.*rotate\(/)
    expect(heading.style.transition).toBe('none')
  })

  it('rests nose-steady with no orbit when the pause has no rest record (initial rest, boxed-in, revisit, celebration)', () => {
    const { container } = render(
      <svg>
        <WalkerToken {...restingProps} />
      </svg>,
    )
    const heading = headingEl(container)
    expect(heading.style.transform).toBe('rotate(45deg)')
    expect(heading.style.transition).toBe('')
  })

  it('skips the orbit for waits too short to read as motion', () => {
    const { container } = render(
      <svg>
        <WalkerToken {...restingProps} restStartedAt={Date.now()} restWaitMs={300} />
      </svg>,
    )
    expect(headingEl(container).style.transform).toBe('rotate(45deg)')
  })

  it('hands the transform back to React (pure rotate, transition restored) when the departure transit arrives', () => {
    const { container, rerender } = render(
      <svg>
        <WalkerToken {...restingProps} restStartedAt={Date.now()} restWaitMs={4000} />
      </svg>,
    )
    rerender(
      <svg>
        <WalkerToken {...restingProps} travelMs={800} angle={120} startedAt={Date.now()} accelEndMs={400} />
      </svg>,
    )
    const heading = headingEl(container)
    expect(heading.style.transition).toBe('')
    // Pure rotation at the node center — the glide starts from where the orbit parked the ship,
    // with the restored 220ms class transition easing the turn. The exact degree value is the
    // shortest-way unwrap from the orbit's final nose, so just assert there's no translate left.
    expect(heading.style.transform).toMatch(/^rotate\(/)
  })
})

describe('WalkerToken thrust flames', () => {
  const transitProps = { x: 10, y: 20, angle: 45, nodeRadius: 10, travelMs: 800, variant: 'main' as const }

  it('fires during the acceleration phase of a transit', () => {
    const { container } = render(
      <svg>
        <WalkerToken {...transitProps} startedAt={Date.now()} accelEndMs={400} decelStartMs={null} />
      </svg>,
    )
    expect(flamesActive(container)).toBe(true)
  })

  it('stays off when the transit departs already at max speed (zero-length accel phase)', () => {
    const { container } = render(
      <svg>
        <WalkerToken {...transitProps} startedAt={Date.now()} accelEndMs={0} decelStartMs={null} />
      </svg>,
    )
    expect(flamesActive(container)).toBe(false)
  })

  it('fires the retrograde burn when the transit brakes immediately', () => {
    const { container } = render(
      <svg>
        <WalkerToken {...transitProps} startedAt={Date.now()} accelEndMs={0} decelStartMs={0} />
      </svg>,
    )
    expect(flamesActive(container)).toBe(true)
  })
})
