import React, { useState } from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import AcknowledgeModal from "./AcknowledgeModal";
import ResolveAlertModal from "./ResolveAlertModal";
import {
  CheckIcon,
  CheckCircleIcon,
  PlusIcon,
  FileTextIcon,
  VideoIcon,
} from "../common/Icons";
import {
  acknowledgeAlert,
  resolveAlert,
} from "../../services/alertApi";

/**
 * Operator actions for an alert. Handles acknowledge + resolve flows via the
 * service layer (auditable) and exposes actions that navigate the operator
 * to relevant pages. No siren / patrol / weapon integrations.
 */
function OperatorActions({ alert, onAlertUpdate }) {
  const [ackOpen, setAckOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isAcknowledged =
    (alert.status || "").toLowerCase() === "acknowledged";
  const isResolved = (alert.status || "").toLowerCase() === "resolved";

  const handleAcknowledge = async (notes) => {
    setLoading(true);
    try {
      const res = await acknowledgeAlert(alert.id, {
        operator: "Security Operator",
        notes,
      });
      onAlertUpdate(res.data);
      setAckOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (type, notes) => {
    setLoading(true);
    try {
      const res = await resolveAlert(alert.id, { type, notes });
      onAlertUpdate(res.data);
      setResolveOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        Operator Actions
      </h3>
      <div className="grid grid-cols-1 gap-2">
        <Button
          variant="primary"
          size="md"
          disabled={isAcknowledged || isResolved}
          onClick={() => setAckOpen(true)}
        >
          <CheckIcon size={16} />
          {isAcknowledged ? "Acknowledged" : "Acknowledge Alert"}
        </Button>
        <Button
          variant="success"
          size="md"
          disabled={isResolved}
          onClick={() => setResolveOpen(true)}
        >
          <CheckCircleIcon size={16} />
          {isResolved ? "Resolved" : "Resolve Alert"}
        </Button>
        <Button as={Link} to={`/surveillance/${alert.camera}`} variant="secondary" size="md">
          <VideoIcon size={16} className="text-navy-700" /> View Live Camera
        </Button>
        <Button variant="secondary" size="md">
          <FileTextIcon size={16} className="text-navy-700" /> View Evidence
        </Button>
        <Button variant="secondary" size="md">
          <PlusIcon size={16} className="text-navy-700" /> Create Incident Report
        </Button>
      </div>

      <AcknowledgeModal
        open={ackOpen}
        onClose={() => setAckOpen(false)}
        onConfirm={handleAcknowledge}
        loading={loading}
      />
      <ResolveAlertModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={handleResolve}
        loading={loading}
      />
    </Card>
  );
}

export default OperatorActions;
