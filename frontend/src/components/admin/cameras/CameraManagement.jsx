import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCameras,
  createCamera,
  updateCamera,
  disableCamera,
  testCameraConnection,
} from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import Loader from "../../common/Loader";
import { SearchIcon, PlusIcon, EditIcon, CctvIcon, MoreHorizontalIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import CameraForm from "./CameraForm";

function streamTone(s) {
  if (s === "Online") return "online";
  if (s === "Offline") return "offline";
  return "default";
}

function CameraManagement() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const [disableTarget, setDisableTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getCameras();
      setCameras(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.id || "").toLowerCase().includes(q) ||
        (c.location || "").toLowerCase().includes(q)
    );
  }, [cameras, query]);

  const handleSave = async (form, editingCam) => {
    try {
      if (editingCam) {
        const { data } = await updateCamera(editingCam.id, {
          name: form.name,
          location: form.location,
          sector: form.sector,
          fpsLimit: form.fpsLimit ? Number(form.fpsLimit) : null,
          sampling: form.sampling,
          description: form.description,
        });
        setCameras((cs) => cs.map((c) => (c.id === editingCam.id ? data : c)));
        toast(`${editingCam.id} updated`, "success");
      } else {
        const { data } = await createCamera(form);
        setCameras((cs) => [data, ...cs]);
        toast(`${data.id} added`, "success");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const handleTest = async (cam) => {
    try {
      const { data } = await testCameraConnection(cam.id);
      setTestResult({ cam, ...data });
    } catch (e) {
      setTestResult({ cam, ok: false, message: e.message || "Test failed" });
    }
  };

  const handleDisable = async () => {
    if (!disableTarget) return;
    try {
      const { data } = await disableCamera(disableTarget.id);
      setCameras((cs) => cs.map((c) => (c.id === disableTarget.id ? data : c)));
      toast(`${disableTarget.id} disabled`, "success");
    } catch (e) {
      toast(e.message || "Disable failed", "error");
    } finally {
      setDisableTarget(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Search cameras…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search cameras"
          />
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon size={16} /> Add Camera
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
            <p className="text-sm text-slate-500">Failed to load cameras. Please try again.</p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Camera</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                  <th className="px-4 py-3 font-semibold">AI</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No cameras match your search.
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-800">
                        <CctvIcon size={16} className="text-navy-600" />
                        {c.id}
                      </div>
                      <p className="text-xs text-slate-400">{c.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.location || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.sector || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={streamTone(c.streamStatus)}>{c.streamStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.aiStatus || "—"}</td>
                    <td className="px-4 py-3">
                      {c.enabled ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : (
                        <Badge tone="offline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                          >
                            <EditIcon size={14} /> Edit
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleTest(c)}>
                          <CctvIcon size={14} /> Test
                        </Button>
                        {canManage && c.enabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => setDisableTarget(c)}
                          >
                            <MoreHorizontalIcon size={14} /> Disable
                          </Button>
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
      <p className="mt-3 text-xs text-slate-400">
        {filtered.length} of {cameras.length} camera(s) shown. RTSP credentials are always masked.
      </p>

      <CameraForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSave}
        editing={editing}
        canManage={canManage}
      />

      {/* Test connection result */}
      <Modal
        open={!!testResult}
        onClose={() => setTestResult(null)}
        title="Camera Connection Test"
        size="sm"
        footer={
          <Button variant="ghost" onClick={() => setTestResult(null)}>
            Close
          </Button>
        }
      >
        {testResult && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Testing <span className="font-medium text-slate-700">{testResult.cam.id}</span> (
              {testResult.cam.name}).
            </p>
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                testResult.ok
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {testResult.ok ? "Connection Successful" : "Connection Failed"}
            </div>
            <p className="text-xs text-slate-400">Endpoint: {testResult.cam.rtspMasked || "rtsp://***.configured"}</p>
          </div>
        )}
      </Modal>

      {/* Disable confirmation */}
      <Modal
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        title={`Disable ${disableTarget?.id || ""}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisableTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDisable}>
              Disable Camera
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Disabling <span className="font-medium">{disableTarget?.name || disableTarget?.id}</span>{" "}
          will stop its live stream and pause AI analysis for this camera. This is reversible.
        </p>
      </Modal>
    </>
  );
}

export default CameraManagement;
