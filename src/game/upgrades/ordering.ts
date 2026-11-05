/**
 * Shop ordering rule: upgrades are always listed by unlock requirement (minLevel — the graph size
 * that must be reached before the first purchase), ascending. Ties keep their declared order, so
 * a dependent upgrade declared after its prerequisite
 * stays below it.
 */
export function sortByUnlockLevel<T>(items: readonly T[], unlockLevelOf: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => unlockLevelOf(a.item) - unlockLevelOf(b.item) || a.index - b.index)
    .map(({ item }) => item)
}
