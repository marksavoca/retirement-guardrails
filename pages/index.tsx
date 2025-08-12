// pages/index.tsx
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
  const isHosted = mode === 'remote' || mode === 'hosted'
  if (!isHosted) {
    return { props: { initialPlan: [], initialActuals: [], initialLastUpdated: null } }
  }

  const { getPool } = await import('../lib/db')
  const { toISO } = await import('../lib/date')

  const pool = getPool()
  try {
    const name = process.env.PLAN_NAME || 'default'
    const assumption = 'Average'

    const [planRows]: any = await pool.query(
      'SELECT date, plan_total_savings, updated_at FROM plans WHERE name = ? AND assumption = ? ORDER BY date',
      [name, assumption]
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
    assumptions,
    assumption,
    setAssumption,
    lowerPct,
    upperPct,
    saveSettings,
    lastUpdated,
    refetch,
    addActual,
    editActual,
    deleteActual,
  } = useGuardrails({
    initialPlan,
    initialActuals,
    initialLastUpdated,
  })

  const [showSettings, setShowSettings] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const todayISO = isoToday()
  const todaysPlan = useMemo(() => planValueAtDate(plan, todayISO), [plan, todayISO])
  const todaysActual = useMemo(
    () => actuals.find((a) => a.date === todayISO),
    [actuals, todayISO]
  )

  // Expose handlers for KebabMenu overlay
  if (typeof window !== 'undefined') {
    (window as any).__openUpload = () => setShowUpload(true);
    (window as any).__closeUpload = () => setShowUpload(false);
    (window as any).__getAssumption = () => assumption;
    (window as any).__getAssumptions = () => assumptions;
    (window as any).__setAssumption = (a: string) => setAssumption(a);
    (window as any).__openSettings = () => setShowSettings(true);
  }

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
        </div>
      </div>

      {/* Chart + assumption selector */}
      <div className="card">
        <div className="row" style={{ marginBottom: 8, alignItems: 'center', gap: 8 }}>
          <h2 className="h2" style={{ margin: 0 }}>Chart</h2>
        </div>

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
          onEdit={async (oldD, newD, val) => {
            if (oldD === newD) await editActual(newD, val)
            else { await deleteActual(oldD); await addActual(newD, val) }
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
          onSaved={async (lp, up) => { await saveSettings(lp, up); setShowSettings(false) }}
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
        Storage mode:{' '}
        <code>{(process.env.NEXT_PUBLIC_STORAGE_MODE || '').toLowerCase().match(/^(remote|hosted)$/) ? 'hosted (MariaDB API)' : 'local (IndexedDB)'}</code>.
        Configure via <code>.env.local</code>.
      </footer>
    </div>
  )
}
