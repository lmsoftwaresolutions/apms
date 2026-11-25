import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Plus,
  Search,
  Filter,
  Building2,
  Briefcase,
  Shield,
  CheckCircle2,
  AlertCircle,
  Eye,
  Edit2,
  Power,
  RotateCw,
  X,
  UserCheck,
  UserMinus,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { api, Branch, Department, Designation, Employee } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { EmptyState } from "../../components/common/EmptyState";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { Spinner } from "../../components/common/Spinner";
import { Employee360Modal } from "./Employee360Modal";
import { EmployeeFormModal } from "./EmployeeFormModal";

export function EmployeesPage() {
  const { can } = useAuth();

  // Data state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Drawers and Modals
  const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Employee | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [empList, branchList, deptList, desigList] = await Promise.all([
        api.employeesList(),
        api.branches(),
        api.departments(),
        api.designations(),
      ]);
      setEmployees(empList);
      setBranches(branchList);
      setDepartments(deptList);
      setDesignations(desigList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee directory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Quick lookup maps
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const desigById = useMemo(() => new Map(designations.map((des) => [des.id, des])), [designations]);

  // Cascading departments for filter bar
  const filterAvailableDepartments = useMemo(() => {
    if (!branchFilter) return departments;
    return departments.filter((d) => d.branch_id === branchFilter);
  }, [departments, branchFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [search, branchFilter, deptFilter, typeFilter, statusFilter]);

  // Client-side filtering
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Search filter: name or employee_code
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const nameMatch = emp.full_name.toLowerCase().includes(q);
        const codeMatch = emp.employee_code.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch) return false;
      }
      // Branch filter
      if (branchFilter && emp.branch_id !== branchFilter) return false;
      // Department filter
      if (deptFilter && emp.department_id !== deptFilter) return false;
      // Employment type filter
      if (typeFilter !== "ALL" && emp.employment_type !== typeFilter) return false;
      // Status filter
      if (statusFilter === "ACTIVE" && !emp.is_active) return false;
      if (statusFilter === "INACTIVE" && emp.is_active) return false;

      return true;
    });
  }, [employees, search, branchFilter, deptFilter, typeFilter, statusFilter]);

  // Total pages and Paginated slice
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, page, pageSize]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.is_active).length;
    const inactive = total - active;
    const dpdpConsented = employees.filter((e) => Boolean(e.biometric_consent_at)).length;
    return { total, active, inactive, dpdpConsented };
  }, [employees]);

  // Actions
  function handleOpenCreate() {
    setEditingEmployee(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(emp: Employee) {
    setEditingEmployee(emp);
    setIsFormOpen(true);
    if (drawerEmployee?.id === emp.id) {
      setDrawerEmployee(null);
    }
  }

  function handleSavedSuccess(saved: Employee) {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    if (drawerEmployee?.id === saved.id) {
      setDrawerEmployee(saved);
    }
  }

  async function handleToggleStatusConfirm() {
    if (!toggleTarget) return;
    setToggleLoading(true);
    try {
      const updated = await api.updateEmployee(toggleTarget.id, {
        is_active: !toggleTarget.is_active,
      });
      handleSavedSuccess(updated);
      setToggleTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle employee active status");
    } finally {
      setToggleLoading(false);
    }
  }

  function handleResetFilters() {
    setSearch("");
    setBranchFilter("");
    setDeptFilter("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
  }

  const hasActiveFilters = Boolean(
    search || branchFilter || deptFilter || typeFilter !== "ALL" || statusFilter !== "ALL",
  );

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
              Employee Directory
            </h2>
            <Badge variant="neutral" size="sm" style={{ fontWeight: 600 }}>
              {stats.total} total
            </Badge>
          </div>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Worker master profiles, organizational placements, encrypted statutory vault, and DPDP Act consent.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCw size={15} />}
            onClick={loadData}
            title="Refresh directory"
          >
            Refresh
          </Button>
          {can("employee.employee.create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={handleOpenCreate}>
              Enroll Employee
            </Button>
          )}
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
        {/* Active Workforce */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "0.625rem",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 550, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Active Workforce
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--color-success-fg)", marginTop: "0.2rem" }}>
              {stats.active}
              <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: "0.35rem" }}>
                / {stats.total}
              </span>
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              backgroundColor: "rgba(22, 163, 74, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-success)",
              flexShrink: 0,
            }}
          >
            <UserCheck size={22} />
          </div>
        </div>

        {/* Inactive / Left */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "0.625rem",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 550, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Inactive / Left
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              {stats.inactive}
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              backgroundColor: "var(--bg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            <UserMinus size={22} />
          </div>
        </div>

        {/* DPDP Biometric Consent */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "0.625rem",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 550, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              DPDP Biometric Consent
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--color-primary)", marginTop: "0.2rem" }}>
              {stats.dpdpConsented}
              <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: "0.35rem" }}>
                ({stats.total > 0 ? Math.round((stats.dpdpConsented / stats.total) * 100) : 0}%)
              </span>
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              backgroundColor: "var(--color-primary-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={22} />
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "0.625rem",
          padding: "0.875rem 1rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", alignItems: "center", flex: 1 }}>
          {/* Live Search */}
          <div style={{ position: "relative", minWidth: "220px", flex: 1, maxWidth: "340px" }}>
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
              className="input"
              aria-label="Search employees by name or code"
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "2.25rem", height: "36px", fontSize: "0.8125rem" }}
            />
          </div>

          {/* Branch Filter */}
          {branches.length > 1 && (
            <select
              className="select"
              aria-label="Filter by branch"
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setDeptFilter("");
              }}
              style={{ width: "auto", minWidth: "150px", height: "36px", fontSize: "0.8125rem" }}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}){!b.is_active ? " (Inactive)" : ""}
                </option>
              ))}
            </select>
          )}

          {/* Department Filter */}
          <select
            className="select"
            aria-label="Filter by department"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{ width: "auto", minWidth: "160px", height: "36px", fontSize: "0.8125rem" }}
          >
            <option value="">All Departments</option>
            {filterAvailableDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code}){!d.is_active ? " (Inactive)" : ""}
              </option>
            ))}
          </select>

          {/* Employment Type */}
          <select
            className="select"
            aria-label="Filter by employment type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: "auto", minWidth: "140px", height: "36px", fontSize: "0.8125rem" }}
          >
            <option value="ALL">All Types</option>
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
            <option value="CONTRACTOR">Contractor</option>
            <option value="INTERN">Intern</option>
            <option value="PROBATION">Probation</option>
          </select>

          {/* Status Filter */}
          <select
            className="select"
            aria-label="Filter by employee status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
            style={{ width: "auto", minWidth: "120px", height: "36px", fontSize: "0.8125rem" }}
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={handleResetFilters}
              style={{ fontSize: "0.75rem", height: "36px" }}
            >
              Clear
            </Button>
          )}
        </div>

        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Found <strong>{filteredEmployees.length}</strong> matching worker{filteredEmployees.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Error Card */}
      {error && (
        <div
          style={{
            backgroundColor: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "0.5rem",
            padding: "0.875rem 1rem",
            color: "var(--color-danger-fg)",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Table Container */}
      <div className="table-container-responsive" style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
        {loading ? (
          <div style={{ padding: "4rem 0", display: "flex", justifyContent: "center" }}>
            <Spinner />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={hasActiveFilters ? "No matching employees" : "No employees registered"}
            description={
              hasActiveFilters
                ? "No employee records matched the applied search and filter criteria."
                : "Begin enrolling workers into the system to manage master profiles and attendance."
            }
            action={
              hasActiveFilters
                ? {
                    label: "Clear All Filters",
                    onClick: handleResetFilters,
                    variant: "secondary",
                  }
                : can("employee.employee.create")
                  ? {
                      label: "Enroll First Employee",
                      onClick: handleOpenCreate,
                      variant: "primary",
                      icon: <Plus size={16} />,
                    }
                  : undefined
            }
          />
        ) : (
          <>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--bg-subtle)",
                    borderBottom: "1px solid var(--border-default)",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Worker
                  </th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Organization
                  </th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Terms
                  </th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Statutory & Vault
                  </th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Status
                  </th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.map((emp) => {
                  const branch = branchById.get(emp.branch_id);
                  const dept = emp.department_id ? deptById.get(emp.department_id) : null;
                  const desig = emp.designation_id ? desigById.get(emp.designation_id) : null;

                  const initials =
                    emp.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "?";

                  return (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                      onClick={() => setDrawerEmployee(emp)}
                      className="hover-row"
                    >
                      {/* Worker Info */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              backgroundColor: "var(--color-primary-bg)",
                              border: "1px solid var(--color-primary-border)",
                              color: "var(--color-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.875rem",
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 650, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                              {emp.full_name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.15rem" }}>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontFamily: "monospace",
                                  color: "var(--text-secondary)",
                                  backgroundColor: "var(--bg-subtle)",
                                  padding: "0.05rem 0.35rem",
                                  borderRadius: "0.25rem",
                                  border: "1px solid var(--border-default)",
                                  fontWeight: 600,
                                }}
                              >
                                {emp.employee_code}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Organization */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            {desig?.name || emp.designation || "Staff"}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <span>{dept ? dept.name : "No Department"} • {branch ? branch.name : "Branch"}</span>
                            {branch && !branch.is_active && (
                              <span
                                style={{
                                  fontSize: "0.6875rem",
                                  color: "var(--color-warning-fg, #f59e0b)",
                                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                                  padding: "0.05rem 0.3rem",
                                  borderRadius: "0.25rem",
                                  fontWeight: 600,
                                }}
                                title="Branch is deactivated"
                              >
                                Inactive Branch
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Terms */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <Badge variant="neutral" size="sm" style={{ width: "fit-content", fontWeight: 550 }}>
                            {emp.employment_type.replace(/_/g, " ")}
                          </Badge>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Joined: {emp.date_of_joining}
                          </span>
                        </div>
                      </td>

                      {/* Statutory & Vault */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem" }}>
                            <Shield size={13} color="var(--color-primary)" />
                            <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", fontWeight: 550 }}>
                              {emp.pan_masked ? `PAN: ${emp.pan_masked}` : "PAN missing"}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem" }}>
                            {emp.biometric_consent_at ? (
                              <>
                                <CheckCircle2 size={13} color="var(--color-success)" />
                                <span style={{ color: "var(--color-success-fg)", fontWeight: 500 }}>DPDP Consent OK</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={13} color="var(--color-warning)" />
                                <span style={{ color: "var(--color-warning-fg)", fontWeight: 500 }}>Consent Pending</span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <Badge variant={emp.is_active ? "success" : "neutral"} size="sm">
                          {emp.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td
                        style={{ padding: "0.875rem 1rem", textAlign: "right" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <button
                            type="button"
                            onClick={() => setDrawerEmployee(emp)}
                            title="View Employee 360"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 30,
                              height: 30,
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border-default)",
                              backgroundColor: "var(--bg-surface)",
                              color: "var(--color-primary)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <Eye size={14} />
                          </button>

                          {can("employee.employee.update") && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(emp)}
                              title="Edit Profile"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 30,
                                height: 30,
                                borderRadius: "0.375rem",
                                border: "1px solid var(--border-default)",
                                backgroundColor: "var(--bg-surface)",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <Edit2 size={14} />
                            </button>
                          )}

                          {can("employee.employee.update") && (
                            <button
                              type="button"
                              onClick={() => setToggleTarget(emp)}
                              title={emp.is_active ? "Deactivate Employee" : "Activate Employee"}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 30,
                                height: 30,
                                borderRadius: "0.375rem",
                                border: "1px solid var(--border-default)",
                                backgroundColor: "var(--bg-surface)",
                                color: emp.is_active ? "var(--color-danger-fg)" : "var(--color-success-fg)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <Power size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls Footer */}
            <div
              style={{
                padding: "0.875rem 1.25rem",
                backgroundColor: "var(--bg-surface)",
                borderTop: "1px solid var(--border-default)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
              }}
            >
              <div>
                Showing <strong>{(page - 1) * pageSize + 1}</strong> to{" "}
                <strong>{Math.min(page * pageSize, filteredEmployees.length)}</strong> of{" "}
                <strong>{filteredEmployees.length}</strong> workers
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Rows per page:</span>
                  <select
                    className="select"
                    aria-label="Rows per page"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    style={{ width: "auto", padding: "0.2rem 0.5rem", height: "30px", fontSize: "0.75rem" }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page <= 1}
                    icon={<ChevronsLeft size={14} />}
                    title="First Page"
                    style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    icon={<ChevronLeft size={14} />}
                    title="Previous Page"
                    style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
                  />
                  <span style={{ padding: "0 0.5rem", fontWeight: 600, fontSize: "0.75rem", color: "var(--text-primary)" }}>
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    icon={<ChevronRight size={14} />}
                    title="Next Page"
                    style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    icon={<ChevronsRight size={14} />}
                    title="Last Page"
                    style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Employee 360 Modal */}
      {drawerEmployee && (
        <Employee360Modal
          employee={drawerEmployee}
          branches={branches}
          departments={departments}
          designations={designations}
          onClose={() => setDrawerEmployee(null)}
          onEdit={(emp) => handleOpenEdit(emp)}
        />
      )}

      {/* Employee Form Modal (Create / Edit) */}
      {isFormOpen && (
        <EmployeeFormModal
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingEmployee(null);
          }}
          onSuccess={handleSavedSuccess}
          initialEmployee={editingEmployee}
          branches={branches}
          departments={departments}
          designations={designations}
        />
      )}

      {/* Deactivate / Activate Confirm Modal */}
      {toggleTarget && (
        <ConfirmModal
          isOpen={Boolean(toggleTarget)}
          onClose={() => setToggleTarget(null)}
          onConfirm={handleToggleStatusConfirm}
          loading={toggleLoading}
          title={toggleTarget.is_active ? "Deactivate Employee" : "Re-activate Employee"}
          message={`Are you sure you want to ${
            toggleTarget.is_active ? "deactivate" : "re-activate"
          } ${toggleTarget.full_name} (${toggleTarget.employee_code})? ${
            toggleTarget.is_active
              ? "Inactive employees will no longer appear in daily roster generation or attendance rollups."
              : "Reactivated employees will be restored to active workforce lists."
          }`}
          confirmText={toggleTarget.is_active ? "Deactivate" : "Activate"}
          confirmVariant={toggleTarget.is_active ? "danger" : "primary"}
        />
      )}
    </div>
  );
}
