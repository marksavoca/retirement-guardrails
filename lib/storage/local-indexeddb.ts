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
  filename?: string | null
  assumption?: string | null
  items_selected?: string | null // JSON
  uploaded_at: number
}

class GuardrailsDB extends Dexie {
  plans!: Table<PlanRow, [string, string]>      // PK: [name+date]
  actuals!: Table<ActualRow, [string, string]>  // PK: [name+date]
  settings!: Table<SettingsRow, string>         // PK: name
  plan_uploads!: Table<UploadRow, number>       // PK: autoinc id

  constructor() {
    super('guardrails')
    this.version(1).stores({
      plans:        '[name+date], name, date, updated_at',
      actuals:      '[name+date], name, date, updated_at',
      settings:     'name, updated_at',
      plan_uploads: '++id, name, uploaded_at',
    })
  }
}
const db = new GuardrailsDB()

export class LocalIndexedDbStorage implements AppStorage {
  static async create() {
    // Dexie opens lazily; nothing special to do here
    return new LocalIndexedDbStorage()
  }

  async getPlan() {
    const rows = await db.plans.where('name').equals(PLAN).sortBy('date')
    const series = rows.map(r => ({
        date: r.date,
        plan_total_savings: Number(r.plan_total_savings),
    }))

    const lastUpdatedNum =
        rows.reduce((m, r) => Math.max(m, r.updated_at || 0), 0) || null
    const lastUpdated = lastUpdatedNum ? new Date(lastUpdatedNum).toISOString() : null

    // Was: .orderBy('uploaded_at').reverse().first()  <-- not valid on Collection
    const uploadsAsc = await db.plan_uploads
        .where('name')
        .equals(PLAN)
        .sortBy('uploaded_at')          // returns array sorted ascending
    const lastUpload = uploadsAsc.length ? uploadsAsc[uploadsAsc.length - 1] : undefined

    const meta = lastUpload
        ? {
            filename: lastUpload.filename || '',
            assumption: lastUpload.assumption ?? null,
            items: lastUpload.items_selected ? JSON.parse(lastUpload.items_selected) : undefined,
            uploaded_at: new Date(lastUpload.uploaded_at).toISOString(),
        }
        : null

    return { series, lastUpdated, meta }
    }

  async savePlan(series: PlanPoint[], meta?: { filename?: string; assumption?: string | null; items?: { include: string[]; exclude: string[] } }) {
    const now = Date.now()
    await db.transaction('rw', db.plans, db.plan_uploads, async () => {
      await db.plans.where('name').equals(PLAN).delete()
      if (series.length) {
        await db.plans.bulkPut(
          series.map(p => ({
            name: PLAN,
            date: p.date,
            plan_total_savings: Number(p.plan_total_savings),
            updated_at: now,
          }))
        )
      }
      if (meta && (meta.filename || meta.assumption || meta.items)) {
        await db.plan_uploads.add({
          name: PLAN,
          filename: meta.filename ?? null,
          assumption: meta.assumption ?? null,
          items_selected: meta.items ? JSON.stringify(meta.items) : null,
          uploaded_at: now,
        })
      }
    })
  }

  async getActuals() {
    const rows = await db.actuals.where('name').equals(PLAN).sortBy('date')
    const actuals: ActualEntry[] = rows.map(r => ({
      date: r.date,
      actual_total_savings: Number(r.actual_total_savings),
    }))
    const lastUpdatedNum =
      rows.reduce((m, r) => Math.max(m, r.updated_at || 0), 0) || null
    const lastUpdated = lastUpdatedNum ? new Date(lastUpdatedNum).toISOString() : null
    return { actuals, lastUpdated }
  }

  async upsertActual(dateISO: string, value: number) {
    const now = Date.now()
    await db.actuals.put({
      name: PLAN,
      date: dateISO,
      actual_total_savings: Number(value),
      updated_at: now,
    })
  }

  async deleteActual(dateISO: string) {
    // primary key is [name+date]
    await db.actuals.delete([PLAN, dateISO] as any)
  }

  async getSettings() {
    const row = await db.settings.get(PLAN)
    return {
      lowerPct: row?.lower_pct ?? 10,
      upperPct: row?.upper_pct ?? 15,
    }
  }

  async saveSettings(lowerPct: number, upperPct: number) {
    await db.settings.put({
      name: PLAN,
      lower_pct: Number(lowerPct),
      upper_pct: Number(upperPct),
      updated_at: Date.now(),
    })
  }
}
