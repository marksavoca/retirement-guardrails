import { useEffect, useState } from 'react'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { toISO } from '../lib/date'
import { parseCurrencyLike } from '../lib/guardrails'
import { getStorage } from '../lib/storage/factory'

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
  const [plan, setPlan] = useState<PlanPoint[]>(initialPlan)
  const [actuals, setActuals] = useState<ActualEntry[]>(initialActuals)
  const [lowerPct, setLowerPct] = useState<number>(10)
  const [upperPct, setUpperPct] = useState<number>(15)
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated)

  // Initial load from selected storage
  useEffect(() => {
    (async () => {
      const store = await getStorage()

      if (plan.length === 0) {
        const p = await store.getPlan().catch(() => null)
        if (p?.series?.length) setPlan(p.series.map(x => ({ date: toISO(x.date), plan_total_savings: Number(x.plan_total_savings) })))
        if (p?.lastUpdated) setLastUpdated(p.lastUpdated)
      }

      if (actuals.length === 0) {
        const a = await store.getActuals().catch(() => null)
        if (a?.actuals?.length) setActuals(a.actuals.map(x => ({ date: toISO(x.date), actual_total_savings: Number(x.actual_total_savings) })))
        if (a?.lastUpdated) setLastUpdated(a.lastUpdated)
      }

      const s = await store.getSettings().catch(() => null)
      if (s) {
        if (Number.isFinite(Number(s.lowerPct))) setLowerPct(Number(s.lowerPct))
        if (Number.isFinite(Number(s.upperPct))) setUpperPct(Number(s.upperPct))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refetch = async () => {
    const store = await getStorage()
    const [p, a] = await Promise.all([store.getPlan().catch(() => null), store.getActuals().catch(() => null)])
    if (p?.series) setPlan(p.series.map(x => ({ date: toISO(x.date), plan_total_savings: Number(x.plan_total_savings) })))
    if (a?.actuals) setActuals(a.actuals.map(x => ({ date: toISO(x.date), actual_total_savings: Number(x.actual_total_savings) })))
    const lp = p?.lastUpdated ? new Date(p.lastUpdated).getTime() : 0
    const la = a?.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
    setLastUpdated(Math.max(lp, la) ? new Date(Math.max(lp, la)).toISOString() : null)
  }

  // Add (create/replace)
  const addActual = async (dateISO: string, value: string | number) => {
    const n = typeof value === 'number' ? value : parseCurrencyLike(String(value))
    if (!Number.isFinite(n)) return
    const d = toISO(dateISO)
    const s = await getStorage()
    await s.upsertActual(d, Number(n))
    await refetch()
  }

  // Edit (update only)
  const editActual = async (dateISO: string, value: string | number) => {
    const n = typeof value === 'number' ? value : parseCurrencyLike(String(value))
    if (!Number.isFinite(n)) return
    const d = toISO(dateISO)
    const s = await getStorage()
    try {
      await s.updateActual(d, Number(n))
    } catch {
      // if not found, fallback to upsert so the user isn't blocked
      await s.upsertActual(d, Number(n))
    }
    await refetch()
  }

  // Back-compat: saveActual decides add vs edit based on current state
  const saveActual = async (dateISO: string, value: string | number) => {
    const d = toISO(dateISO)
    const exists = actuals.some(a => toISO(a.date) === d)
    return exists ? editActual(d, value) : addActual(d, value)
  }

  const deleteActual = async (dateISO: string) => {
    const d = toISO(dateISO)
    const s = await getStorage()
    await s.deleteActual(d)
    await refetch()
  }

  const saveSettings = async (lp: number, up: number) => {
    setLowerPct(lp)
    setUpperPct(up)
    const s = await getStorage()
    await s.saveSettings(lp, up)
  }

  return {
    plan,
    actuals,
    lowerPct,
    upperPct,
    setLowerPct,
    setUpperPct,
    saveSettings,
    lastUpdated,
    refetch,
    saveActual,   // still available
    addActual,
    editActual,
    deleteActual,
  }
}
