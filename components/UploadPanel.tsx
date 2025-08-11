import { useEffect, useRef, useState } from 'react'
import * as Papa from 'papaparse'
import { getStorage } from '../lib/storage/factory'
import { buildPlanFromCSV } from '../lib/guardrails'
import type { PlanMeta } from '../lib/storage/types'

type BoldinishRow = Record<string, string | number>

export default function UploadPanelSimple({
  onPlanSaved,
  onCancel,
}: {
  onPlanSaved: () => Promise<void> | void
  onCancel?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  // file + parsed data
  const [csvText, setCsvText] = useState('')
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [filename, setFilename] = useState('')

  // items/assumptions
  const [items, setItems] = useState<string[]>([])
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [assumption, setAssumption] = useState<string>('Average')

  // selections (default exclude Housing)
  const [includeItems, setIncludeItems] = useState<string[]>([])
  const [excludeItems, setExcludeItems] = useState<string[]>(['Housing'])

  // last meta + ui
  const [lastMeta, setLastMeta] = useState<PlanMeta>(null)
  const [saving, setSaving] = useState(false)
  const fileChosen = !!filename

  // Prefill from last saved meta (works for local/remote via storage adapter)
  useEffect(() => {
    (async () => {
      try {
        const store = await getStorage()
        const data = await store.getPlan()
        if (data?.meta) {
          setLastMeta(data.meta)
          if (data.meta.assumption) setAssumption(data.meta.assumption)
          if (data.meta.items?.include) setIncludeItems(data.meta.items.include)
          if (data.meta.items?.exclude) {
            setExcludeItems(
              data.meta.items.exclude.length ? data.meta.items.exclude : ['Housing']
            )
          }
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])

  async function onChooseFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    setFilename(file.name)

    Papa.parse<BoldinishRow>(text, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        const rows = (results.data as any[]).filter(Boolean)
        setParsedRows(rows)

        // items from Accounts rows
        const itemSet = new Set(
          rows
            .filter((r) => String(r['Category']).toLowerCase() === 'accounts')
            .map((r) => String(r['Item']).trim())
        )
        setItems(Array.from(itemSet).sort())

        // assumptions list
        const assumpSet = new Set(
          rows.map((r) => String(r['Assumptions'] || '').trim()).filter(Boolean)
        )
        const arr = Array.from(assumpSet)
        setAssumptions(arr)
        if (arr.length && !arr.includes(assumption)) setAssumption(arr[0]!)
      },
    })
  }

  async function onSave() {
    if (!fileChosen || !parsedRows.length) return
    setSaving(true)
    try {
      const series = buildPlanFromCSV(parsedRows, {
        selectedAssumption: assumption,
        includeItems,
        excludeItems,
      })
      const store = await getStorage()
      await store.savePlan(series, {
        filename,
        assumption,
        items: { include: includeItems, exclude: excludeItems },
      })

      // refresh meta (for the “Last upload” line)
      const data = await store.getPlan()
      if (data?.meta) setLastMeta(data.meta)

      await onPlanSaved()
    } catch (e) {
      console.error(e)
      alert('Failed to save plan. Please check the CSV and try again.')
    } finally {
      setSaving(false)
    }
  }

  const isChecked = (it: string) =>
    !excludeItems.includes(it) && (includeItems.length === 0 || includeItems.includes(it))

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* No title here — your Modal title is the single header */}

      {lastMeta && (
        <div className="help" style={{ marginBottom: 12, lineHeight: 1.4 }}>
          Last upload: <b>{lastMeta.filename}</b> ·{' '}
          {new Date(lastMeta.uploaded_at).toLocaleString()}
          {lastMeta.assumption ? (
            <> · Assumption: <b>{lastMeta.assumption}</b></>
          ) : null}
        </div>
      )}

      <div className="cardish" style={{ padding: 12, borderRadius: 12 }}>
        {/* File chooser */}
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onChooseFile(f)
            }}
          />
          {filename && (
            <div
              className="help"
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={filename}
            >
              {filename}
            </div>
          )}
        </div>

        {/* Items (no filter, no select/clear all) */}
        {items.length > 0 && (
          <>
            <div className="help" style={{ marginTop: 14 }}>
              Select items (default excludes <b>Housing</b>). Uncheck to exclude.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {items.map((it) => (
                <label
                  key={it}
                  className="tag"
                  style={{
                    borderRadius: 999,
                    padding: '6px 10px',
                    border: '1px solid #dbe4f0',
                    background: isChecked(it) ? '#e8f0ff' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked(it)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setExcludeItems((prev) => {
                        const s = new Set(prev)
                        if (checked) s.delete(it)
                        else s.add(it)
                        return Array.from(s)
                      })
                    }}
                  />{' '}
                  {it}
                </label>
              ))}
            </div>
          </>
        )}

        {/* Assumption */}
        {assumptions.length > 0 && (
          <div className="row" style={{ marginTop: 16 }}>
            <label style={{ minWidth: 110, paddingTop: 8 }}>Assumption</label>
            <select
              className="input"
              value={assumption}
              onChange={(e) => setAssumption(e.target.value)}
              style={{ flex: 1 }}
            >
              {assumptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn ghost" onClick={onCancel ?? (() => {/* no-op */})}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={onSave}
            disabled={!fileChosen || saving}
            title={!fileChosen ? 'Choose a CSV first' : undefined}
          >
            {saving ? 'Saving…' : 'Build & Save Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
