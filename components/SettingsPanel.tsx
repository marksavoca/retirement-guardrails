import { useState } from 'react'
import { getStorage } from '../lib/storage/factory'

export default function SettingsPanel({
  lowerPct,
  upperPct,
  onClose,
  onSaved,
}: {
  lowerPct: number
  upperPct: number
  onClose: () => void
  onSaved: (lp: number, up: number) => Promise<void> | void
}) {
  const [lp, setLp] = useState<number>(lowerPct)
  const [up, setUp] = useState<number>(upperPct)
  const [saving, setSaving] = useState(false)

  async function save() {
    const lpNum = Number(lp)
    const upNum = Number(up)
    if (!Number.isFinite(lpNum) || !Number.isFinite(upNum)) {
      alert('Please enter valid numbers for the guardrails.')
      return
    }
    setSaving(true)
    try {
      const store = await getStorage()
      await store.saveSettings(lpNum, upNum)  // ← persists via hosted or local storage
      await onSaved(lpNum, upNum)             // ← let parent update any local state
      onClose()
    } catch (e) {
      console.error(e)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="title">Settings</div>

        <div className="row">
          <label>Lower Guardrail (% below plan)</label>
          <input
            className="number"
            type="number"
            value={lp}
            onChange={(e) => setLp(Number(e.target.value))}
          />
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <label>Upper Guardrail (% above plan)</label>
          <input
            className="number"
            type="number"
            value={up}
            onChange={(e) => setUp(Number(e.target.value))}
          />
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
