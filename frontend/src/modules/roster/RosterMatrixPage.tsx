import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
  Repeat,
  Search,
  Sparkles,
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
import { formatTimeShort } from "../shifts/shiftUtils";
import { CellAssignmentModal } from "./CellAssignmentModal";
import { ScheduleMode, ScheduleShiftsModal } from "./ScheduleShiftsModal";
import { formatMonthYear, getMonthDays, shiftDateStr } from "./rosterUtils";

type ViewFilter = "ALL" | "FIXED" | "ROTATING";

interface SelectedCell {
  employee: Employee;
  dateStr: string;
  dayIndex: number;
  instance: DatedShiftInstance | undefined;
}

interface DragFillState {
  employeeId: string;
  startIndex: number;
  currentIndex: number;
  shiftTemplateId: string | null;
  isRestDay: boolean;
  label: string;
  color: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getCompactShiftLabel(
  inst: DatedShiftInstance | undefined,
  tpl: ShiftTemplate | null | undefined,
): string {
  if (!inst) return "";
  if (inst.status === "CANCELLED_PAID") return "CXL";
  if (inst.is_rest_day) return inst.is_adhoc_modified ? "OFF*" : "OFF";
  if (inst.sessions.length > 0) {
    const sorted = [...inst.sessions].sort((a, b) => a.session_order - b.session_order);
    const sH = sorted[0].start_time.slice(0, 2);
    const eH = sorted[sorted.length - 1].end_time.slice(0, 2);
    return `${sH}-${eH}${inst.is_adhoc_modified ? "*" : ""}`;
  }
  return tpl ? `${tpl.code.slice(0, 5)}${inst.is_adhoc_modified ? "*" : ""}` : "SHF";
}

function getTemplateCompactLabel(tpl: ShiftTemplate): string {
  if (tpl.sessions.length > 0) {
    const sorted = [...tpl.sessions].sort((a, b) => a.session_order - b.session_order);
    return `${sorted[0].start_time.slice(0, 2)}-${sorted[sorted.length - 1].end_time.slice(0, 2)}`;
  }
  return tpl.code.slice(0, 5);
}

export function RosterMatrixPage() {
  const { can } = useAuth();

  // Month Navigation
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Master & Roster Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [patterns, setPatterns] = useState<RosterPattern[]>([]);
  const [instances, setInstances] = useState<DatedShiftInstance[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingFill, setSavingFill] = useState(false);
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

  // Selected Cell, Modal & Excel Drag-to-Fill State
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [cellModalOpen, setCellModalOpen] = useState(false);
  const [dragFill, setDragFill] = useState<DragFillState | null>(null);
  const didDragRef = useRef(false);

  const days = getMonthDays(year, month);
  const monthStart = days[0].dateStr;
  const monthEnd = days[days.length - 1].dateStr;
  const prevDayBeforeMonth = shiftDateStr(monthStart, -1);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [year, month]);

  const activeBranches = branches.filter((b) => b.is_active);
  const activeTemplates = templates.filter((t) => t.is_active);
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  const instanceMap = new Map<string, DatedShiftInstance>();
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

