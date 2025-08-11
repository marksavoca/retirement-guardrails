import type { NextApiRequest, NextApiResponse } from 'next'
import { getPool } from '../../lib/db'

const PLAN = process.env.PLAN_NAME || 'default'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pool = getPool()

  if (req.method === 'GET') {
    const [rows]: any = await pool.query(
      'SELECT lower_pct, upper_pct, updated_at FROM settings WHERE name = ?',
      [PLAN]
    )
    if (rows.length === 0) {
      return res.json({ lowerPct: 10, upperPct: 15, updated_at: null })
    }
    const r = rows[0]
    return res.json({
      lowerPct: Number(r.lower_pct),
      upperPct: Number(r.upper_pct),
      updated_at: typeof r.updated_at === 'string'
        ? r.updated_at
        : new Date(r.updated_at).toISOString(),
    })
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const { lowerPct, upperPct } = req.body || {}
    const lp = Number(lowerPct)
    const up = Number(upperPct)
    if (!Number.isFinite(lp) || !Number.isFinite(up)) {
      return res.status(400).json({ error: 'lowerPct and upperPct must be numbers' })
    }
    await pool.query(
      `INSERT INTO settings (name, lower_pct, upper_pct)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE lower_pct = VALUES(lower_pct), upper_pct = VALUES(upper_pct)`,
      [PLAN, lp, up]
    )
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET,POST,PUT')
  return res.status(405).end('Method Not Allowed')
}
