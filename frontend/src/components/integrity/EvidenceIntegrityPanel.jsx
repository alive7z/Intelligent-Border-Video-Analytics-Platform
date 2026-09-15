"use strict";

import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Loader from "../common/Loader";
import { getEvidenceIntegrity, verifyEvidenceIntegrity } from "../../services/integrityApi";
import { formatDateTime } from "../../utils/date";

const badgeTone = {
  VERIFIED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  PARTIALLY_VERIFIED: "border-amber-300 bg-amber-50 text-amber-800",
  TAMPERED: "border-rose-300 bg-rose-50 text-rose-800",
  NOT_ANCHORED: "border-sky-300 bg-sky-50 text-sky-800",
  UNKNOWN: "border-slate-300 bg-slate-50 text-slate-700",
};

function Check({ label, status }) {
  const ok = /^(VERIFIED|MATCH|VALID|HASH_MATCH|SIGNATURE_VALID|LEDGER_ANCHORED|CUSTODY_*VALID.*)$/i.test(status || "");
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className={`text-[11px] font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}`}>{status || "—"}</span>
    </div>
  );
}

// Tamper-evident verdict panel for a single evidence code. Calls the backend
// integrity pipeline (capture → hash → sign → custody → ledger → verify) and
// renders the per-check status plus the on-chain anchor metadata.
export default function EvidenceIntegrityPanel({ evidenceCode, evidenceType = "evidence" }) {
  const [record, setRecord] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getEvidenceIntegrity(evidenceCode);
      setRecord(res?.data || res || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && evidenceCode) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evidenceCode]);

  const runVerify = async () => {
    setVerifying(true);
    setError("");
    try {
      const res = await verifyEvidenceIntegrity(evidenceCode);
      setVerdict(res?.data || res || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-1">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Verify evidence integrity
        </Button>
      </div>
    );
  }

  const checks = verdict?.checks || {};
  const status = verdict?.status || (record?.ledgerStatus === "ANCHORED" ? "VERIFIED" : "NOT_ANCHORED");
  const anchor = record?.ledgerTxHash ? (
    <p className="mt-3 break-all rounded-md bg-white/70 px-3 py-2 text-[11px] text-slate-600">
      tx <span className="font-mono">{record.ledgerTxHash}</span>
      {record.ledgerBlockNumber ? ` · block ${record.ledgerBlockNumber}` : ""}
      {record.ledgerStatus === "ANCHORED" ? " · on-chain" : " · pending anchor"}
      {record.anchoredAt ? ` · ${formatDateTime(record.anchoredAt)}` : ""}
    </p>
  ) : null;

  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Evidence integrity · {evidenceType}</p>
          <p className="text-xs text-slate-500">Capture → hash → sign → custody → ledger → verify</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeTone[status] || badgeTone.UNKNOWN}`}>
          {verifying ? "Verifying…" : status}
        </span>
      </div>

      {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {loading && <div className="mt-3"><Loader label="Loading integrity record…" /></div>}
      {!loading && !error && (
        <>
          <div className="mt-4 space-y-2">
            <Check label="SHA-256 hash" status={checks.hash || record?.sha256Hash?.slice(0, 24) || "…"} />
            <Check label="Ed25519 signature" status={checks.signature || record?.signatureStatus || "…"} />
            <Check label="Chain of custody" status={(checks.custody || "").replace(/^CUSTODY_/i, "") || "…"} />
            <Check label="Ledger anchor" status={(checks.ledger || "").replace(/^LEDGER_/i, "") || record?.ledgerStatus || "…"} />
          </div>
          {anchor}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={runVerify} disabled={verifying}>
              {verifying ? <Loader label="Verifying…" /> : "Run verification"}
            </Button>
            <Button size="sm" variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Hide</Button>
          </div>
        </>
      )}
    </Card>
  );
}
