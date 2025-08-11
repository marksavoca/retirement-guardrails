export default function Modal({ title, onClose, children }:{ title:string; onClose:()=>void; children:React.ReactNode; }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <div className="title">{title}</div>
        <div>{children}</div>
      </div>
    </div>
  )
}
