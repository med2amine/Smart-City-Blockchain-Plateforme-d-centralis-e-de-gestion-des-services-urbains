import { STATUSES } from "../lib/contract";
import { Badge } from "./IssueList";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function HistoryModal({ issueId, entries, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>History — <span className="mono">{issueId}</span></h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <ol className="timeline">
          {entries.map((h, i) => (
            <li key={i}>
              <Badge status={h.status} />
              <span className="when">{new Date(h.timestamp * 1000).toLocaleString()}</span>
              <div>{h.note || STATUSES[h.status]}{h.assignedTo && <> · team <b>{h.assignedTo}</b></>}</div>
              <small className="mono">by {short(h.changedBy)}</small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
