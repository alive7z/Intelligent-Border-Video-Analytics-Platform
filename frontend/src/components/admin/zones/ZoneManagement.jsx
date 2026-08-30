import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getZones, createZone, updateZone, deleteZone } from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import Loader from "../../common/Loader";
import { PlusIcon, EditIcon, LayersIcon, MapPinIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import ZoneForm from "./ZoneForm";

const riskTone = { Low: "low", Medium: "medium", High: "high", Critical: "critical" };

function ZoneManagement() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getZones();
      setZones(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: zones.length,
      restricted: zones.filter((z) => z.type === "Restricted Zone").length,
      fence: zones.filter((z) => z.type === "Virtual Fence").length,
    }),
    [zones]
  );

  const handleSave = async (form, editingZone) => {
    try {
      if (editingZone) {
        const { data } = await updateZone(editingZone.id, {
          name: form.name,
          type: form.type,
          sector: form.sector,
          riskLevel: form.riskLevel,
        });
        setZones((zs) => zs.map((z) => (z.id === editingZone.id ? data : z)));
        toast(`${editingZone.id} updated`, "success");
      } else {
        const { data } = await createZone(form);
        setZones((zs) => [...zs, data]);
        toast(`${data.id} added`, "success");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteZone(deleteTarget.id);
      setZones((zs) => zs.filter((z) => z.id !== deleteTarget.id));
      toast(`${deleteTarget.id} deleted`, "success");
    } catch (e) {
      toast(e.message || "Delete failed", "error");
    } finally {
      setDeleteTarget(null);
      setPreview(null);
    }
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total Zones", value: counts.total },
          { label: "Restricted", value: counts.restricted },
          { label: "Virtual Fences", value: counts.fence },
        ].map((k) => (
          <Card key={k.label} className="!p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">Manage surveillance zones and virtual fences.</p>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon size={16} /> Add Zone
          </Button>
        )}
      </div>

      <Card pad={false} className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-slate-500">Failed to load zones. Please try again.</p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Zone</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 font-semibold">Risk</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      No zones defined.
                    </td>
                  </tr>
                )}
                {zones.map((z) => (
                  <tr key={z.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-800">
                        <MapPinIcon size={16} className="text-navy-600" />
                        {z.id}
                      </div>
                      <p className="text-xs text-slate-400">{z.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{z.type}</td>
                    <td className="px-4 py-3 text-slate-600">{z.sector || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={riskTone[z.riskLevel] || "default"}>{z.riskLevel}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {z.enabled ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="offline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setPreview(z)}>
                          <LayersIcon size={14} /> Preview
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(z);
                                setFormOpen(true);
                              }}
                            >
                              <EditIcon size={14} /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => setDeleteTarget(z)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ZoneForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSave}
        editing={editing}
        canManage={canManage}
      />

      {/* Preview */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Preview — ${preview.id}` : ""}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Close
          </Button>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="relative h-56 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <svg viewBox="0 0 400 220" className="h-full w-full" aria-hidden="true">
                <polygon
                  points="60,160 130,70 300,80 340,150 220,190"
                  fill="rgba(24,53,94,0.12)"
                  stroke="#18355e"
                  strokeWidth="2"
                  strokeDasharray={preview.type === "Virtual Fence" ? "6 4" : "0"}
                />
              </svg>
              <span className="absolute bottom-2 left-2 rounded bg-navy-700/80 px-2 py-0.5 text-[11px] text-white">
                {preview.name || preview.id} · {preview.type}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Type</p>
                <p className="font-medium text-slate-700">{preview.type}</p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Risk Level</p>
                <Badge tone={riskTone[preview.riskLevel] || "default"}>{preview.riskLevel}</Badge>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Sector</p>
                <p className="font-medium text-slate-700">{preview.sector || "—"}</p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Coordinates</p>
                <p className="font-medium text-slate-700">{preview.coordinates?.length || 0} points</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.id || ""}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete Zone
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-medium">{deleteTarget?.name || deleteTarget?.id}</span>?
          This removes the zone boundary and its association with rules. This action cannot be
          undone.
        </p>
      </Modal>
    </>
  );
}

export default ZoneManagement;
