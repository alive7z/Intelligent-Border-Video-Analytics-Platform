import React, { useEffect, useState } from "react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import Input from "../../common/Input";
import Badge from "../../common/Badge";

const TYPES = ["Restricted Zone", "Monitoring Zone", "Virtual Fence"];
const RISK = ["Low", "Medium", "High", "Critical"];
const SECTORS = ["North", "South", "East", "West", "Central"];

const EMPTY = {
  id: "",
  name: "",
  type: "Restricted Zone",
  sector: "North",
  riskLevel: "Medium",
};

/**
 * Add / edit surveillance zone dialog. Coordinates are edited via a preview
 * (mock overlay) rather than raw coordinate entry to keep it simple to grasp.
 */
function ZoneForm({ open, onClose, onSubmit, editing, canManage }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            name: editing.name || "",
            type: editing.type || "Restricted Zone",
            sector: editing.sector || "North",
            riskLevel: editing.riskLevel || "Medium",
          }
        : EMPTY
    );
    setErrors({});
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.id.trim() && !editing) errs.id = "Zone ID is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(form, editing);
  };

  const riskTone = { Low: "low", Medium: "medium", High: "high", Critical: "critical" }[form.riskLevel] || "default";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.id}` : "Add Zone"}
      size="lg"
      footer={
        !canManage ? (
          <div className="text-sm text-slate-400">Read-only</div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>{editing ? "Save Changes" : "Add Zone"}</Button>
          </>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Zone ID"
          id="zone-id"
          value={form.id}
          onChange={set("id")}
          error={errors.id}
          disabled={!!editing || !canManage}
          placeholder="e.g. ZONE-05"
          hint={editing ? "ID cannot be changed" : "Unique identifier"}
        />
        <Input
          label="Name"
          id="zone-name"
          value={form.name}
          onChange={set("name")}
          error={errors.name}
          disabled={!canManage}
          placeholder="e.g. Naka Checkpoint Area"
        />
        <div>
          <label htmlFor="zone-type" className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
          <select id="zone-type" value={form.type} onChange={set("type")} disabled={!canManage} className="input-field">
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="zone-sector" className="mb-1.5 block text-sm font-medium text-slate-700">Sector</label>
          <select id="zone-sector" value={form.sector} onChange={set("sector")} disabled={!canManage} className="input-field">
            {SECTORS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Risk Level</label>
          <Badge tone={riskTone}>{form.riskLevel}</Badge>
        </div>
      </div>

      {/* Mock polygon preview */}
      <div className="mt-5">
        <p className="mb-1.5 text-sm font-medium text-slate-700">Boundary Preview</p>
        <div className="relative h-40 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <svg viewBox="0 0 400 160" className="h-full w-full" aria-hidden="true">
            <polygon
              points="60,120 130,40 300,50 340,120 220,140"
              fill="rgba(24,53,94,0.12)"
              stroke="#18355e"
              strokeWidth="2"
              strokeDasharray={form.type === "Virtual Fence" ? "6 4" : "0"}
            />
          </svg>
          <span className="absolute bottom-2 left-2 rounded bg-navy-700/80 px-2 py-0.5 text-[11px] text-white">
            {form.name || "Untitled zone"} · {form.type}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Visualization only — coordinates are configured on the published map.
        </p>
      </div>
    </Modal>
  );
}

export default ZoneForm;