  // Handle global mouseup to commit Excel horizontal drag-to-fill
  useEffect(() => {
    if (!dragFill) return;

    const handleMouseUp = async () => {
      const { employeeId, startIndex, currentIndex, shiftTemplateId, isRestDay } = dragFill;
      setDragFill(null);

      if (startIndex === currentIndex) return;
      didDragRef.current = true;
      window.setTimeout(() => {
        didDragRef.current = false;
      }, 50);

      const minIdx = Math.min(startIndex, currentIndex);
      const maxIdx = Math.max(startIndex, currentIndex);
      const targetStartDate = days[minIdx]?.dateStr;
      const numDays = maxIdx - minIdx + 1;

      if (!targetStartDate || numDays < 2) return;

      setSavingFill(true);
      setError("");
      try {
        if (shiftTemplateId && !isRestDay) {
          await api.materializeRoster({
            employee_ids: [employeeId],
            start_date: targetStartDate,
            days: numDays,
            shift_template_id: shiftTemplateId,
          });
        } else if (isRestDay) {
          for (let i = minIdx; i <= maxIdx; i++) {
            const dStr = days[i].dateStr;
            const existing = instanceMap.get(`${employeeId}::${dStr}`);
            if (existing && !existing.is_rest_day) {
              await api.overrideShiftInstance(existing.id, {
                shift_template_id: null,
                is_rest_day: true,
                reason: "Horizontal drag fill to Rest Day (OFF)",
              });
            }
          }
        }
        await loadData(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to copy shift across cells");
      } finally {
        setSavingFill(false);
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragFill, days]);

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
    setSelectedCell(null);
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    setSelectedCell(null);
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

  function startHorizontalDrag(
    empId: string,
    dayIndex: number,
    inst: DatedShiftInstance | undefined,
  ) {
    if (!inst || !can("roster.instance.create")) return;
    if (!inst.shift_template_id && !inst.is_rest_day) return;
    didDragRef.current = false;
    const tpl = inst.shift_template_id ? templateMap.get(inst.shift_template_id) : null;
    setDragFill({
      employeeId: empId,
      startIndex: dayIndex,
      currentIndex: dayIndex,
      shiftTemplateId: inst.shift_template_id,
      isRestDay: inst.is_rest_day,
      label: getCompactShiftLabel(inst, tpl),
      color: tpl?.color_code || "var(--color-primary)",
    });
  }

  const prevInstanceForCellModal = selectedCell
    ? instanceMap.get(`${selectedCell.employee.id}::${shiftDateStr(selectedCell.dateStr, -1)}`)
    : undefined;

  return (
    <div style={{ userSelect: dragFill ? "none" : undefined }}>
      {/* Header + Month Navigation + Publish Status */}
      <div
        className="card-header"
        style={{
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2 className="card-title">Monthly Shift Roster</h2>
          <div style={{ marginTop: "0.35rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.2rem 0.65rem",
                borderRadius: "999px",
                fontSize: "0.76rem",
                fontWeight: 500,
                background: isPublished ? "var(--color-success-bg)" : "var(--color-warning-bg)",
                border: `1px solid ${isPublished ? "var(--color-success-border)" : "var(--color-warning-border)"}`,
                color: isPublished ? "var(--color-success-fg)" : "var(--color-warning-fg)",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "999px",
                  background: isPublished ? "var(--color-success)" : "var(--color-warning)",
                }}
              />
              {isPublished
                ? "Published · visible to employees on ESS"
                : "Draft · visible only to managers"}
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
              background: "var(--bg-surface)",
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
            {isPublished ? "Unlock to draft" : "Publish roster"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {/* Sleek Filter Row (Segmented Pill Tabs + Search + Dept + Legend + Schedule Shifts) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.65rem",
          marginBottom: "0.875rem",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.65rem",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Segmented Pill Tabs */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.2rem",
              padding: "0.25rem",
              borderRadius: "0.55rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              flexWrap: "wrap",
            }}
          >
            {(
              [
                { key: "ALL", label: "All employees", count: baseFilteredEmployees.length },
                { key: "FIXED", label: "Fixed shifts", count: fixedCount },
                { key: "ROTATING", label: "Rotating shifts", count: rotatingCount },
              ] as const
            ).map((tab) => {
              const active = viewFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setViewFilter(tab.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.35rem 0.7rem",
                    borderRadius: "0.4rem",
                    border: "none",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    background: active ? "var(--color-primary)" : "transparent",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      padding: "0.05rem 0.4rem",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background: active ? "rgba(255,255,255,0.22)" : "var(--bg-subtle)",
                      color: active ? "#ffffff" : "var(--text-muted)",
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Filters + Legend */}
          <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center", flex: "1 1 auto", justifyContent: "flex-end" }}>
            <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "260px" }}>
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
                style={{ width: "auto", minWidth: "145px" }}
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="ALL">All branches</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : null}

            <select
              className="select"
              style={{ width: "auto", minWidth: "150px" }}
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="ALL">All departments</option>
              {departments
                .filter((d) => d.is_active && (branchFilter === "ALL" || d.branch_id === branchFilter))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>

            <Button
              size="sm"
              variant="secondary"
              icon={<HelpCircle size={15} />}
              onClick={() => setShowLegend((v) => !v)}
            >
              Legend
            </Button>
          </div>
        </div>

        {/* Schedule Shifts Action + Saving Indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          {can("roster.instance.create") ? (
            <div style={{ position: "relative" }}>
              <Button
                size="sm"
                variant="primary"
                icon={<ChevronDown size={15} />}
                onClick={() => setIsScheduleMenuOpen((v) => !v)}
              >
                Schedule shifts
              </Button>
              {isScheduleMenuOpen ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "calc(100% + 6px)",
                    width: "265px",
                    background: "var(--bg-surface)",
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

          <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
            {savingFill
              ? "Saving horizontal fill..."
              : "Click any cell to assign/edit · Drag a shift cell horizontally like Excel to copy across days"}
          </span>
        </div>

        {/* Expandable Legend Panel */}
        {showLegend ? (
          <div
            className="card-panel"
            style={{
              padding: "0.75rem 1rem",
              marginBottom: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: "0.65rem 1.25rem",
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
                <code>{getTemplateCompactLabel(tpl)}</code>
                <span style={{ color: "var(--text-muted)" }}>
                  {tpl.code} ({tpl.name})
                </span>
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
              <code style={{ color: "var(--color-primary)" }}>*</code>
              <span style={{ color: "var(--text-muted)" }}>N67 Override</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Matrix Grid */}
      {loading ? (
        <div className="table-container">
          <table className="data-table">
            <tbody>
              <LoadingRow cols={8} />
            </tbody>
          </table>
        </div>
      ) : visibleEmployees.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={36} />}
          title="No employees in this roster view"
          description={
            employees.length === 0
              ? "Add active employees first, then use Schedule shifts to materialize their monthly roster."
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
        <div className="table-container" style={{ position: "relative" }}>
          <table
            className="data-table"
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
                    minWidth: "220px",
                    maxWidth: "240px",
                    borderRight: "1px solid var(--border-default)",
                    boxShadow: "2px 0 6px rgba(0,0,0,0.08)",
                  }}
                >
                  Employee
                </th>
                {days.map((d) => (
                  <th
                    key={d.dateStr}
                    style={{
                      textAlign: "center",
                      minWidth: "56px",
                      padding: "0.5rem 0.25rem",
                      background: d.isWeekend ? "var(--bg-active)" : "var(--bg-subtle)",
                      borderRight: "1px solid var(--border-subtle)",
                      fontSize: "0.74rem",
                    }}
                  >
                    <div>{d.dayNum}</div>
                    <div style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>
                      {d.weekday}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((emp) => {
                const schedType = empScheduleType.get(emp.id) || "UNASSIGNED";

                return (
                  <tr key={emp.id}>
                    {/* Single Pinned Employee Cell (Avatar + Name + Code + Inline Type Pill) */}
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        background: "var(--bg-surface)",
                        minWidth: "220px",
                        maxWidth: "240px",
                        padding: "0.55rem 0.75rem",
                        borderRight: "1px solid var(--border-default)",
                        boxShadow: "2px 0 6px rgba(0,0,0,0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
                          <div
                            style={{
                              width: "30px",
                              height: "30px",
                              borderRadius: "999px",
                              background: "var(--bg-active)",
                              color: "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(emp.full_name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "0.82rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {emp.full_name}
                            </div>
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {emp.employee_code}
                            </div>
                          </div>
                        </div>

                        {schedType === "FIXED" ? (
                          <Badge variant="info">Fixed</Badge>
                        ) : schedType === "ROTATING" ? (
                          <Badge variant="warning">Rotat</Badge>
                        ) : null}
                      </div>
                    </td>

                    {/* Calendar Day Cells with Click-to-Select + Excel Horizontal Drag-Fill */}
                    {days.map((d, dayIdx) => {
                      const inst = instanceMap.get(`${emp.id}::${d.dateStr}`);
                      const tpl =
                        inst && inst.shift_template_id
                          ? templateMap.get(inst.shift_template_id)
                          : null;
                      const isSelected =
                        selectedCell?.employee.id === emp.id &&
                        selectedCell?.dateStr === d.dateStr;

                      const isInDragRange =
                        dragFill !== null &&
                        dragFill.employeeId === emp.id &&
                        dayIdx >= Math.min(dragFill.startIndex, dragFill.currentIndex) &&
                        dayIdx <= Math.max(dragFill.startIndex, dragFill.currentIndex);

                      const compactLabel = getCompactShiftLabel(inst, tpl);

                      return (
                        <td
                          key={d.dateStr}
                          onMouseEnter={() => {
                            if (dragFill && dragFill.employeeId === emp.id) {
                              setDragFill((prev) =>
                                prev ? { ...prev, currentIndex: dayIdx } : null,
                              );
                            }
                          }}
                          onClick={() => {
                            if (dragFill || didDragRef.current) return;
                            setSelectedCell({
                              employee: emp,
                              dateStr: d.dateStr,
                              dayIndex: dayIdx,
                              instance: inst,
                            });
                            setCellModalOpen(true);
                          }}
                          style={{
                            position: "relative",
                            textAlign: "center",
                            padding: "0.4rem 0.2rem",
                            cursor: "pointer",
                            borderRight: "1px solid var(--border-subtle)",
                            background: isInDragRange
                              ? "rgba(37, 99, 235, 0.16)"
                              : isSelected
                                ? "var(--color-primary-bg)"
                                : d.isWeekend
                                  ? "var(--bg-subtle)"
                                  : undefined,
                            outline: isInDragRange
                              ? "2px dashed var(--color-primary)"
                              : isSelected
                                ? "2px solid var(--color-primary)"
                                : undefined,
                            outlineOffset: "-2px",
                          }}
                        >
                          {inst ? (
                            <span
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                startHorizontalDrag(emp.id, dayIdx, inst);
                              }}
                              title={`${tpl?.code || "SHIFT"} — ${tpl?.name || "Scheduled"} (Drag horizontally to copy)`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: "44px",
                                padding: "0.24rem 0.35rem",
                                borderRadius: "6px",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                fontFamily: "var(--font-mono)",
                                cursor: can("roster.instance.create") ? "grab" : "pointer",
                                background:
                                  inst.status === "CANCELLED_PAID"
                                    ? "var(--color-warning-bg)"
                                    : inst.is_rest_day
                                      ? "var(--bg-active)"
                                      : tpl?.color_code || "var(--color-primary)",
                                color:
                                  inst.status === "CANCELLED_PAID"
                                    ? "var(--color-warning-fg)"
                                    : inst.is_rest_day
                                      ? "var(--text-secondary)"
                                      : "#ffffff",
                                border: inst.is_adhoc_modified
                                  ? "1px solid rgba(255,255,255,0.45)"
                                  : "1px solid transparent",
                              }}
                            >
                              {compactLabel}
                            </span>
                          ) : isInDragRange && dragFill ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: "44px",
                                padding: "0.24rem 0.35rem",
                                borderRadius: "6px",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                fontFamily: "var(--font-mono)",
                                opacity: 0.6,
                                background: dragFill.color,
                                color: "#ffffff",
                              }}
                            >
                              {dragFill.label}
                            </span>
                          ) : null}

                          {/* Excel-style Bottom-Right Fill Handle on Selected Scheduled Cell */}
                          {isSelected && inst && can("roster.instance.create") ? (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                startHorizontalDrag(emp.id, dayIdx, inst);
                              }}
                              title="Drag horizontally to copy shift to adjacent days"
                              style={{
                                position: "absolute",
                                right: "1px",
                                bottom: "1px",
                                width: "8px",
                                height: "8px",
                                background: "var(--color-primary)",
                                border: "1px solid #ffffff",
                                borderRadius: "1px",
                                cursor: "ew-resize",
                                zIndex: 15,
                              }}
                            />
                          ) : null}
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

      {/* Schedule Shifts Modal */}
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
        onSaved={() => loadData(true)}
      />

      {/* Cell Assignment Modal (Single Day / Fixed Auto-Fill / Rest Day / Cancel) */}
      <CellAssignmentModal
        isOpen={cellModalOpen}
        onClose={() => setCellModalOpen(false)}
        employee={selectedCell?.employee || null}
        dateStr={selectedCell?.dateStr || monthStart}
        monthStart={monthStart}
        monthDaysCount={days.length}
        dayIndex={selectedCell?.dayIndex || 0}
        instance={
          selectedCell
            ? instanceMap.get(`${selectedCell.employee.id}::${selectedCell.dateStr}`)
            : undefined
        }
        prevInstance={prevInstanceForCellModal}
        templates={templates}
        onSaved={() => loadData(true)}
      />
    </div>
  );
}
