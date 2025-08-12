import { useEffect, useRef, useState } from 'react'
import * as Papa from 'papaparse'
import { getStorage } from '../lib/storage/factory'
import { buildPlanSetFromCSV } from '../lib/plan-from-csv'

type PlanMeta = {
  filename: string
  assumption: string | null
  items?: { include: string[]; exclude: string[] }
  uploaded_at: string
} | null

type BoldinRow = Record<string, string | number>

export default function UploadPanel({ onPlanSaved }:{ onPlanSaved: ()=>Promise<void>|void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [effectiveFrom, setEffectiveFrom] = useState<string>('')
  const [csvText, setCsvText] = useState('')
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [filename, setFilename] = useState('')

  const [items, setItems] = useState<string[]>([])
  const [includeItems, setIncludeItems] = useState<string[]>([])
  const [excludeItems, setExcludeItems] = useState<string[]>(['Housing'])

  const [lastMeta, setLastMeta] = useState<PlanMeta>(null)

  useEffect(() => {
    (async () => {
      const store = await getStorage()
      const data = await store.getPlan().catch(()=>null)
      if (data?.meta) {
        setLastMeta({
          filename: data.meta.filename,
          assumption: null,
          items: data.meta.items ?? { include:[], exclude:['Housing'] },
          uploaded_at: data.meta.uploaded_at,
        })
        if (data.meta.items?.include) setIncludeItems(data.meta.items.include)
        if (data.meta.items?.exclude) setExcludeItems(data.meta.items.exclude.length ? data.meta.items.exclude : ['Housing'])
      }
    })()
  }, [])

  async function onChooseFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    setFilename(file.name)

    Papa.parse<BoldinRow>(text, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        const rows = (results.data as any[]).filter(Boolean)
        setParsedRows(rows)
        const itemSet = new Set(
          rows
            .filter((r) => String(r['Category']).toLowerCase() === 'accounts')
            .map((r) => String(r['Item']).trim())
        )
        setItems(Array.from(itemSet).sort())
      },
    })
  }

  async function onSave() {
    if (!csvText || parsedRows.length === 0) return alert('Select a CSV file first.')
    const store = await getStorage()

    // Build plan series for all assumptions from Boldin rows (respect include/exclude)
    const seriesByAssumption = buildPlanSetFromCSV(parsedRows, {
      includeItems,
      excludeItems,
    })

    // Basic sanity check
    const counts = Object.fromEntries(
      Object.entries(seriesByAssumption).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    )
    const total = Object.values(counts).reduce((a, b) => a + (b as number), 0)
    if (!total) {
      alert('No plan rows were produced from the CSV. Double-check the CSV headers and the “Assumptions” values.')
      return
    }

    // Merge with existing plan data by effectiveFrom (if provided)
    const eff = effectiveFrom && effectiveFrom.length >= 10 ? effectiveFrom : null
    const merged: Record<string, any[]> = {}

    for (const [ass, newSeries] of Object.entries(seriesByAssumption)) {
      let base: any[] = []
      try {
        const existing = await store.getPlan(ass as string).catch(()=>null)
        base = existing?.series || []
      } catch {}

      if (!eff) {
        merged[ass] = newSeries as any[]
        continue
      }

      const byDateNew = new Map<string, number>((newSeries as any[]).map(p => [String(p.date).slice(0,10), Number((p as any).plan_total_savings)]))
      const byDateOld = new Map<string, number>(base.map((p:any) => [String(p.date).slice(0,10), Number(p.plan_total_savings)]))
      const allDates = Array.from(new Set([
        ...Array.from(byDateNew.keys()),
        ...Array.from(byDateOld.keys())
      ])).sort()

      const out: any[] = []
      for (const d of allDates) {
        const useNew = d >= eff && byDateNew.has(d)
        const val = useNew ? byDateNew.get(d)! : (byDateOld.get(d) ?? byDateNew.get(d))
        if (val == null) continue
        out.push({ date: d, plan_total_savings: val })
      }
      merged[ass] = out
    }

    await store.savePlans(merged as any, {
      replace: true,
      meta: { filename, items: { include: includeItems, exclude: excludeItems } },
    })

    const data = await store.getPlan().catch(()=>null)
    if (data?.meta) setLastMeta(data.meta)
    await onPlanSaved()
  }

  return (
    <div style={{ maxWidth: 520 }}>
      {lastMeta && (
        <div className="help" style={{ marginBottom: 8 }}>
          Last upload: <b>{lastMeta.filename}</b> · {new Date(lastMeta.uploaded_at).toLocaleString()}
        </div>
      )}

      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onChooseFile(f)
          }}
        />

        <div className="row" style={{ gap: 8 }}>
          <label className="help" style={{ alignSelf: 'center' }}>Effective from:</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="help">Select items to include (default excludes <b>Housing</b>).</div>
          <div style={{ marginTop: 6 }}>
            {items.map((it) => {
              const checked =
                !excludeItems.includes(it) && (includeItems.length === 0 || includeItems.includes(it))
              return (
                <label key={it} className="tag">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked
                      setExcludeItems((prev) => {
                        const s = new Set(prev)
                        if (isChecked) s.delete(it); else s.add(it)
                        return Array.from(s)
                      })
                    }}
                  />{' '}
                  {it}
                </label>
              )
            })}
          </div>

          <div className="row right" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn ghost" onClick={() => (window as any).__closeUpload?.()}>Cancel</button>
            <button className="btn" disabled={!csvText} onClick={onSave}>Build & Save Plans</button>
          </div>
        </div>
      )}
    </div>
  )
}
