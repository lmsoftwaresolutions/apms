import { useEffect, useState, useMemo, FormEvent } from "react";
import { UserCheck, Search, Shield, Plus, X, Check, Users, Building, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { api, DirectoryUser, Role, Permission } from "../../api";
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
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Selection & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Staged role modifications for the active user in the right drawer
  const [stagedRoleCodes, setStagedRoleCodes] = useState<Set<string>>(new Set());
  const [savingRoles, setSavingRoles] = useState(false);
  const [drawerSuccessMsg, setDrawerSuccessMsg] = useState("");
  const [drawerErrorMsg, setDrawerErrorMsg] = useState("");

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

  // Full Permissions Modal
  const [isPermsListOpen, setIsPermsListOpen] = useState(false);
  const [permSearchQuery, setPermSearchQuery] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [userList, roleList, permList] = await Promise.all([
        api.users(),
        api.roles(),
        api.permissions(),
      ]);
      setUsers(userList);
      setRoles(roleList);
      setPermissions(permList);
      if (userList.length > 0 && !activeUserId) {
        setActiveUserId(userList[0].id);
        setStagedRoleCodes(new Set((userList[0].roles || []).map((r) => r.toUpperCase())));
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
      setStagedRoleCodes(new Set((activeUser.roles || []).map((r) => r.toUpperCase())));
      setDrawerSuccessMsg("");
      setDrawerErrorMsg("");
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

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRoleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedUsers = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, validCurrentPage, pageSize]);

  // Checkbox Selection for the current page
  const allPageSelected =
    paginatedUsers.length > 0 &&
    paginatedUsers.every((u) => selectedUserIds.has(u.id));

  function handleToggleSelectAll() {
    const next = new Set(selectedUserIds);
    if (allPageSelected) {
      for (const u of paginatedUsers) next.delete(u.id);
    } else {
      for (const u of paginatedUsers) next.add(u.id);
    }
    setSelectedUserIds(next);
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
    () => new Set((activeUser?.roles || []).map((r) => r.toUpperCase())),
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
    setDrawerSuccessMsg("");
    setDrawerErrorMsg("");
  }

  function handleRemoveRole(code: string) {
    const next = new Set(stagedRoleCodes);
    next.delete(code.toUpperCase());
    setStagedRoleCodes(next);
    setDrawerSuccessMsg("");
    setDrawerErrorMsg("");
  }

  function handleCancelRoleChanges() {
    if (activeUser) {
      setStagedRoleCodes(new Set((activeUser.roles || []).map((r) => r.toUpperCase())));
      setDrawerSuccessMsg("");
      setDrawerErrorMsg("");
    }
  }

  async function handleSaveRoleChanges() {
    if (!activeUser) return;
    setSavingRoles(true);
    setDrawerErrorMsg("");
    setDrawerSuccessMsg("");
    try {
      const rolesToAdd = Array.from(stagedRoleCodes).filter((r) => !originalUserRoles.has(r));
      const rolesToRemove = Array.from(originalUserRoles).filter((r) => !stagedRoleCodes.has(r));

      for (const code of rolesToAdd) {
        const role = roleByCode.get(code);
        if (role) {
          try {
            await api.assignRole(activeUser.id, role.id);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.toLowerCase().includes("already assigned")) {
              throw err;
            }
          }
        }
      }

      for (const code of rolesToRemove) {
        const role = roleByCode.get(code);
        if (role) {
          try {
            await api.unassignRole(activeUser.id, role.id);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.toLowerCase().includes("not found")) {
              throw err;
            }
          }
        }
      }

      // Re-fetch authoritative users from API to guarantee backend sync
      const updatedList = await api.users();
      setUsers(updatedList);
      const updatedUser = updatedList.find((u) => u.id === activeUser.id);
      if (updatedUser) {
        setStagedRoleCodes(new Set((updatedUser.roles || []).map((r) => r.toUpperCase())));
      }

      setDrawerSuccessMsg("Roles updated successfully.");
      setTimeout(() => setDrawerSuccessMsg(""), 3500);
    } catch (err) {
      setDrawerErrorMsg(err instanceof Error ? err.message : "Failed to update user roles");
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
    if (upper === "EMPLOYEE") {
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
    const customRole = roleByCode.get(upper);
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0.25rem 0.65rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: 600,
          backgroundColor: "rgba(147, 51, 234, 0.15)",
          color: "#c084fc",
          border: "1px solid rgba(147, 51, 234, 0.35)",
        }}
      >
        {customRole?.name || roleCode}
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
      <div className="users-page-grid">
        {/* Left Side: Directory Table with Filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
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
            <div style={{ position: "relative", minWidth: "220px", flex: "1 1 220px", maxWidth: "340px" }}>
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
                  width: "100%",
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
          <div className="table-container-responsive">
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <th style={{ width: "42px", padding: "0.75rem 0.75rem 0.75rem 1rem", textAlign: "left" }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
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
                ) : paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                      No users match the search criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => {
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
                          {!u.roles || u.roles.length === 0 ? (
                            getRoleBadge(undefined)
                          ) : (
                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                              {u.roles.map((rCode) => (
                                <span key={rCode}>{getRoleBadge(rCode)}</span>
                              ))}
                            </div>
                          )}
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

          {/* Pagination Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
              padding: "0.25rem 0.25rem 0.5rem",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
            }}
          >
            <div>
              {filteredUsers.length === 0 ? (
                "0 users"
              ) : (
                <>
                  Showing{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {(validCurrentPage - 1) * pageSize + 1}
                  </strong>{" "}
                  to{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {Math.min(validCurrentPage * pageSize, filteredUsers.length)}
                  </strong>{" "}
                  of{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {filteredUsers.length}
                  </strong>{" "}
                  users
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {/* Rows per page selector */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="input"
                  style={{
                    height: "30px",
                    padding: "0.15rem 0.5rem",
                    fontSize: "0.75rem",
                    borderRadius: "0.375rem",
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Prev / Page numbers / Next */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage <= 1}
                  title="Previous page"
                  aria-label="Previous page"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    color: validCurrentPage <= 1 ? "var(--text-muted)" : "var(--text-primary)",
                    cursor: validCurrentPage <= 1 ? "not-allowed" : "pointer",
                    opacity: validCurrentPage <= 1 ? 0.4 : 1,
                  }}
                >
                  <ChevronLeft size={15} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (p === 1 || p === totalPages) return true;
                    return Math.abs(p - validCurrentPage) <= 1;
                  })
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                      acc.push("...");
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    typeof item === "string" ? (
                      <span key={`dots-${idx}`} style={{ padding: "0 0.25rem", color: "var(--text-muted)" }}>
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrentPage(item)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: item === validCurrentPage ? 700 : 500,
                          border: item === validCurrentPage
                            ? "1px solid var(--color-primary-border, #10b981)"
                            : "1px solid var(--border-default)",
                          backgroundColor: item === validCurrentPage
                            ? "var(--color-primary-bg, rgba(16, 185, 129, 0.15))"
                            : "var(--bg-surface)",
                          color: item === validCurrentPage
                            ? "var(--color-primary-fg, #10b981)"
                            : "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage >= totalPages}
                  title="Next page"
                  aria-label="Next page"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    color: validCurrentPage >= totalPages ? "var(--text-muted)" : "var(--text-primary)",
                    cursor: validCurrentPage >= totalPages ? "not-allowed" : "pointer",
                    opacity: validCurrentPage >= totalPages ? 0.4 : 1,
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Role Inspection & Assignment Drawer */}
        {activeUser ? (
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-default)",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              position: "sticky",
              top: "1rem",
            }}
          >
            {/* Header: User avatar + info */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(99, 102, 241, 0.15)",
                    color: "#818cf8",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: "0.8125rem",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    flexShrink: 0,
                  }}
                >
                  {getUserInitials(activeUser.full_name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeUser.full_name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeUser.email}
                  </div>
                </div>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "9999px",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  flexShrink: 0,
                }}
              >
                Active
              </span>
            </div>

            {drawerSuccessMsg ? (
              <div
                style={{
                  padding: "0.4rem 0.65rem",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                ✓ {drawerSuccessMsg}
              </div>
            ) : null}

            {/* Section 1: CURRENT ROLE */}
            <div>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
                CURRENT ROLE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {Array.from(stagedRoleCodes).length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", padding: "0.25rem 0" }}>
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
                          padding: "0.5rem 0.75rem",
                          borderRadius: "0.375rem",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 650, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                            {title}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "1px" }}>
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
                              borderRadius: "0.25rem",
                              padding: "0.2rem 0.5rem",
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
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
                ADD ANOTHER ROLE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {roles.filter((r) => !stagedRoleCodes.has(r.code.toUpperCase())).length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", padding: "0.25rem 0" }}>
                    All available roles are assigned.
                  </div>
                ) : (
                  roles
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
                            padding: "0.5rem 0.75rem",
                            borderRadius: "0.375rem",
                            backgroundColor: "var(--bg-card)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 650, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                              {r.name}
                            </div>
                            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "1px" }}>
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
                                borderRadius: "0.25rem",
                                padding: "0.2rem 0.6rem",
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
                    })
                )}
              </div>
            </div>

            {hasRoleChanges ? (
              <div
                style={{
                  padding: "0.45rem 0.65rem",
                  backgroundColor: "rgba(245, 158, 11, 0.12)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <AlertCircle size={14} />
                <span>Unsaved changes. Click <strong>Save changes</strong> below.</span>
              </div>
            ) : null}

            {drawerErrorMsg ? (
              <div
                style={{
                  padding: "0.45rem 0.65rem",
                  backgroundColor: "var(--color-danger-bg)",
                  color: "var(--color-danger-fg)",
                  border: "1px solid var(--color-danger-border)",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                }}
              >
                {drawerErrorMsg}
              </div>
            ) : null}

            {/* Action Bar (Cancel / Save) */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                paddingTop: "0.65rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <Button
                variant="ghost"
                onClick={handleCancelRoleChanges}
                disabled={!hasRoleChanges || savingRoles}
                style={{ borderRadius: "0.375rem", fontSize: "0.8125rem", padding: "0.35rem 0.85rem" }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveRoleChanges}
                loading={savingRoles}
                disabled={!hasRoleChanges || savingRoles}
                style={{
                  backgroundColor: hasRoleChanges ? "#10b981" : "var(--bg-card)",
                  borderColor: hasRoleChanges ? "#10b981" : "var(--border-strong)",
                  color: hasRoleChanges ? "#ffffff" : "var(--text-muted)",
                  borderRadius: "0.375rem",
                  fontWeight: 650,
                  fontSize: "0.8125rem",
                  padding: "0.35rem 1rem",
                  boxShadow: hasRoleChanges ? "0 0 10px rgba(16, 185, 129, 0.3)" : "none",
                  cursor: hasRoleChanges ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                }}
              >
                {hasRoleChanges ? "Save changes" : "Save"}
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
          <Button variant="secondary" onClick={() => setIsPermsListOpen(false)}>
            Close
          </Button>
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
