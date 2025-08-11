// lib/storage/local-indexeddb.ts
import Dexie, { Table } from 'dexie'
import type { Storage as AppStorage } from './types'

type PlanPoint = { date: string; plan_total_savings: number }
type ActualEntry = { date: string; actual_total_savings: number }
type PlanMeta = {
  filename: string
  assumption: string | null
  items?: { include: string[]; exclude: string[] }
  uploaded_at: string
} | null

const PLAN = 'default'

// Normalize anything to "YYYY-MM-DD"
const norm = (d: string) =>
  typeof d === 'string'
    ? (d.length >= 10 ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10))
    : new Date(d).toISOString().slice(0, 10)

interface PlanRow {
  name: string
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
  assumption: string | null
  items?: { include: string[]; exclude: string[] }
  uploaded_at: number
}

class GuardrailsDB extends Dexie {
  plans!: Table<PlanRow, [string, string]>
  actuals!: Table<ActualRow, [string, string]>
  settings!: Table<SettingsRow, string>
  plan_uploads!: Table<UploadRow, number>

  constructor() {
    super('guardrails')
    // Compound primary keys: [name+date]
    this.version(1).stores({
      plans:        '[name+date], name, date, updated_at',
      actuals:      '[name+date], name, date, updated_at',
      settings:     'name, updated_at',
      plan_uploads: '++id, name, uploaded_at',
    })
  }
}
const db = new GuardrailsDB()

// --- Helpers that respect legacy, non-normalized dates ---
async function findActualByNormDate(name: string, dateISO: string) {
  const d = norm(dateISO)
  return db.actuals
    .where('name')
    .equals(name)
    .and(r => norm(r.date) === d)
    .first()
}
async function deleteActualByNormDate(name: string, dateISO: string) {
  const d = norm(dateISO)
  const rows = await db.actuals
    .where('name')
    .equals(name)
    .and(r => norm(r.date) === d)
    .toArray()
  await Promise.all(rows.map(r => db.actuals.delete([r.name, r.date] as any)))
}
async function migrateNormalizeDates() {
  // Normalize ACTUALS keys
  const acts = await db.actuals.where('name').equals(PLAN).toArray()
  for (const r of acts) {
    const nd = norm(r.date)
    if (nd !== r.date) {
      // If a normalized record already exists, keep the latest value
      const existing = await db.actuals.get([r.name, nd] as any)
      if (!existing || existing.updated_at <= r.updated_at) {
        await db.actuals.put({
          name: r.name,
          date: nd,
          actual_total_savings: r.actual_total_savings,
          updated_at: r.updated_at,
        })
      }
      await db.actuals.delete([r.name, r.date] as any)
    }
  }
  // Normalize PLANS keys
  const plans = await db.plans.where('name').equals(PLAN).toArray()
  for (const r of plans) {
    const nd = norm(r.date)
    if (nd !== r.date) {
      const existing = await db.plans.get([r.name, nd] as any)
      if (!existing || existing.updated_at <= r.updated_at) {
        await db.plans.put({
          name: r.name,
          date: nd,
          plan_total_savings: r.plan_total_savings,
          updated_at: r.updated_at,
        })
      }
      await db.plans.delete([r.name, r.date] as any)
    }
  }
}

export class LocalIndexedDbStorage implements AppStorage {
  static async create() {
    // one-time normalization to fix legacy keys with timestamps
    await migrateNormalizeDates().catch(() => {})
    return new LocalIndexedDbStorage()
  }

  async getPlan() {
    const rows = await db.plans.where('name').equals(PLAN).toArray()
    rows.sort((a, b) => a.date.localeCompare(b.date))
    const series: PlanPoint[] = rows.map(r => ({
      date: norm(r.date),
      plan_total_savings: r.plan_total_savings,
    }))
    const uploads = await db.plan_uploads.where('name').equals(PLAN).toArray()
    uploads.sort((a, b) => (a.uploaded_at || 0) - (b.uploaded_at || 0))
    const last = uploads.at(-1) || null
    const meta: PlanMeta = last
      ? {
          filename: last.filename,
          assumption: last.assumption,
          items: last.items,
          uploaded_at: new Date(last.uploaded_at).toISOString(),
        }
      : null
    const lastUpdated =
      rows.length ? new Date(Math.max(...rows.map(r => r.updated_at))).toISOString() : null
    return { series, lastUpdated, meta }
  }

  async savePlan(
    series: PlanPoint[],
    meta?: { filename?: string; assumption?: string | null; items?: { include: string[]; exclude: string[] } }
  ) {
    const now = Date.now()
    await db.transaction('rw', db.plans, db.plan_uploads, async () => {
      const existing = await db.plans.where('name').equals(PLAN).toArray()
      await Promise.all(existing.map(r => db.plans.delete([r.name, r.date] as any)))
      for (const p of series) {
        await db.plans.put({
          name: PLAN,
          date: norm(p.date),
          plan_total_savings: Number(p.plan_total_savings),
          updated_at: now,
        })
      }
      if (meta?.filename) {
        await db.plan_uploads.add({
          name: PLAN,
          filename: meta.filename,
          assumption: meta.assumption ?? null,
          items: meta.items,
          uploaded_at: now,
        })
      }
    })
  }

  async getActuals() {
    const rows = await db.actuals.where('name').equals(PLAN).toArray()
    // coalesce by normalized date (if any legacy dupes remain)
    const map = new Map<string, ActualRow>()
    for (const r of rows) {
      const k = norm(r.date)
      const prev = map.get(k)
      if (!prev || prev.updated_at <= r.updated_at) {
        map.set(k, { ...r, date: k })
      }
    }
    const list = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
    const actuals: ActualEntry[] = list.map(r => ({
      date: r.date,
      actual_total_savings: r.actual_total_savings,
    }))
    const lastUpdated =
      list.length ? new Date(Math.max(...list.map(r => r.updated_at))).toISOString() : null
    return { actuals, lastUpdated }
  }

  // create/replace
  async upsertActual(dateISO: string, value: number) {
    const d = norm(dateISO)
    // remove any legacy/duplicate keys first
    await deleteActualByNormDate(PLAN, d).catch(() => {})
    await db.actuals.put({
      name: PLAN,
      date: d,
      actual_total_savings: Number(value),
      updated_at: Date.now(),
    })
  }

  // edit existing only (no insert). If legacy key exists, it is replaced in-place.
  async updateActual(dateISO: string, value: number) {
    console.log("update actual", dateISO, value)
    const d = norm(dateISO)
    const existing = await findActualByNormDate(PLAN, d)
    console.log("existing", existing)
    if (!existing) throw new Error('Not found')
    if (existing.date !== d) {
      // rekey from legacy timestamped date to normalized date
      console.log("delete legacy date", existing.date)
      await db.actuals.delete([existing.name, existing.date] as any)
    }
    await db.actuals.put({
      name: PLAN,
      date: d,
      actual_total_savings: Number(value),
      updated_at: Date.now(),
    })
  }

  async deleteActual(dateISO: string) {
    await deleteActualByNormDate(PLAN, dateISO)
  }

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
