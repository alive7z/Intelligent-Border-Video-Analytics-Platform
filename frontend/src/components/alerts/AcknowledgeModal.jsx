import React, { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Input from "../common/Input";

/**
 * Confirmation modal for acknowledging an alert. Allows an optional operator
 * note which is stored for auditability.
 */
function AcknowledgeModal({ open, onClose, onConfirm, loading }) {
  const [notes, setNotes] = useState("");

  const handleClose = () => {
    if (loading) return;
    setNotes("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Acknowledge Alert"
      size="sm"
    >
      <p className="text-sm text-slate-600">Acknowledge this alert?</p>
      <div className="mt-4">
        <Input
          label="Operator Note (optional)"
          id="ack-note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note for the audit log"
        />
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" size="md" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={loading}
          onClick={() => onConfirm(notes)}
        >
          Acknowledge
        </Button>
      </div>
    </Modal>
  );
}

export default AcknowledgeModal;
