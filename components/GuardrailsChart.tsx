// components/GuardrailsChart.tsx
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  DefaultTooltipContent
} from 'recharts'
import { useMemo, useState } from 'react'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { planValueAtDate } from '../lib/guardrails'
import KebabMenu from './KebabMenu'

const toISO = (d: string | Date) => {
  if (typeof d !== 'string') return new Date(d).toISOString().slice(0, 10)
  const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const [, y, mo, da] = m
    return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`
  }
  return d.slice(0, 10)
}

const fmtUSD = (n: unknown) =>
  (Number.isFinite(Number(n))
    ? Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : '—');

function HoverOnlyTooltip({ active, label, payload }: any) {
  if (!active || !payload?.length) return null;

  // Normalize to a canonical set (prefer Hover values if both exist)
  const pick = new Map<string, any>();
  const preferHover = (key: string, p: any) => {
    const cur = pick.get(key);
    const isHover = String(p.dataKey).endsWith('Hover');
    if (!cur || isHover) pick.set(key, p);
  };

  console.log('tooltip payload', payload);

  for (const p of payload) {
    const dk = String(p.dataKey);
    if (dk === 'planHover' || dk === 'plan') preferHover('plan', p);
    else if (dk === 'lowerHover' || dk === 'lower') preferHover('lower', p);
    else if (dk === 'upperHover' || dk === 'upper') preferHover('upper', p);
    else if (dk === 'y') preferHover('y', p); // Actuals
  }

  const rows = ['plan', 'y', 'lower', 'upper'].map(k => pick.get(k)).filter(Boolean);
  if (!rows.length) return null;

  const iso = new Date(Number(label)).toISOString().slice(0, 10);

  return (
    <div
      className="recharts-default-tooltip"
      style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,.15)',
        padding: '8px 10px',
        borderRadius: 6,
        boxShadow: '0 6px 18px rgba(0,0,0,.12)',
        pointerEvents: 'none',
      }}
    >
      <p className="recharts-tooltip-label" style={{ margin: 0, marginBottom: 6 }}>{iso}</p>
      {rows.map((p: any) => (
        <div key={p.dataKey}>
          <span>
            {p.name ||
              (p.dataKey === 'y' ? 'Actual'
               : p.dataKey.toString().startsWith('plan') ? 'Plan'
               : p.dataKey.toString().startsWith('lower') ? 'Lower guardrail'
               : 'Upper guardrail')}:&nbsp;
          </span>
          <span>{fmtUSD(p.value)}</span>
        </div>
      ))}
    </div>
  );
}


// choose a "nice" step so we show ~12 ticks max (1/2/5/10/20/…)
function pickYearStep(spanY: number, target = 12) {
  const raw = Math.max(1, Math.ceil(spanY / target))
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)))
  const candidates = [1, 2, 5, 10].map(m => m * pow10)
  const step = candidates.find(c => c >= raw) ?? raw
  return step
}

export default function GuardrailsChart({
  plan,
  actuals,
  lowerPct,
  upperPct,
}: {
  plan: PlanPoint[]
  actuals: ActualEntry[]
  lowerPct: number
  upperPct: number
}) {
  const [hoverISO, setHoverISO] = useState<string | null>(null)
  

  const { baseData, actualPoints, xDomain, xTicks, yDomain, hoverData } = useMemo(() => {
    const dateSet = new Set<string>([
      ...plan.map(p => toISO(p.date)),
      ...actuals.map(a => toISO(a.date)),
    ])
    const sortedPlan = [...plan].sort((a, b) => toISO(a.date).localeCompare(toISO(b.date)))
    if (sortedPlan.length) {
      dateSet.add(toISO(sortedPlan[0].date))
      dateSet.add(toISO(sortedPlan[sortedPlan.length - 1].date))
    }
    const allDates = Array.from(dateSet).sort()

    const frame = allDates.map(d => {
      const t = new Date(d).getTime()
      const pv = planValueAtDate(plan, d)
      return {
        t,
        date: d,
        plan: pv,
        lower: pv != null ? pv * (1 - lowerPct / 100) : null,
        upper: pv != null ? pv * (1 + upperPct / 100) : null,
      }
    })

    const points = actuals
      .map(a => ({
        t: new Date(toISO(a.date)).getTime(),
        y: Number(a.actual_total_savings),
        date: toISO(a.date),
      }))
      .sort((a, b) => a.t - b.t)

    // X domain from both series
    const tVals = [
      ...frame.map(r => r.t).filter(Number.isFinite),
      ...points.map(p => p.t).filter(Number.isFinite),
    ]
    let xDomain: [number, number] | ['auto', 'auto'] = ['auto', 'auto']
    let xTicks: number[] = []
    if (tVals.length) {
      let min = Math.min(...tVals)
      let max = Math.max(...tVals)
      if (min === max) {
        const day = 24 * 3600 * 1000
        min -= day
        max += day
      }
      xDomain = [min, max]

      const minY = new Date(min).getUTCFullYear()
      const maxY = new Date(max).getUTCFullYear()
      const spanY = Math.max(1, maxY - minY)
      const step = pickYearStep(spanY, 12) // ≈12 ticks
      for (let y = minY; y <= maxY; y += step) {
        xTicks.push(Date.UTC(y, 0, 1))
      }
    }
    

    // Y domain with padding
    const vals = [
      ...frame.flatMap(r => [r.plan, r.lower, r.upper].filter(v => v != null) as number[]),
      ...points.map(p => p.y),
    ]
    let yDomain: [number | 'auto', number | 'auto'] = ['auto', 'auto']
    if (vals.length) {
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const span = Math.max(1, max - min)
      yDomain = [Math.floor(min - 0.05 * span), Math.ceil(max + 0.05 * span)]
    }

    const baseData =
      frame.length > 0
        ? frame
        : points.map(p => ({ t: p.t, date: p.date, plan: null, lower: null, upper: null }))

    const hoverData = baseData.map(d => ({
      t: d.t,
      planHover: d.plan,
      lowerHover: d.lower,
      upperHover: d.upper,
    }))

    return { baseData, actualPoints: points, xDomain, xTicks, yDomain, hoverData }
  }, [plan, actuals, lowerPct, upperPct])

  return (
    <div style={{ width: '100%', height: 420, position:'relative' }}>
      <KebabMenu onUpload={() => (window as any).__openUpload?.()} onSettings={() => (window as any).__openSettings?.()} />
      <ResponsiveContainer>
        <ComposedChart
          data={baseData}
          margin={{ top: 16, right: 20, bottom: 12, left: 72 }}
          onMouseMove={(s: any) => {
            if (s?.activeLabel) {
              const iso = new Date(Number(s.activeLabel)).toISOString().slice(0, 10)
              setHoverISO(iso)
            }
          }}
        >
          <XAxis
            dataKey="t"
            type="number"
            scale="time"                
            domain={xDomain as any}
            allowDataOverflow
            ticks={xTicks}
            interval={0}
            minTickGap={10}
            tickMargin={8}
            tickFormatter={t => new Date(Number(t)).getUTCFullYear().toString()}
            padding={{ left: 10, right: 10 }}
          />

          <YAxis
            domain={yDomain as any}
            tickMargin={8}
            tickFormatter={v => '$' + Number(v).toLocaleString()}
          />

         <Tooltip
            shared
            content={<HoverOnlyTooltip />}
            cursor={{ strokeDasharray: '3 3' }}
          />

          <Line type="monotone" dataKey="plan"  name="Plan"            dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="lower" name="Lower guardrail" strokeDasharray="4 4" dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="upper" name="Upper guardrail" strokeDasharray="4 4" dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />

          {/* invisible hover targets */}
          <Scatter data={hoverData} dataKey="planHover"  name="Plan"            opacity={0} isAnimationActive={false} />
          <Scatter data={hoverData} dataKey="lowerHover" name="Lower guardrail" opacity={0} isAnimationActive={false} />
          <Scatter data={hoverData} dataKey="upperHover" name="Upper guardrail" opacity={0} isAnimationActive={false} />

          {/* actuals (visible) */}
          <Scatter data={actualPoints} dataKey="y" name="Actual" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
