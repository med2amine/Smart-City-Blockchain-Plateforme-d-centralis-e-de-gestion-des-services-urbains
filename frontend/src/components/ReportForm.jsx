import { useState } from "react";
import { ISSUE_TYPES, PRIORITIES } from "../lib/contract";

export default function ReportForm({ nextId, busy, onSubmit }) {
  const today = new Date().toISOString().slice(0, 10);
  const empty = { issueType: ISSUE_TYPES[0], location: "", description: "", reportDate: today, priority: 1, reportedBy: "" };
  const [f, setF] = useState(empty);
  const [id, setId] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit({ issueId: id.trim() || nextId, ...f, priority: Number(f.priority) });
    if (ok) { setF(empty); setId(""); }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Report an urban issue</h2>
      <label>Issue ID
        <input value={id} placeholder={nextId} onChange={(e) => setId(e.target.value)} />
      </label>
      <label>Type
        <select value={f.issueType} onChange={set("issueType")}>
          {ISSUE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label>Location
        <input required value={f.location} onChange={set("location")} placeholder="Avenue Mohammed V" />
      </label>
      <label>Description
        <textarea required rows={3} value={f.description} onChange={set("description")} placeholder="Streetlight not working" />
      </label>
      <div className="row">
        <label>Report date
          <input type="date" required value={f.reportDate} onChange={set("reportDate")} />
        </label>
        <label>Priority
          <select value={f.priority} onChange={set("priority")}>
            {PRIORITIES.map((p, i) => <option key={p} value={i}>{p}</option>)}
          </select>
        </label>
      </div>
      <label>Reported by
        <input required value={f.reportedBy} onChange={set("reportedBy")} placeholder="Citizen01" />
      </label>
      <button disabled={busy}>{busy ? "Sending…" : "Submit to blockchain"}</button>
    </form>
  );
}
