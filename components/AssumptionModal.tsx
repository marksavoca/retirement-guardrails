import React from 'react'
import Modal from './Modal'

export default function AssumptionModal({
  open,
  assumptions,
  current,
  onSelect,
  onClose,
}: {
  open: boolean
  assumptions: string[]
  current: string
  onSelect: (a: string) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <Modal onClose={onClose}>
      <div className="panel">
        <h3 className="h3" style={{ marginTop: 0 }}>Select assumption</h3>
        <div className="col" style={{ gap: 8 }}>
          {assumptions.map(a => (
            <button
              key={a}
              className="btn"
              style={{ background: a === current ? 'black' : 'white', color: a === current ? 'white' : 'black' }}
              onClick={() => { onSelect(a); onClose(); }}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="row right" style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}
