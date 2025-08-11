// lib/storage/local-indexeddb.ts
import Dexie, { Table } from 'dexie'
import type { Storage as AppStorage, PlanPoint, ActualEntry, PlanMeta } from './types'

const PLAN = 'default'
const norm = (d: string) =>
  (d && d.length >= 10 ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10))

// Legacy v1 shape (no assumption key)
interface OldPlanRow {
  name: string
  date: string
  plan_total_savings: number
  updated_at: number
}

// New v2 shape (with assumption key)
interface PlanRowV2 {
  name: string
  assumption: string
  date: string
  plan_total_savings: number
  updated_at: number
}

interface ActualRow {
  name: string
  date: string
  actual_total_savings: number
  updated_at: number
}
interface SettingsRow {
  name: string
  lower_pct: number
  upper_pct: number
  updated_at: number
}
interface UploadRow {
  id?: number
  name: string
  filename: string
  items?: { include: string[]; exclude: string[] } | null
  uploaded_at: number
}

class GuardrailsDB extends Dexie {
  // v1 legacy (optional, removed in v3)
  plans?: Table<OldPlanRow, [string, string]>
  // v2 current
  plansV2!: Table<PlanRowV2, [string, string, string]>
  actuals!: Table<ActualRow, [string, string]>
  settings!: Table<SettingsRow, string>
  plan_uploads!: Table<UploadRow, number>

  constructor() {
    super('guardrails')

    // v1 legacy schema
    this.version(1).stores({
      plans:        '[name+date], name, date, updated_at',
      actuals:      '[name+date], name, date, updated_at',
      settings:     'name, updated_at',
      plan_uploads: '++id, name, uploaded_at',
    })

    // v2: introduce plansV2 with assumption; migrate if old table exists
    this.version(2).stores({
      plansV2:      '[name+assumption+date], name, assumption, date, updated_at',
      actuals:      '[name+date], name, date, updated_at',
      settings:     'name, updated_at',
      plan_uploads: '++id, name, uploaded_at',
    }).upgrade(async (tx) => {
      try {
        const old = await (tx as any).table('plans').toArray() as OldPlanRow[]
        const now = Date.now()
        for (const r of old) {
          await tx.table('plansV2').put({
            name: r.name ?? PLAN,
            assumption: 'Average',
            date: norm(r.date),
            plan_total_savings: Number(r.plan_total_savings ?? 0),
            updated_at: r.updated_at ?? now,
          } as PlanRowV2)
        }
      } catch {
        // no legacy table — fine
      }
    })

    // v3: drop legacy 'plans'
    this.version(3).stores({
      plans:        null,
      plansV2:      '[name+assumption+date], name, assumption, date, updated_at',
      actuals:      '[name+date], name, date, updated_at',
      settings:     'name, updated_at',
      plan_uploads: '++id, name, uploaded_at',
    })
  }
}
const db = new GuardrailsDB()

export class LocalIndexedDbStorage implements AppStorage {
  static async create() { return new LocalIndexedDbStorage() }

  // ---------- Plans ----------
  async getPlan(assumption = 'Average') {
    const rows = await db.plansV2
      .where('[name+assumption+date]')
      .between([PLAN, assumption, '0000-00-00'], [PLAN, assumption, '9999-12-31'])
      .toArray()

    rows.sort((a, b) => a.date.localeCompare(b.date))

    const series: PlanPoint[] = rows.map(r => ({
      date: r.date,
      plan_total_savings: r.plan_total_savings,
    }))

    const all = await db.plansV2.where('name').equals(PLAN).toArray()
    const assumptions = Array.from(new Set(all.map(r => r.assumption))).sort()

    const lastUpdated = rows.length
      ? new Date(Math.max(...rows.map(r => r.updated_at || 0))).toISOString()
      : null

    const uploads = await db.plan_uploads.where('name').equals(PLAN).toArray()
    uploads.sort((a, b) => (a.uploaded_at || 0) - (b.uploaded_at || 0))
    const last = uploads.at(-1) || null
    const meta: PlanMeta = last
      ? {
          filename: last.filename,
          assumption: null,
          items: last.items ?? { include: [], exclude: ['Housing'] },
          uploaded_at: new Date(last.uploaded_at).toISOString(),
        }
      : null

    return { series, lastUpdated, meta, assumptions }
  }

  async getPlanAssumptions() {
    const rows = await db.plansV2.where('name').equals(PLAN).toArray()
    return Array.from(new Set(rows.map(r => r.assumption))).sort()
  }

  async savePlans(
    seriesByAssumption: Record<string, PlanPoint[]>,
    opts?: { replace?: boolean; meta?: { filename?: string; items?: { include: string[]; exclude: string[] } } }
  ) {
    const { replace = true, meta } = opts || {}
    const now = Date.now()

    await db.transaction('rw', db.plansV2, db.plan_uploads, async () => {
      if (replace) {
        // Wipe existing plans for this name
        const existing = await db.plansV2.where('name').equals(PLAN).toArray()
        for (const r of existing) {
          await db.plansV2.delete([r.name, r.assumption, r.date] as any)
        }
      }

      let wrote = 0
      for (const [assump, series] of Object.entries(seriesByAssumption)) {
        if (!Array.isArray(series) || series.length === 0) continue
        for (const p of series) {
          await db.plansV2.put({
            name: PLAN,
            assumption: assump,
            date: norm(p.date),
            plan_total_savings: Number(p.plan_total_savings),
            updated_at: now,
          })
          wrote++
        }
      }

      if (meta?.filename) {
        await db.plan_uploads.add({
          name: PLAN,
          filename: meta.filename,
          items: meta.items ?? null,
          uploaded_at: now,
        })
      }

      if (wrote === 0) {
        throw new Error('No plan rows were written (empty seriesByAssumption)')
      }
    })
  }

  // ---------- Actuals ----------
  async getActuals() {
    const rows = await db.actuals.where('name').equals(PLAN).toArray()
    rows.sort((a,b)=>a.date.localeCompare(b.date))
    const actuals: ActualEntry[] = rows.map(r => ({
      date: r.date,
      actual_total_savings: r.actual_total_savings,
    }))
    const lastUpdated = rows.length
      ? new Date(Math.max(...rows.map(r => r.updated_at || 0))).toISOString()
      : null
    return { actuals, lastUpdated }
  }

  async upsertActual(dateISO: string, value: number) {
    await db.actuals.put({
      name: PLAN,
      date: norm(dateISO),
      actual_total_savings: Number(value),
      updated_at: Date.now(),
    })
  }

  async updateActual(dateISO: string, value: number) {
    const key = [PLAN, norm(dateISO)] as any
    const existing = await db.actuals.get(key)
    if (!existing) throw new Error('Not found')
    await db.actuals.put({ ...existing, actual_total_savings: Number(value), updated_at: Date.now() })
  }

  async deleteActual(dateISO: string) {
    await db.actuals.delete([PLAN, norm(dateISO)] as any)
  }

  // ---------- Settings ----------
  async getSettings() {
    const row = await db.settings.get(PLAN)
    if (!row) return { lowerPct: 10, upperPct: 15 }
    return { lowerPct: row.lower_pct, upperPct: row.upper_pct }
  }

  async saveSettings(lowerPct: number, upperPct: number) {
    await db.settings.put({
      name: PLAN,
      lower_pct: Math.round(Number(lowerPct)),
      upper_pct: Math.round(Number(upperPct)),
      updated_at: Date.now(),
    })
  }
}
