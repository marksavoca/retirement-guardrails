import { useMemo, useState } from 'react'
import { PlanPoint, ActualEntry } from '../lib/types'
import { isoToday, toISO } from '../lib/date'
import { guardrailStatus, planValueAtDate } from '../lib/guardrails'

/** "$1,234,567" while typing */
function formatCurrencyTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return '$' + withCommas
}

export default function ActualsTable({
  plan,
  actuals,
  lowerPct,
  upperPct,
  onSave,
  onDelete,
}: {
  plan: PlanPoint[]
  actuals: ActualEntry[]
  lowerPct: number
  upperPct: number
  onSave: (dateISO: string, value: string) => Promise<void>
  onDelete: (dateISO: string) => Promise<void>
}) {
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; date: string | null }>({
    open: false, x: 0, y: 0, date: null,
  })
  const [showPanel, setShowPanel] = useState(false)
  const [mode, setMode] = useState<'add' | 'edit'>('add')
  const [dateISO, setDateISO] = useState<string>(isoToday())
  const [value, setValue] = useState<string>('')

  const [showDelete, setShowDelete] = useState(false)
  const [deleteDate, setDeleteDate] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...actuals].sort((a, b) => toISO(a.date).localeCompare(toISO(b.date))),
    [actuals]
  )

  return (
    <div>
      <div className="row spread">
        <h2 className="h2">Actuals</h2>
        <button
          className="btn"
          onClick={() => {
            setMode('add'); setDateISO(isoToday()); setValue(''); setShowPanel(true)
          }}
        >
          + Add Actual
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Actual Total Savings</th>
            <th>Status</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const iso = toISO(a.date)
            const planVal = planValueAtDate(plan, iso)
            let badge: JSX.Element | null = null
            if (planVal != null) {
              const s = guardrailStatus(planVal, Number(a.actual_total_savings), lowerPct, upperPct)
              badge = <span className={`badge ${s.className}`}>{s.status}</span>
            }
            return (
              <tr key={iso}>
                <td>{iso}</td>
                <td>${Number(a.actual_total_savings).toLocaleString()}</td>
                <td>{badge ?? <span className="help">—</span>}</td>
                <td style={{ position: 'relative' }}>
                  <button
                    className="kebab"
                    aria-label={'Actions for ' + iso}
                    onClick={(e) => {
                      const r = (e.target as HTMLElement).getBoundingClientRect()
                      setMenu({ open: true, x: r.left, y: r.bottom + 4, date: iso })
                    }}
                  >
                    ⋮
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* kebab menu */}
      {menu.open && (
        <div
          onClick={() => setMenu({ open: false, x: 0, y: 0, date: null })}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        >
          <div className="menu" style={{ left: menu.x, top: menu.y, zIndex: 50 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                if (!menu.date) return
                const current = sorted.find((x) => toISO(x.date) === menu.date)?.actual_total_savings ?? ''
                setMode('edit'); setDateISO(menu.date); setValue(current === '' ? '' : '$' + Number(current).toLocaleString())
                setShowPanel(true); setMenu({ open: false, x: 0, y: 0, date: null })
              }}
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (!menu.date) return
                setDeleteDate(menu.date); setShowDelete(true)
                setMenu({ open: false, x: 0, y: 0, date: null })
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showPanel && (
        <div className="modal-backdrop" onClick={() => setShowPanel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="title">{mode === 'add' ? 'Add Actual' : 'Edit Actual'}</div>

            <div className="row">
              <label>Date</label>
              <input
                type="date"
                className="input"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
              />
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <label>Actual Total Savings</label>
              <input
                type="text"
                className="number"
                placeholder="$1,234,567"
                value={value}
                onChange={(e) => setValue(formatCurrencyTyping(e.target.value))}
              />
            </div>

            <div className="actions">
              <button className="btn ghost" onClick={() => setShowPanel(false)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={async () => {
                  await onSave(dateISO, value)
                  setShowPanel(false)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDelete && deleteDate && (
        <div className="modal-backdrop" onClick={() => setShowDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="title">Delete Actual</div>
            <p className="help" style={{ marginTop: 0 }}>
              Are you sure you want to delete the actual for <b>{deleteDate}</b>? This action can’t be undone.
            </p>
            <div className="actions">
              <button className="btn ghost" onClick={() => setShowDelete(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  await onDelete(deleteDate)
                  setShowDelete(false)
                  setDeleteDate(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
