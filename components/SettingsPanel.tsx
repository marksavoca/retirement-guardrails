import { useState } from 'react'

export default function SettingsPanel({ lowerPct, upperPct, onClose, onSaved }:{ lowerPct:number; upperPct:number; onClose:()=>void; onSaved:(lp:number,up:number)=>Promise<void>|void }) {
  const [lp, setLp] = useState(lowerPct)
  const [up, setUp] = useState(upperPct)
  async function save(){ await fetch('/api/settings',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lower_pct:Number(lp), upper_pct:Number(up) }) }); await onSaved(Number(lp), Number(up)); onClose() }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="title">Settings</div>
        <div className="row"><label>Lower Guardrail (% below plan)</label><input className="number" type="number" value={lp} onChange={e=>setLp(Number(e.target.value))} /></div>
        <div className="row" style={{marginTop:8}}><label>Upper Guardrail (% above plan)</label><input className="number" type="number" value={up} onChange={e=>setUp(Number(e.target.value))} /></div>
        <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></div>
      </div>
    </div>
  )
}
