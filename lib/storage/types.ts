// lib/storage/types.ts
export type PlanPoint = { date: string; plan_total_savings: number }
export type ActualEntry = { date: string; actual_total_savings: number }
export type PlanMeta = {
  filename: string
  assumption: string | null
  items?: { include: string[]; exclude: string[] }
  uploaded_at: string
} | null

export interface Storage {
  getPlan(): Promise<{ series: PlanPoint[]; lastUpdated: string | null; meta?: PlanMeta }>
  savePlan(
    series: PlanPoint[],
    meta?: { filename?: string; assumption?: string | null; items?: { include: string[]; exclude: string[] } }
  ): Promise<void>

  getActuals(): Promise<{ actuals: ActualEntry[]; lastUpdated: string | null }>
  upsertActual(dateISO: string, value: number): Promise<void>
  deleteActual(dateISO: string): Promise<void>

  getSettings(): Promise<{ lowerPct: number; upperPct: number }>
  saveSettings(lowerPct: number, upperPct: number): Promise<void>
}
