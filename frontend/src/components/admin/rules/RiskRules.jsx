import React, { useCallback, useEffect, useState } from "react";
import {
  getRiskRules,
  updateRiskRule,
  getRiskThresholds,
  updateRiskThresholds,
  getRiskConfig,
  updateRiskConfig,
} from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Loader from "../../common/Loader";
import { ArrowRightIcon, EditIcon, CctvIcon, BrainIcon, ActivityIcon, ShieldIcon, AlertTriangleIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import RuleForm from "./RuleForm";

const PIPELINE = [
  { label: "Detection", icon: CctvIcon, tone: "text-navy-600" },
  { label: "Context", icon: ActivityIcon, tone: "text-slate-600" },
  { label: "Behavior", icon: BrainIcon, tone: "text-slate-600" },
  { label: "Risk", icon: ShieldIcon, tone: "text-orange-600" },
  { label: "Action", icon: AlertTriangleIcon, tone: "text-red-600" },
];

const DEFAULT_THRESHOLDS = [
  { id: "critical", label: "CRITICAL", min: 81, max: 100 },
  { id: "high", label: "HIGH", min: 61, max: 80 },
  { id: "medium", label: "MEDIUM", min: 41, max: 60 },
  { id: "low", label: "LOW", min: 21, max: 40 },
  { id: "info", label: "INFO", min: 0, max: 20 },
];

function RiskRules() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [rules, setRules] = useState([]);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [config, setConfig] = useState({ temporalMinDuration: 2, alertCooldown: 30, minConfidence: 0.5 });
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: r }, { data: t }, { data: c }] = await Promise.all([
        getRiskRules(),
        getRiskThresholds(),
        getRiskConfig(),
      ]);
      setRules(r || []);
      if (t?.thresholds) setThresholds(t.thresholds);
      setConfig(c || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setBand = (id, key, val) =>
    setThresholds((ts) => ts.map((b) => (b.id === id ? { ...b, [key]: Number(val) } : b)));

  const saveThresholds = async () => {
    try {
      const { data } = await updateRiskThresholds({ thresholds });
      setThresholds(data.thresholds || thresholds);
      toast("Severity thresholds updated", "success");
    } catch (e) {
      toast(e.message || "Update failed", "error");
    }
  };

  const saveConfig = async () => {
    try {
      const { data } = await updateRiskConfig(config);
      setConfig(data || config);
      toast("Risk configuration saved", "success");
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const handleRuleSave = async (form) => {
    if (!editing) return;
    try {
      const { data } = await updateRiskRule(editing.id, form);
      setRules((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
      toast(`Rule ${editing.id} updated`, "success");
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const resetDemo = async () => {
    setThresholds(DEFAULT_THRESHOLDS);
    try {
      await updateRiskThresholds({ thresholds: DEFAULT_THRESHOLDS });
      toast("Risk rules reset to demo defaults", "success");
    } catch (e) {
      toast(e.message || "Reset failed", "error");
    }
    setResetOpen(false);
  };

  const weightTone = (w) => (w >= 80 ? "critical" : w >= 60 ? "high" : w >= 40 ? "medium" : "low");

  return (
    <>
      {/* Pipeline visualization */}
      <Card className="mb-6">
        <p className="mb-3 text-sm font-semibold text-slate-800">
          How a single detection becomes an action
        </p>
        <p className="mb-4 text-xs text-slate-500">
          A single detection is not automatically critical — it must pass through context and
          behavior weighting before escalating.
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {PIPELINE.map((p, i) => {
            const Icon = p.icon;
            return (
              <React.Fragment key={p.label}>
                {i > 0 && <ArrowRightIcon size={16} className="mx-1 text-slate-300" />}
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Icon size={16} className={`${p.tone}`} />
                  <span className="text-sm font-medium text-slate-700">{p.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Rule list */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Risk Rules</p>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
            Reset to Demo
          </Button>
        )}
      </div>
      <Card pad={false} className="mb-6 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Rule</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Weight</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.rule}</p>
                      <p className="text-xs text-slate-400">{r.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{r.category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={weightTone(r.weight)}>{r.weight}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.enabled ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : (
                        <Badge tone="offline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                          <EditIcon size={14} /> Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Severity thresholds */}
        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-800">Severity Thresholds</p>
          <p className="mb-4 text-xs text-slate-500">
            Configurable risk score bands. Lower min = more sensitive.
          </p>
          <div className="space-y-3">
            {thresholds.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <Badge tone={b.id === "critical" ? "critical" : b.id === "high" ? "high" : b.id === "medium" ? "medium" : b.id === "low" ? "low" : "info"} className="w-24 justify-center">
                  {b.label}
                </Badge>
                <Input
                  type="number"
                  value={b.min}
                  disabled={!canManage}
                  onChange={(e) => setBand(b.id, "min", e.target.value)}
                  aria-label={`${b.label} minimum`}
                  containerClassName="w-24"
                />
                <span className="text-slate-400">–</span>
                <Input
                  type="number"
                  value={b.max}
                  disabled={!canManage}
                  onChange={(e) => setBand(b.id, "max", e.target.value)}
                  aria-label={`${b.label} maximum`}
                  containerClassName="w-24"
                />
              </div>
            ))}
          </div>
          {canManage && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={saveThresholds}>
              Save Thresholds
            </Button>
          )}
        </Card>

        {/* Risk configuration */}
        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-800">Risk Engine Configuration</p>
          <p className="mb-4 text-xs text-slate-500">
            Temporal confirmation and cooldown settings that prevent a single detection from
            escalating prematurely.
          </p>
          <div className="space-y-4">
            <Input
              label="Temporal Minimum Duration (s)"
              type="number"
              value={config.temporalMinDuration}
              disabled={!canManage}
              onChange={(e) => setConfig((c) => ({ ...c, temporalMinDuration: Number(e.target.value) }))}
            />
            <Input
              label="Alert Cooldown (s)"
              type="number"
              value={config.alertCooldown}
              disabled={!canManage}
              onChange={(e) => setConfig((c) => ({ ...c, alertCooldown: Number(e.target.value) }))}
            />
            <Input
              label="Minimum Confidence (0–1)"
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={config.minConfidence}
              disabled={!canManage}
              onChange={(e) => setConfig((c) => ({ ...c, minConfidence: Number(e.target.value) }))}
            />
          </div>
          {canManage && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={saveConfig}>
              Save Configuration
            </Button>
          )}
        </Card>
      </div>

      <RuleForm
        open={!!editing}
        onClose={() => setEditing(null)}
        onSubmit={handleRuleSave}
        rule={editing}
        canManage={canManage}
      />

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Risk Rules to Demo?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={resetDemo}>
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This restores the severity thresholds and demo default risk configuration. Your custom
          rules and settings will be overwritten.
        </p>
      </Modal>
    </>
  );
}

export default RiskRules;
