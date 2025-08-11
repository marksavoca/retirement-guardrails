// lib/plan-from-csv.ts
import type { PlanPoint } from './types'

export type BuildOptions = {
  includeItems?: string[]
  excludeItems?: string[]
}

/** Normalize year -> YYYY-MM-DD (we pin to Jan 1 for each year column). */
const yToISO = (y: number) => `${y}-01-01`

/** Money parser: handles $, commas, and Unicode minus (U+2212). */
export function parseMoneyCell(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\u2212|−/g, '-') // Unicode minus
    .trim()
    .replace(/\s+/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Case-insensitive field getter (e.g., "Assumptions" vs "assumptions"). */
function getField<T extends Record<string, any>>(row: T, key: string): any {
  const hit = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase())
  return hit ? (row as any)[hit] : undefined
}

/** Extract columns that contain a 4-digit year (robust to extra text like "[2025] age=..."). */
function extractYearColumns(headers: string[]): Array<{ year: number; key: string }> {
  const cols: Array<{ year: number; key: string }> = []
  for (const h of headers) {
    const m = /(\d{4})/.exec(h)
    if (m) cols.push({ year: Number(m[1]), key: h })
  }
  cols.sort((a, b) => a.year - b.year)
  return cols
}

/**
 * Build plan series for ALL assumptions present in the CSV.
 * Returns a map keyed by assumption, e.g. { Pessimistic: PlanPoint[], Average: PlanPoint[], Optimistic: PlanPoint[] }.
 */
export function buildPlanSetFromCSV(
  rows: Record<string, any>[],
  opts: BuildOptions = {}
): Record<string, PlanPoint[]> {
  const includeItems = new Set((opts.includeItems ?? []).map(s => s.toLowerCase()))
  const excludeItems = new Set((opts.excludeItems ?? []).map(s => s.toLowerCase()))

  if (!rows || rows.length === 0) return {}

  const headers = Object.keys(rows[0] || {})
  const yearCols = extractYearColumns(headers)
  if (yearCols.length === 0) return {}

  // Group eligible rows by assumption (only Category === "Accounts")
  const byAssumption = new Map<string, Record<string, any>[]>()

  for (const r of rows) {
    const cat = String(getField(r, 'Category') ?? '')
    if (cat.toLowerCase() !== 'accounts') continue

    const assumption = String(getField(r, 'Assumptions') ?? '').trim() || 'Average'
    const item = String(getField(r, 'Item') ?? '').trim()

    const low = item.toLowerCase()
    if (excludeItems.has(low)) continue
    if (includeItems.size > 0 && !includeItems.has(low)) continue

    if (!byAssumption.has(assumption)) byAssumption.set(assumption, [])
    byAssumption.get(assumption)!.push(r)
  }

  const result: Record<string, PlanPoint[]> = {}

  for (const [assumption, ars] of Array.from(byAssumption.entries())) {
    const totalsByYear = new Map<number, number>()

    for (const { year, key } of yearCols) {
      let sum = 0
      for (const r of ars) sum += parseMoneyCell(r[key])
      totalsByYear.set(year, sum)
    }

    const series: PlanPoint[] = Array.from(totalsByYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([y, val]) => ({ date: yToISO(y), plan_total_savings: val }))

    if (series.length) result[assumption] = series
  }

  return result
}
