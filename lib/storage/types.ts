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
  // Plan series and optional meta
  getPlan(): Promise<{ series: PlanPoint[]; lastUpdated: string | null; meta?: PlanMeta }>
  savePlan(
    series: PlanPoint[],
    meta?: { filename?: string; assumption?: string | null; items?: { include: string[]; exclude: string[] } }
  ): Promise<void>

  // Actuals
  getActuals(): Promise<{ actuals: ActualEntry[]; lastUpdated: string | null }>
  upsertActual(dateISO: string, value: number): Promise<void>   // create/replace
  updateActual(dateISO: string, value: number): Promise<void>   // edit existing only
  deleteActual(dateISO: string): Promise<void>

  // Guardrail settings
  getSettings(): Promise<{ lowerPct: number; upperPct: number }>
  saveSettings(lowerPct: number, upperPct: number): Promise<void>
}
