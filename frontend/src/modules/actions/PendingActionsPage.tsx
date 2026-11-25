import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  api,
  Branch,
  Department,
  Designation,
  PendingAction,
  PendingActionCount,
} from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";
import { Spinner } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";

type TabFilter = "PENDING" | "OVERDUE" | "DUE_SOON" | "ALL";

export function PendingActionsPage() {
  const { can } = useAuth();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [counts, setCounts] = useState<PendingActionCount>({ pending: 0, overdue: 0, due_soon: 0 });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [tabFilter, setTabFilter] = useState<TabFilter>("PENDING");
  const [search, setSearch] = useState("");

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<PendingAction | null>(null);
  const [confirmDeptId, setConfirmDeptId] = useState("");
  const [confirmDesigId, setConfirmDesigId] = useState("");
  const [confirmType, setConfirmType] = useState("FULL_TIME");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Extend Modal state
  const [extendTarget, setExtendTarget] = useState<PendingAction | null>(null);
  const [extendEndDate, setExtendEndDate] = useState("");
  const [extendNote, setExtendNote] = useState("");
  const [extendSubmitting, setExtendSubmitting] = useState(false);

  // Dismiss Modal state
  const [dismissTarget, setDismissTarget] = useState<PendingAction | null>(null);
  const [dismissSubmitting, setDismissSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [actionList, countData, branchList, deptList, desigList] = await Promise.all([
        api.pendingActions({ status: tabFilter === "ALL" ? "ALL" : undefined }),
        api.pendingActionsCount(),
        api.branches(),
        api.departments(),
        api.designations(),
      ]);
      setActions(actionList);
      setCounts(countData);
      setBranches(branchList);
      setDepartments(deptList);
      setDesignations(desigList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending actions");
    } finally {
      setLoading(false);
    }
  }

  async function handleScanAndRefresh() {
    setRefreshing(true);
    try {
      await api.scanPendingActions();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan actions");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFilter]);

  // Lookup maps
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const desigById = useMemo(() => new Map(designations.map((des) => [des.id, des])), [designations]);

  // Client filtering
  const filteredActions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return actions.filter((act) => {
      // Search
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchTitle = act.title.toLowerCase().includes(q);
        const matchName = (act.metadata?.full_name || "").toLowerCase().includes(q);
        const matchCode = (act.metadata?.employee_code || "").toLowerCase().includes(q);
        if (!matchTitle && !matchName && !matchCode) return false;
      }
      // Tab filters
      if (tabFilter === "OVERDUE") {
        if (act.status !== "PENDING" || act.due_date >= today) return false;
      } else if (tabFilter === "DUE_SOON") {
        const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (act.status !== "PENDING" || act.due_date < today || act.due_date > soon) return false;
      } else if (tabFilter === "PENDING") {
        if (act.status !== "PENDING") return false;
      }
      return true;
    });
  }, [actions, tabFilter, search]);

  // Open Confirm Modal
  function handleOpenConfirm(act: PendingAction) {
    setConfirmTarget(act);
    setConfirmDeptId(act.metadata?.department_id || "");
    setConfirmDesigId(act.metadata?.designation_id || "");
    setConfirmType("FULL_TIME");
    setConfirmNote("Probation completed successfully. Approved for permanent status.");
  }

  async function handleConfirmSubmit(e: FormEvent) {
    e.preventDefault();
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    try {
      await api.resolvePendingAction(confirmTarget.id, {
        action: "CONFIRM",
        note: confirmNote.trim() || undefined,
        target_employment_type: confirmType,
        target_department_id: confirmDeptId || undefined,
        target_designation_id: confirmDesigId || undefined,
      });
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm employment");
    } finally {
      setConfirmSubmitting(false);
    }
  }

  // Open Extend Modal
  function handleOpenExtend(act: PendingAction) {
    setExtendTarget(act);
    const currDue = act.due_date || new Date().toISOString().slice(0, 10);
    const defaultExtend = new Date(new Date(currDue).getTime() + 44 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    setExtendEndDate(defaultExtend);
    setExtendNote("Extended probation by 44 days for continued evaluation.");
  }

  function handleSetExtendDays(days: number) {
    if (!extendTarget) return;
    const baseDate = new Date(extendTarget.due_date || new Date().toISOString().slice(0, 10));
    const next = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    setExtendEndDate(next.toISOString().slice(0, 10));
  }

  async function handleExtendSubmit(e: FormEvent) {
    e.preventDefault();
    if (!extendTarget || !extendEndDate) return;
    setExtendSubmitting(true);
    try {
      await api.resolvePendingAction(extendTarget.id, {
        action: "EXTEND",
        note: extendNote.trim() || undefined,
        new_end_date: extendEndDate,
      });
      setExtendTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extend probation");
    } finally {
      setExtendSubmitting(false);
    }
  }

  // Handle Dismiss
  async function handleDismissConfirm() {
    if (!dismissTarget) return;
    setDismissSubmitting(true);
    try {
      await api.resolvePendingAction(dismissTarget.id, {
        action: "DISMISS",
        note: "Action dismissed by administrator.",
      });
      setDismissTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss action");
    } finally {
      setDismissSubmitting(false);
    }
  }

  const availableDeptsForBranch = useMemo(() => {
    if (!confirmTarget?.metadata?.branch_id) return departments;
    return departments.filter(
      (d) => d.branch_id === confirmTarget.metadata.branch_id && d.is_active
    );
  }, [departments, confirmTarget]);

  const availableDesigsForDept = useMemo(() => {
    if (!confirmDeptId) return [];
    return designations.filter((des) => des.department_id === confirmDeptId && des.is_active);
  }, [designations, confirmDeptId]);

  return (
    <div>
      {/* Top Header Card */}
      <div
        className="card-header"
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              Action Center & Warnings
            </h2>
            <Badge variant="info" size="sm" style={{ fontWeight: 600 }}>
              {counts.pending} pending
            </Badge>
          </div>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Review probation expiries, department conversions, and time-sensitive organizational alerts.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={15} className={refreshing ? "spin" : ""} />}
            onClick={handleScanAndRefresh}
            disabled={refreshing}
            title="Scan for overdue milestones and probation expiries"
          >
            {refreshing ? "Scanning..." : "Scan & Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        {/* Total Pending */}
        <div
          onClick={() => setTabFilter("PENDING")}
          style={{
            backgroundColor: "var(--bg-surface)",
            border: `1px solid ${tabFilter === "PENDING" ? "var(--color-primary)" : "var(--border-default)"}`,
            borderRadius: "0.625rem",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 550, textTransform: "uppercase" }}>
              Total Pending
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.2rem" }}>
              {counts.pending}
            </div>
          </div>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: "var(--color-primary-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
            }}
          >
            <Clock size={20} />
          </div>
        </div>

        {/* Overdue Warnings */}
        <div
          onClick={() => setTabFilter("OVERDUE")}
          style={{
            backgroundColor: "var(--bg-surface)",
            border: `1px solid ${tabFilter === "OVERDUE" ? "var(--color-danger)" : "var(--border-default)"}`,
            borderRadius: "0.625rem",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-danger-fg)", fontWeight: 550, textTransform: "uppercase" }}>
              Overdue Review
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--color-danger-fg)", marginTop: "0.2rem" }}>
              {counts.overdue}
            </div>
          </div>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: "var(--color-danger-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-danger)",
            }}
          >
            <AlertTriangle size={20} />
          </div>
        </div>

        {/* Due Soon (Next 7 days) */}
        <div
          onClick={() => setTabFilter("DUE_SOON")}
          style={{
            backgroundColor: "var(--bg-surface)",
            border: `1px solid ${tabFilter === "DUE_SOON" ? "var(--color-warning)" : "var(--border-default)"}`,
            borderRadius: "0.625rem",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-warning-fg)", fontWeight: 550, textTransform: "uppercase" }}>
              Due In 7 Days
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--color-warning-fg)", marginTop: "0.2rem" }}>
              {counts.due_soon}
            </div>
          </div>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: "rgba(234, 179, 8, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-warning)",
            }}
          >
            <Bell size={20} />
          </div>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-danger-bg)",
            color: "var(--color-danger-fg)",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Filter Toolbar */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "0.625rem",
          padding: "0.75rem 1rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={`btn-filter ${tabFilter === "PENDING" ? "active" : ""}`}
            onClick={() => setTabFilter("PENDING")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              fontWeight: 550,
              border: "1px solid",
              borderColor: tabFilter === "PENDING" ? "var(--color-primary)" : "var(--border-default)",
              backgroundColor: tabFilter === "PENDING" ? "var(--color-primary-bg)" : "transparent",
              color: tabFilter === "PENDING" ? "var(--color-primary)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Pending ({counts.pending})
          </button>
          <button
            type="button"
            className={`btn-filter ${tabFilter === "OVERDUE" ? "active" : ""}`}
            onClick={() => setTabFilter("OVERDUE")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              fontWeight: 550,
              border: "1px solid",
              borderColor: tabFilter === "OVERDUE" ? "var(--color-danger)" : "var(--border-default)",
              backgroundColor: tabFilter === "OVERDUE" ? "var(--color-danger-bg)" : "transparent",
              color: tabFilter === "OVERDUE" ? "var(--color-danger-fg)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Overdue ({counts.overdue})
          </button>
          <button
            type="button"
            className={`btn-filter ${tabFilter === "DUE_SOON" ? "active" : ""}`}
            onClick={() => setTabFilter("DUE_SOON")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              fontWeight: 550,
              border: "1px solid",
              borderColor: tabFilter === "DUE_SOON" ? "var(--color-warning)" : "var(--border-default)",
              backgroundColor: tabFilter === "DUE_SOON" ? "rgba(234, 179, 8, 0.1)" : "transparent",
              color: tabFilter === "DUE_SOON" ? "var(--color-warning-fg)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Due Soon ({counts.due_soon})
          </button>
          <button
            type="button"
            className={`btn-filter ${tabFilter === "ALL" ? "active" : ""}`}
            onClick={() => setTabFilter("ALL")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              fontWeight: 550,
              border: "1px solid",
              borderColor: tabFilter === "ALL" ? "var(--border-strong)" : "var(--border-default)",
              backgroundColor: tabFilter === "ALL" ? "var(--bg-subtle)" : "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            All History
          </button>
        </div>

        {/* Live Search */}
        <div style={{ position: "relative", minWidth: "220px", maxWidth: "320px", flex: 1 }}>
          <Search
            size={14}
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
            className="input"
            placeholder="Search by worker name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.25rem", height: "34px", fontSize: "0.8125rem" }}
          />
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <Spinner />
        </div>
      ) : filteredActions.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={32} color="var(--color-success)" />}
          title={
            tabFilter === "OVERDUE"
              ? "No overdue actions"
              : tabFilter === "DUE_SOON"
                ? "No reviews due in the next 7 days"
                : "All clear — no pending actions"
          }
          description="All probation periods and milestones are up to date. You will be alerted here when an employee's probation approaches expiration."
          action={{
            label: "Scan Now",
            onClick: handleScanAndRefresh,
            icon: <RefreshCw size={15} />,
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {filteredActions.map((act) => {
            const isOverdue = act.days_remaining !== null && act.days_remaining < 0;
            const isDueToday = act.days_remaining === 0;
            const empName = act.metadata?.full_name || "Employee";
            const empCode = act.metadata?.employee_code || "—";
            const branchName = branchById.get(act.metadata?.branch_id || "")?.name || "Main Gate";
            const deptName = deptById.get(act.metadata?.department_id || "")?.name || "Unassigned Dept";
            const desigName = desigById.get(act.metadata?.designation_id || "")?.name || "Staff";

            return (
              <div
                key={act.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: `1px solid ${
                    isOverdue
                      ? "var(--color-danger-border)"
                      : act.status === "PENDING"
                        ? "var(--border-default)"
                        : "var(--border-subtle)"
                  }`,
                  borderLeft: `4px solid ${
                    isOverdue
                      ? "var(--color-danger)"
                      : act.status === "RESOLVED"
                        ? "var(--color-success)"
                        : "var(--color-warning)"
                  }`,
                  borderRadius: "0.5rem",
                  padding: "1rem 1.25rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                {/* Details Left */}
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flex: 1, minWidth: "280px" }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      backgroundColor: isOverdue ? "var(--color-danger-bg)" : "var(--color-primary-bg)",
                      color: isOverdue ? "var(--color-danger-fg)" : "var(--color-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      flexShrink: 0,
                    }}
                  >
                    {empName
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 650, fontSize: "0.9375rem" }}>{empName}</span>
                      <code style={{ fontSize: "0.75rem", padding: "0.1rem 0.35rem", backgroundColor: "var(--bg-subtle)", borderRadius: "0.25rem" }}>
                        {empCode}
                      </code>
                      {isOverdue && act.status === "PENDING" ? (
                        <Badge variant="danger" size="sm">
                          Overdue by {Math.abs(act.days_remaining!)} days
                        </Badge>
                      ) : isDueToday && act.status === "PENDING" ? (
                        <Badge variant="warning" size="sm">
                          Due Today
                        </Badge>
                      ) : act.status === "PENDING" ? (
                        <Badge variant="warning" size="sm">
                          Due in {act.days_remaining} days
                        </Badge>
                      ) : (
                        <Badge variant={act.status === "RESOLVED" ? "success" : "neutral"} size="sm">
                          {act.status}
                        </Badge>
                      )}
                    </div>

                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      <strong>{deptName}</strong> • {branchName} • {desigName}
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      Probation Target Date: <strong>{act.due_date}</strong>
                      {act.metadata?.date_of_joining ? ` (Joined: ${act.metadata.date_of_joining})` : ""}
                    </div>

                    {act.resolution ? (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          padding: "0.4rem 0.6rem",
                          backgroundColor: "var(--bg-subtle)",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <strong>Resolution:</strong> {act.resolution.action} — {act.resolution.note || "No note recorded."}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Action Buttons Right */}
                {act.status === "PENDING" && can("pending_action:update") ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<UserCheck size={14} />}
                      onClick={() => handleOpenConfirm(act)}
                    >
                      Confirm Employment
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Clock size={14} />}
                      onClick={() => handleOpenExtend(act)}
                    >
                      Extend
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<XCircle size={14} />}
                      onClick={() => setDismissTarget(act)}
                      title="Dismiss warning"
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Employment Modal */}
      {confirmTarget ? (
        <Modal
          isOpen={Boolean(confirmTarget)}
          onClose={() => setConfirmTarget(null)}
          title={`Confirm Employment: ${confirmTarget.metadata?.full_name}`}
          description="Graduate employee from Probation to Permanent status. You can confirm or change their department placement upon graduation."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmTarget(null)} disabled={confirmSubmitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={(e) => handleConfirmSubmit(e as unknown as FormEvent)}
                loading={confirmSubmitting}
                icon={<UserCheck size={15} />}
              >
                Approve & Confirm
              </Button>
            </>
          }
        >
          <form onSubmit={handleConfirmSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--color-primary-bg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                color: "var(--color-primary)",
              }}
            >
              Confirming permanent employment will update worker status, set confirmation date to today, and resolve this action.
            </div>

            <Field label="Target Employment Type" required help="Status upon successful probation completion">
              <select
                className="select"
                value={confirmType}
                onChange={(e) => setConfirmType(e.target.value)}
                required
              >
                <option value="FULL_TIME">Full Time (Standard Permanent)</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
            </Field>

            <Field label="Confirmed Department Placement" help="Select target department to transition worker into">
              <select
                className="select"
                value={confirmDeptId}
                onChange={(e) => {
                  setConfirmDeptId(e.target.value);
                  setConfirmDesigId("");
                }}
              >
                <option value="">Keep Current Placement</option>
                {availableDeptsForBranch.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </Field>

            {confirmDeptId && availableDesigsForDept.length > 0 ? (
              <Field label="Confirmed Designation" help="Select designation under confirmed department">
                <select
                  className="select"
                  value={confirmDesigId}
                  onChange={(e) => setConfirmDesigId(e.target.value)}
                >
                  <option value="">Keep Current Designation</option>
                  {availableDesigsForDept.map((des) => (
                    <option key={des.id} value={des.id}>
                      {des.name} ({des.code})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Approval Notes" help="HR / Management remarks recorded in audit trail">
              <textarea
                className="input"
                rows={3}
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="e.g. Completed 44-day probation successfully with positive evaluation."
              />
            </Field>
          </form>
        </Modal>
      ) : null}

      {/* Extend Probation Modal */}
      {extendTarget ? (
        <Modal
          isOpen={Boolean(extendTarget)}
          onClose={() => setExtendTarget(null)}
          title={`Extend Probation: ${extendTarget.metadata?.full_name}`}
          description={`Current probation ends on ${extendTarget.due_date}. Select extension duration and provide reason.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setExtendTarget(null)} disabled={extendSubmitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={(e) => handleExtendSubmit(e as unknown as FormEvent)}
                loading={extendSubmitting}
                icon={<Clock size={15} />}
              >
                Confirm Extension
              </Button>
            </>
          }
        >
          <form onSubmit={handleExtendSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Field label="New Probation End Date" required help="Select new expiration date">
              <input
                type="date"
                className="input"
                value={extendEndDate}
                onChange={(e) => setExtendEndDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>

            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                Extension Presets (from current end date):
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {[30, 44, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSetExtendDays(d)}
                    style={{
                      padding: "0.25rem 0.6rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.75rem",
                      border: "1px solid var(--border-default)",
                      backgroundColor: "var(--bg-subtle)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    +{d} days
                  </button>
                ))}
              </div>
            </div>

            <Field label="Extension Reason" required help="Mandatory justification for extending probation">
              <textarea
                className="input"
                rows={3}
                value={extendNote}
                onChange={(e) => setExtendNote(e.target.value)}
                placeholder="e.g. Additional training required for production equipment certification."
                required
              />
            </Field>
          </form>
        </Modal>
      ) : null}

      {/* Dismiss Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(dismissTarget)}
        onClose={() => setDismissTarget(null)}
        onConfirm={handleDismissConfirm}
        title="Dismiss Pending Action"
        message={
          <>
            Are you sure you want to dismiss the probation warning for{" "}
            <strong>{dismissTarget?.metadata?.full_name}</strong>? This action will be marked as dismissed without
            altering the employee&apos;s record.
          </>
        }
        confirmText="Dismiss Action"
        loading={dismissSubmitting}
      />
    </div>
  );
}
