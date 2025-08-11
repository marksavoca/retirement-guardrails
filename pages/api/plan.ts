// pages/api/plan.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getPool } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planName = process.env.PLAN_NAME || 'default'
  const pool = getPool()

  if (req.method === 'GET') {
    const assumption = String(req.query.assumption || 'Average')
    const [rows]: any = await pool.query(
      'SELECT date, plan_total_savings, updated_at FROM plans WHERE name = ? AND assumption = ? ORDER BY date',
      [planName, assumption]
    ).catch(()=>[[]] as any)

    const [assRows]: any = await pool.query(
      'SELECT DISTINCT assumption FROM plans WHERE name = ? ORDER BY assumption',
      [planName]
    ).catch(()=>[[]] as any)

    const series = (rows as any[]).map(r => ({ date: r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10), plan_total_savings: Number(r.plan_total_savings) }))
    const lastUpdated = (rows as any[]).length ? new Date(Math.max(...(rows as any[]).map(r => new Date(r.updated_at||0).getTime() || 0))).toISOString() : null
    const assumptions = (assRows as any[]).map(r => String(r.assumption)).filter(Boolean)

    res.json({ series, lastUpdated, assumptions })
    return
  }

  if (req.method === 'POST') {
    const { seriesByAssumption, replace, meta } = req.body || {}
    if (!seriesByAssumption || typeof seriesByAssumption !== 'object') {
      res.status(400).json({ error: 'seriesByAssumption required' }); return
    }
    await pool.query('START TRANSACTION')
    try {
      if (replace) {
        await pool.query('DELETE FROM plans WHERE name = ?', [planName])
      }
      const now = new Date()
      for (const [assump, series] of Object.entries(seriesByAssumption as Record<string, any[]>)) {
        for (const p of series) {
          await pool.query(
            'INSERT INTO plans (name, assumption, date, plan_total_savings, updated_at) VALUES (?, ?, ?, ?, ?)',
            [planName, assump, p.date, Number(p.plan_total_savings), now]
          )
        }
      }
      // optional meta table
      if (meta?.filename) {
        await pool.query(
          'INSERT INTO plan_uploads (name, filename, items, uploaded_at) VALUES (?, ?, ?, ?)',
          [planName, meta.filename, JSON.stringify(meta.items ?? null), now]
        ).catch(()=>{})
      }
      await pool.query('COMMIT')
      res.status(204).end()
    } catch (e) {
      await pool.query('ROLLBACK')
      console.error('plan POST failed', e)
      res.status(500).json({ error: 'failed to save plans' })
    }
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end()
}
