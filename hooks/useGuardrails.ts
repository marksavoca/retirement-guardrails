import { useEffect, useState } from 'react'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { toISO } from '../lib/date'
import { parseCurrencyLike } from '../lib/guardrails'

type Args = {
  initialPlan?: PlanPoint[]
  initialActuals?: ActualEntry[]
  initialLastUpdated?: string | null
}

export function useGuardrails({
  initialPlan = [],
  initialActuals = [],
  initialLastUpdated = null,
}: Args) {
  // Data
  const [plan, setPlan] = useState<PlanPoint[]>(initialPlan)
  const [actuals, setActuals] = useState<ActualEntry[]>(initialActuals)

  // Guardrail settings (persisted)
  const [lowerPct, setLowerPct] = useState<number>(10)
  const [upperPct, setUpperPct] = useState<number>(15)

  // Misc
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated)

  // Load plan + actuals if SSR props were empty
  useEffect(() => {
    (async () => {
      if (plan.length === 0) {
        const p = await fetch('/api/plan').then(r => r.json()).catch(() => null)
        if (p?.series) {
          setPlan(
            p.series.map((x: any) => ({
              date: toISO(x.date),
              plan_total_savings: Number(x.plan_total_savings),
            }))
          )
        }
        if (p?.lastUpdated) setLastUpdated(p.lastUpdated)
      }

      if (actuals.length === 0) {
        const a = await fetch('/api/actuals').then(r => r.json()).catch(() => null)
        if (a?.actuals) {
          setActuals(
            a.actuals.map((x: any) => ({
              date: toISO(x.date),
              actual_total_savings: Number(x.actual_total_savings),
            }))
          )
        }
        if (a?.lastUpdated) setLastUpdated(a.lastUpdated)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load persisted guardrail settings on mount
  useEffect(() => {
    (async () => {
      const s = await fetch('/api/settings').then(r => r.json()).catch(() => null)
      if (s) {
        if (Number.isFinite(Number(s.lowerPct))) setLowerPct(Number(s.lowerPct))
        if (Number.isFinite(Number(s.upperPct))) setUpperPct(Number(s.upperPct))
      }
    })()
  }, [])

  // Refresh both series and compute a unified lastUpdated
  const refetch = async () => {
    const [p, a] = await Promise.all([
      fetch('/api/plan').then(r => r.json()).catch(() => null),
      fetch('/api/actuals').then(r => r.json()).catch(() => null),
    ])

    if (p?.series) {
      setPlan(
        p.series.map((x: any) => ({
          date: toISO(x.date),
          plan_total_savings: Number(x.plan_total_savings),
        }))
      )
    }
    if (a?.actuals) {
      setActuals(
        a.actuals.map((x: any) => ({
          date: toISO(x.date),
          actual_total_savings: Number(x.actual_total_savings),
        }))
      )
    }

    const lp = p?.lastUpdated ? new Date(p.lastUpdated).getTime() : 0
    const la = a?.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
    const latest = Math.max(lp, la)
    setLastUpdated(latest ? new Date(latest).toISOString() : null)
  }

  // Persist a single actual (parses "$" and commas too)
  const saveActual = async (dateISO: string, value: string | number) => {
    const n =
      typeof value === 'number'
        ? value
        : parseCurrencyLike(String(value)) // strips $ and commas
    if (!Number.isFinite(n)) return
    await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateISO, actual_total_savings: Number(n) }),
    })
    await refetch()
  }

  // Persist guardrail settings and update local state
  const saveSettings = async (lp: number, up: number) => {
    setLowerPct(lp)
    setUpperPct(up)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lowerPct: lp, upperPct: up }),
    })
    // No refetch needed; chart recomputes rails from state
  }

  return {
    plan,
    actuals,
    lowerPct,
    upperPct,
    setLowerPct,  // exposed if you want local tweaking before saving
    setUpperPct,
    saveSettings, // <-- persist to DB
    lastUpdated,
    refetch,
    saveActual,
  }
}
