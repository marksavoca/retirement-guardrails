export type PlanPoint = { date: string; plan_total_savings: number };
export type ActualEntry = { date: string; actual_total_savings: number };

export function parseCurrencyLike(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function normalizeDateYYYY(d: string): string {
  const m = d.match(/\[(\d{4})\]/);
  if (m) return `${m[1]}-01-01`;
  const m2 = d.match(/^(\d{4})$/);
  if (m2) return `${m2[1]}-01-01`;
  return d;
}

export function buildPlanFromCSV(rows: any[], options: {
  selectedAssumption?: string | null,
  includeItems: string[],
  excludeItems: string[]
}): PlanPoint[] {
  const assumptionSet = new Set(rows.map(r => String(r['Assumptions'] || r['assumptions'] || '').trim()).filter(Boolean));
  const chosenAssumption = options.selectedAssumption && assumptionSet.has(options.selectedAssumption)
    ? options.selectedAssumption
    : (assumptionSet.values().next().value ?? null);

  const filtered = rows.filter(r => {
    const category = String(r['Category'] || '').trim();
    const assumption = String(r['Assumptions'] || '').trim();
    return category.toLowerCase() === 'accounts' && (!chosenAssumption || assumption === chosenAssumption);
  });

  const yearCols: string[] = Object.keys(rows[0] || {}).filter(k => /^\[\d{4}\]/.test(k));

  const includeSet = new Set(options.includeItems.map(s => s.toLowerCase()));
  const excludeSet = new Set(options.excludeItems.map(s => s.toLowerCase()));
  function shouldIncludeItem(item: string) {
    const low = item.toLowerCase();
    if (excludeSet.has(low)) return false;
    if (includeSet.size === 0) return true;
    return includeSet.has(low);
  }

  const series: PlanPoint[] = [];
  for (const yc of yearCols) {
    let sum = 0;
    for (const r of filtered) {
      const item = String(r['Item'] || '').trim();
      if (!shouldIncludeItem(item)) continue;
      const v = parseCurrencyLike(r[yc]);
      if (Number.isFinite(v)) sum += v;
    }
    const date = normalizeDateYYYY(yc);
    if (Number.isFinite(sum) && date) {
      series.push({ date, plan_total_savings: sum });
    }
  }
  return series.sort((a,b)=>a.date.localeCompare(b.date));
}

export function guardrailStatus(planValue: number, actual: number, lowerPct: number, upperPct: number) {
  const lower = planValue * (1 - lowerPct/100);
  const upper = planValue * (1 + upperPct/100);
  if (actual < lower) return { status: 'Below Lower', className: 'fail', lower, upper };
  if (actual > upper) return { status: 'Above Upper', className: 'warn', lower, upper };
  return { status: 'Within Guardrails', className: 'ok', lower, upper };
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function planValueAtDate(plan: PlanPoint[], dateISO: string): number | null {
  if (!plan.length) return null;
  const sorted = [...plan]
    .map(p => ({ ...p, plan_total_savings: Number(p.plan_total_savings) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const target = new Date(dateISO).getTime();
  const toMs = (d: string) => new Date(d).getTime();

  if (target <= toMs(sorted[0].date)) return sorted[0].plan_total_savings;
  if (target >= toMs(sorted[sorted.length - 1].date)) return sorted[sorted.length - 1].plan_total_savings;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const tPrev = toMs(prev.date), tNext = toMs(next.date);
    if (tPrev <= target && target <= tNext) {
      if (tPrev === tNext) return prev.plan_total_savings;
      const ratio = (target - tPrev) / (tNext - tPrev);
      return prev.plan_total_savings + ratio * (next.plan_total_savings - prev.plan_total_savings);
    }
  }
  return null;
}
