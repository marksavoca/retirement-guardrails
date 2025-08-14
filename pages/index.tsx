import { useEffect, useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'

import GuardrailsChart from '../components/GuardrailsChart'
import UploadPanel from '../components/UploadPanel'
import SettingsPanel from '../components/SettingsPanel'
import ActualsTable from '../components/ActualsTable'
import Modal from '../components/Modal'

import { useGuardrails } from '../hooks/useGuardrails'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { planValueAtDate, isoToday } from '../lib/guardrails'
import Header from '../components/Header'
import KebabMenu from '../components/KebabMenu'
import ExpensesChart from '../components/ExpensesChart' 
import { useExpenses } from '../hooks/useExpenses'

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
  // SAVINGS (existing)
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

  const {
  plan: expPlan,
  setPlan: setExpPlan,       // handy for wiring CSV upload later
  actuals: expActuals,
  addActual: addExpenseActual,
  editActual: editExpenseActual,
  deleteActual: deleteExpenseActual,
  refetch: refetchExpenses,  // (template; wire later)
} = useExpenses({})

  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [activeTab, setActiveTab] = useState<'Savings' | 'Expenses'>('Savings') // NEW

  const todayISO = isoToday()
  // Savings “today”
  const todaysPlan = useMemo(() => planValueAtDate(plan, todayISO), [plan, todayISO])
  const todaysActual = useMemo(
    () => actuals.find((a) => a.date === todayISO),
    [actuals, todayISO]
  )
  // Expenses “today”
  const todaysExpPlan = useMemo(() => planValueAtDate(expPlan, todayISO), [expPlan, todayISO])
  const todaysExpActual = useMemo(
    () => expActuals.find((a) => a.date === todayISO),
    [expActuals, todayISO]
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
      <Header />

      {/* Tabs (NEW) */}
      <div className="row" style={{ gap: 6, margin: '10px 0 14px' }}>
        {(['Savings','Expenses'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="btn"
            style={{
              padding: '6px 12px',
              background: activeTab === tab ? 'black' : 'white',
              color: activeTab === tab ? 'white' : 'black',
              borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          >
            {tab}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }} />
      </div>

      {/* ===== Tab: Savings ===== */}
      {activeTab === 'Savings' && (
        <>
          <div className="card">
            <div
              className="row"
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
            >
              <h2 className="h2">Savings {assumption ? `(${assumption})` : ''}</h2>
              <div style={{ marginLeft: 'auto', position: 'relative' }}>
                <KebabMenu
                  onUpload={() => (window as any).__openUpload?.()}
                  onSettings={() => (window as any).__openSettings?.()}
                />
              </div>
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
        </>
      )}

      {/* ===== Tab: Expenses (NEW) ===== */}
      {activeTab === 'Expenses' && (
        <>
          <div className="card">
            <div
              className="row"
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
            >
              <h2 className="h2">Expenses {assumption ? `(${assumption})` : ''}</h2>
              <div style={{ marginLeft: 'auto', position: 'relative' }}>
                <KebabMenu
                  onUpload={() => (window as any).__openUpload?.()}
                  onSettings={() => (window as any).__openSettings?.()}
                />
              </div>
            </div>

            <ExpensesChart
              plan={expPlan}
              actuals={expActuals}
              lowerPct={lowerPct}
              upperPct={upperPct}
            />

            {todaysExpPlan != null && todaysExpActual && (
              <div style={{ marginTop: 10 }} className="help">
                Today — plan: <b>${Number(todaysExpPlan).toLocaleString()}</b>, actual:{' '}
                <b>${Number(todaysExpActual.actual_total_savings).toLocaleString()}</b>
              </div>
            )}
          </div>

          <div className="card">
            <ActualsTable
              plan={expPlan}
              actuals={expActuals}
              lowerPct={lowerPct}
              upperPct={upperPct}
              onAdd={addExpenseActual}
              onEdit={async (oldD, newD, val) => {
                if (oldD === newD) await editExpenseActual(newD, val)
                else { await deleteExpenseActual(oldD); await addExpenseActual(newD, val) }
              }}
              onDelete={deleteExpenseActual}
            />
          </div>
        </>
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel
          lowerPct={lowerPct}
          upperPct={upperPct}
          onClose={() => setShowSettings(false)}
          onSaved={async (lp, up) => { await saveSettings(lp, up); setShowSettings(false) }}
        />
      )}

      {/* Upload modal (still shared; you can later extend UploadPanel to populate expPlan too) */}
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
