import { useEffect, useState } from "react";
import {
  connectWallet, switchToTargetChain, loadIssues, loadHistory, loadRole, parseError,
  TARGET_CHAIN_ID, CONTRACT_ADDRESS, NETWORK_NAME,
} from "./lib/contract";
import ReportForm from "./components/ReportForm";
import IssueList from "./components/IssueList";
import ManagePanel from "./components/ManagePanel";
import HistoryModal from "./components/HistoryModal";
import ImportPanel from "./components/ImportPanel";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function App() {
  const [w, setW] = useState(null); // { contract, account, chainId }
  const [role, setRole] = useState({ isOwner: false, isStaff: false });
  const [issues, setIssues] = useState([]);
  const [tab, setTab] = useState("issues");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  const notify = (type, msg) => setToast({ type, msg });
  const wrongChain = w && w.chainId !== TARGET_CHAIN_ID;

  const refresh = async (ctx) => {
    setIssues(await loadIssues(ctx.contract));
    setRole(await loadRole(ctx.contract, ctx.account));
  };

  const connect = async () => {
    try {
      const ctx = await connectWallet();
      setW(ctx);
      if (ctx.chainId === TARGET_CHAIN_ID) await refresh(ctx);
    } catch (e) {
      notify("error", parseError(e));
    }
  };

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((a) => a.length && connect());
    const reload = () => window.location.reload();
    window.ethereum.on("chainChanged", reload);
    window.ethereum.on("accountsChanged", reload);
    return () => {
      window.ethereum.removeListener("chainChanged", reload);
      window.ethereum.removeListener("accountsChanged", reload);
    };
  }, []);

  // Runs one transaction: confirm -> wait -> refresh, with readable errors
  const send = async (label, action) => {
    setBusy(true);
    try {
      notify("info", `${label}: confirm in MetaMask…`);
      const tx = await action(w.contract);
      notify("info", `${label}: waiting for the block…`);
      await tx.wait();
      await refresh(w);
      notify("success", `${label}: done ✔`);
      return true;
    } catch (e) {
      notify("error", parseError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const showHistory = async (issueId) => {
    try {
      setHistory({ issueId, entries: await loadHistory(w.contract, issueId) });
    } catch (e) {
      notify("error", parseError(e));
    }
  };

  const nextId = `CITY-${new Date().getFullYear()}-${String(issues.length + 1).padStart(3, "0")}`;

  return (
    <div className="app">
      <header>
        <div>
          <h1>🏙️ Urban Issue Registry</h1>
          <small>{NETWORK_NAME} · contract {short(CONTRACT_ADDRESS)}</small>
        </div>
        {w ? (
          <div className="wallet">
            <span className="mono">{short(w.account)}</span>
            <span className={`role ${role.isStaff ? "staff" : ""}`}>
              {role.isOwner ? "Owner" : role.isStaff ? "Operator" : "Citizen"}
            </span>
          </div>
        ) : (
          <button onClick={connect}>Connect MetaMask</button>
        )}
      </header>

      {toast && (
        <div className={`toast ${toast.type}`} onClick={() => setToast(null)}>{toast.msg}</div>
      )}

      {!w && <p className="empty">Connect your wallet to view and report urban issues.</p>}

      {wrongChain && (
        <div className="banner">
          Wrong network. Please switch to <b>{NETWORK_NAME}</b> (chain {TARGET_CHAIN_ID}).{" "}
          <button onClick={() => switchToTargetChain().catch((e) => notify("error", parseError(e)))}>
            Switch network
          </button>
        </div>
      )}

      {w && !wrongChain && (
        <>
          <nav>
            {[["issues", `Issues (${issues.length})`], ["report", "Report an issue"], ["import", "Import Excel/CSV"], ["manage", "Municipality"]].map(
              ([k, label]) => (
                <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>
              )
            )}
          </nav>

          {tab === "issues" && <IssueList issues={issues} onHistory={showHistory} />}
          {tab === "report" && (
            <ReportForm
              nextId={nextId}
              busy={busy}
              onSubmit={(p) => send("Report issue", (c) => c.createIssue(p))}
            />
          )}
          {tab === "import" && (
            <ImportPanel contract={w.contract} issues={issues} onImported={() => refresh(w)} />
          )}
          {tab === "manage" && (
            <ManagePanel
              issues={issues}
              role={role}
              busy={busy}
              onHistory={showHistory}
              onAssign={(id, team) => send("Assign team", (c) => c.assignTeam(id, team))}
              onAdvance={(id, status, note) => send("Update status", (c) => c.updateStatus(id, status, note))}
              onAddOperator={(a) => send("Add operator", (c) => c.addOperator(a))}
              onRemoveOperator={(a) => send("Remove operator", (c) => c.removeOperator(a))}
            />
          )}
        </>
      )}

      {history && <HistoryModal {...history} onClose={() => setHistory(null)} />}
    </div>
  );
}