import { useRef, useState } from "react";
import { ISSUE_TYPES, PRIORITIES, NETWORK_NAME, parseError } from "../lib/contract";
import { parseFile, validateRows } from "../lib/importer";
import "./ImportPanel.css";

const isRejected = (e) => e?.code === "ACTION_REJECTED" || e?.code === 4001;

export default function ImportPanel({ contract, issues, onImported }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);          // validated rows
  const [selected, setSelected] = useState(new Set()); // selected line numbers
  const [progress, setProgress] = useState({});  // line -> { state, msg, hash }
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState("");

  // Step 1-3: read, preview, validate 
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError(""); setSummary(""); setRows([]); setSelected(new Set()); setProgress({});
    try {
      const parsed = await parseFile(file);
      const checked = validateRows(parsed, {
        existingIds: new Set(issues.map((i) => i.issueId)),
        issueTypes: ISSUE_TYPES,
      });
      setFileName(file.name);
      setRows(checked);
      // valid rows are pre-selected
      setSelected(new Set(checked.filter((r) => r.errors.length === 0).map((r) => r.line)));
    } catch (err) {
      setFileName("");
      setLoadError(err.message);
    }
    e.target.value = ""; // allows re-importing the same file
  };

  const reset = () => { setFileName(""); setRows([]); setSelected(new Set()); setProgress({}); setSummary(""); setLoadError(""); };

  // Step 4: selection 
  const isValid = (r) => r.errors.length === 0 && progress[r.line]?.state !== "saved";
  const toggle = (line) =>
    setSelected((s) => { const n = new Set(s); n.has(line) ? n.delete(line) : n.add(line); return n; });
  const selectValid = () => setSelected(new Set(rows.filter(isValid).map((r) => r.line)));
  const selectNone = () => setSelected(new Set());

  //  Step 5: save selected rows on the blockchain (one transaction per row) 
  const save = async () => {
    const todo = rows.filter((r) => selected.has(r.line) && isValid(r));
    if (!todo.length) return;
    setSaving(true); setSummary("");
    let saved = 0, failed = 0, stopped = false;

    for (const r of todo) {
      setProgress((p) => ({ ...p, [r.line]: { state: "sending" } }));
      try {
        const tx = await contract.createIssue({
          issueId: r.issueId, issueType: r.issueType, location: r.location,
          description: r.description, reportDate: r.reportDate,
          priority: r.priority, reportedBy: r.reportedBy,
        });
        setProgress((p) => ({ ...p, [r.line]: { state: "mining", hash: tx.hash } }));
        await tx.wait();
        setProgress((p) => ({ ...p, [r.line]: { state: "saved", hash: tx.hash } }));
        saved++;
      } catch (err) {
        setProgress((p) => ({ ...p, [r.line]: { state: "failed", msg: parseError(err) } }));
        failed++;
        if (isRejected(err)) { stopped = true; break; } // user cancelled: stop the batch
      }
    }

    setSaving(false);
    setSummary(
      `${saved} saved, ${failed} failed` + (stopped ? " — import stopped (transaction rejected in MetaMask)." : ".")
    );
    await onImported(); // reload the issues list from the blockchain
  };

  // Render 
  const nValid = rows.filter((r) => r.errors.length === 0).length;
  const nErr = rows.length - nValid;
  const nWarn = rows.filter((r) => r.errors.length === 0 && r.warnings.length).length;
  const nSel = rows.filter((r) => selected.has(r.line) && isValid(r)).length;
  const done = Object.values(progress).filter((p) => p.state === "saved" || p.state === "failed").length;
  const txUrl = (h) => (NETWORK_NAME === "sepolia" ? `https://sepolia.etherscan.io/tx/${h}` : null);

  return (
    <section>
      <div className="card">
        <h2>Import issues from Excel / CSV</h2>
        <p><small>
          Expected columns: IssueID (optional), IssueType, Location, Description, ReportDate (YYYY-MM-DD),
          Priority (Low / Medium / High / Critical), ReportedBy. The file is read in your browser; nothing is
          sent anywhere until you confirm the transactions in MetaMask.
        </small></p>
        <div className="inline">
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={saving} />
          {rows.length > 0 && <button className="ghost" onClick={reset} disabled={saving}>Clear</button>}
        </div>
        {loadError && <p className="imp-error">⚠ {loadError}</p>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="imp-summary">
            <b>{fileName}</b> — {rows.length} rows ·{" "}
            <span className="ok">{nValid} valid</span> ·{" "}
            <span className="bad">{nErr} with errors</span> ·{" "}
            <span className="warn">{nWarn} with warnings</span>
          </div>

          <div className="imp-actions">
            <button className="ghost" onClick={selectValid} disabled={saving}>Select all valid</button>
            <button className="ghost" onClick={selectNone} disabled={saving}>Select none</button>
            <button onClick={save} disabled={saving || nSel === 0}>
              {saving ? `Saving… ${done}/${nSel + done}` : `Save ${nSel} selected to blockchain`}
            </button>
          </div>
          {summary && <p className="imp-done">{summary}</p>}

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th></th><th>Line</th><th>ID</th><th>Type</th><th>Location</th><th>Description</th>
                  <th>Date</th><th>Priority</th><th>By</th><th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = progress[r.line];
                  const bad = r.errors.length > 0;
                  const cls = p?.state === "saved" ? "row-saved" : bad ? "row-bad" : r.warnings.length ? "row-warn" : "";
                  return (
                    <tr key={r.line} className={cls}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(r.line) && isValid(r)}
                          disabled={!isValid(r) || saving}
                          onChange={() => toggle(r.line)}
                        />
                      </td>
                      <td>{r.line}</td>
                      <td className="mono">{r.issueId}</td>
                      <td>{r.issueType}</td>
                      <td>{r.location}</td>
                      <td>{r.description}</td>
                      <td>{r.reportDate}</td>
                      <td>{r.priority === null ? "—" : PRIORITIES[r.priority]}</td>
                      <td>{r.reportedBy}</td>
                      <td className="imp-msgs">
                        {p?.state === "sending" && <span className="info">⏳ Confirm in MetaMask…</span>}
                        {p?.state === "mining" && <span className="info">⛏ Waiting for the block…</span>}
                        {p?.state === "saved" && (
                          <span className="ok">
                            ✔ Saved{" "}
                            {txUrl(p.hash)
                              ? <a href={txUrl(p.hash)} target="_blank" rel="noreferrer">{p.hash.slice(0, 10)}…</a>
                              : <span className="mono">{p.hash.slice(0, 10)}…</span>}
                          </span>
                        )}
                        {p?.state === "failed" && <span className="bad">✘ {p.msg}</span>}
                        {!p && !bad && !r.warnings.length && <span className="ok">✔ Valid</span>}
                        {p?.state !== "saved" && r.errors.map((m) => <div key={m} className="bad">✘ {m}</div>)}
                        {p?.state !== "saved" && r.warnings.map((m) => <div key={m} className="warn">⚠ {m}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}