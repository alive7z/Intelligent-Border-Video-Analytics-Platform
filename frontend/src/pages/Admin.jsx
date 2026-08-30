import React, { useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import { ShieldIcon } from "../components/common/Icons";
import { ToastProvider } from "../components/common/Toast";
import AdminTabs from "../components/admin/AdminTabs";
import { useAdminAccess, OPERATOR_ROLE } from "../components/admin/useAdminAccess";
import CameraManagement from "../components/admin/cameras/CameraManagement";
import ZoneManagement from "../components/admin/zones/ZoneManagement";
import RiskRules from "../components/admin/rules/RiskRules";
import UserManagement from "../components/admin/users/UserManagement";
import SystemSettings from "../components/admin/settings/SystemSettings";

const PANELS = {
  cameras: CameraManagement,
  zones: ZoneManagement,
  rules: RiskRules,
  users: UserManagement,
  settings: SystemSettings,
};

function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <ShieldIcon size={24} className="text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your role does not permit access to system administration.
        </p>
      </Card>
    </div>
  );
}

function AdminContent({ readOnly }) {
  const [active, setActive] = useState("cameras");
  const Panel = PANELS[active] || PANELS.cameras;

  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="Manage cameras, surveillance zones, security rules, users, and platform settings."
      />
      <AdminTabs active={active} onChange={setActive} readOnly={readOnly} />
      <div key={active} role="tabpanel" id={`admin-panel-${active}`} aria-labelledby={`admin-tab-${active}`}>
        <Panel />
      </div>
    </div>
  );
}

function Admin() {
  const { role, canManage } = useAdminAccess();

  // Security Operator is denied admin access entirely; Administrator has full
  // access; Auditor / Analyst gets read-only (view-only) access.
  if (role === OPERATOR_ROLE) {
    return (
      <ToastProvider>
        <PageHeader title="Administration" subtitle="System configuration and administration." />
        <AccessDenied />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AdminContent readOnly={!canManage} />
    </ToastProvider>
  );
}

export default Admin;
