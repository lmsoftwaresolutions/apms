import { useEffect, useState, FormEvent } from "react";
import { Plus, Shield, Check, Lock } from "lucide-react";
import { api, Permission, Role } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { Field } from "../../components/common/Field";
import { Spinner } from "../../components/common/Spinner";

export function RolesPage() {
  const { can } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Create Role Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [roleList, permList] = await Promise.all([
        api.roles(),
        api.permissions(),
      ]);
      setRoles(roleList);
      setCatalog(permList);
      if (!selectedRoleId && roleList.length > 0) {
        setSelectedRoleId(roleList[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles and permissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  // Group catalog permissions by module
  const permissionsByModule = catalog.reduce<Record<string, Permission[]>>((acc, perm) => {
    const mod = perm.module || "core";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(perm);
    return acc;
  }, {});

  async function handleTogglePermission(role: Role, code: string) {
    if (!can("iam.role.update") || role.is_system) return;
    const permissions = role.permissions.includes(code)
      ? role.permissions.filter((item) => item !== code)
      : [...role.permissions, code];

    setSaving(true);
    try {
      const updated = await api.updateRole(role.id, permissions);
      setRoles((current) => current.map((r) => (r.id === role.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the role permissions");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRole(e: FormEvent) {
    e.preventDefault();
    if (!newCode || !newName) return;
    setCreateSubmitting(true);
    setCreateError("");
    try {
      const created = await api.createRole(newCode.toLowerCase(), newName, []);
      setNewCode("");
      setNewName("");
      setIsCreateOpen(false);
      setRoles((current) => [...current, created]);
      setSelectedRoleId(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreateSubmitting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Roles & Access Control</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            RBAC definition, system permissions, and module access control matrices.
          </p>
        </div>
        {can("iam.role.create") ? (
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setIsCreateOpen(true)}
          >
            Create Role
          </Button>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-danger-bg)",
            color: "var(--color-danger-fg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <Spinner size="lg" />
          <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Loading permissions matrix…</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) 1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* Roles list */}
          <div className="card-panel" style={{ padding: "0.75rem" }}>
            <div style={{ padding: "0.5rem 0.75rem", fontWeight: 650, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              DEFINED ROLES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {roles.map((r) => {
                const isSelected = r.id === (activeRole?.id || "");
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.75rem",
                      borderRadius: "0.375rem",
                      border: isSelected ? "1px solid var(--color-primary-border)" : "1px solid transparent",
                      backgroundColor: isSelected ? "var(--color-primary-bg)" : "transparent",
                      color: isSelected ? "var(--color-primary-fg)" : "var(--text-primary)",
                      textAlign: "left",
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{r.name}</div>
                      <code style={{ fontSize: "0.75rem", color: isSelected ? "var(--color-primary)" : "var(--text-muted)" }}>
                        {r.code}
                      </code>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {r.is_system ? (
                        <span title="System Role (Read-only)">
                          <Lock size={14} color="var(--text-muted)" />
                        </span>
                      ) : null}
                      <Badge variant={isSelected ? "info" : "neutral"} size="sm">
                        {r.permissions.length}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permissions Matrix for active role */}
          {activeRole ? (
            <div className="card-panel">
              <div className="card-header" style={{ paddingBottom: "1rem", borderBottom: "1px solid var(--border-default)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Shield size={20} color="var(--color-primary)" />
                    <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 650 }}>
                      {activeRole.name} Permissions
                    </h3>
                    {activeRole.is_system ? (
                      <Badge variant="warning" size="sm">
                        System Protected
                      </Badge>
                    ) : null}
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    Grant or revoke granular API and UI privileges for this role.
                  </p>
                </div>
                {saving ? (
                  <Badge variant="info">
                    <Spinner size="sm" /> Updating…
                  </Badge>
                ) : null}
              </div>

              {/* Module Groups */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", marginTop: "1.5rem" }}>
                {Object.entries(permissionsByModule).map(([moduleName, perms]) => (
                  <div key={moduleName}>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-secondary)",
                        marginBottom: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>Module: {moduleName}</span>
                      <Badge variant="neutral" size="sm">
                        {perms.filter((p) => activeRole.permissions.includes(p.code)).length} / {perms.length}
                      </Badge>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: "0.625rem",
                      }}
                    >
                      {perms.map((p) => {
                        const checked = activeRole.permissions.includes(p.code);
                        const disabled = !can("iam.role.update") || activeRole.is_system;

                        return (
                          <label
                            key={p.code}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "0.625rem",
                              padding: "0.625rem 0.75rem",
                              border: checked
                                ? "1px solid var(--color-primary-border)"
                                : "1px solid var(--border-default)",
                              borderRadius: "0.375rem",
                              backgroundColor: checked ? "var(--color-primary-bg)" : "var(--bg-surface)",
                              cursor: disabled ? "not-allowed" : "pointer",
                              opacity: disabled ? 0.75 : 1,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <input
                              type="checkbox"
                              style={{ marginTop: "0.2rem" }}
                              checked={checked}
                              disabled={disabled}
                              onChange={() => void handleTogglePermission(activeRole, p.code)}
                            />
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                {p.code}
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {p.description || `${p.action} on ${p.resource}`}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Create Role Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateError("");
        }}
        title="Create New Role"
        description="Define a custom role name and code."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateError("");
              }}
              disabled={createSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => handleCreateRole(e as unknown as FormEvent)}
              loading={createSubmitting}
              disabled={!newName.trim() || !newCode.trim()}
            >
              Create Role
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateRole} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {createError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {createError}
            </div>
          ) : null}

          <Field label="Role Name" required help="e.g. Shift Incharge, Attendance Auditor">
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Shift Supervisor"
              required
            />
          </Field>

          <Field label="Role Code" required help="Unique identifier, e.g. shift_supervisor">
            <input
              className="input"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toLowerCase())}
              placeholder="e.g. shift_supervisor"
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
