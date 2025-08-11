import { useEffect, useRef, useState } from 'react'

type PlanMeta = {
  filename: string
  assumption: string | null
  items: { include: string[]; exclude: string[] }
  uploaded_at: string
} | null

export default function UploadPanel({ onPlanSaved }:{ onPlanSaved: ()=>Promise<void>|void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [filename, setFilename] = useState('')

  const [items, setItems] = useState<string[]>([])
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [assumption, setAssumption] = useState<string>('Average')

  // persisted selections (prefilled from last meta)
  const [includeItems, setIncludeItems] = useState<string[]>([])
  const [excludeItems, setExcludeItems] = useState<string[]>(['Housing'])

  const [lastMeta, setLastMeta] = useState<PlanMeta>(null)

  // Load last meta on mount (prefill assumption + selections)
  useEffect(() => {
    (async () => {
      const data = await fetch('/api/plan').then(r => r.json()).catch(() => null)
      if (data?.meta) {
        setLastMeta(data.meta)
        if (data.meta.assumption) setAssumption(data.meta.assumption)
        if (data.meta.items?.include) setIncludeItems(data.meta.items.include)
        if (data.meta.items?.exclude) setExcludeItems(data.meta.items.exclude.length ? data.meta.items.exclude : ['Housing'])
      }
    })()
  }, [])

  async function onChooseFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    setFilename(file.name)

    // Ask server to quickly parse the CSV to show Items + Assumptions
    const res = await fetch('/api/parse-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: text }),
    }).then(r => r.json()).catch(() => null)

    setItems(res?.items || [])
    setAssumptions(res?.assumptions || [])
    // If server found assumptions, keep prefilled one if present; else pick first
    if (res?.assumptions?.length && !res.assumptions.includes(assumption)) {
      setAssumption(res.assumptions[0])
    }
  }

  async function onSave() {
    if (!csvText) return alert('Select a CSV file first.')

    await fetch('/api/plan-from-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: csvText,
        filename,
        assumption,
        includeItems,
        excludeItems,
      }),
    })

    // Refresh meta after save (so UI shows the latest filename/time)
    const data = await fetch('/api/plan').then(r => r.json()).catch(() => null)
    if (data?.meta) setLastMeta(data.meta)

    await onPlanSaved()
  }

  return (
    <div>
      {lastMeta && (
        <div className="help" style={{ marginBottom: 8 }}>
          Last upload: <b>{lastMeta.filename}</b> · {new Date(lastMeta.uploaded_at).toLocaleString()}
          {lastMeta.assumption ? <> · Assumption: <b>{lastMeta.assumption}</b></> : null}
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
                      // We keep includeItems optional; primary control is exclude list
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
