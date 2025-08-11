import type { NextApiRequest, NextApiResponse } from 'next'
import { parse } from 'csv-parse/sync'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed')
  const { csv } = req.body || {}
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text required' })
  try {
    const rows = parse(csv, { columns: true, skip_empty_lines: true })
    const items = Array.from(new Set(rows.filter((r:any)=> String(r['Category']).toLowerCase()==='accounts').map((r:any)=> String(r['Item']).trim()))).sort()
    const assumptions = Array.from(new Set(rows.map((r:any)=> String(r['Assumptions']||'').trim()).filter(Boolean)))
    return res.json({ items, assumptions })
  } catch (e:any) { return res.status(400).json({ error: e.message }) }
}
