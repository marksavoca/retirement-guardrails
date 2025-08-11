import type { NextApiRequest, NextApiResponse } from 'next'
import { parse } from 'csv-parse/sync'
import { getPool } from '../../lib/db'
import { buildPlanFromCSV } from '../../lib/guardrails'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed')
  const { csv, filename, assumption, includeItems = [], excludeItems = [] } = req.body || {}
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text required' })

  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as any[]
  const series = buildPlanFromCSV(rows, { selectedAssumption: assumption || 'Average', includeItems, excludeItems })

  const pool = getPool(); const name = process.env.PLAN_NAME || 'default'; const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('DELETE FROM plans WHERE name = ?', [name])
    for (const r of series) {
      await conn.execute('INSERT INTO plans (name, date, plan_total_savings) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE plan_total_savings=VALUES(plan_total_savings)', [name, r.date, Number(r.plan_total_savings)])
    }
    if (filename) {
      await conn.execute('INSERT INTO plan_uploads (name, filename, assumption, items_selected) VALUES (?, ?, ?, ?)', [name, String(filename), assumption || null, JSON.stringify({ include: includeItems, exclude: excludeItems })])
    }
    await conn.commit()
    return res.json({ ok: true, count: series.length })
  } catch (e:any) {
    await conn.rollback(); return res.status(500).json({ error: e.message })
  } finally { conn.release() }
}
