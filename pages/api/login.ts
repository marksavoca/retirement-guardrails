import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const { password } = req.body || {}
  const expected = process.env.APP_PASSWORD || ''
  if (!expected) return res.status(500).json({ error: 'Server not configured (APP_PASSWORD missing).' })
  if (password !== expected) return res.status(401).json({ error: 'Invalid password' })
  res.setHeader('Set-Cookie', `auth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`)
  const next = typeof req.query.next === 'string' ? req.query.next : '/'
  res.json({ ok: true, next })
}
