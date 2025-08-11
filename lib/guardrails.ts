// lib/guardrails.ts
import type { PlanPoint } from './types'

/** YYYY-MM-DD for today (local time). */
export function isoToday(): string {
  const d = new Date()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Parse "$1,234,567" (and unicode minus) into a number. */
export function parseCurrencyLike(v: string | number): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\u2212|−/g, '-') // unicode minus
    .trim()
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Guardrail status helper. */
export function guardrailStatus(
  plan: number,
  actual: number,
  lowerPct: number,
  upperPct: number
): { status: string; className: string; lower: number; upper: number } {
  const lower = plan * (1 - lowerPct / 100)
  const upper = plan * (1 + upperPct / 100)
  if (actual < lower) return { status: 'Below guardrail', className: 'danger', lower, upper }
  if (actual > upper) return { status: 'Above guardrail', className: 'success', lower, upper }
  return { status: 'Within guardrails', className: 'neutral', lower, upper }
}

/**
 * Interpolating plan lookup.
 * Returns the plan value at an arbitrary date, using linear interpolation
 * between the surrounding plan points. Clamps on both ends.
 */
export function planValueAtDate(plan: PlanPoint[], dateISO: string): number | null {
  if (!plan || plan.length === 0) return null

  const pts = plan
    .map(p => ({ t: new Date(p.date).getTime(), v: Number(p.plan_total_savings) }))
    .filter(p => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t)

  if (pts.length === 0) return null

  const t = new Date(dateISO).getTime()
  if (!Number.isFinite(t)) return null

  // clamp
  if (t <= pts[0].t) return pts[0].v
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v

  // find bracketing points (lo < t <= hi)
  let hi = 1
  while (hi < pts.length && t > pts[hi].t) hi++
  const lo = hi - 1

  const p0 = pts[lo]
  const p1 = pts[hi]
  const r = (t - p0.t) / (p1.t - p0.t) // 0..1
  return p0.v + r * (p1.v - p0.v)
}
