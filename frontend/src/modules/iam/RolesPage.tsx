import { useEffect, useState, useMemo, FormEvent } from "react";
import { Plus, Search, Shield, Lock, Check } from "lucide-react";
import { api, Permission, Role } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { Field } from "../../components/common/Field";
import { Spinner } from "../../components/common/Spinner";

interface AreaDef {
  key: string;
  label: string;
}

const AREAS: AreaDef[] = [
  { key: "attendance", label: "Attendance" },
  { key: "capture", label: "Capture" },
  { key: "employee", label: "Employee" },
  { key: "ess", label: "My calendar (ESS)" },
  { key: "iam", label: "Roles & assignments" },
  { key: "leave", label: "Leave" },
  { key: "muster", label: "Muster" },
  { key: "org", label: "Organization" },
  { key: "overtime", label: "Overtime" },
  { key: "policy", label: "Policy" },
  { key: "privacy", label: "Privacy" },
  { key: "roster", label: "Roster" },
  { key: "shift", label: "Shift" },
  { key: "work_mode", label: "Work mode" },
];

function getAreaForModule(module: string): string {
  const m = (module || "").toLowerCase();
  if (m === "attendance") return "attendance";
  if (m === "capture") return "capture";
  if (m === "employee") return "employee";
  if (m === "ess") return "ess";
  if (m === "iam") return "iam";
  if (m === "leave") return "leave";
  if (m === "muster") return "muster";
  if (m === "org") return "org";
  if (m === "overtime" || m === "overtime_record") return "overtime";
  if (m === "policy" || m === "policy_override") return "policy";
  if (m === "privacy") return "privacy";
  if (m === "roster") return "roster";
  if (m === "shift") return "shift";
  if (m === "work_mode") return "work_mode";
  return m;
}

