import type { NextApiRequest, NextApiResponse } from 'next'
import { getPool } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pool = getPool()
  const planName = process.env.PLAN_NAME || 'default'

  if (req.method === 'POST') {
    const { series, replace, meta } = req.body || {}
    if (!Array.isArray(series)) return res.status(400).json({ error: 'series required' })
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      if (replace) await conn.execute('DELETE FROM plans WHERE name = ?', [planName])
      for (const row of series) {
        await conn.execute('INSERT INTO plans (name, date, plan_total_savings) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE plan_total_savings=VALUES(plan_total_savings)',
          [planName, row.date, Number(row.plan_total_savings)])
      }
      if (meta && meta.filename) {
        await conn.execute('INSERT INTO plan_uploads (name, filename, assumption, items_selected) VALUES (?, ?, ?, ?)',
          [planName, String(meta.filename), meta.assumption || null, JSON.stringify({ include: meta.includeItems || [], exclude: meta.excludeItems || [] })])
      }
      await conn.commit()
      res.json({ ok: true, count: series.length })
    } catch (e:any) {
      await conn.rollback()
      res.status(500).json({ error: e.message })
    } finally { conn.release() }
    return
  }

  if (req.method === 'GET') {
    const [rows]: any = await pool.query('SELECT date, plan_total_savings, updated_at FROM plans WHERE name = ? ORDER BY date', [planName])
    const series = rows.map((r: any) => ({
      date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0,10),
      plan_total_savings: Number(r.plan_total_savings),
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
    }))
    const [lu]: any = await pool.query('SELECT MAX(updated_at) as lastUpdated FROM plans WHERE name = ?', [planName])
    const [metaRows]: any = await pool.query('SELECT filename, assumption, items_selected, uploaded_at FROM plan_uploads WHERE name = ? ORDER BY uploaded_at DESC LIMIT 1', [planName])
    const meta = metaRows?.[0] ? {
      filename: metaRows[0].filename,
      assumption: metaRows[0].assumption || null,
      items: safeParseJSON(metaRows[0].items_selected),
      uploaded_at: typeof metaRows[0].uploaded_at === 'string' ? metaRows[0].uploaded_at : new Date(metaRows[0].uploaded_at).toISOString()
    } : null
    res.json({ series, lastUpdated: lu[0]?.lastUpdated || null, meta })
    return
  }

  res.setHeader('Allow', 'GET,POST')
  res.status(405).end('Method Not Allowed')
}

function safeParseJSON(v:any){ try{ return JSON.parse(v) }catch{ return { include:[], exclude:[] } } }
