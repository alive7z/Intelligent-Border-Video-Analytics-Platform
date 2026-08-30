import React, { useState } from "react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import Input from "../../common/Input";

const EMPTY = {
  id: "",
  name: "",
  location: "",
  sector: "North",
  rtspUrl: "",
  fpsLimit: "",
  sampling: "",
  description: "",
};

const SECTORS = ["North", "South", "East", "West", "Central"];

/**
 * Add / edit camera dialog. RTSP credentials are never echoed — the URL is
 * always masked so plugin secrets never reach the UI.
 */
function CameraForm({ open, onClose, onSubmit, editing, canManage }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        id: editing.id,
        name: editing.name || "",
        location: editing.location || "",
        sector: editing.sector || "North",
        rtspUrl: "",
        fpsLimit: editing.fpsLimit ?? "",
        sampling: editing.sampling || "",
        description: editing.description || "",
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.id.trim() && !editing) errs.id = "Camera ID is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(form, editing);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.id}` : "Add Camera"}
      size="lg"
      footer={
        !canManage ? (
          <div className="text-sm text-slate-400">Read-only</div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>{editing ? "Save Changes" : "Add Camera"}</Button>
          </>
        )
      }
    >
      {!canManage && (
        <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Your role has read-only access to the Admin area. Editing is disabled.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Camera ID"
          id="cam-id"
          value={form.id}
          onChange={set("id")}
          error={errors.id}
          disabled={!!editing || !canManage}
          placeholder="e.g. CAM-11"
          hint={editing ? "ID cannot be changed" : "Unique identifier"}
        />
        <Input
          label="Name"
          id="cam-name"
          value={form.name}
          onChange={set("name")}
          error={errors.name}
          disabled={!canManage}
          placeholder="e.g. Checkpoint North"
        />
        <Input
          label="Location"
          id="cam-location"
          value={form.location}
          onChange={set("location")}
          disabled={!canManage}
          placeholder="e.g. Gate 3, Sector 12"
        />
        <div>
          <label htmlFor="cam-sector" className="mb-1.5 block text-sm font-medium text-slate-700">
            Sector
          </label>
          <select
            id="cam-sector"
            value={form.sector}
            onChange={set("sector")}
            disabled={!canManage}
            className="input-field"
          >
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="RTSP URL"
          id="cam-rtsp"
          value={form.rtspUrl}
          onChange={set("rtspUrl")}
          type="password"
          disabled={!canManage}
          placeholder="rtsp://••••••••••••"
          hint="Masked — never displayed after save"
        />
        <Input
          label="FPS Limit"
          id="cam-fps"
          value={form.fpsLimit}
          onChange={set("fpsLimit")}
          disabled={!canManage}
          placeholder="e.g. 15"
        />
        <Input
          label="Sampling"
          id="cam-sampling"
          value={form.sampling}
          onChange={set("sampling")}
          disabled={!canManage}
          placeholder="e.g. 10 frames/min"
        />
        <Input
          label="Description"
          id="cam-desc"
          value={form.description}
          onChange={set("description")}
          disabled={!canManage}
          placeholder="Optional notes"
        />
      </div>
    </Modal>
  );
}

export default CameraForm;
