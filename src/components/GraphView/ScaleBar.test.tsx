// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScaleBar } from './ScaleBar'

afterEach(cleanup)

describe('ScaleBar', () => {
  it('shows a light-time label and no change badge on first mount', () => {
    render(<ScaleBar worldPerPixel={1} spacing={150} />)
    expect(screen.getByRole('img', { name: /Map scale: 0\.17 ls/ })).toBeTruthy()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('flashes the % growth when a new graph is more spread out', () => {
    const { rerender } = render(<ScaleBar worldPerPixel={1} spacing={100} />)
    rerender(<ScaleBar worldPerPixel={1.38} spacing={138} />)
    expect(screen.getByText('↑38%')).toBeTruthy()
  })

  it('marks a shrink (prestige reset) with a down arrow', () => {
    const { rerender } = render(<ScaleBar worldPerPixel={4} spacing={400} />)
    rerender(<ScaleBar worldPerPixel={1} spacing={100} />)
    expect(screen.getByText('↓75%')).toBeTruthy()
  })

  it('ignores a same-spacing graph', () => {
    const { rerender } = render(<ScaleBar worldPerPixel={1} spacing={100} />)
    rerender(<ScaleBar worldPerPixel={1} spacing={100.1} />)
    expect(screen.queryByText(/%/)).toBeNull()
  })
})
