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

  type AssumptionType = 'Pessimistic' | 'Average' | 'Optimistic' | string
  const [assumptions, setAssumptions] = useState<AssumptionType[]>([])
  const [assumption, setAssumption] = useState<AssumptionType>('Average')

  const [lowerPct, setLowerPct] = useState<number>(10)
  const [upperPct, setUpperPct] = useState<number>(15)
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated)

  // Initial load
  useEffect(() => {
    (async () => {
      const store = await getStorage()

      // assumptions list + pick default
      const list = await store.getPlanAssumptions().catch(()=>[])
      if (list && list.length) {
        setAssumptions(list as AssumptionType[])
        if (list.includes('Average')) setAssumption('Average')
        else setAssumption(list[0] as AssumptionType)
      } else {
        setAssumptions(['Pessimistic','Average','Optimistic'])
      }

      // plan for current assumption
      const p = await store.getPlan(assumption).catch(()=>null)
      if (p?.series) setPlan(p.series.map(x=>({ date: toISO(x.date), plan_total_savings: Number(x.plan_total_savings) })))
      if (p?.lastUpdated) setLastUpdated(p.lastUpdated)

      // actuals
      const a = await store.getActuals().catch(()=>null)
      if (a?.actuals) setActuals(a.actuals.map(x=>({ date: toISO(x.date), actual_total_savings: Number(x.actual_total_savings) })))
      if (a?.lastUpdated) setLastUpdated(a.lastUpdated)

      // guardrails
      const s = await store.getSettings().catch(()=>null)
      if (s) { if (Number.isFinite(+s.lowerPct)) setLowerPct(+s.lowerPct); if (Number.isFinite(+s.upperPct)) setUpperPct(+s.upperPct) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When assumption changes, reload plan only
  useEffect(() => {
    (async () => {
      const store = await getStorage()
      const p = await store.getPlan(assumption).catch(()=>null)
      if (p?.series) setPlan(p.series.map(x=>({ date: toISO(x.date), plan_total_savings: Number(x.plan_total_savings) })))
      if (p?.lastUpdated) setLastUpdated(p.lastUpdated)
    })()
  }, [assumption])

  const refetch = async () => {
    const store = await getStorage()
    const [p, a] = await Promise.all([
      store.getPlan(assumption).catch(()=>null),
      store.getActuals().catch(()=>null),
    ])
    if (p?.series) setPlan(p.series.map(x=>({ date: toISO(x.date), plan_total_savings: Number(x.plan_total_savings) })))
    if (a?.actuals) setActuals(a.actuals.map(x=>({ date: toISO(x.date), actual_total_savings: Number(x.actual_total_savings) })))
    const lp = p?.lastUpdated ? new Date(p.lastUpdated).getTime() : 0
    const la = a?.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
    setLastUpdated(Math.max(lp, la) ? new Date(Math.max(lp, la)).toISOString() : null)
  }

  const addActual = async (dateISO: string, value: string | number) => {
    const n = typeof value === 'number' ? value : parseCurrencyLike(String(value))
    if (!Number.isFinite(n)) return
    const s = await getStorage()
    await s.upsertActual(toISO(dateISO), Number(n))
    await refetch()
  }
  const editActual = async (dateISO: string, value: string | number) => {
    const n = typeof value === 'number' ? value : parseCurrencyLike(String(value))
    if (!Number.isFinite(n)) return
    const s = await getStorage()
    try { await s.updateActual(toISO(dateISO), Number(n)) }
    catch { await s.upsertActual(toISO(dateISO), Number(n)) }
    await refetch()
  }
  const deleteActual = async (dateISO: string) => {
    const s = await getStorage()
    await s.deleteActual(toISO(dateISO))
    await refetch()
  }

  const saveSettings = async (lp: number, up: number) => {
    setLowerPct(lp); setUpperPct(up)
    const s = await getStorage()
    await s.saveSettings(lp, up)
  }

  return {
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
  }
}
