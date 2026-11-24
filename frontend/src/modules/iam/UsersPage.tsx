import { useEffect, useState, useMemo, FormEvent } from "react";
import { UserCheck, Search, Shield, Plus, X, Check, Users, Building, AlertCircle, Code, Eye, Lock } from "lucide-react";
import { api, DirectoryUser, Role, Branch, Permission } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { Field } from "../../components/common/Field";
import { Spinner, LoadingRow } from "../../components/common/Spinner";
import { EmptyState } from "../../components/common/EmptyState";

// Human-friendly functional module groups
const MODULE_GROUPS: Record<string, string> = {
  attendance: "Attendance & Regularization",
  capture: "Punch & Biometric Capture",
  employee: "Employee Management",
  ess: "My Calendar & Self-Service (ESS)",
  iam: "Roles & System Access",
  leave: "Leaves & Holiday Calendars",
  muster: "Muster Roll Reports",
  org: "Organization & Locations",
  overtime: "Overtime & Comp-Off Ledger",
  overtime_record: "Overtime & Comp-Off Ledger",
  policy: "Attendance Policies",
  policy_override: "Policy Scope Overrides",
  privacy: "Privacy & Biometric Consent",
  roster: "Roster & Shift Schedules",
  shift: "Shift Master Templates",
  work_mode: "Work Modes & Remote Approvals",
};

// Human-friendly role capability summaries
const ROLE_CAPABILITIES: Record<string, { summary: string; detail: string }> = {
  TENANT_ADMIN: {
    summary: "77 permissions · full access",
    detail: "Full administrative access to manage all employees, organization structure, policies, shifts, and system permissions.",
  },
  SUPERVISOR: {
    summary: "26 permissions · approves leave, overtime",
    detail: "Approve leave and overtime requests, override shift schedules, view punch streams, and inspect daily rollups.",
  },
  EMPLOYEE: {
    summary: "12 permissions · 6 areas",
    detail: "Request punch corrections and leave, view their calendar and overtime, and apply for work from home.",
  },
};

