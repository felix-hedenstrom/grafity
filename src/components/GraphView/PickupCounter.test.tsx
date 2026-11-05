// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PickupCounter } from './PickupCounter'

afterEach(cleanup)

describe('PickupCounter', () => {
  it('shows collected/total keys', () => {
    render(<PickupCounter kind="key" collected={1} total={3} />)
    expect(screen.getByRole('status', { name: 'Keys: 1 of 3' })).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
  })

  it('shows collected/total pulsars', () => {
    render(<PickupCounter kind="pulsar" collected={0} total={2} />)
    expect(screen.getByRole('status', { name: 'Pulsars: 0 of 2' })).toBeTruthy()
  })

  it('renders nothing when the level started without that pickup', () => {
    const { container } = render(<PickupCounter kind="pulsar" collected={0} total={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('marks the exit unlocked once every key is collected', () => {
    const { rerender } = render(<PickupCounter kind="key" collected={1} total={2} />)
    rerender(<PickupCounter kind="key" collected={2} total={2} />)
    expect(screen.getByRole('status', { name: /exit unlocked/ })).toBeTruthy()
    expect(screen.getByText('2/2')).toBeTruthy()
  })
})
