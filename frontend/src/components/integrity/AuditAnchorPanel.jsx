"use strict";

import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Loader from "../common/Loader";
import { getAuditAnchorStatus } from "../../services/integrityApi";
import { formatDateTime } from "../../utils/date";

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${tone || "text-primary"}`}>{value}</p>
    </div>
  );
}

// Off-chain best-effort snapshot, optionally backed by an on-chain anchor batch.
// Shows the last audit Merkle anchor: pending count, latest bundle hash, and
// the batch/block where it was persisted. This panel is only meaningful once
// the audit-anchor service has run against the permissioned ledger.
export default function AuditAnchorPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getAuditAnchorStatus();
      setStatus(res?.data || res || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !status) {
    return (
      <Card>
        <div className="p-4"><Loader label="Loading audit anchor status…" /></div>
      </Card>
    );
  }

  const pending = status?.pendingAnchorCount ?? status?.pending ?? 0;
  const latest = status?.latestBatch || status?.lastBatch || null2;
  const pendingValid = pending > 0;

  return (
    <Card title="Audit anchor status">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Evidence anchored" value={status?.anchoredCount ?? status?.totalAnchored ?? "—"} />
        <Stat label="Pending anchor" value={pendingValid ? <span className="text-amber-600">{pending}</span> : pending} tone={pendingValid ? "text-amber-600" : "text-emerald-700"} />
        <Stat label="Custody records" value={status?.custodyCount ?? "—"} />
        <Stat label="Latest bundle" value={latest?.batchHash ? latest.batchHash.slice(0, 12) : "—"} />
      </div>

      {latest && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-secondary">
          <p className="font-mono break-all">
            batch {latest.batchNumber ?? latest.index ?? "—"} · {latest.batchHash ? latest.batchHash.slice(0, 10) + "…" : "no hash"}
            {latest.ledgerStatus === "ANCHORED" ? " · on-chain" : " · pending"}
          </p>
          {latest.anchoredAt ? <p className="mt-1 text-muted">anchored {formatDateTime(latest.anchoredAt)}</p> : null}
          {latest.ledgerTxHash ? <p className="mt-1 break-all text-muted">tx <span className="font-mono">{latest.ledgerTxHash}</span></p> : null}
        </div>
      )}

      {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={load}>Refresh</Button>
      </div>
    </Card>
  );
}
