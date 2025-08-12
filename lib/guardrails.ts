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

const parseDay = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d));
  }
  const dt = new Date(iso);
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
};

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function planValueAtDate(plan: PlanPoint[], iso: string): number | null {
  if (!plan?.length) return null;
  const t = parseDay(iso);

  // Accept both shapes: { value } or { plan_total_savings }
  const pts = plan
    .map(p => {
      const v =
        toNum((p as any).value) ??
        toNum((p as any).plan_total_savings);
      const date = (p as any).date as string | undefined;
      if (v == null || !date) return null;
      return { t: parseDay(date), v };
    })
    .filter((x): x is { t: number; v: number } => x != null) // <-- type guard
    .sort((a, b) => a.t - b.t);

  if (!pts.length) return null;

  // outside range → keep null so the line doesn’t extend past ends
  if (t < pts[0].t || t > pts[pts.length - 1].t) return null;

  // exact match
  for (const p of pts) if (p.t === t) return p.v;

  // find bracket [a,b]
  let a = pts[0], b = pts[pts.length - 1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].t <= t && t <= pts[i + 1].t) {
      a = pts[i];
      b = pts[i + 1];
      break;
    }
  }
  if (a.t === b.t) return a.v;

  // linear interpolation
  const r = (t - a.t) / (b.t - a.t);
  return a.v + (b.v - a.v) * r;
}