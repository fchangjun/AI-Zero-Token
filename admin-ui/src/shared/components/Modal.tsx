import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal(props: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className={`modal-card ${props.wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{props.title}</h3>
          <button className="btn-secondary icon-only" type="button" onClick={props.onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
      </section>
    </div>
  );
}
