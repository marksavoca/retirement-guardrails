import { useState } from 'react'
import { useRouter } from 'next/router'

export default function Login() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const next = typeof router.query.next === 'string' ? router.query.next : '/'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/login?next='+encodeURIComponent(next), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (res.ok) {
      const data = await res.json()
      router.replace(data.next || '/')
    } else {
      const data = await res.json().catch(()=>({error:'Login failed'}))
      setError(data.error || 'Login failed')
    }
  }

  return (
    <div style={{ display:'grid', placeItems:'center', minHeight:'100vh', background:'#0f172a' }}>
      <form onSubmit={onSubmit} style={{ background:'white', padding:24, borderRadius:16, minWidth:360, boxShadow:'0 10px 30px rgba(0,0,0,0.15)' }}>
        <h1 style={{ margin:'0 0 12px' }}>Guardrails Login</h1>
        <p style={{ color:'#475569', marginTop:0 }}>Enter the password to access your dashboard.</p>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc' }}
        />
        <button type="submit" style={{ marginTop:12, width:'100%', padding:'10px 12px', borderRadius:10, border:0, background:'#0ea5e9', color:'white', fontWeight:700, cursor:'pointer' }}>Sign in</button>
        {error && <div style={{ marginTop:8, color:'#b91c1c' }}>{error}</div>}
      </form>
    </div>
  )
}
