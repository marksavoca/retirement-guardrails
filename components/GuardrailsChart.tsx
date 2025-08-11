import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PlanPoint, ActualEntry } from '../lib/types'
import { planValueAtDate } from '../lib/guardrails'

const toISO = (d: string | Date) =>
  typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)
const ms = (d: string) => new Date(d).getTime()

function monthlyBetween(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const start = new Date(startISO); start.setUTCDate(1); start.setUTCHours(0,0,0,0)
  const end = new Date(endISO);     end.setUTCDate(1);   end.setUTCHours(0,0,0,0)
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0,10))
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

function yearTicks(minISO: string, maxISO: string): number[] {
  const minY = new Date(minISO).getUTCFullYear()
  const maxY = new Date(maxISO).getUTCFullYear()
  const span = Math.max(1, maxY - minY)
  const step = span > 12 ? 5 : 1
  const ticks: number[] = []
  for (let y = minY; y <= maxY; y += step) ticks.push(Date.UTC(y, 0, 1))
  return ticks
}

export default function GuardrailsChart({
  plan,
  actuals,
  lowerPct,
  upperPct,
  onHoverDate,
}: {
  plan: PlanPoint[]
  actuals: ActualEntry[]
  lowerPct: number
  upperPct: number
  onHoverDate?: (iso: string) => void
}) {
  const { frame, actualPoints, planProbe, xDomain, yDomain, ticks, actualMap } = useMemo(() => {
    const planDates = plan.map(p => toISO(p.date))
    const minISO = planDates[0] ?? toISO(actuals[0]?.date ?? new Date())
    const maxISO = planDates[planDates.length - 1] ?? toISO(actuals[actuals.length - 1]?.date ?? minISO)

    const timeline = monthlyBetween(minISO, maxISO)
    const frame = timeline.map(d => {
      const t = ms(d)
      const pv = planValueAtDate(plan, d)
      return {
        t,
        date: d,
        plan: pv,
        lower: pv != null ? pv * (1 - lowerPct / 100) : null,
        upper: pv != null ? pv * (1 + upperPct / 100) : null,
      }
    })

    const actualPoints = actuals
      .map(a => {
        const d = toISO(a.date)
        const pv = planValueAtDate(plan, d)
        const lower = pv != null ? pv * (1 - lowerPct / 100) : null
        const upper = pv != null ? pv * (1 + upperPct / 100) : null
        const y = Number(a.actual_total_savings)
        const oob = lower != null && upper != null ? (y < lower || y > upper) : false
        return { t: ms(d), y, date: d, oob }
      })
      .sort((a, b) => a.t - b.t)

    const planProbe = frame
      .filter(r => r.plan != null)
      .map(r => ({ t: r.t, y: r.plan as number }))

    const actualMap = new Map(actuals.map(a => [toISO(a.date), Number(a.actual_total_savings)]))

    const planVals = frame.flatMap(r => [r.plan, r.lower, r.upper].filter(v => v != null)) as number[]
    const actualVals = actualPoints.map(p => p.y)
    const allVals = [...planVals, ...actualVals]
    const pad = (min: number, max: number) => {
      const span = Math.max(1, max - min)
      return [Math.floor(min - 0.08 * span), Math.ceil(max + 0.08 * span)] as const
    }
    const yDomain = allVals.length ? pad(Math.min(...allVals), Math.max(...allVals)) : (['auto','auto'] as const)
    const xDomain: [number, number] = [ms(minISO), ms(maxISO)]
    const ticks = yearTicks(minISO, maxISO)

    return { frame, actualPoints, planProbe, xDomain, yDomain, ticks, actualMap }
  }, [plan, actuals, lowerPct, upperPct])

  const CustomTooltip = ({ active, label }: any) => {
    if (!active || label == null) return null
    const iso = new Date(Number(label)).toISOString().slice(0, 10)
    const pv = planValueAtDate(plan, iso)
    if (pv == null) return null
    const lower = pv * (1 - lowerPct / 100)
    const upper = pv * (1 + upperPct / 100)
    const actual = actualMap.get(iso)

    return (
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', boxShadow: '0 10px 20px rgba(2,6,23,0.15)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{iso}</div>
        <div>Plan: <b>${Number(pv).toLocaleString()}</b></div>
        <div>Lower: <b>${Number(lower).toLocaleString()}</b></div>
        <div>Upper: <b>${Number(upper).toLocaleString()}</b></div>
        {actual != null && (
          <div style={{ marginTop: 4 }}>Actual: <b>${Number(actual).toLocaleString()}</b></div>
        )}
      </div>
    )
  }

  // red when out-of-bounds, teal otherwise
  const ActualDot = (props: any) => {
    const { cx, cy, payload } = props
    const fill = payload?.oob ? '#ef4444' : '#0ea5a6'
    return <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="#ffffff" strokeWidth={1} />
  }

  return (
    <div style={{ width: '100%', height: 380 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={frame}
          margin={{ left: 28, right: 16, top: 8, bottom: 8 }}
          onMouseMove={(s: any) => {
            if (s?.activeLabel && onHoverDate) {
              const iso = new Date(Number(s.activeLabel)).toISOString().slice(0, 10)
              onHoverDate(iso)
            }
          }}
        >
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[frame[0]?.t ?? 0, frame[frame.length - 1]?.t ?? 0]}
            ticks={frame.length ? yearTicks(frame[0].date, frame[frame.length - 1].date) : []}
            minTickGap={12}
            allowDataOverflow
            tickFormatter={(t) => String(new Date(Number(t)).getUTCFullYear())}
          />
          <YAxis
            width={96}
            tickMargin={8}
            domain={yDomain as any}
            tickFormatter={(v) => '$' + Number(v).toLocaleString()}
          />
          {/* invisible hover targets along plan */}
          <Scatter data={planProbe} name="probe" fill="transparent" stroke="transparent" />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Line dataKey="plan" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="lower" strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="upper" strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          {/* actuals with conditional dot color */}
          {/* <Scatter data={actualPoints} dataKey="y" name="Actual" shape={ActualDot} /> */}
          {/* Actual points */}
          <Scatter
            data={actualPoints}
            dataKey="y"
            name="Actual"
            shape={ActualDot}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