export function UsersPage() {
  const { can } = useAuth();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Selection & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  // Staged role modifications for the active user in the right drawer
  const [stagedRoleCodes, setStagedRoleCodes] = useState<Set<string>>(new Set());
  const [savingRoles, setSavingRoles] = useState(false);
  const [drawerSuccessMsg, setDrawerSuccessMsg] = useState("");

  // Invite User Modal
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Batch Assign Modal
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchRoleId, setBatchRoleId] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState("");

  // Full Permissions Modal & Simplification Options
  const [isPermsListOpen, setIsPermsListOpen] = useState(false);
  const [showTechnicalCodes, setShowTechnicalCodes] = useState(false);
  const [permSearchQuery, setPermSearchQuery] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [userList, roleList, branchList, permList] = await Promise.all([
        api.users(),
        api.roles(),
        api.branches(),
        api.permissions(),
      ]);
      setUsers(userList);
      setRoles(roleList);
      setBranches(branchList);
      setPermissions(permList);
      if (userList.length > 0 && !activeUserId) {
        setActiveUserId(userList[0].id);
        setStagedRoleCodes(new Set(userList[0].roles || []));
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory users and roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Sync staged roles whenever activeUserId changes
  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) || users[0] || null,
    [users, activeUserId]
  );

  useEffect(() => {
    if (activeUser) {
      setStagedRoleCodes(new Set(activeUser.roles || []));
      setDrawerSuccessMsg("");
    }
  }, [activeUser?.id]);

  // Roles map by code and by id
  const roleByCode = useMemo(() => new Map(roles.map((r) => [r.code.toUpperCase(), r])), [roles]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const permByCode = useMemo(() => new Map(permissions.map((p) => [p.code, p])), [permissions]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    let result = users;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }
    if (selectedRoleFilter !== "ALL") {
      if (selectedRoleFilter === "NO_ROLE") {
        result = result.filter((u) => !u.roles || u.roles.length === 0);
      } else {
        result = result.filter((u) =>
          u.roles && u.roles.some((r) => r.toUpperCase() === selectedRoleFilter)
        );
      }
    }
    return result;
  }, [users, searchQuery, selectedRoleFilter]);

  // Checkbox Selection
  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.has(u.id));

  function handleToggleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selectedUserIds);
      for (const u of filteredUsers) next.delete(u.id);
      setSelectedUserIds(next);
    } else {
      const next = new Set(selectedUserIds);
      for (const u of filteredUsers) next.add(u.id);
      setSelectedUserIds(next);
    }
  }

  function handleToggleSelectUser(userId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelectedUserIds(next);
  }

  // Active Role Staging
  const originalUserRoles = useMemo(
    () => new Set(activeUser?.roles || []),
    [activeUser]
  );

  const hasRoleChanges = useMemo(() => {
    if (!activeUser) return false;
    if (originalUserRoles.size !== stagedRoleCodes.size) return true;
    for (const r of stagedRoleCodes) {
      if (!originalUserRoles.has(r)) return true;
    }
    return false;
  }, [originalUserRoles, stagedRoleCodes, activeUser]);

  function handleAddRole(code: string) {
    const next = new Set(stagedRoleCodes);
    next.add(code.toUpperCase());
    setStagedRoleCodes(next);
  }

  function handleRemoveRole(code: string) {
    const next = new Set(stagedRoleCodes);
    next.delete(code.toUpperCase());
    setStagedRoleCodes(next);
  }

  function handleCancelRoleChanges() {
    if (activeUser) {
      setStagedRoleCodes(new Set(activeUser.roles || []));
    }
  }

  async function handleSaveRoleChanges() {
    if (!activeUser) return;
    setSavingRoles(true);
    setError("");
    setDrawerSuccessMsg("");
    try {
      const rolesToAdd = Array.from(stagedRoleCodes).filter((r) => !originalUserRoles.has(r));
      const rolesToRemove = Array.from(originalUserRoles).filter((r) => !stagedRoleCodes.has(r));

      for (const code of rolesToAdd) {
        const role = roleByCode.get(code);
        if (role) {
          await api.assignRole(activeUser.id, role.id);
        }
      }

      for (const code of rolesToRemove) {
        const role = roleByCode.get(code);
        if (role) {
          await api.unassignRole(activeUser.id, role.id);
        }
      }

      // Update local user state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === activeUser.id ? { ...u, roles: Array.from(stagedRoleCodes) } : u
        )
      );
      setDrawerSuccessMsg("Roles updated successfully.");
      setTimeout(() => setDrawerSuccessMsg(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user roles");
    } finally {
      setSavingRoles(false);
    }
  }

  // Invite User Submit
  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inviteName || !inviteEmail) return;
    setInviteSubmitting(true);
    setInviteError("");
    try {
      const newUser = await api.createUser({
        full_name: inviteName.trim(),
        email: inviteEmail.trim(),
        role_id: inviteRoleId || undefined,
      });
      setUsers((prev) => [newUser, ...prev]);
      setActiveUserId(newUser.id);
      setIsInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRoleId("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setInviteSubmitting(false);
    }
  }

  // Batch Assign Submit
  async function handleBatchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!batchRoleId || selectedUserIds.size === 0) return;
    setBatchSubmitting(true);
    setBatchError("");
    try {
      const targetRole = roleById.get(batchRoleId);
      if (!targetRole) return;

      const userIds = Array.from(selectedUserIds);
      await Promise.all(
        userIds.map((uid) => api.assignRole(uid, batchRoleId).catch(() => null))
      );

      // Refresh list
      const updatedList = await api.users();
      setUsers(updatedList);
      setIsBatchOpen(false);
      setSelectedUserIds(new Set());
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Failed to batch assign role");
    } finally {
      setBatchSubmitting(false);
    }
  }

  // Helper for role badge colors
  function getRoleBadge(roleCode?: string) {
    if (!roleCode) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.25rem 0.65rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "rgba(100, 116, 139, 0.15)",
            color: "var(--text-muted)",
          }}
        >
          No role
        </span>
      );
    }
    const upper = roleCode.toUpperCase();
    if (upper === "TENANT_ADMIN") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.25rem 0.65rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "rgba(99, 102, 241, 0.18)",
            color: "#818cf8",
            border: "1px solid rgba(99, 102, 241, 0.35)",
          }}
        >
          Tenant admin
        </span>
      );
    }
    if (upper === "SUPERVISOR") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.25rem 0.65rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            color: "#fbbf24",
            border: "1px solid rgba(245, 158, 11, 0.35)",
          }}
        >
          Shift supervisor
        </span>
      );
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0.25rem 0.65rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: 600,
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          color: "#34d399",
          border: "1px solid rgba(16, 185, 129, 0.35)",
        }}
      >
        Employee
      </span>
    );
  }

  // Get User Initials
  function getUserInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || "US";
  }

  // Capabilities description based on staged roles
  const effectiveCapabilitiesText = useMemo(() => {
    if (stagedRoleCodes.size === 0) {
      return "No permissions assigned. This user cannot perform actions in the portal.";
    }
    if (stagedRoleCodes.has("TENANT_ADMIN")) {
      return ROLE_CAPABILITIES.TENANT_ADMIN.detail;
    }
    if (stagedRoleCodes.has("SUPERVISOR")) {
      return ROLE_CAPABILITIES.SUPERVISOR.detail;
    }
    return ROLE_CAPABILITIES.EMPLOYEE.detail;
  }, [stagedRoleCodes]);

  return (
    <div style={{ maxWidth: "1380px", margin: "0 auto" }}>
      {/* Top Header */}
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
            Users
          </h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Select a person to see and change the roles they have.
          </p>
        </div>

        {can("iam.assignment.create") ? (
          <Button
            variant="primary"
            onClick={() => setIsInviteOpen(true)}
            style={{
              backgroundColor: "#10b981",
              borderColor: "#10b981",
              color: "#ffffff",
              borderRadius: "0.5rem",
              fontWeight: 600,
              padding: "0.5rem 1.15rem",
            }}
          >
            Invite user
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

      {/* Main Two-Column Container */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 390px",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left Side: Directory Table with Filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Filter Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            {/* Search Input */}
            <div style={{ position: "relative", width: "260px" }}>
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
                placeholder="Search name or email"
                className="input"
                style={{
                  paddingLeft: "2.25rem",
                  fontSize: "0.8125rem",
                  height: "36px",
                  borderRadius: "0.5rem",
                }}
              />
            </div>

            {/* Role Filter Pills */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              {[
                { label: "All roles", value: "ALL" },
                { label: "Employee", value: "EMPLOYEE" },
                { label: "Supervisor", value: "SUPERVISOR" },
                { label: "Tenant admin", value: "TENANT_ADMIN" },
                { label: "No role", value: "NO_ROLE" },
              ].map((pill) => {
                const isActive = selectedRoleFilter === pill.value;
                return (
                  <button
                    key={pill.value}
                    type="button"
                    onClick={() => setSelectedRoleFilter(pill.value)}
                    style={{
                      padding: "0.35rem 0.8rem",
                      borderRadius: "9999px",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      border: isActive
                        ? "1px solid var(--text-primary)"
                        : "1px solid var(--border-default)",
                      backgroundColor: isActive ? "#ffffff" : "var(--bg-surface)",
                      color: isActive ? "#000000" : "var(--text-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>

            {/* Batch Action Button */}
            {selectedUserIds.size > 0 && can("iam.assignment.create") ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBatchOpen(true)}
                style={{
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  borderColor: "var(--border-strong)",
                }}
              >
                Assign role to selected ({selectedUserIds.size})
              </Button>
            ) : null}
          </div>

          {/* Users Table */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
            }}
          >
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <th style={{ width: "42px", padding: "0.75rem 0.75rem 0.75rem 1rem", textAlign: "left" }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAll}
                      style={{ cursor: "pointer", width: "16px", height: "16px" }}
                    />
                  </th>
                  <th style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 650, letterSpacing: "0.05em" }}>
                    NAME
                  </th>
                  <th style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 650, letterSpacing: "0.05em" }}>
                    EMAIL
                  </th>
                  <th style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 650, letterSpacing: "0.05em" }}>
                    ROLE
                  </th>
                  <th style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 650, letterSpacing: "0.05em", width: "90px" }}>
                    STATUS
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRow cols={5} rows={6} />
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                      No users match the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelectedInDrawer = u.id === activeUser?.id;
                    const isChecked = selectedUserIds.has(u.id);
                    return (
                      <tr
                        key={u.id}
                        onClick={() => setActiveUserId(u.id)}
                        style={{
                          cursor: "pointer",
                          backgroundColor: isSelectedInDrawer
                            ? "rgba(16, 185, 129, 0.08)"
                            : "transparent",
                          borderLeft: isSelectedInDrawer
                            ? "3px solid #10b981"
                            : "3px solid transparent",
                          borderBottom: "1px solid var(--border-subtle)",
                          transition: "background-color 0.15s ease",
                        }}
                      >
                        <td
                          style={{ padding: "0.85rem 0.75rem 0.85rem 1rem" }}
                          onClick={(e) => handleToggleSelectUser(u.id, e)}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ cursor: "pointer", width: "16px", height: "16px" }}
                          />
                        </td>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                          {u.full_name}
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontFamily: "var(--font-mono, monospace)" }}>
                          {u.email}
                        </td>
                        <td>
                          {getRoleBadge(u.roles && u.roles[0])}
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "9999px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: u.is_active ? "rgba(16, 185, 129, 0.12)" : "rgba(148, 163, 184, 0.12)",
                              color: u.is_active ? "#10b981" : "var(--text-muted)",
                            }}
                          >
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", paddingLeft: "0.25rem" }}>
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </div>

        {/* Right Side: Role Inspection & Assignment Drawer */}
        {activeUser ? (
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-default)",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            {/* Header: User avatar + info */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(99, 102, 241, 0.15)",
                    color: "#818cf8",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                  }}
                >
                  {getUserInitials(activeUser.full_name)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                    {activeUser.full_name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {activeUser.email}
                  </div>
                </div>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                }}
              >
                Active
              </span>
            </div>

            {drawerSuccessMsg ? (
              <div
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  borderRadius: "0.375rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                }}
              >
                ✓ {drawerSuccessMsg}
              </div>
            ) : null}

            {/* Section 1: CURRENT ROLE */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                CURRENT ROLE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {Array.from(stagedRoleCodes).length === 0 ? (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontStyle: "italic", padding: "0.5rem 0" }}>
                    No roles assigned yet.
                  </div>
                ) : (
                  Array.from(stagedRoleCodes).map((code) => {
                    const role = roleByCode.get(code);
                    const title = role?.name || code;
                    const cap = ROLE_CAPABILITIES[code] || {
                      summary: `${role?.permissions?.length || 0} permissions`,
                      detail: "",
                    };
                    return (
                      <div
                        key={code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 0.875rem",
                          borderRadius: "0.5rem",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 650, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                            {title}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            {cap.summary}
                          </div>
                        </div>

                        {can("iam.assignment.delete") ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveRole(code)}
                            style={{
                              background: "none",
                              border: "1px solid rgba(239, 68, 68, 0.35)",
                              color: "#f87171",
                              borderRadius: "0.375rem",
                              padding: "0.3rem 0.65rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Section 2: ADD ANOTHER ROLE */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                ADD ANOTHER ROLE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {roles
                  .filter((r) => !stagedRoleCodes.has(r.code.toUpperCase()))
                  .map((r) => {
                    const cap = ROLE_CAPABILITIES[r.code.toUpperCase()] || {
                      summary: `${r.permissions.length} permissions`,
                      detail: "",
                    };
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 0.875rem",
                          borderRadius: "0.5rem",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 650, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                            {r.name}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            {cap.summary}
                          </div>
                        </div>

                        {can("iam.assignment.create") ? (
                          <button
                            type="button"
                            onClick={() => handleAddRole(r.code)}
                            style={{
                              background: "none",
                              border: "1px solid var(--border-strong)",
                              color: "var(--text-primary)",
                              borderRadius: "0.375rem",
                              padding: "0.3rem 0.75rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Add
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Section 3: APPLIES TO (Branch Scope) */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                APPLIES TO
              </div>
              <select
                className="select"
                style={{ width: "100%", fontSize: "0.8125rem", padding: "0.5rem 0.75rem", borderRadius: "0.375rem" }}
                disabled={branches.length <= 1}
              >
                <option value="ALL">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Section 4: WHAT THEY CAN DO NOW */}
            <div style={{ paddingTop: "0.25rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                WHAT THEY CAN DO NOW
              </div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                {effectiveCapabilitiesText}
              </p>
              <button
                type="button"
                onClick={() => setIsPermsListOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#10b981",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                See full list
              </button>
            </div>

            {/* Action Bar (Cancel / Save) */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "0.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <Button
                variant="ghost"
                onClick={handleCancelRoleChanges}
                disabled={!hasRoleChanges || savingRoles}
                style={{ borderRadius: "0.5rem", fontSize: "0.875rem" }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveRoleChanges}
                loading={savingRoles}
                disabled={!hasRoleChanges}
                style={{
                  backgroundColor: "#10b981",
                  borderColor: "#10b981",
                  color: "#ffffff",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  padding: "0.45rem 1.25rem",
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Invite User Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New User"
        description="Provision portal login access for a new workforce member or manager."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleInviteSubmit}
              loading={inviteSubmitting}
              disabled={!inviteName || !inviteEmail}
              style={{ backgroundColor: "#10b981", borderColor: "#10b981", color: "#ffffff" }}
            >
              Send Invite
            </Button>
          </>
        }
      >
        <form onSubmit={handleInviteSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {inviteError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {inviteError}
            </div>
          ) : null}

          <Field label="Full Name" required help="e.g. Ramesh Kumar, John Doe">
            <input
              className="input"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Anand Sharma"
              required
            />
          </Field>

          <Field label="Email Address" required help="Login email used for portal authentication">
            <input
              type="email"
              className="input"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="e.g. anand@northmill.example"
              required
            />
          </Field>

          <Field label="Initial Role" help="Default access role assigned upon first login">
            <select
              className="select"
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
            >
              <option value="">No role (Assign later)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>

      {/* Batch Assign Role Modal */}
      <Modal
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        title="Batch Assign Role"
        description={`Assign a role to ${selectedUserIds.size} selected users at once.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsBatchOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleBatchSubmit}
              loading={batchSubmitting}
              disabled={!batchRoleId}
              style={{ backgroundColor: "#10b981", borderColor: "#10b981", color: "#ffffff" }}
            >
              Assign Role ({selectedUserIds.size})
            </Button>
          </>
        }
      >
        <form onSubmit={handleBatchSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {batchError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {batchError}
            </div>
          ) : null}

          <Field label="Role to Assign" required help="Select the role to grant to all checked users">
            <select
              className="select"
              value={batchRoleId}
              onChange={(e) => setBatchRoleId(e.target.value)}
              required
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>

      {/* Full Permissions Breakdown Modal */}
      <Modal
        isOpen={isPermsListOpen}
        onClose={() => setIsPermsListOpen(false)}
        title={`${activeUser?.full_name} — Permissions & Capabilities`}
        description={`Plain-English breakdown of actions authorized by assigned roles: ${Array.from(stagedRoleCodes).join(", ") || "None"}`}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={showTechnicalCodes}
                onChange={(e) => setShowTechnicalCodes(e.target.checked)}
                style={{ cursor: "pointer", width: "15px", height: "15px" }}
              />
              <span>Show technical permission codes</span>
            </label>
            <Button variant="secondary" onClick={() => setIsPermsListOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Capability Search Input */}
          <div style={{ position: "relative" }}>
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
              value={permSearchQuery}
              onChange={(e) => setPermSearchQuery(e.target.value)}
              placeholder="Search capabilities (e.g. leave, punch, calendar, overtime)..."
              className="input"
              style={{
                paddingLeft: "2.25rem",
                fontSize: "0.8125rem",
                height: "36px",
                borderRadius: "0.5rem",
                width: "100%",
              }}
            />
          </div>

          <div
            style={{
              maxHeight: "440px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              paddingRight: "0.25rem",
            }}
          >
            {Array.from(stagedRoleCodes).length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                No roles assigned to this user.
              </div>
            ) : (
              Array.from(stagedRoleCodes).map((roleCode) => {
                const role = roleByCode.get(roleCode);
                const roleName = role?.name || roleCode;
                const rawPermCodes = role?.permissions || [];

                // Deduplicate and resolve permissions
                const seenDescriptions = new Set<string>();
                const resolvedPerms: { code: string; title: string; module: string }[] = [];

                for (const pCode of rawPermCodes) {
                  const permObj = permByCode.get(pCode);
                  const rawDesc = permObj?.description || pCode;
                  const cleanDesc = rawDesc.replace(/\s*\(dot alias\)/i, "").trim();
                  const normalizedKey = cleanDesc.toLowerCase();

                  if (seenDescriptions.has(normalizedKey)) continue;
                  seenDescriptions.add(normalizedKey);

                  const modKey = permObj?.module || pCode.split(/[.:]/)[0] || "other";
                  resolvedPerms.push({
                    code: pCode,
                    title: cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1),
                    module: modKey.toLowerCase(),
                  });
                }

                // Filter by search query
                const q = permSearchQuery.trim().toLowerCase();
                const filtered = q
                  ? resolvedPerms.filter(
                      (p) =>
                        p.title.toLowerCase().includes(q) ||
                        p.code.toLowerCase().includes(q) ||
                        (MODULE_GROUPS[p.module] || "").toLowerCase().includes(q)
                    )
                  : resolvedPerms;

                // Group by functional module area
                const grouped = new Map<string, typeof filtered>();
                for (const p of filtered) {
                  const areaTitle = MODULE_GROUPS[p.module] || "Other Capabilities";
                  const existing = grouped.get(areaTitle) || [];
                  existing.push(p);
                  grouped.set(areaTitle, existing);
                }

                return (
                  <div
                    key={roleCode}
                    style={{
                      borderRadius: "0.625rem",
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-default)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Role Header */}
                    <div
                      style={{
                        padding: "0.75rem 1rem",
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        borderBottom: "1px solid var(--border-subtle)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                        {roleName}
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.55rem",
                          borderRadius: "9999px",
                          backgroundColor: "rgba(16, 185, 129, 0.12)",
                          color: "#10b981",
                        }}
                      >
                        {resolvedPerms.length} capabilities
                      </span>
                    </div>

                    {/* Grouped Capabilities */}
                    <div style={{ padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {grouped.size === 0 ? (
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                          No capabilities match "{permSearchQuery}".
                        </div>
                      ) : (
                        Array.from(grouped.entries()).map(([areaTitle, areaPerms]) => (
                          <div key={areaTitle}>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: "var(--text-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: "0.45rem",
                              }}
                            >
                              {areaTitle}
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                                gap: "0.45rem",
                              }}
                            >
                              {areaPerms.map((p) => (
                                <div
                                  key={p.code}
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "0.5rem",
                                    padding: "0.45rem 0.65rem",
                                    borderRadius: "0.375rem",
                                    backgroundColor: "var(--bg-surface)",
                                    border: "1px solid var(--border-subtle)",
                                  }}
                                >
                                  <Check
                                    size={14}
                                    style={{ color: "#10b981", marginTop: "2px", flexShrink: 0 }}
                                  />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                      style={{
                                        fontSize: "0.8125rem",
                                        fontWeight: 600,
                                        color: "var(--text-primary)",
                                        lineHeight: 1.35,
                                      }}
                                    >
                                      {p.title}
                                    </div>
                                    {showTechnicalCodes ? (
                                      <code
                                        style={{
                                          display: "block",
                                          fontSize: "0.6875rem",
                                          color: "var(--text-muted)",
                                          marginTop: "2px",
                                          fontFamily: "var(--font-mono, monospace)",
                                        }}
                                      >
                                        {p.code}
                                      </code>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
