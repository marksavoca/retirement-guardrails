import { useEffect, useState } from 'react'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { toISO } from '../lib/date'
import { parseCurrencyLike } from '../lib/guardrails'
import { getStorage } from '../lib/storage/factory' // ← storage adapter factory

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

  // Load plan + actuals + settings on mount (from the selected storage adapter)
  useEffect(() => {
    (async () => {
      try {
        const store = await getStorage()
        const [p, a, s] = await Promise.all([
          store.getPlan(),
          store.getActuals(),
          store.getSettings(),
        ])

        if (p?.series?.length) {
          setPlan(
            p.series.map((x: any) => ({
              date: toISO(x.date),
              plan_total_savings: Number(x.plan_total_savings),
            }))
          )
        }

        if (a?.actuals?.length) {
          setActuals(
            a.actuals.map((x: any) => ({
              date: toISO(x.date),
              actual_total_savings: Number(x.actual_total_savings),
            }))
          )
        }

        if (s) {
          if (Number.isFinite(Number(s.lowerPct))) setLowerPct(Number(s.lowerPct))
          if (Number.isFinite(Number(s.upperPct))) setUpperPct(Number(s.upperPct))
        }

        const lp = p?.lastUpdated ? Date.parse(p.lastUpdated) : 0
        const la = a?.lastUpdated ? Date.parse(a.lastUpdated) : 0
        const latest = Math.max(lp, la)
        setLastUpdated(latest ? new Date(latest).toISOString() : null)
      } catch {
        // noop — keep initial/SSR values
      }
    })()
  }, [])

  // Refresh both series and compute a unified lastUpdated
  const refetch = async () => {
    const store = await getStorage()
    const [p, a] = await Promise.all([store.getPlan(), store.getActuals()])

    if (p?.series) {
      setPlan(
        p.series.map((x: any) => ({
          date: toISO(x.date),
          plan_total_savings: Number(x.plan_total_savings),
        }))
      )
    } else {
      setPlan([])
    }

    if (a?.actuals) {
      setActuals(
        a.actuals.map((x: any) => ({
          date: toISO(x.date),
          actual_total_savings: Number(x.actual_total_savings),
        }))
      )
    } else {
      setActuals([])
    }

    const lp = p?.lastUpdated ? Date.parse(p.lastUpdated) : 0
    const la = a?.lastUpdated ? Date.parse(a.lastUpdated) : 0
    const latest = Math.max(lp, la)
    setLastUpdated(latest ? new Date(latest).toISOString() : null)
  }

  // Persist a single actual (parses "$" and commas too)
  const saveActual = async (dateISO: string, value: string | number) => {
    const n = typeof value === 'number' ? value : parseCurrencyLike(String(value))
    if (!Number.isFinite(n)) return
    const store = await getStorage()
    await store.upsertActual(dateISO, Number(n))
    await refetch()
  }

  // Persist guardrail settings and update local state
  const saveSettings = async (lp: number, up: number) => {
    const store = await getStorage()
    await store.saveSettings(lp, up)
    setLowerPct(lp)
    setUpperPct(up)
    // No refetch needed; rails compute from state
  }

  return {
    plan,
    actuals,
    lowerPct,
    upperPct,
    setLowerPct,  // exposed if you want local tweaking before saving
    setUpperPct,
    saveSettings, // persist to selected storage
    lastUpdated,
    refetch,
    saveActual,
  }
}
