import { stopGame } from './index'
import { RUN_SAVE_KEY, toSavedRunState, useRunStore } from '../store/useRunStore'
import type { SavedRunState } from '../store/useRunStore'

export const EXPORT_FORMAT_VERSION = 1

/** The zustand persist wrapper each persisted store keeps in localStorage. Shipped verbatim in exports so each store's own version/migrate machinery still applies on import. */
interface PersistEnvelope {
  state: Record<string, unknown>
  version?: number
}

const PERSIST_KEYS = {
  progression: 'grafity-save-v1',
  prestige: 'grafity-prestige-v1',
  achievements: 'grafity-achievements-v1',
  scannerWiring: 'grafity-scanner-v1',
} as const

export interface GamestateExport {
  kind: 'grafity-gamestate'
  version: typeof EXPORT_FORMAT_VERSION
  exportedAt: string
  progression: PersistEnvelope | null
  prestige: PersistEnvelope | null
  achievements: PersistEnvelope | null
  /** Absent in exports made before the Scanner Array existed — read as null (a fresh board). */
  scannerWiring?: PersistEnvelope | null
  run: SavedRunState | null
}

function readEnvelope(key: string): PersistEnvelope | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PersistEnvelope
  } catch {
    return null
  }
}

export function buildGamestateExport(): GamestateExport {
  return {
    kind: 'grafity-gamestate',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    progression: readEnvelope(PERSIST_KEYS.progression),
    prestige: readEnvelope(PERSIST_KEYS.prestige),
    achievements: readEnvelope(PERSIST_KEYS.achievements),
    scannerWiring: readEnvelope(PERSIST_KEYS.scannerWiring),
    run: toSavedRunState(useRunStore.getState()),
  }
}

export function serializeGamestateExport(): string {
  return JSON.stringify(buildGamestateExport(), null, 2)
}

export function downloadGamestateExport(): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([serializeGamestateExport()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `grafity-export-${stamp}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export type ImportResult = { ok: true } | { ok: false; error: string }

function isEnvelope(value: unknown): value is PersistEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PersistEnvelope).state === 'object' &&
    (value as PersistEnvelope).state !== null
  )
}

/** The fields loadSavedRun's boot-time hydration dereferences without guards — a run that passes this won't crash the store's module init. */
function isImportableRun(run: unknown): run is SavedRunState {
  if (typeof run !== 'object' || run === null) return false
  const candidate = run as SavedRunState
  return (
    typeof candidate.graph === 'object' &&
    candidate.graph !== null &&
    Array.isArray(candidate.graph.nodes) &&
    candidate.graph.nodes.length > 0 &&
    Array.isArray(candidate.walkers) &&
    candidate.walkers.length > 0 &&
    Array.isArray(candidate.discoveredNodeIds) &&
    Array.isArray(candidate.discoveredEdgeIds) &&
    Array.isArray(candidate.visitedNodeIds)
  )
}

/** Validates an exported gamestate and writes it into localStorage. Writes nothing on failure.
 * Does NOT reload — the caller must location.reload() immediately so the stores rehydrate from
 * the imported keys before any live store write can re-persist the old state over them. */
export function applyGamestateImport(json: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Not valid JSON.' }
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as GamestateExport).kind !== 'grafity-gamestate') {
    return { ok: false, error: 'Not a grafity gamestate export.' }
  }
  const data = parsed as GamestateExport
  if (data.version !== EXPORT_FORMAT_VERSION) {
    return { ok: false, error: `Export is version ${data.version}; this build reads version ${EXPORT_FORMAT_VERSION}.` }
  }
  for (const section of ['progression', 'prestige', 'achievements', 'scannerWiring'] as const) {
    if ((data[section] ?? null) !== null && !isEnvelope(data[section])) {
      return { ok: false, error: `Malformed "${section}" section.` }
    }
  }
  if (data.run !== null && !isImportableRun(data.run)) {
    return { ok: false, error: 'Malformed "run" section.' }
  }

  // location.reload() doesn't unload the page instantly — a walker timer firing in the gap would
  // set() stores and synchronously re-persist the OLD state over the keys written below. Kill the
  // scheduler first so nothing can write between here and the navigation landing.
  stopGame()

  for (const section of ['progression', 'prestige', 'achievements', 'scannerWiring'] as const) {
    const envelope = data[section] ?? null
    if (envelope) localStorage.setItem(PERSIST_KEYS[section], JSON.stringify(envelope))
    else localStorage.removeItem(PERSIST_KEYS[section])
  }
  if (data.run) localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(data.run))
  else localStorage.removeItem(RUN_SAVE_KEY)
  return { ok: true }
}
