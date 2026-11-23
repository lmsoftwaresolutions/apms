import React, { useEffect, useState } from "react";
import { Plus, Shield, Users as UsersIcon, Trash2, Edit, Search } from "lucide-react";
import { api, Permission, Role, DirectoryUser } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Badge, Drawer, EmptyState, SkeletonTable, Alert } from "../../components/common/UIComponents";

export function IAMPage() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Role Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [roleName, setRoleName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  // User assignment state
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [selectedRoleIdToAssign, setSelectedRoleIdToAssign] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [r, p, u] = await Promise.all([
        api.roles(),
        api.permissions(),
        api.users().catch(() => []),
      ]);
      setRoles(r);
      setPermissions(p);
      setUsers(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IAM data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Group permissions by module
  const permissionsByModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const mod = p.module || "general";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(p);
    return acc;
  }, {});

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleCode("");
    setRoleName("");
    setSelectedPermissions([]);
    setIsDrawerOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleCode(role.code);
    setRoleName(role.name);
    setSelectedPermissions([...role.permissions]);
    setIsDrawerOpen(true);
  };

  const togglePermission = (code: string) => {
    if (editingRole?.is_system) return;
    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const saveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRole(true);
    setError("");
    try {
      if (editingRole) {
        // Gap 2 resolved: update both name and permissions
        await api.updateRole(editingRole.id, {
          name: editingRole.is_system ? undefined : roleName,
          permissions: editingRole.is_system ? undefined : selectedPermissions,
        });
      } else {
        await api.createRole(roleCode.toUpperCase(), roleName, selectedPermissions);
      }
      setIsDrawerOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSavingRole(false);
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm("Are you sure you want to delete this custom role?")) return;
    try {
      await api.deleteRole(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    }
  };

  // Gap 3 resolved: assign role using UUID lookup
  const handleAssignRole = async (userId: string) => {
    if (!selectedRoleIdToAssign) return;
    try {
      await api.assignRole(userId, selectedRoleIdToAssign);
      setAssigningUserId(null);
      setSelectedRoleIdToAssign("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign role");
    }
  };

  const handleUnassignRole = async (userId: string, roleName: string) => {
    const matchedRole = roles.find((r) => r.name === roleName || r.code === roleName);
    if (!matchedRole) return;
    try {
      await api.unassignRole(userId, matchedRole.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove role");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Access Control & Directory Users</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Manage role-based access control (RBAC) permissions matrix and directory user assignments.
          </p>
        </div>

        <div className="flex gap-2">
          {activeTab === "roles" && can("iam.role.create") ? (
            <button className="primary" type="button" onClick={openCreateRole}>
              <Plus size={16} />
              Create Role
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="danger" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2" style={{ borderBottom: "1px solid var(--border-default)", paddingBottom: "0.5rem" }}>
        <button
          className={activeTab === "roles" ? "primary small" : "ghost small"}
          type="button"
          onClick={() => setActiveTab("roles")}
        >
          <Shield size={14} />
          Roles &amp; Permissions ({roles.length})
        </button>
        <button
          className={activeTab === "users" ? "primary small" : "ghost small"}
          type="button"
          onClick={() => setActiveTab("users")}
        >
          <UsersIcon size={14} />
          Directory Users ({users.length})
        </button>
      </div>

      {/* Tab: Roles List */}
      {activeTab === "roles" ? (
        <div className="panel" style={{ padding: 0 }}>
          {loading ? (
            <SkeletonTable rows={4} cols={4} />
          ) : roles.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No roles configured"
              description="Create custom roles with fine-grained permissions or view system roles."
            />
          ) : (
            <div className="table-container" style={{ border: "none" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Role Code</th>
                    <th>Role Name</th>
                    <th>Type</th>
                    <th>Permissions Granted</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td style={{ fontWeight: 600 }}>{role.code}</td>
                      <td>{role.name}</td>
                      <td>
                        <Badge variant={role.is_system ? "info" : "neutral"}>
                          {role.is_system ? "System Protected" : "Custom"}
                        </Badge>
                      </td>
                      <td style={{ maxWidth: "360px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span className="tabular">{role.permissions.length} capabilities assigned</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="flex justify-between items-center" style={{ justifyContent: "flex-end", gap: "0.4rem" }}>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => openEditRole(role)}
                            title={role.is_system ? "View Permissions" : "Edit Role"}
                          >
                            <Edit size={14} />
                            {role.is_system ? "View" : "Edit"}
                          </button>
                          {!role.is_system && can("iam.role.delete") ? (
                            <button
                              className="danger small"
                              type="button"
                              onClick={() => deleteRole(role.id)}
                              title="Delete Role"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Tab: Users Assignment */}
      {activeTab === "users" ? (
        <div className="panel" style={{ padding: 0 }}>
          {loading ? (
            <SkeletonTable rows={4} cols={3} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No directory users"
              description="No active directory users found for this tenant."
            />
          ) : (
            <div className="table-container" style={{ border: "none" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Assigned Roles</th>
                    <th style={{ textAlign: "right" }}>Manage Roles</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td style={{ fontWeight: 600 }}>{user.full_name}</td>
                      <td className="text-secondary">{user.email}</td>
                      <td>
                        <Badge variant={user.is_active ? "present" : "neutral"}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                          {user.roles.length === 0 ? (
                            <span className="text-muted" style={{ fontSize: "0.8rem" }}>None</span>
                          ) : (
                            user.roles.map((rName) => (
                              <Badge key={rName} variant="info">
                                {rName}
                                {can("iam.assignment.delete") ? (
                                  <button
                                    className="ghost"
                                    style={{ padding: "0 0.2rem", height: "auto", border: "none" }}
                                    onClick={() => handleUnassignRole(user.id, rName)}
                                    title="Unassign role"
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {can("iam.assignment.create") ? (
                          assigningUserId === user.id ? (
                            <div className="flex gap-1" style={{ justifyContent: "flex-end" }}>
                              <select
                                style={{ width: "160px" }}
                                value={selectedRoleIdToAssign}
                                onChange={(e) => setSelectedRoleIdToAssign(e.target.value)}
                              >
                                <option value="">Select role…</option>
                                {roles.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="primary small"
                                type="button"
                                disabled={!selectedRoleIdToAssign}
                                onClick={() => handleAssignRole(user.id)}
                              >
                                Assign
                              </button>
                              <button
                                className="ghost small"
                                type="button"
                                onClick={() => setAssigningUserId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="ghost small"
                              type="button"
                              onClick={() => {
                                setAssigningUserId(user.id);
                                setSelectedRoleIdToAssign("");
                              }}
                            >
                              <Plus size={14} /> Add Role
                            </button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Role Create/Edit Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingRole ? (editingRole.is_system ? "View System Role" : "Edit Custom Role") : "Create Custom Role"}
        footer={
          editingRole?.is_system ? (
            <button className="primary small" type="button" onClick={() => setIsDrawerOpen(false)}>
              Done
            </button>
          ) : (
            <>
              <button className="ghost small" type="button" onClick={() => setIsDrawerOpen(false)}>
                Cancel
              </button>
              <button
                className="primary small"
                type="button"
                disabled={savingRole || !roleName || (!editingRole && !roleCode)}
                onClick={saveRole}
              >
                {savingRole ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
              </button>
            </>
          )
        }
      >
        <form className="flex flex-col gap-3" onSubmit={saveRole}>
          <div className="form-group">
            <label>Role Code</label>
            <input
              value={roleCode}
              disabled={!!editingRole}
              onChange={(e) => setRoleCode(e.target.value.toUpperCase())}
              placeholder="e.g. SHIFT_SUPERVISOR"
              required
            />
          </div>

          <div className="form-group">
            <label>Role Name</label>
            <input
              value={roleName}
              disabled={editingRole?.is_system}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Shift Operations Supervisor"
              required
            />
          </div>

          <div style={{ marginTop: "0.5rem" }}>
            <div className="flex justify-between items-center" style={{ marginBottom: "0.5rem" }}>
              <h4>Permissions Matrix</h4>
              <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                {selectedPermissions.length} selected
              </span>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <input
                type="text"
                placeholder="Search permissions by code, name or module…"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "380px", overflowY: "auto" }}>
              {Object.entries(permissionsByModule).map(([mod, items]) => {
                const filtered = items.filter(
                  (p) =>
                    !permSearch ||
                    p.code.toLowerCase().includes(permSearch.toLowerCase()) ||
                    p.description.toLowerCase().includes(permSearch.toLowerCase()) ||
                    mod.toLowerCase().includes(permSearch.toLowerCase())
                );
                if (filtered.length === 0) return null;

                return (
                  <div key={mod} style={{ border: "1px solid var(--border-default)", borderRadius: "4px", padding: "0.75rem" }}>
                    <div style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                      Module: {mod} ({filtered.length})
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.4rem" }}>
                      {filtered.map((perm) => {
                        const isChecked = selectedPermissions.includes(perm.code);
                        return (
                          <label
                            key={perm.code}
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              gap: "0.5rem",
                              cursor: editingRole?.is_system ? "default" : "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={editingRole?.is_system}
                              onChange={() => togglePermission(perm.code)}
                              style={{ width: "auto" }}
                            />
                            <div>
                              <div style={{ fontSize: "0.82rem", fontWeight: 500 }}>{perm.code}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{perm.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
