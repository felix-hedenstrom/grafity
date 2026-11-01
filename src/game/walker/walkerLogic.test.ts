import { describe, expect, it } from 'vitest'
import { createWalker, moveWalker } from './walkerLogic'

describe('walkerLogic', () => {
  it('creates a walker sitting at the start node with an empty history', () => {
    const walker = createWalker('n0')
    expect(walker.currentNodeId).toBe('n0')
    expect(walker.previousNodeId).toBeNull()
    expect(walker.path).toEqual(['n0'])
    expect(walker.stepsTaken).toBe(0)
    expect(walker.hasReachedGoal).toBe(false)
  })

  it('moves to the next node, tracking previous node and path history', () => {
    const walker = createWalker('n0')
    const moved = moveWalker(walker, 'n1', 'n9')
    expect(moved.currentNodeId).toBe('n1')
    expect(moved.previousNodeId).toBe('n0')
    expect(moved.path).toEqual(['n0', 'n1'])
    expect(moved.stepsTaken).toBe(1)
    expect(moved.hasReachedGoal).toBe(false)
  })

  it('marks hasReachedGoal when moving onto the goal node', () => {
    const walker = createWalker('n0')
    const moved = moveWalker(walker, 'n9', 'n9')
    expect(moved.hasReachedGoal).toBe(true)
  })

  it('does not mutate the original walker state', () => {
    const walker = createWalker('n0')
    moveWalker(walker, 'n1', 'n9')
    expect(walker.currentNodeId).toBe('n0')
    expect(walker.path).toEqual(['n0'])
  })
})
