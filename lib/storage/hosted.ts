// lib/storage/hosted.ts
import type { Storage, PlanPoint } from './types'

export class HostedStorage implements Storage {
  async getPlan(assumption = 'Average') {
    const r = await fetch(`/api/plan?assumption=${encodeURIComponent(assumption)}`).then(r=>r.json()).catch(()=>null)
    return {
      series: r?.series ?? [],
      lastUpdated: r?.lastUpdated ?? null,
      meta: r?.meta ?? null,
      assumptions: r?.assumptions ?? [],
    }
  }

  async getPlanAssumptions() {
    const r = await fetch(`/api/plan`).then(r=>r.json()).catch(()=>null)
    return r?.assumptions ?? []
  }

  async savePlans(seriesByAssumption: Record<string, PlanPoint[]>, opts?: { replace?: boolean; meta?: { filename?: string; items?: { include: string[]; exclude: string[] } } }) {
    await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ seriesByAssumption, replace: opts?.replace ?? true, meta: opts?.meta }),
    })
  }

  async getActuals() {
    const r = await fetch('/api/actuals').then(r=>r.json()).catch(()=>null)
    return { actuals: r?.actuals ?? [], lastUpdated: r?.lastUpdated ?? null }
  }
  async upsertActual(dateISO: string, value: number) {
    await fetch('/api/actuals', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: dateISO, actual_total_savings: Number(value) }) })
  }
  async updateActual(dateISO: string, value: number) {
    await fetch(`/api/actuals/${encodeURIComponent(dateISO)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ actual_total_savings: Number(value) }) })
  }
  async deleteActual(dateISO: string) {
    await fetch(`/api/actuals/${encodeURIComponent(dateISO)}`, { method:'DELETE' })
  }

  async getSettings() {
    const r = await fetch('/api/settings').then(r=>r.json()).catch(()=>null)
    return { lowerPct: r?.lowerPct ?? 10, upperPct: r?.upperPct ?? 15 }
  }
  async saveSettings(lowerPct: number, upperPct: number) {
    await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lowerPct, upperPct }) })
  }
}
