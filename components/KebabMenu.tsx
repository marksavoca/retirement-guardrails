import React, { useEffect, useRef, useState } from 'react';

export default function KebabMenu({
  onUpload,
  onSettings,
  }
) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'absolute', right: 8, top: 8, zIndex: 10 }}>
      <button
        aria-label="Menu"
        onClick={() => setOpen(v => !v)}
        className="btn ghost"
        style={{ borderRadius: 999 }}
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 12,
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
            minWidth: 180,
            overflow: 'hidden',
          }}
        >
          <button className="menu-item" onClick={() => { setOpen(false); onUpload(); }} style={itemStyle}>Upload plan CSV</button>
          <button className="menu-item" onClick={() => { setOpen(false); onSettings(); }} style={itemStyle}>Settings</button>
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="help" style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Assumption</div>
            {(['Pessimistic','Average','Optimistic'] as const).map(a => (
              <label key={a} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', cursor:'pointer' }}>
                <input
                  type="radio"
                  name="assumption"
                  defaultChecked={(window as any)?.__getAssumption?.() === a}
                  onChange={() => { (window as any)?.__setAssumption?.(a); }}
                />
                <span>{a}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const itemStyle: React.CSSProperties = { display:'block', width:'100%', textAlign:'left', padding:'8px 12px', background:'transparent', border:0, cursor:'pointer' }
