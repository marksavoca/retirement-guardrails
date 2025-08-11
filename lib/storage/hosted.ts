// lib/storage/hosted.ts
import type { Storage, PlanPoint } from './types'

export class HostedStorage implements Storage {
  async getPlan() {
    const r = await fetch('/api/plan').then(r => r.json()).catch(() => null)
    return {
      series: r?.series ?? [],
      lastUpdated: r?.lastUpdated ?? null,
      meta: r?.meta ?? null,
    }
  }

  async savePlan(series: PlanPoint[], meta?: any) {
    // Save series and optional meta via your existing API
    await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series, replace: true, meta }),
    })
  }

  async getActuals() {
    const r = await fetch('/api/actuals').then(r => r.json()).catch(() => null)
    return { actuals: r?.actuals ?? [], lastUpdated: r?.lastUpdated ?? null }
  }

  async upsertActual(dateISO: string, value: number) {
    await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateISO, actual_total_savings: Number(value) }),
    })
  }

  async deleteActual(dateISO: string) {
    await fetch('/api/actuals?date=' + encodeURIComponent(dateISO), { method: 'DELETE' })
  }

  async getSettings() {
    const r = await fetch('/api/settings').then(r => r.json()).catch(() => null)
    return { lowerPct: r?.lowerPct ?? 10, upperPct: r?.upperPct ?? 15 }
  }

  async saveSettings(lowerPct: number, upperPct: number) {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lowerPct, upperPct }),
    })
  }
}
