import { useState } from "react";
import { STATUSES } from "../lib/contract";
import { Badge } from "./IssueList";

function IssueCard({ issue, busy, onHistory, onAssign, onAdvance }) {
  const [team, setTeam] = useState(issue.assignedTo);
  const [note, setNote] = useState("");
  const s = issue.status;

  return (
    <div className="card">
      <div className="card-head">
        <b className="mono">{issue.issueId}</b> <Badge status={s} />
        <button className="ghost" onClick={() => onHistory(issue.issueId)}>History</button>
      </div>
      <p>{issue.issueType} — {issue.location}<br /><small>{issue.description}</small></p>
      {s === 4 ? (
        <small>Closed. No further action possible.</small>
      ) : (
        <>
          {s <= 1 && (
            <div className="inline">
              <input placeholder="Team (e.g. UrbanTeam01)" value={team} onChange={(e) => setTeam(e.target.value)} />
              <button disabled={busy || !team.trim()} onClick={() => onAssign(issue.issueId, team.trim())}>
                {s === 0 ? "Assign team" : "Re-assign"}
              </button>
            </div>
          )}
          {s >= 1 && (
            <div className="inline">
              <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button disabled={busy} onClick={async () => { if (await onAdvance(issue.issueId, s + 1, note)) setNote(""); }}>
                Mark {STATUSES[s + 1]}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ManagePanel({ issues, role, busy, onHistory, onAssign, onAdvance, onAddOperator, onRemoveOperator }) {
  const [addr, setAddr] = useState("");

  if (!role.isStaff) {
    return <p className="empty">This area is reserved for municipal staff. Connect with the owner or an operator account.</p>;
  }

  return (
    <section>
      {role.isOwner && (
        <div className="card">
          <h2>Operators</h2>
          <div className="inline">
            <input placeholder="0x… wallet address" value={addr} onChange={(e) => setAddr(e.target.value)} />
            <button disabled={busy || !addr.trim()} onClick={async () => { if (await onAddOperator(addr.trim())) setAddr(""); }}>Add</button>
            <button className="ghost" disabled={busy || !addr.trim()} onClick={() => onRemoveOperator(addr.trim())}>Remove</button>
          </div>
        </div>
      )}
      <h2>Interventions</h2>
      {issues.length === 0 && <p className="empty">No issues yet.</p>}
      <div className="grid">
        {[...issues].reverse().map((i) => (
          <IssueCard key={i.issueId} issue={i} busy={busy} onHistory={onHistory} onAssign={onAssign} onAdvance={onAdvance} />
        ))}
      </div>
    </section>
  );
}
