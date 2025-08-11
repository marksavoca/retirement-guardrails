// components/GuardrailsChart.tsx
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useMemo, useState } from 'react'
import type { PlanPoint, ActualEntry } from '../lib/types'
import { planValueAtDate } from '../lib/guardrails'

const toISO = (d: string | Date) => {
  if (typeof d !== 'string') return new Date(d).toISOString().slice(0, 10)
  const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const [, y, mo, da] = m
    return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`
  }
  return d.slice(0, 10)
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

  const { baseData, actualPoints, xDomain, xTicks, yDomain } = useMemo(() => {
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

    return { baseData, actualPoints: points, xDomain, xTicks, yDomain }
  }, [plan, actuals, lowerPct, upperPct])

  return (
    <div style={{ width: '100%', height: 420 }}>
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
            domain={xDomain as any}
            allowDataOverflow
            ticks={xTicks}              // precomputed ticks
            interval={0}                // draw all in ticks[]
            minTickGap={10}             // extra insurance
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
            labelFormatter={t => new Date(Number(t)).toISOString().slice(0, 10)}
            formatter={v => '$' + Number(v).toLocaleString()}
          />

          <Line type="monotone" dataKey="plan" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="lower" strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="upper" strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          <Scatter data={actualPoints} dataKey="y" name="Actual" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
