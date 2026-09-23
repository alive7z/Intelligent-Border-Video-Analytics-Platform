import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getUsers, createUser, updateUser, deactivateUser, getRolePermissions } from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import Loader from "../../common/Loader";
import { PlusIcon, EditIcon, UserIcon, CheckIcon, XIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import UserForm from "./UserForm";
import { roleLabel } from "../../../utils/roles";

const MODULES = ["Dashboard", "Surveillance", "Alerts", "Events", "Intelligence", "Map", "Analytics", "Admin"];

function RoleMatrix({ matrix }) {
  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-primary">Role Permissions Matrix</p>
      <p className="mb-4 text-xs text-muted">
        Read-only view of what each role may access. Enforcement happens on the backend.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Role</th>
              {MODULES.map((m) => (
                <th key={m} className="px-2 py-2 text-center font-semibold">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrix || {}).map(([role, perms]) => (
              <tr key={role} className="border-b border-slate-100">
                <td className="px-3 py-2.5 font-medium text-secondary">{roleLabel(role)}</td>
                {MODULES.map((m) => {
                  const v = perms[m];
                  return (
                    <td key={m} className="px-2 py-2.5 text-center">
                      {v === false || v === "limited" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          {v === "limited" ? (
                            <>
                              <CheckIcon size={12} className="text-amber-600" /> L
                            </>
                          ) : (
                            <XIcon size={12} />
                          )}
                        </span>
                      ) : (
                        <CheckIcon size={14} className="mx-auto text-green-600" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UserManagement() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: us }, { data: m }] = await Promise.all([getUsers(), getRolePermissions()]);
      setUsers(us || []);
      setMatrix(m || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      active: users.filter((u) => u.status !== "Disabled").length,
      disabled: users.filter((u) => u.status === "Disabled").length,
    }),
    [users]
  );

  const handleSave = async (form, editingUser) => {
    try {
      if (editingUser) {
        const { data } = await updateUser(editingUser.id, {
          name: form.name,
          username: form.username,
          email: form.email,
          role: form.role,
        });
        setUsers((us) => us.map((u) => (u.id === editingUser.id ? data : u)));
        toast(`${editingUser.username} updated`, "success");
      } else {
        const { data } = await createUser(form);
        setUsers((us) => [data, ...us]);
        toast(`${data.username} created`, "success");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      const { data } = await deactivateUser(deactivateTarget.id);
      setUsers((us) => us.map((u) => (u.id === deactivateTarget.id ? data : u)));
      toast(`${deactivateTarget.username} deactivated`, "success");
    } catch (e) {
      toast(e.message || "Deactivate failed", "error");
    } finally {
      setDeactivateTarget(null);
    }
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="!p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Active Users</p>
          <p className="mt-1 text-2xl font-bold text-primary">{counts.active}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Disabled</p>
          <p className="mt-1 text-2xl font-bold text-primary">{counts.disabled}</p>
        </Card>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">Manage users and their platform roles.</p>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon size={16} /> Add User
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
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Username</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Last Login</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-primary">
                        <UserIcon size={16} className="text-blue-600" />
                        {u.name}
                      </div>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-secondary">{u.username}</td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{roleLabel(u.role)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "Disabled" ? (
                        <Badge tone="offline">Disabled</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary">{u.lastLogin}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <>
                            <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(u);
                              setFormOpen(true);
                            }}
                          >
                            <EditIcon size={14} /> Edit
                          </Button>
                            {u.status !== "Disabled" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-300 hover:bg-red-500/10"
                                onClick={() => setDeactivateTarget(u)}
                              >
                                Deactivate
                              </Button>
                            )}
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

      <RoleMatrix matrix={matrix} />

      <UserForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSave}
        editing={editing}
        canManage={canManage}
      />

      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title={`Deactivate ${deactivateTarget?.username || ""}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeactivate}>
              Deactivate User
            </Button>
          </>
        }
      >
        <p className="text-sm text-secondary">
          Deactivating <span className="font-medium">{deactivateTarget?.name}</span> prevents them
          from signing in. Their history and audit trail is preserved.
        </p>
      </Modal>
    </>
  );
}

export default UserManagement;