export function RolesPage() {
  const { can } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedAreaKey, setSelectedAreaKey] = useState<string>("attendance");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Staged permissions for active role
  const [stagedPermissions, setStagedPermissions] = useState<Set<string>>(new Set());

  // Create Role Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [roleList, permList] = await Promise.all([api.roles(), api.permissions()]);
      setRoles(roleList);
      setCatalog(permList);
      if (roleList.length > 0) {
        const initialRole = roleList[0];
        setSelectedRoleId(initialRole.id);
        setStagedPermissions(new Set(initialRole.permissions));
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
  }, []);

  const activeRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || roles[0],
    [roles, selectedRoleId]
  );

  function handleSelectRole(roleId: string) {
    if (roleId === selectedRoleId) return;
    const target = roles.find((r) => r.id === roleId);
    if (!target) return;
    setSelectedRoleId(roleId);
    setStagedPermissions(new Set(target.permissions));
    setError("");
  }

  // Deduplicate permissions: if both colon and dot alias exist, pick a display canonical
  const canonicalCatalog = useMemo(() => {
    const seen = new Set<string>();
    const list: (Permission & { area: string; aliasCode?: string })[] = [];

    for (const p of catalog) {
      const area = getAreaForModule(p.module);
      // Clean base key for deduplicating alias (e.g. overtime_record:create vs overtime.record.create)
      const normalizedKey = p.code.replace(/_/g, ".").replace(/:/g, ".");
      if (seen.has(normalizedKey)) {
        // Link alias to existing item
        const existing = list.find(
          (item) => item.code.replace(/_/g, ".").replace(/:/g, ".") === normalizedKey
        );
        if (existing) {
          existing.aliasCode = p.code;
        }
        continue;
      }
      seen.add(normalizedKey);
      list.push({ ...p, area });
    }
    return list;
  }, [catalog]);

  // Permissions grouped by area
  const permissionsByArea = useMemo(() => {
    const map = new Map<string, typeof canonicalCatalog>();
    for (const p of canonicalCatalog) {
      const arr = map.get(p.area) || [];
      arr.push(p);
      map.set(p.area, arr);
    }
    return map;
  }, [canonicalCatalog]);

  // Current area permissions
  const currentAreaPermissions = useMemo(() => {
    return permissionsByArea.get(selectedAreaKey) || [];
  }, [permissionsByArea, selectedAreaKey]);

  // Filtered permissions by search
  const filteredPermissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return currentAreaPermissions;
    return currentAreaPermissions.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [currentAreaPermissions, searchQuery]);

  // Calculate granted counts for areas
  function getAreaCounts(areaKey: string) {
    const perms = permissionsByArea.get(areaKey) || [];
    const total = perms.length;
    let granted = 0;
    for (const p of perms) {
      if (stagedPermissions.has(p.code) || (p.aliasCode && stagedPermissions.has(p.aliasCode))) {
        granted++;
      }
    }
    return { granted, total };
  }

  const { granted: currentAreaGrantedCount } = getAreaCounts(selectedAreaKey);
  const allAreaOn =
    currentAreaPermissions.length > 0 &&
    currentAreaGrantedCount === currentAreaPermissions.length;

  function handleTogglePermission(permCode: string, aliasCode?: string) {
    if (!activeRole) return;
    const next = new Set(stagedPermissions);
    const isCurrentlyOn = next.has(permCode) || (aliasCode && next.has(aliasCode));

    if (isCurrentlyOn) {
      next.delete(permCode);
      if (aliasCode) next.delete(aliasCode);
    } else {
      next.add(permCode);
      if (aliasCode) next.add(aliasCode);
    }
    setStagedPermissions(next);
  }

  function handleToggleAllInArea() {
    const next = new Set(stagedPermissions);
    if (allAreaOn) {
      // Turn all off in current area
      for (const p of currentAreaPermissions) {
        next.delete(p.code);
        if (p.aliasCode) next.delete(p.aliasCode);
      }
    } else {
      // Turn all on in current area
      for (const p of currentAreaPermissions) {
        next.add(p.code);
        if (p.aliasCode) next.add(p.aliasCode);
      }
    }
    setStagedPermissions(next);
  }

  // Unsaved changes check
  const hasUnsavedChanges = useMemo(() => {
    if (!activeRole) return false;
    const orig = new Set(activeRole.permissions);
    if (orig.size !== stagedPermissions.size) return true;
    for (const p of stagedPermissions) {
      if (!orig.has(p)) return true;
    }
    return false;
  }, [activeRole, stagedPermissions]);

  const unsavedCount = useMemo(() => {
    if (!activeRole) return 0;
    const orig = new Set(activeRole.permissions);
    let diff = 0;
    for (const p of stagedPermissions) {
      if (!orig.has(p)) diff++;
    }
    for (const p of orig) {
      if (!stagedPermissions.has(p)) diff++;
    }
    return diff;
  }, [activeRole, stagedPermissions]);

  function handleDiscardChanges() {
    if (!activeRole) return;
    setStagedPermissions(new Set(activeRole.permissions));
  }

  async function handleSaveChanges() {
    if (!activeRole) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateRole(activeRole.id, Array.from(stagedPermissions));
      setRoles((current) => current.map((r) => (r.id === activeRole.id ? updated : r)));
      setStagedPermissions(new Set(updated.permissions));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save permissions");
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
      setStagedPermissions(new Set());
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const currentArea = AREAS.find((a) => a.key === selectedAreaKey) || AREAS[0];

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              margin: "0 0 0.35rem",
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Roles & access
          </h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Pick a role, then an area, then switch on what that role can do.
          </p>
        </div>

        {can("iam.role.create") ? (
          <Button
            variant="secondary"
            onClick={() => setIsCreateOpen(true)}
            style={{ borderRadius: "0.5rem", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 600 }}
          >
            New role
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
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem" }}>
          <Spinner size="lg" />
          <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Loading roles and permissions…</p>
        </div>
      ) : (
        <>
          {/* Top Role Selector Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              {roles.map((r) => {
                const isSelected = r.id === activeRole?.id;
                const count = isSelected ? stagedPermissions.size : r.permissions.length;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRole(r.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.45rem 0.9rem",
                      borderRadius: "9999px",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      border: isSelected
                        ? "1.5px solid #10b981"
                        : "1px solid var(--border-default)",
                      backgroundColor: isSelected
                        ? "rgba(16, 185, 129, 0.12)"
                        : "var(--bg-surface)",
                      color: isSelected ? "#10b981" : "var(--text-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>{r.name}</span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        opacity: isSelected ? 1 : 0.75,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {activeRole?.is_system ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.3rem 0.65rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    color: "#f59e0b",
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    marginLeft: "0.25rem",
                  }}
                >
                  System role
                </span>
              ) : null}
            </div>

            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontWeight: 500 }}>
              {stagedPermissions.size} of {catalog.length} permissions granted
            </div>
          </div>

          {/* Main Card Container */}
          <div
            className="roles-page-grid"
            style={{
              minHeight: "560px",
            }}
          >
            {/* Left Area List */}
            <div
              style={{
                borderRight: "1px solid var(--border-default)",
                padding: "0.75rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              {AREAS.map((area) => {
                const isSelected = area.key === selectedAreaKey;
                const { granted, total } = getAreaCounts(area.key);
                return (
                  <button
                    key={area.key}
                    type="button"
                    onClick={() => {
                      setSelectedAreaKey(area.key);
                      setSearchQuery("");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "0.5rem",
                      backgroundColor: isSelected ? "rgba(16, 185, 129, 0.15)" : "transparent",
                      border: isSelected
                        ? "1px solid rgba(16, 185, 129, 0.35)"
                        : "1px solid transparent",
                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                      fontWeight: isSelected ? 650 : 500,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <span>{area.label}</span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color:
                          granted > 0
                            ? isSelected
                              ? "#10b981"
                              : "#34d399"
                            : "var(--text-muted)",
                      }}
                    >
                      {granted}/{total}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Area Permissions Panel */}
            <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--bg-surface)" }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1.25rem 1.5rem",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <h2
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--text-primary)",
                    }}
                  >
                    {currentArea.label}
                  </h2>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    {currentAreaGrantedCount} of {currentAreaPermissions.length} on
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAllInArea}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#10b981",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      padding: "0 0.25rem",
                    }}
                  >
                    {allAreaOn ? "Deselect all" : "Select all"}
                  </button>
                </div>

                {/* Search Input */}
                <div style={{ position: "relative", width: "240px" }}>
                  <Search
                    size={15}
                    style={{
                      position: "absolute",
                      left: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                    }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search all permissions"
                    className="input"
                    style={{
                      paddingLeft: "2.25rem",
                      fontSize: "0.8125rem",
                      height: "36px",
                      borderRadius: "0.5rem",
                    }}
                  />
                </div>
              </div>

              {/* Grid of Permission Toggle Cards */}
              <div style={{ padding: "1.25rem 1.5rem", flex: 1, overflowY: "auto" }}>
                {filteredPermissions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    No permissions match "{searchQuery}" in {currentArea.label}.
                  </div>
                ) : (
                  <div className="perms-matrix-grid">
                    {filteredPermissions.map((perm) => {
                      const isChecked =
                        stagedPermissions.has(perm.code) ||
                        (Boolean(perm.aliasCode) && stagedPermissions.has(perm.aliasCode!));
                      return (
                        <div
                          key={perm.code}
                          onClick={() => handleTogglePermission(perm.code, perm.aliasCode)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.875rem",
                            padding: "1rem",
                            borderRadius: "0.5rem",
                            backgroundColor: "var(--bg-card)",
                            border: "1px solid var(--border-subtle)",
                            cursor: "pointer",
                            transition: "border-color 0.15s ease",
                            userSelect: "none",
                          }}
                        >
                          {/* Toggle Switch */}
                          <div
                            style={{
                              width: "38px",
                              height: "22px",
                              borderRadius: "9999px",
                              backgroundColor: isChecked ? "#10b981" : "var(--border-strong)",
                              position: "relative",
                              flexShrink: 0,
                              marginTop: "2px",
                              transition: "background-color 0.2s ease",
                            }}
                          >
                            <div
                              style={{
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                backgroundColor: "#ffffff",
                                position: "absolute",
                                top: "3px",
                                left: isChecked ? "19px" : "3px",
                                transition: "left 0.2s ease",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                              }}
                            />
                          </div>

                          {/* Label & Code */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            <div
                              style={{
                                fontSize: "0.875rem",
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                lineHeight: 1.3,
                              }}
                            >
                              {perm.description || perm.code}
                            </div>
                            <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {perm.code}
                            </code>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Sticky Action Footer */}
              {hasUnsavedChanges ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem 1.5rem",
                    borderTop: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-card)",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {unsavedCount} unsaved change{unsavedCount > 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <Button variant="ghost" onClick={handleDiscardChanges} disabled={saving}>
                      Discard
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleSaveChanges}
                      loading={saving}
                      style={{
                        backgroundColor: "#10b981",
                        borderColor: "#10b981",
                        color: "#ffffff",
                        fontWeight: 600,
                        padding: "0.45rem 1.1rem",
                      }}
                    >
                      Save changes
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Create Role Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Role"
        description="Define a new role code and display name for this tenant."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateRole}
              loading={createSubmitting}
              disabled={!newCode || !newName}
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

          <Field label="Role Name" required help="Human-readable title (e.g. Line Supervisor, Payroll Auditor)">
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Attendance Clerk"
              required
            />
          </Field>

          <Field label="Role Code" required help="Unique programmatic identifier (lowercase, e.g. clerk, auditor)">
            <input
              className="input"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="e.g. attendance_clerk"
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
