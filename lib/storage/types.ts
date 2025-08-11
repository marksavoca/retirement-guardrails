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
  // Plans
  getPlan(assumption?: string): Promise<{ series: PlanPoint[]; lastUpdated: string | null; meta?: PlanMeta; assumptions?: string[] }>
  /** Save a full set of series keyed by assumption name (e.g., Pessimistic/Average/Optimistic). Replaces existing if replace=true. */
  savePlans(seriesByAssumption: Record<string, PlanPoint[]>, opts?: { replace?: boolean; meta?: { filename?: string; items?: { include: string[]; exclude: string[] } } }): Promise<void>
  /** List the assumptions currently stored. */
  getPlanAssumptions(): Promise<string[]>

  // Actuals
  getActuals(): Promise<{ actuals: ActualEntry[]; lastUpdated: string | null }>
  upsertActual(dateISO: string, value: number): Promise<void>
  updateActual(dateISO: string, value: number): Promise<void>
  deleteActual(dateISO: string): Promise<void>

  // Guardrail settings
  getSettings(): Promise<{ lowerPct: number; upperPct: number }>
  saveSettings(lowerPct: number, upperPct: number): Promise<void>
}
