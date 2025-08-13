// hooks/useExpenses.ts
import { useEffect, useMemo, useState } from 'react'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { getStorage } from '../lib/storage/factory'

type Args = {
  initialPlan?: PlanPoint[]
  initialActuals?: ActualEntry[]
  initialLastUpdated?: string | null
}

export function useExpenses({
  initialPlan = [],
  initialActuals = [],
  initialLastUpdated = null,
}: Args) {
  const [plan, setPlan] = useState<PlanPoint[]>(initialPlan)
  const [actuals, setActuals] = useState<ActualEntry[]>(initialActuals)
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated)

  // TODO (persistence): try to load from storage when available.
  useEffect(() => {
    (async () => {
      try {
        const store = await getStorage()
        // If your storage later supports namespacing by kind:
        // const exp = await store.getPlan(undefined, 'expenses').catch(() => null)
        // if (exp?.series) setPlan(exp.series)
        // const a = await store.getActuals?.('expenses').catch(() => null)
        // if (Array.isArray(a)) setActuals(a)
      } catch {}
    })()
  }, [])

  const refetch = async () => {
    // Wire this to your storage once you persist expenses.
  }

  const addActual = async (date: string, value: number) => {
    setActuals(prev => {
      const next = prev.filter(a => a.date !== date).concat([{ date, actual_total_savings: value }])
      next.sort((a, b) => a.date.localeCompare(b.date))
      return next
    })
    // await (await getStorage()).addActual?.(date, value, 'expenses').catch(() => {})
  }

  const editActual = async (date: string, value: number) => {
    setActuals(prev => prev.map(a => (a.date === date ? { ...a, actual_total_savings: value } : a)))
    // await (await getStorage()).editActual?.(date, value, 'expenses').catch(() => {})
  }

  const deleteActual = async (date: string) => {
    setActuals(prev => prev.filter(a => a.date !== date))
    // await (await getStorage()).deleteActual?.(date, 'expenses').catch(() => {})
  }

  return {
    plan,
    setPlan,         // handy for wiring the Upload panel later
    actuals,
    addActual,
    editActual,
    deleteActual,
    lastUpdated,
    refetch,
  }
}
