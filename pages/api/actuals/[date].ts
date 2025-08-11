// pages/api/actuals/[date].ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getPool } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const dateParam = String(req.query.date || '')
  // Expect YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    res.status(400).json({ error: 'Bad date' })
    return
  }

  const pool = getPool()
  const planName = process.env.PLAN_NAME || 'default'

  if (req.method === 'PUT') {
    const { actual_total_savings } = req.body ?? {}
    if (!Number.isFinite(Number(actual_total_savings))) {
      res.status(400).json({ error: 'actual_total_savings required' })
      return
    }
    const [r]: any = await pool.query(
      `UPDATE actuals
         SET actual_total_savings = ?, updated_at = NOW()
       WHERE name = ? AND date = ?`,
      [Number(actual_total_savings), planName, dateParam]
    )
    if (r.affectedRows === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.status(204).end()
    return
  }

  if (req.method === 'DELETE') {
    const [r]: any = await pool.query(
      'DELETE FROM actuals WHERE name = ? AND date = ?',
      [planName, dateParam]
    )
    res.status(r.affectedRows ? 204 : 404).end()
    return
  }

  res.setHeader('Allow', 'PUT, DELETE')
  res.status(405).end()
}
