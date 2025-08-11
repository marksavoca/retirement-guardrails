import { useEffect, useRef, useState } from 'react'
import * as Papa from 'papaparse'
import { getStorage } from '../lib/storage/factory'
import { buildPlanFromCSV } from '../lib/guardrails'

type PlanMeta = {
  filename: string
  assumption: string | null
  items: { include: string[]; exclude: string[] }
  uploaded_at: string
} | null

type CSVRow = Record<string, string | number>

export default function UploadPanel({ onPlanSaved }: { onPlanSaved: () => Promise<void> | void }) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [csvText, setCsvText] = useState('')
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [filename, setFilename] = useState('')

  const [items, setItems] = useState<string[]>([])
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [assumption, setAssumption] = useState<string>('Average')

  // persisted selections (prefilled from last meta)
  const [includeItems, setIncludeItems] = useState<string[]>([])
  const [excludeItems, setExcludeItems] = useState<string[]>(['Housing'])

  const [lastMeta, setLastMeta] = useState<PlanMeta>(null)

  // Load last saved meta (from whichever storage mode is active)
  useEffect(() => {
    (async () => {
      try {
        // Use the storage factory to get the current storage adapter
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
        // ignore; UI will show empty state
      }
    })()
  }, [])

  async function onChooseFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    setFilename(file.name)

    Papa.parse<CSVRow>(text, {
      header: true,
      dynamicTyping: true,
      complete: (results: Papa.ParseResult<CSVRow>) => {
        const rows = (results.data as any[]).filter(Boolean)
        setParsedRows(rows)

        // Build item list from Accounts rows
        const itemSet = new Set(
          rows
            .filter((r) => String(r['Category']).toLowerCase() === 'accounts')
            .map((r) => String(r['Item']).trim())
        )
        const itemArr = Array.from(itemSet).sort()
        setItems(itemArr)

        // Collect available assumptions
        const assumpSet = new Set(
          rows.map((r) => String(r['Assumptions'] || '').trim()).filter(Boolean)
        )
        const assumpArr = Array.from(assumpSet)
        setAssumptions(assumpArr)
        if (assumpArr.length && !assumpArr.includes(assumption)) {
          setAssumption(assumpArr[0]!)
        }
      },
    })
  }

  async function onSave() {
    if (!csvText || parsedRows.length === 0) {
      alert('Select a CSV file first.')
      return
    }

    try {
      console.log('Building plan from CSV...')
      const planSeries = buildPlanFromCSV(parsedRows, {
        selectedAssumption: assumption,
        includeItems,
        excludeItems,
      })

      const store = await getStorage()
      console.log('Saving plan to storage...')
      await store.savePlan(planSeries, {
        filename,
        assumption,
        items: { include: includeItems, exclude: excludeItems },
      })

      // Refresh meta after save
      const data = await store.getPlan()
      if (data?.meta) setLastMeta(data.meta)

      await onPlanSaved()
    } catch (e) {
      console.error(e)
      alert('Failed to save plan. Check the CSV format and try again.')
    }
  }

  return (
    <div>
      {lastMeta && (
        <div className="help" style={{ marginBottom: 8 }}>
          Last upload: <b>{lastMeta.filename}</b> ·{' '}
          {new Date(lastMeta.uploaded_at).toLocaleString()}
          {lastMeta.assumption ? (
            <>
              {' '}
              · Assumption: <b>{lastMeta.assumption}</b>
            </>
          ) : null}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChooseFile(f)
        }}
      />

      {items.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="help">
            Select items (default excludes <b>Housing</b>). Uncheck to exclude.
          </div>

          <div style={{ marginTop: 6 }}>
            {items.map((it) => {
              const checked =
                !excludeItems.includes(it) &&
                (includeItems.length === 0 || includeItems.includes(it))
              return (
                <label key={it} className="tag">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked
                      // Use exclude list as primary control
                      setExcludeItems((prev) => {
                        const s = new Set(prev)
                        if (isChecked) s.delete(it)
                        else s.add(it)
                        return Array.from(s)
                      })
                    }}
                  />{' '}
                  {it}
                </label>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <label>Assumption</label>
            <select
              className="input"
              value={assumption}
              onChange={(e) => setAssumption(e.target.value)}
            >
              {assumptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="row right" style={{ marginTop: 8 }}>
            <button className="btn" onClick={onSave}>
              Build & Save Plan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
