import type { NextApiRequest, NextApiResponse } from 'next'
import { getPool } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pool = getPool()
  const planName = process.env.PLAN_NAME || 'default'

  if (req.method === 'POST') {
    const { date, actual_total_savings } = req.body || {}
    if (!date || typeof actual_total_savings !== 'number') return res.status(400).json({ error: 'date and actual_total_savings required' })
    await pool.execute('INSERT INTO actuals (name, date, actual_total_savings) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE actual_total_savings=VALUES(actual_total_savings)', [planName, date, Number(actual_total_savings)])
    return res.json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const date = (req.query?.date || (req.body as any)?.date) as string | undefined
    if (!date) return res.status(400).json({ error: 'date required' })
    const [r]: any = await pool.execute('DELETE FROM actuals WHERE name = ? AND date = ?', [planName, date])
    return res.json({ ok: true, deleted: r?.affectedRows || 0 })
  }

  if (req.method === 'GET') {
    const [rows]: any = await pool.query('SELECT date, actual_total_savings, updated_at FROM actuals WHERE name = ? ORDER BY date', [planName])
    const actuals = rows.map((r: any) => ({
      date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0,10),
      actual_total_savings: Number(r.actual_total_savings),
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
    }))
    const [lu]: any = await pool.query('SELECT MAX(updated_at) as lastUpdated FROM actuals WHERE name = ?', [planName])
    res.json({ actuals, lastUpdated: lu[0]?.lastUpdated || null })
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end('Method Not Allowed')
}
