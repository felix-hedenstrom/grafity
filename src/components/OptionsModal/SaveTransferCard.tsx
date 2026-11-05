import { useEffect, useRef, useState } from 'react'
import { applyGamestateImport, downloadGamestateExport, serializeGamestateExport } from '../../game/saveTransfer'
import shopStyles from '../Shop/Shop.module.css'
import styles from './SaveTransferCard.module.css'

const ARM_TIMEOUT_MS = 3000
const COPIED_FLASH_MS = 1500

/** Export the full gamestate (progression, prestige, achievements, live run) as JSON for debugging,
 * and import such a file back. Import overwrites the current save, so it uses the same two-click
 * arm/confirm pattern as ResetButton; on success it reloads immediately so every store rehydrates
 * from the imported localStorage keys before any live write can re-persist the old state. */
export function SaveTransferCard() {
  const [copied, setCopied] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [armed])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => clearTimeout(id)
  }, [copied])

  async function handleCopy() {
    await navigator.clipboard.writeText(serializeGamestateExport())
    setCopied(true)
  }

  function runImport(json: string) {
    const result = applyGamestateImport(json)
    if (result.ok) {
      location.reload()
    } else {
      setError(result.error)
    }
  }

  function handleImportClick() {
    setError(null)
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    const pasted = pasteRef.current?.value.trim()
    if (pasted) {
      runImport(pasted)
    } else {
      fileInputRef.current?.click()
    }
  }

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    runImport(await file.text())
  }

  return (
    <div className={shopStyles.card}>
      <div className={shopStyles.name}>Export / import save</div>
      <div className={shopStyles.description}>
        Export the whole gamestate as JSON for debugging. Importing replaces the current save and reloads the page —
        pick a file, or paste JSON below first.
      </div>
      <textarea
        ref={pasteRef}
        className={styles.pasteArea}
        placeholder="Paste exported JSON here to import it (optional)"
        spellCheck={false}
      />
      <div className={shopStyles.buttonRow}>
        <button type="button" className={shopStyles.buyButton} onClick={downloadGamestateExport}>
          Export file
        </button>
        {typeof navigator !== 'undefined' && navigator.clipboard && (
          <button type="button" className={shopStyles.buyButton} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        )}
        <button type="button" className={shopStyles.buyButton} onClick={handleImportClick}>
          {armed ? 'Click again to confirm' : 'Import…'}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFilePicked}
      />
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
