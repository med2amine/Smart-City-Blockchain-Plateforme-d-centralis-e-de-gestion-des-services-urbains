import { useState } from "react";
import { STATUSES, PRIORITIES } from "../lib/contract";

export const Badge = ({ status }) => <span className={`badge s${status}`}>{STATUSES[status]}</span>;

export default function IssueList({ issues, onHistory }) {
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");

  const rows = issues
    .filter((i) => st === "all" || i.status === Number(st))
    .filter((i) => `${i.issueId} ${i.issueType} ${i.location} ${i.description}`.toLowerCase().includes(q.toLowerCase()))
    .reverse();

  return (
    <section>
      <div className="filters">
        <input placeholder="Search id, type, location…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s, i) => <option key={s} value={i}>{s}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No issues found.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>ID</th><th>Type</th><th>Location</th><th>Description</th><th>Priority</th><th>Status</th><th>Assigned to</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.issueId}>
                  <td className="mono">{i.issueId}</td>
                  <td>{i.issueType}</td>
                  <td>{i.location}</td>
                  <td>{i.description}</td>
                  <td><span className={`prio p${i.priority}`}>{PRIORITIES[i.priority]}</span></td>
                  <td><Badge status={i.status} /></td>
                  <td>{i.assignedTo || "—"}</td>
                  <td>{i.reportDate}</td>
                  <td><button className="ghost" onClick={() => onHistory(i.issueId)}>History</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
