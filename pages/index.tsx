import { useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'

import GuardrailsChart from '../components/GuardrailsChart'
import UploadPanel from '../components/UploadPanel'
import SettingsPanel from '../components/SettingsPanel'
import ActualsTable from '../components/ActualsTable'
import Modal from '../components/Modal'

import { useGuardrails } from '../hooks/useGuardrails'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { planValueAtDate, isoToday } from '../lib/guardrails'

type PageProps = {
  initialPlan: PlanPoint[]
  initialActuals: ActualEntry[]
  initialLastUpdated: string | null
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (_ctx) => {
  const mode = (process.env.NEXT_PUBLIC_STORAGE_MODE || '').toLowerCase()
  const isHosted = mode === 'remote' || mode === 'hosted' // hosted only when explicitly set

  if (!isHosted) {
    // Default: local mode — let the client load from browser storage
    return { props: { initialPlan: [], initialActuals: [], initialLastUpdated: null } }
  }

  // Hosted (MariaDB) fetch
  const { getPool } = await import('../lib/db')
  const { toISO } = await import('../lib/date')

  const pool = getPool()
  try {
    const name = process.env.PLAN_NAME || 'default'

    const [planRows]: any = await pool.query(
      'SELECT date, plan_total_savings, updated_at FROM plans WHERE name = ? ORDER BY date',
      [name]
    )
    const [actualRows]: any = await pool.query(
      'SELECT date, actual_total_savings, updated_at FROM actuals WHERE name = ? ORDER BY date',
      [name]
    )

    const initialPlan: PlanPoint[] = (planRows as any[]).map((r) => ({
      date: toISO(r.date),
      plan_total_savings: Number(r.plan_total_savings),
    }))

    const initialActuals: ActualEntry[] = (actualRows as any[]).map((r) => ({
      date: toISO(r.date),
      actual_total_savings: Number(r.actual_total_savings),
    }))

    const latest =
      Math.max(
        ...(planRows as any[]).map((r) => new Date(r.updated_at || 0).getTime() || 0),
        ...(actualRows as any[]).map((r) => new Date(r.updated_at || 0).getTime() || 0)
      ) || 0

    const initialLastUpdated = latest ? new Date(latest).toISOString() : null

    return { props: { initialPlan, initialActuals, initialLastUpdated } }
  } catch (e) {
    console.error('SSR DB error', e)
    return { props: { initialPlan: [], initialActuals: [], initialLastUpdated: null } }
  }
}

export default function Home({
  initialPlan,
  initialActuals,
  initialLastUpdated,
}: PageProps) {
  const {
    plan,
    actuals,
    lowerPct,
    upperPct,
    saveSettings,     // persist guardrail settings
    lastUpdated,
    refetch,
    addActual,        // <-- use explicit add/edit/delete
    editActual,
    deleteActual,
  } = useGuardrails({
    initialPlan,
    initialActuals,
    initialLastUpdated,
  })

  const [showSettings, setShowSettings] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  // Optional: quick “today” snapshot
  const todayISO = isoToday()
  const todaysPlan = useMemo(() => planValueAtDate(plan, todayISO), [plan, todayISO])
  const todaysActual = useMemo(
    () => actuals.find((a) => a.date === todayISO),
    [actuals, todayISO]
  )

  return (
    <div className="container">
      {/* Top bar */}
      <div className="card">
        <div className="row spread">
          <div>
            <h1 className="h1">Retirement Guardrails Monitor</h1>
            <p className="help">
              Track plan vs actuals with guardrails. Upload a Planner Summary CSV, tune thresholds, and
              keep everything stored in MariaDB or fully local in your browser.
            </p>
          </div>
          <div className="row">
            <div className="help" style={{ alignSelf: 'center', marginRight: 8 }}>
              Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}
            </div>
            <button className="btn ghost" onClick={() => setShowUpload(true)}>📤 Upload CSV</button>
            <button className="btn ghost" onClick={() => setShowSettings(true)}>⚙ Settings</button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card">
        <h2 className="h2">Chart</h2>
        <GuardrailsChart
          plan={plan}
          actuals={actuals}
          lowerPct={lowerPct}
          upperPct={upperPct}
        />
        {todaysPlan != null && todaysActual && (
          <div style={{ marginTop: 10 }} className="help">
            Today — plan: <b>${Number(todaysPlan).toLocaleString()}</b>, actual:{' '}
            <b>${Number(todaysActual.actual_total_savings).toLocaleString()}</b>
          </div>
        )}
      </div>

      {/* Actuals table */}
      <div className="card">
        <ActualsTable
          plan={plan}
          actuals={actuals}
          lowerPct={lowerPct}
          upperPct={upperPct}
          onAdd={addActual}
          onEdit={async (originalDateISO, newDateISO, value) => {
            if (originalDateISO === newDateISO) {
              // true in-place edit
              await editActual(newDateISO, value)
            } else {
              // date changed → move the record
              await deleteActual(originalDateISO)
              await addActual(newDateISO, value)
            }
          }}
          onDelete={deleteActual}
        />
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel
          lowerPct={lowerPct}
          upperPct={upperPct}
          onClose={() => setShowSettings(false)}
          onSaved={async (lp, up) => {
            await saveSettings(lp, up)
            setShowSettings(false)
          }}
        />
      )}

      {/* Upload modal */}
      {showUpload && (
        <Modal title="Upload Planner Summary CSV" onClose={() => setShowUpload(false)}>
          <UploadPanel
            onPlanSaved={async () => {
              await refetch()
              setShowUpload(false)
            }}
          />
        </Modal>
      )}

      <footer>
        Storage mode: <code>{process.env.NEXT_PUBLIC_STORAGE_MODE === 'local' ? 'local (IndexedDB)' : 'hosted (MariaDB API)'}</code>. Configure via <code>.env.local</code>.
      </footer>
    </div>
  )
}
