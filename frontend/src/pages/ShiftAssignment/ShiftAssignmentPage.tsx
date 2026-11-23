import React, { useEffect, useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  UserCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Users,
  Building2,
  Briefcase,
  ChevronRight,
  Info,
  CalendarCheck,
  Layers,
  ArrowRight,
  UserCog,
} from "lucide-react";
import {
  api,
  Branch,
  Department,
  Employee,
  ShiftTemplate,
  DatedShiftInstance,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import {
  Badge,
  Modal,
  EmptyState,
  SkeletonTable,
  Alert,
} from "../../components/common/UIComponents";

export function ShiftAssignmentPage() {
  const { can } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [instances, setInstances] = useState<DatedShiftInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterDeptId, setFilterDeptId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ASSIGNED" | "UNASSIGNED">("ALL");
  const [filterShiftId, setFilterShiftId] = useState("");

  // Selection for bulk assignment
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  // Modal State for Assign Shift
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetEmployees, setTargetEmployees] = useState<Employee[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [durationDays, setDurationDays] = useState<number>(90);
  const [submitting, setSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Load all initial metadata and current assignments
  async function loadData(showRefreshSpinner = false) {
    if (showRefreshSpinner) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      // Calculate 90-day horizon for instance lookups
      const start = new Date().toISOString().slice(0, 10);
      const horizonDate = new Date();
      horizonDate.setDate(horizonDate.getDate() + 90);
      const end = horizonDate.toISOString().slice(0, 10);

      const [b, d, tpls, emps, insts] = await Promise.all([
        api.branches(),
        api.departments(),
        api.shiftTemplates(true),
        api.employees({ is_active: true }),
        api.rosterInstances({ start_date: start, end_date: end }),
      ]);

      setBranches(b);
      setDepartments(d);
      setShiftTemplates(tpls);
      setEmployees(emps);
      setInstances(insts);

      if (tpls.length > 0 && !selectedShiftId) {
        setSelectedShiftId(tpls[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load shift assignment data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Map employee current assignments
  const employeeAssignmentMap = useMemo(() => {
    const map = new Map<
      string,
      {
        todayInstance?: DatedShiftInstance;
        todayShift?: ShiftTemplate;
        isRestDay: boolean;
        validUntil?: string;
        upcomingDaysCount: number;
      }
    >();

    const templateMap = new Map<string, ShiftTemplate>(
      shiftTemplates.map((s) => [s.id, s])
    );

    // Group instances by employee
    const byEmp = new Map<string, DatedShiftInstance[]>();
    for (const inst of instances) {
      const list = byEmp.get(inst.employee_id) || [];
      list.push(inst);
      byEmp.set(inst.employee_id, list);
    }

    for (const emp of employees) {
      const empInsts = byEmp.get(emp.id) || [];
      const todayInst = empInsts.find((i) => i.calendar_date === todayStr);

      let todayShift: ShiftTemplate | undefined;
      let isRestDay = false;

      if (todayInst) {
        isRestDay = todayInst.is_rest_day;
        if (todayInst.shift_template_id) {
          todayShift = templateMap.get(todayInst.shift_template_id);
        }
      }

      // Find max calendar date as validUntil
      let validUntil: string | undefined;
      if (empInsts.length > 0) {
        const sorted = [...empInsts].sort((a, b) =>
          b.calendar_date.localeCompare(a.calendar_date)
        );
        validUntil = sorted[0].calendar_date;
      }

      map.set(emp.id, {
        todayInstance: todayInst,
        todayShift,
        isRestDay,
        validUntil,
        upcomingDaysCount: empInsts.length,
      });
    }

    return map;
  }, [employees, instances, shiftTemplates, todayStr]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Branch filter
      if (filterBranchId && emp.branch_id !== filterBranchId) return false;

      // Department filter
      if (filterDeptId && emp.department_id !== filterDeptId) return false;

      const info = employeeAssignmentMap.get(emp.id);

      // Status filter
      if (filterStatus === "ASSIGNED") {
        if (!info?.todayInstance || info.isRestDay) return false;
      } else if (filterStatus === "UNASSIGNED") {
        if (info?.todayInstance && !info.isRestDay) return false;
      }

      // Shift template filter
      if (filterShiftId) {
        if (info?.todayInstance?.shift_template_id !== filterShiftId) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (emp.employee_code || "").toLowerCase();
        const name = (emp.full_name || "").toLowerCase();
        const desig = (emp.designation || "").toLowerCase();
        return code.includes(q) || name.includes(q) || desig.includes(q);
      }

      return true;
    });
  }, [
    employees,
    filterBranchId,
    filterDeptId,
    filterStatus,
    filterShiftId,
    searchQuery,
    employeeAssignmentMap,
  ]);

  // KPIs
  const totalEmployees = employees.length;
  const activeAssignedToday = useMemo(() => {
    let count = 0;
    for (const info of employeeAssignmentMap.values()) {
      if (info.todayInstance && !info.isRestDay && info.todayShift) count++;
    }
    return count;
  }, [employeeAssignmentMap]);

  const unassignedToday = totalEmployees - activeAssignedToday;

  // Selected shift template for preview in modal
  const activeShiftPreview = useMemo(() => {
    return shiftTemplates.find((s) => s.id === selectedShiftId);
  }, [shiftTemplates, selectedShiftId]);

  // Calculated End Date for Modal Preview
  const calculatedEndDate = useMemo(() => {
    if (!startDate) return "";
    const d = new Date(startDate);
    d.setDate(d.getDate() + durationDays - 1);
    return d.toISOString().slice(0, 10);
  }, [startDate, durationDays]);

  // Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmpIds(filteredEmployees.map((e) => e.id));
    } else {
      setSelectedEmpIds([]);
    }
  };

  const handleToggleSelect = (empId: string) => {
    setSelectedEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleOpenAssignForOne = (emp: Employee) => {
    setTargetEmployees([emp]);
    setIsAssignModalOpen(true);
    setSuccessBanner(null);
  };

  const handleOpenAssignBulk = () => {
    const targets = employees.filter((e) => selectedEmpIds.includes(e.id));
    if (targets.length === 0) return;
    setTargetEmployees(targets);
    setIsAssignModalOpen(true);
    setSuccessBanner(null);
  };

  const handleAssignAllInDept = () => {
    if (!filterDeptId) return;
    const deptEmps = employees.filter((e) => e.department_id === filterDeptId);
    if (deptEmps.length === 0) return;
    setTargetEmployees(deptEmps);
    setIsAssignModalOpen(true);
    setSuccessBanner(null);
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId || targetEmployees.length === 0) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await api.materializeRoster({
        employee_ids: targetEmployees.map((e) => e.id),
        start_date: startDate,
        days: durationDays,
        shift_template_id: selectedShiftId,
        roster_pattern_id: null,
      });

      setSuccessBanner(
        `Successfully assigned shift "${activeShiftPreview?.name || "Shift"}" to ${
          res.employees_count
        } employee(s), creating ${res.total_materialized} shift instances from ${
          res.start_date
        } to ${res.end_date}.`
      );

      // Reload assignments
      await loadData(true);
      setSelectedEmpIds([]);
      setIsAssignModalOpen(false);
    } catch (err: any) {
      setError(err?.message || "Failed to materialize shift assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper lookups
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  return (
    <div className="page-content" style={{ padding: "1.5rem" }}>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Fixed Shift Assignment
            </h1>
            <Badge variant="info">Standard / Office Shifts</Badge>
          </div>
          <p className="page-subtitle" style={{ margin: "0.3rem 0 0" }}>
            Assign long-term fixed shifts to standard office and factory employees without manual day-by-day scheduling.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            className="ghost"
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            title="Refresh shift assignments"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            <span>Refresh</span>
          </button>

          {can("roster.instance.create") && (
            <button
              className="primary"
              type="button"
              disabled={selectedEmpIds.length === 0}
              onClick={handleOpenAssignBulk}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <UserCog size={16} />
              <span>
                Assign Shift{" "}
                {selectedEmpIds.length > 0 ? `(${selectedEmpIds.length})` : ""}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Success Alert Banner ── */}
      {successBanner && (
        <Alert variant="success" onDismiss={() => setSuccessBanner(null)}>
          <strong>Shift Assignment Completed:</strong> {successBanner}
        </Alert>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="danger" onDismiss={() => setError("")}>
          <strong>Shift Assignment Error:</strong> {error}
        </Alert>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className="dashboard-kpi-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="kpi-card">
          <div className="kpi-label">
            <Users size={14} style={{ marginRight: 6 }} /> Total Employees
          </div>
          <div className="kpi-value">{totalEmployees}</div>
          <div className="kpi-sub">Active tenant workforce</div>
        </div>

        <div className="kpi-card kpi-success">
          <div className="kpi-label">
            <CheckCircle2 size={14} style={{ marginRight: 6 }} /> Active Shift Assigned
          </div>
          <div className="kpi-value">{activeAssignedToday}</div>
          <div className="kpi-sub">
            {totalEmployees > 0
              ? `${Math.round((activeAssignedToday / totalEmployees) * 100)}% coverage today`
              : "0% coverage"}
          </div>
        </div>

        <div className="kpi-card kpi-warning">
          <div className="kpi-label">
            <AlertCircle size={14} style={{ marginRight: 6 }} /> Unassigned / Need Shift
          </div>
          <div className="kpi-value">{unassignedToday}</div>
          <div className="kpi-sub">Requires shift materialization</div>
        </div>

        <div className="kpi-card kpi-violet">
          <div className="kpi-label">
            <Layers size={14} style={{ marginRight: 6 }} /> Available Shift Types
          </div>
          <div className="kpi-value">{shiftTemplates.length}</div>
          <div className="kpi-sub">Configured shift templates</div>
        </div>
      </div>

      {/* ── Main Data Card ── */}
      <div className="card">
        {/* Filters and Search Bar */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-subtle)",
          }}
        >
          {/* Left: Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            {/* Search Input */}
            <div style={{ position: "relative", width: 220 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "0.6rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                placeholder="Search name, code, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "2rem", width: "100%", fontSize: "0.82rem" }}
              />
            </div>

            {/* Branch Filter */}
            <select
              value={filterBranchId}
              onChange={(e) => {
                setFilterBranchId(e.target.value);
                setFilterDeptId(""); // Reset dept when branch changes
              }}
              style={{ fontSize: "0.82rem", minWidth: 140 }}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              value={filterDeptId}
              onChange={(e) => setFilterDeptId(e.target.value)}
              style={{ fontSize: "0.82rem", minWidth: 140 }}
            >
              <option value="">All Departments</option>
              {departments
                .filter((d) => !filterBranchId || d.branch_id === filterBranchId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>

            {/* Shift Assignment Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              style={{ fontSize: "0.82rem", minWidth: 130 }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ASSIGNED">Assigned Only</option>
              <option value="UNASSIGNED">Unassigned Only</option>
            </select>

            {/* Shift Template Filter */}
            <select
              value={filterShiftId}
              onChange={(e) => setFilterShiftId(e.target.value)}
              style={{ fontSize: "0.82rem", minWidth: 140 }}
            >
              <option value="">All Shifts</option>
              {shiftTemplates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Right: Dept Shortcut Button */}
          {filterDeptId && can("roster.instance.create") && (
            <button
              className="ghost small"
              type="button"
              onClick={handleAssignAllInDept}
              style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
            >
              <Sparkles size={13} />
              <span>Assign All in {deptMap.get(filterDeptId) || "Dept"}</span>
            </button>
          )}
        </div>

        {/* Bulk Action Bar (when rows are selected) */}
        {selectedEmpIds.length > 0 && (
          <div
            style={{
              padding: "0.6rem 1.25rem",
              background: "var(--info-bg)",
              borderBottom: "1px solid var(--info-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.82rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <UserCheck size={16} style={{ color: "var(--info-fg)" }} />
              <strong style={{ color: "var(--info-fg)" }}>
                {selectedEmpIds.length} employee(s) selected
              </strong>
              <span style={{ color: "var(--text-secondary)" }}>
                (out of {filteredEmployees.length} visible)
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                className="ghost small"
                type="button"
                onClick={() => setSelectedEmpIds([])}
                style={{ fontSize: "0.78rem" }}
              >
                Clear Selection
              </button>
              {can("roster.instance.create") && (
                <button
                  className="primary small"
                  type="button"
                  onClick={handleOpenAssignBulk}
                  style={{ fontSize: "0.78rem" }}
                >
                  Assign Shift to Selected ({selectedEmpIds.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table Content */}
        {loading ? (
          <div style={{ padding: "1.5rem" }}>
            <SkeletonTable rows={6} />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees match your filter criteria"
            description="Try clearing search filters or selecting a different department."
            action={
              (searchQuery || filterBranchId || filterDeptId || filterStatus !== "ALL" || filterShiftId) ? (
                <button
                  className="secondary small"
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterBranchId("");
                    setFilterDeptId("");
                    setFilterStatus("ALL");
                    setFilterShiftId("");
                  }}
                >
                  Clear All Filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredEmployees.length > 0 &&
                        filteredEmployees.every((e) => selectedEmpIds.includes(e.id))
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      title="Select all visible employees"
                    />
                  </th>
                  <th>Employee</th>
                  <th>Branch & Department</th>
                  <th>Designation</th>
                  <th>Current Shift (Today)</th>
                  <th>Schedule Horizon</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  const info = employeeAssignmentMap.get(emp.id);
                  const isSelected = selectedEmpIds.includes(emp.id);
                  const branchName = branchMap.get(emp.branch_id) || "—";
                  const deptName = emp.department_id ? deptMap.get(emp.department_id) || "—" : "—";

                  return (
                    <tr
                      key={emp.id}
                      style={{
                        background: isSelected ? "var(--bg-subtle)" : undefined,
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(emp.id)}
                        />
                      </td>

                      {/* Employee Name & Code */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background: "var(--action-primary)",
                              color: "var(--action-fg)",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 600,
                              fontSize: "0.78rem",
                              flexShrink: 0,
                            }}
                          >
                            {emp.full_name?.slice(0, 2).toUpperCase() || "EM"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {emp.full_name}
                            </div>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {emp.employee_code}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Branch & Dept */}
                      <td>
                        <div style={{ fontSize: "0.82rem", color: "var(--text-primary)" }}>
                          {branchName}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {deptName}
                        </div>
                      </td>

                      {/* Designation */}
                      <td>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          {emp.designation || "—"}
                        </span>
                      </td>

                      {/* Current Shift */}
                      <td>
                        {info?.todayInstance ? (
                          info.isRestDay ? (
                            <Badge variant="warning">Rest Day</Badge>
                          ) : info.todayShift ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                <Badge variant="success">
                                  {info.todayShift.code}
                                </Badge>
                                <span style={{ fontWeight: 500, fontSize: "0.82rem" }}>
                                  {info.todayShift.name}
                                </span>
                              </div>
                              {info.todayShift.sessions && info.todayShift.sessions.length > 0 && (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "var(--text-muted)",
                                    fontFamily: "var(--font-mono)",
                                  }}
                                >
                                  {info.todayShift.sessions[0].start_time?.slice(0, 5)} -{" "}
                                  {info.todayShift.sessions[0].end_time?.slice(0, 5)}
                                  {info.todayShift.sessions.length > 1
                                    ? ` (+${info.todayShift.sessions.length - 1} session)`
                                    : ""}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="neutral">Shift ID Assigned</Badge>
                          )
                        ) : (
                          <Badge variant="danger">No Shift Assigned</Badge>
                        )}
                      </td>

                      {/* Schedule Horizon */}
                      <td>
                        {info?.validUntil ? (
                          <div style={{ fontSize: "0.8rem" }}>
                            <span style={{ color: "var(--text-primary)" }}>
                              Valid to {info.validUntil}
                            </span>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              {info.upcomingDaysCount} day(s) materialized
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            No active schedule
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        {can("roster.instance.create") && (
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => handleOpenAssignForOne(emp)}
                            style={{ fontSize: "0.78rem" }}
                          >
                            Assign / Change
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Assign Shift Modal ── */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => !submitting && setIsAssignModalOpen(false)}
        title={
          targetEmployees.length === 1
            ? `Assign Shift: ${targetEmployees[0].full_name} (${targetEmployees[0].employee_code})`
            : `Bulk Shift Assignment (${targetEmployees.length} employees)`
        }
        maxWidth={620}
        footer={
          <>
            <button
              className="ghost"
              type="button"
              disabled={submitting}
              onClick={() => setIsAssignModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="primary"
              type="button"
              disabled={submitting || !selectedShiftId || targetEmployees.length === 0}
              onClick={handleSubmitAssignment}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <CalendarCheck size={15} />
              <span>
                {submitting
                  ? "Materializing Shifts..."
                  : `Confirm & Assign to ${targetEmployees.length} Staff`}
              </span>
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmitAssignment} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Target Employees Header */}
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "var(--bg-subtle)",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              Target Staff: {targetEmployees.length} employee(s)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", maxHeight: 90, overflowY: "auto" }}>
              {targetEmployees.slice(0, 15).map((e) => (
                <span
                  key={e.id}
                  style={{
                    fontSize: "0.72rem",
                    background: "var(--bg-surface)",
                    padding: "0.15rem 0.4rem",
                    borderRadius: 4,
                    border: "1px solid var(--border-default)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {e.full_name} ({e.employee_code})
                </span>
              ))}
              {targetEmployees.length > 15 && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", alignSelf: "center" }}>
                  +{targetEmployees.length - 15} more
                </span>
              )}
            </div>
          </div>

          {/* Shift Template Selector */}
          <div className="form-group">
            <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Select Shift Template <span style={{ color: "var(--danger-fg)" }}>*</span>
            </label>
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              required
              style={{ fontSize: "0.85rem" }}
            >
              <option value="" disabled>
                -- Select a shift template --
              </option>
              {shiftTemplates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) — {s.shift_type}
                </option>
              ))}
            </select>
          </div>

          {/* Shift Template Details Card */}
          {activeShiftPreview && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: 6,
                border: "1px solid var(--border-default)",
                background: "var(--bg-subtle)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {activeShiftPreview.name} ({activeShiftPreview.code})
                </span>
                <Badge variant="info">{activeShiftPreview.shift_type}</Badge>
              </div>

              {activeShiftPreview.sessions && activeShiftPreview.sessions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem" }}>
                  {activeShiftPreview.sessions.map((sess, idx) => (
                    <div
                      key={sess.id || idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "0.3rem 0.5rem",
                        background: "var(--bg-surface)",
                        borderRadius: 4,
                      }}
                    >
                      <span>
                        <strong>Session {sess.session_order}:</strong> {sess.name}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {sess.start_time?.slice(0, 5)} → {sess.end_time?.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                  <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: "0.2rem" }}>
                    • Attendance pairing will match punches against these configured boundaries.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  No sessions defined for this shift.
                </div>
              )}
            </div>
          )}

          {/* Effective Start Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Effective Start Date <span style={{ color: "var(--danger-fg)" }}>*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={{ fontSize: "0.85rem" }}
              />
            </div>

            {/* Duration */}
            <div className="form-group">
              <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Assignment Duration <span style={{ color: "var(--danger-fg)" }}>*</span>
              </label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                style={{ fontSize: "0.85rem" }}
              >
                <option value={30}>30 Days (1 Month)</option>
                <option value={60}>60 Days (2 Months)</option>
                <option value={90}>90 Days (Quarterly — Standard)</option>
                <option value={180}>180 Days (Half Year)</option>
                <option value={365}>365 Days (1 Full Year)</option>
              </select>
            </div>
          </div>

          {/* Horizon Preview */}
          <div
            style={{
              padding: "0.6rem 0.85rem",
              borderRadius: 6,
              background: "var(--info-bg)",
              border: "1px solid var(--info-border)",
              fontSize: "0.78rem",
              color: "var(--info-fg)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Info size={16} style={{ flexShrink: 0 }} />
            <div>
              Will materialize <strong>{durationDays} daily instances</strong> from{" "}
              <strong>{startDate}</strong> through <strong>{calculatedEndDate}</strong>.
              <br />
              Any individual day (such as weekend rest days or approved leave) can be customized anytime in the Shift Roster.
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
