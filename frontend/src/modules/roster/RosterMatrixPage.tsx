import { useEffect, useState } from "react";
import {
  Ban,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
  Pencil,
  Repeat,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  api,
  Branch,
  DatedShiftInstance,
  Department,
  Employee,
  RosterPattern,
  ShiftTemplate,
} from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { formatDuration, formatTimeShort } from "../shifts/shiftUtils";
import { ScheduleMode, ScheduleShiftsModal } from "./ScheduleShiftsModal";
import { ShiftOverrideModal } from "./ShiftOverrideModal";
import { formatMonthYear, getMonthDays, shiftDateStr } from "./rosterUtils";

type ViewFilter = "ALL" | "FIXED" | "ROTATING";

export function RosterMatrixPage() {
  const { can } = useAuth();

  // Month Navigation
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  // Master & Roster Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [patterns, setPatterns] = useState<RosterPattern[]>([]);
  const [instances, setInstances] = useState<DatedShiftInstance[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Toolbar State
  const [viewFilter, setViewFilter] = useState<ViewFilter>("ALL");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showLegend, setShowLegend] = useState(false);
  const [isScheduleMenuOpen, setIsScheduleMenuOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  // Schedule Shifts Modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("fixed");

  // Tier 1 Inspection Popover State
  const [inspectedCell, setInspectedCell] = useState<{
    employee: Employee;
    instance: DatedShiftInstance;
  } | null>(null);

  // Tier 2 Override / Cancel Modal State
  const [overrideModalState, setOverrideModalState] = useState<{
    isOpen: boolean;
    mode: "override" | "cancel";
    employee: Employee | null;
    instance: DatedShiftInstance | null;
  }>({
    isOpen: false,
    mode: "override",
    employee: null,
    instance: null,
  });

  const days = getMonthDays(year, month);
  const monthStart = days[0].dateStr;
  const monthEnd = days[days.length - 1].dateStr;
  const prevDayBeforeMonth = shiftDateStr(monthStart, -1);

  async function loadData() {
    setLoading(true);
    try {
      const [branchList, deptList, empList, tplList, patternList, instanceList] =
        await Promise.all([
          api.branches(),
          api.departments(),
          api.employeesList({ is_active: true }),
          api.shiftTemplates(false),
          api.rosterPatterns().catch(() => [] as RosterPattern[]),
          api.rosterInstances({ start_date: prevDayBeforeMonth, end_date: monthEnd }),
        ]);
      setBranches(branchList);
      setDepartments(deptList);
      setEmployees(empList);
      setTemplates(tplList);
      setPatterns(patternList);
      setInstances(instanceList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roster matrix");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [year, month]);

  const activeBranches = branches.filter((b) => b.is_active);
  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  // Map: `${employee_id}::${calendar_date}` -> DatedShiftInstance
  const instanceMap = new Map<string, DatedShiftInstance>();
  // Classify each employee as FIXED vs ROTATING based on materialized instances
  const empScheduleType = new Map<string, "FIXED" | "ROTATING" | "UNASSIGNED">();

  for (const inst of instances) {
    instanceMap.set(`${inst.employee_id}::${inst.calendar_date}`, inst);
    if (inst.calendar_date >= monthStart && inst.calendar_date <= monthEnd) {
      const curr = empScheduleType.get(inst.employee_id);
      if (inst.roster_pattern_id) {
        empScheduleType.set(inst.employee_id, "ROTATING");
      } else if (!curr) {
        empScheduleType.set(inst.employee_id, "FIXED");
      }
    }
  }

  // Count by schedule type (after branch/dept/search filters)
  const baseFilteredEmployees = employees.filter((emp) => {
    if (branchFilter !== "ALL" && emp.branch_id !== branchFilter) return false;
    if (deptFilter !== "ALL" && (emp.department_id || "") !== deptFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !emp.full_name.toLowerCase().includes(q) &&
        !emp.employee_code.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const fixedCount = baseFilteredEmployees.filter(
    (e) => empScheduleType.get(e.id) === "FIXED",
  ).length;
  const rotatingCount = baseFilteredEmployees.filter(
    (e) => empScheduleType.get(e.id) === "ROTATING",
  ).length;

  const visibleEmployees = baseFilteredEmployees.filter((emp) => {
    const kind = empScheduleType.get(emp.id) || "UNASSIGNED";
    if (viewFilter === "FIXED") return kind === "FIXED";
    if (viewFilter === "ROTATING") return kind === "ROTATING";
    return true;
  });

  function prevMonth() {
    setInspectedCell(null);
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    setInspectedCell(null);
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function openScheduleModal(mode: ScheduleMode) {
    setIsScheduleMenuOpen(false);
    setScheduleMode(mode);
    setScheduleModalOpen(true);
  }

  function openOverrideModal(
    mode: "override" | "cancel",
    employee: Employee,
    instance: DatedShiftInstance,
  ) {
    setInspectedCell(null);
    setOverrideModalState({
      isOpen: true,
      mode,
      employee,
      instance,
    });
  }

  const prevInstanceForModal = overrideModalState.instance
    ? instanceMap.get(
        `${overrideModalState.instance.employee_id}::${shiftDateStr(overrideModalState.instance.calendar_date, -1)}`,
      )
    : undefined;

  return (
    <div>
      {/* Header + Month Navigation + Publish Status */}
      <div
        className="card-header"
        style={{
          marginBottom: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2 className="card-title">Monthly Shift Roster</h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginTop: "0.35rem",
              fontSize: "0.825rem",
              color: "var(--text-muted)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontWeight: 500,
                color: isPublished ? "var(--color-success-fg)" : "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: isPublished ? "var(--color-success)" : "var(--color-warning)",
                }}
              />
              {isPublished
                ? "Published — Visible to employees on ESS"
                : "Draft — Roster visible only to managers"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius)",
              background: "var(--bg-card)",
              overflow: "hidden",
            }}
          >
            <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Button>
            <span
              style={{
                padding: "0 0.75rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                minWidth: "135px",
                textAlign: "center",
              }}
            >
              {formatMonthYear(year, month)}
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={16} />
            </Button>
          </div>

          <Button
            variant={isPublished ? "secondary" : "primary"}
            size="sm"
            onClick={() => setIsPublished((v) => !v)}
          >
            {isPublished ? "Unlock to Draft" : "Publish Roster"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {/* Unified Toolbar: View Filter Tabs + Dept/Search + Schedule Menu + Legend */}
      <div
        className="card"
        style={{
          padding: "0.875rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Smart View Filter Tabs */}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <Button
              size="sm"
              variant={viewFilter === "ALL" ? "primary" : "secondary"}
              onClick={() => setViewFilter("ALL")}
            >
              All Employees ({baseFilteredEmployees.length})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "FIXED" ? "primary" : "secondary"}
              onClick={() => setViewFilter("FIXED")}
            >
              Fixed Shifts ({fixedCount})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "ROTATING" ? "primary" : "secondary"}
              onClick={() => setViewFilter("ROTATING")}
            >
              Rotating Shifts ({rotatingCount})
            </Button>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", position: "relative" }}>
            <Button
              size="sm"
              variant="secondary"
              icon={<HelpCircle size={15} />}
              onClick={() => setShowLegend((v) => !v)}
            >
              Legend
            </Button>

            {can("roster.instance.create") ? (
              <div style={{ position: "relative" }}>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ChevronDown size={15} />}
                  onClick={() => setIsScheduleMenuOpen((v) => !v)}
                >
                  Schedule Shifts
                </Button>
                {isScheduleMenuOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      width: "265px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius)",
                      boxShadow: "var(--shadow-lg)",
                      zIndex: 40,
                      padding: "0.35rem",
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        width: "100%",
                        justifyContent: "flex-start",
                        textAlign: "left",
                        padding: "0.55rem 0.65rem",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "0.15rem",
                      }}
                      onClick={() => openScheduleModal("pattern")}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem" }}>
                        <Repeat size={14} color="var(--color-primary)" />
                        Assign Rotating Pattern
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Set cyclical A/B/C rotation for shift staff
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        width: "100%",
                        justifyContent: "flex-start",
                        textAlign: "left",
                        padding: "0.55rem 0.65rem",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "0.15rem",
                      }}
                      onClick={() => openScheduleModal("fixed")}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem" }}>
                        <Sparkles size={14} color="var(--color-success)" />
                        Set Fixed Default Shift
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        For office/admin staff (with impact preview)
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        width: "100%",
                        justifyContent: "flex-start",
                        textAlign: "left",
                        padding: "0.55rem 0.65rem",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "0.15rem",
                      }}
                      onClick={() => openScheduleModal("bulk")}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem" }}>
                        <Layers size={14} color="var(--text-secondary)" />
                        Bulk Assign by Date Range
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Materialize custom dates manually
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Search + Branch + Dept Filters */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: "300px" }}>
            <Search
              size={15}
              color="var(--text-muted)"
              style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              className="input"
              placeholder="Search employee name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "2.15rem" }}
            />
          </div>

          {activeBranches.length > 1 ? (
            <select
              className="select"
              style={{ width: "auto", minWidth: "160px" }}
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="ALL">All Branches</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          ) : null}

          <select
            className="select"
            style={{ width: "auto", minWidth: "180px" }}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            {departments
              .filter((d) => d.is_active && (branchFilter === "ALL" || d.branch_id === branchFilter))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
          </select>
        </div>

        {/* Expandable Legend Panel */}
        {showLegend ? (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "var(--radius)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem 1.25rem",
              fontSize: "0.78rem",
            }}
          >
            {templates.map((tpl) => (
              <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: tpl.color_code || "#3b82f6",
                  }}
                />
                <code>{tpl.code}</code>
                <span style={{ color: "var(--text-muted)" }}>{tpl.name}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Badge variant="neutral">OFF</Badge>
              <span style={{ color: "var(--text-muted)" }}>Rest Day</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Badge variant="warning">CXL</Badge>
              <span style={{ color: "var(--text-muted)" }}>N66d Cancelled Paid</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Pencil size={12} color="var(--color-primary)" />
              <span style={{ color: "var(--text-muted)" }}>N67 Override</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Tier 1 Inspection Popover Card (when a cell is clicked) */}
      {inspectedCell ? (
        <div
          className="card"
          style={{
            padding: "0.875rem 1rem",
            marginBottom: "1rem",
            border: "1px solid var(--color-primary-border)",
            background: "var(--color-primary-bg)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ fontSize: "0.85rem" }}>
            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {inspectedCell.employee.full_name} ({inspectedCell.employee.employee_code}) •{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {inspectedCell.instance.calendar_date}
              </span>
            </div>
            <div style={{ color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              {inspectedCell.instance.status === "CANCELLED_PAID" ? (
                <span>
                  <strong>CANCELLED_PAID (Rule N66d)</strong> — Reason:{" "}
                  {inspectedCell.instance.modification_reason || "Employer cancelled"}
                </span>
              ) : inspectedCell.instance.is_rest_day ? (
                <span>
                  <strong>Weekly Off / Rest Day (OFF)</strong>
                </span>
              ) : (
                (() => {
                  const tpl = inspectedCell.instance.shift_template_id
                    ? templateMap.get(inspectedCell.instance.shift_template_id)
                    : null;
                  const s = inspectedCell.instance.sessions[0];
                  return (
                    <span>
                      <strong>{tpl ? `${tpl.code} — ${tpl.name}` : "Scheduled"}</strong>
                      {s
                        ? ` (${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)})`
                        : ""}
                      {" • "}
                      {inspectedCell.instance.is_adhoc_modified
                        ? `N67 Override: ${inspectedCell.instance.modification_reason}`
                        : inspectedCell.instance.roster_pattern_id
                          ? "Rotating Pattern"
                          : "Fixed Default"}
                    </span>
                  );
                })()
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {can("roster.instance.update") ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Pencil size={14} />}
                  onClick={() =>
                    openOverrideModal("override", inspectedCell.employee, inspectedCell.instance)
                  }
                >
                  Override (N67)
                </Button>
                {inspectedCell.instance.status !== "CANCELLED_PAID" &&
                !inspectedCell.instance.is_rest_day ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Ban size={14} />}
                    onClick={() =>
                      openOverrideModal("cancel", inspectedCell.employee, inspectedCell.instance)
                    }
                  >
                    Cancel Session (N66d)
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Close inspection"
              onClick={() => setInspectedCell(null)}
            >
              <X size={15} />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Matrix Grid */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <table className="table">
            <tbody>
              <LoadingRow cols={8} />
            </tbody>
          </table>
        ) : visibleEmployees.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={36} />}
            title="No employees in this roster view"
            description={
              employees.length === 0
                ? "Add active employees first, then use Schedule Shifts to materialize their monthly roster."
                : "No employees match your current filter tabs or search query."
            }
            action={
              can("roster.instance.create") && employees.length > 0
                ? {
                    label: "Set Fixed Default Shift",
                    onClick: () => openScheduleModal("fixed"),
                  }
                : undefined
            }
          />
        ) : (
          <div style={{ overflowX: "auto", position: "relative" }}>
            <table
              className="table"
              style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 20,
                      background: "var(--bg-subtle)",
                      minWidth: "190px",
                      maxWidth: "190px",
                    }}
                  >
                    Employee
                  </th>
                  <th
                    style={{
                      position: "sticky",
                      left: "190px",
                      zIndex: 20,
                      background: "var(--bg-subtle)",
                      minWidth: "86px",
                      boxShadow: "2px 0 4px rgba(0,0,0,0.06)",
                    }}
                  >
                    Sched
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.dateStr}
                      style={{
                        textAlign: "center",
                        minWidth: "56px",
                        padding: "0.5rem 0.25rem",
                        background: d.isWeekend ? "var(--bg-active)" : "var(--bg-subtle)",
                        fontSize: "0.75rem",
                      }}
                    >
                      <div>{d.dayNum}</div>
                      <div style={{ color: "var(--text-muted)", fontWeight: 400 }}>{d.weekday}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((emp) => {
                  const dept = emp.department_id ? deptMap.get(emp.department_id) : null;
                  const schedType = empScheduleType.get(emp.id) || "UNASSIGNED";

                  return (
                    <tr key={emp.id}>
                      {/* Pinned Employee Column */}
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 10,
                          background: "var(--bg-card)",
                          minWidth: "190px",
                          maxWidth: "190px",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "0.84rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {emp.full_name}
                        </div>
                        <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                          {emp.employee_code}
                          {dept ? ` • ${dept.name}` : ""}
                        </div>
                      </td>

                      {/* Pinned Schedule Type Column */}
                      <td
                        style={{
                          position: "sticky",
                          left: "190px",
                          zIndex: 10,
                          background: "var(--bg-card)",
                          minWidth: "86px",
                          boxShadow: "2px 0 4px rgba(0,0,0,0.06)",
                        }}
                      >
                        {schedType === "ROTATING" ? (
                          <Badge variant="info">⟳ Rotat</Badge>
                        ) : schedType === "FIXED" ? (
                          <Badge variant="neutral">● Fixed</Badge>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>

                      {/* Calendar Day Cells */}
                      {days.map((d) => {
                        const inst = instanceMap.get(`${emp.id}::${d.dateStr}`);
                        const tpl =
                          inst && inst.shift_template_id
                            ? templateMap.get(inst.shift_template_id)
                            : null;
                        const isSelected =
                          inspectedCell?.employee.id === emp.id &&
                          inspectedCell?.instance.calendar_date === d.dateStr;

                        return (
                          <td
                            key={d.dateStr}
                            style={{
                              textAlign: "center",
                              padding: "0.35rem 0.2rem",
                              background: isSelected
                                ? "var(--color-primary-bg)"
                                : d.isWeekend
                                  ? "var(--bg-subtle)"
                                  : undefined,
                            }}
                          >
                            {!inst ? (
                              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                —
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setInspectedCell({ employee: emp, instance: inst })}
                                title={
                                  inst.status === "CANCELLED_PAID"
                                    ? `Cancelled Paid (N66d): ${inst.modification_reason}`
                                    : inst.is_rest_day
                                      ? "Rest Day (OFF)"
                                      : `${tpl?.code || "SHIFT"} (${tpl?.name || ""})${inst.is_adhoc_modified ? " — N67 Override" : ""}`
                                }
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "2px",
                                  minWidth: "46px",
                                  padding: "0.2rem 0.3rem",
                                  borderRadius: "5px",
                                  fontSize: "0.7rem",
                                  fontWeight: 600,
                                  fontFamily: "var(--font-mono)",
                                  cursor: "pointer",
                                  border: inst.is_adhoc_modified
                                    ? "1.5px solid var(--color-primary)"
                                    : schedType === "FIXED" && !inst.is_rest_day
                                      ? `1px solid ${tpl?.color_code || "var(--border-strong)"}`
                                      : "1px solid transparent",
                                  background:
                                    inst.status === "CANCELLED_PAID"
                                      ? "var(--color-warning-bg)"
                                      : inst.is_rest_day
                                        ? "var(--bg-active)"
                                        : schedType === "FIXED"
                                          ? "transparent"
                                          : tpl?.color_code || "var(--color-primary)",
                                  color:
                                    inst.status === "CANCELLED_PAID"
                                      ? "var(--color-warning-fg)"
                                      : inst.is_rest_day
                                        ? "var(--text-muted)"
                                        : schedType === "FIXED"
                                          ? "var(--text-primary)"
                                          : "#ffffff",
                                }}
                              >
                                <span>
                                  {inst.status === "CANCELLED_PAID"
                                    ? "CXL"
                                    : inst.is_rest_day
                                      ? "OFF"
                                      : tpl?.code.slice(0, 5) || "SHF"}
                                </span>
                                {inst.is_adhoc_modified ? <span>*</span> : null}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schedule Shifts Modal (Fixed Default 2-Step / Rotating Pattern / Bulk) */}
      <ScheduleShiftsModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        mode={scheduleMode}
        defaultStartDate={monthStart}
        defaultDays={days.length}
        employees={employees}
        departments={departments}
        templates={templates}
        patterns={patterns}
        existingInstances={instances}
        onSaved={loadData}
      />

      {/* N67 Override / N66d Cancel Modal */}
      <ShiftOverrideModal
        isOpen={overrideModalState.isOpen}
        onClose={() =>
          setOverrideModalState((prev) => ({ ...prev, isOpen: false }))
        }
        mode={overrideModalState.mode}
        instance={overrideModalState.instance}
        prevInstance={prevInstanceForModal}
        employee={overrideModalState.employee}
        templates={templates}
        onSaved={loadData}
      />
    </div>
  );
}
