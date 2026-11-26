import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  FileText,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import { api, DailyAttendanceRecord, Department, Employee } from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { formatDuration } from "../shifts/shiftUtils";
import { RecalculateModal } from "./RecalculateModal";
import { TraceInspectorModal } from "./TraceInspectorModal";

function getMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const mm = String(m + 1).padStart(2, "0");
  const lastDay = String(new Date(y, m + 1, 0).getDate()).padStart(2, "0");
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${lastDay}`,
  };
}

export function DailyAttendancePage() {
  const { can } = useAuth();
  const bounds = getMonthBounds();

  const [records, setRecords] = useState<DailyAttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cutoffBanner, setCutoffBanner] = useState("");
  const [runningCutoff, setRunningCutoff] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState(bounds.start);
  const [endDate, setEndDate] = useState(bounds.end);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Modals
  const [traceRecord, setTraceRecord] = useState<DailyAttendanceRecord | null>(null);
  const [isRecalcOpen, setIsRecalcOpen] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [recList, empList, deptList] = await Promise.all([
        api.dailyAttendance({ start_date: startDate, end_date: endDate }),
        employees.length > 0 ? Promise.resolve(employees) : api.employeesList(),
        departments.length > 0 ? Promise.resolve(departments) : api.departments(),
      ]);
      setRecords(recList);
      if (employees.length === 0) setEmployees(empList);
      if (departments.length === 0) setDepartments(deptList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load daily attendance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [startDate, endDate]);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  const filteredRecords = records.filter((rec) => {
    const emp = employeeMap.get(rec.employee_id);
    if (statusFilter !== "ALL" && rec.status !== statusFilter) return false;
    if (deptFilter !== "ALL" && (emp?.department_id || "") !== deptFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const name = emp?.full_name.toLowerCase() || "";
      const code = emp?.employee_code.toLowerCase() || "";
      if (!name.includes(q) && !code.includes(q)) return false;
    }
    return true;
  });

  // Summary Counts
  const presentCount = filteredRecords.filter((r) => r.status === "PRESENT").length;
  const halfDayCount = filteredRecords.filter((r) => r.status === "HALF_DAY").length;
  const absentCount = filteredRecords.filter((r) => r.status === "ABSENT").length;
  const anomalyCount = filteredRecords.filter(
    (r) => r.is_single_punch || Boolean(r.anomaly_code) || r.status === "NEEDS_REVIEW",
  ).length;

  async function handleRunCutoff() {
    setRunningCutoff(true);
    setCutoffBanner("");
    setError("");
    try {
      const res = await api.runAttendanceCutoff();
      setCutoffBanner(`Cutoff rollup complete: ${res.evaluated} closed shift instance(s) evaluated.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run cutoff rollup");
    } finally {
      setRunningCutoff(false);
    }
  }

  async function handleQuickRecalculate(rec: DailyAttendanceRecord) {
    try {
      await api.recalculateAttendance(rec.employee_id, rec.calendar_date);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate record");
    }
  }

  function statusBadgeVariant(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
    if (status === "PRESENT") return "success";
    if (status === "HALF_DAY") return "warning";
    if (status === "ABSENT") return "danger";
    if (status === "REST_DAY" || status === "CANCELLED_PAID") return "info";
    return "neutral";
  }

  return (
    <div>
      {/* Header */}
      <div
        className="card-header"
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2 className="card-title">Daily Attendance Rollup</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Deterministic session pairing, N65 mid-shift gap exclusion, and immutable JSON explanation traces (M10).
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={15} />}
            onClick={() => void loadData()}
          >
            Refresh
          </Button>
          {can("attendance.daily.recalculate") ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Play size={15} />}
                loading={runningCutoff}
                onClick={() => void handleRunCutoff()}
              >
                Run Cutoff
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsRecalcOpen(true)}
              >
                Recalculate Day
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {cutoffBanner ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius)",
            background: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            color: "var(--color-success-fg)",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          <CheckCircle2 size={16} />
          <span>{cutoffBanner}</span>
        </div>
      ) : null}

      {/* Summary KPI Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div className="card-panel" style={{ padding: "0.875rem 1rem", marginBottom: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Present
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--color-success)" }}>
            {presentCount}
          </div>
        </div>
        <div className="card-panel" style={{ padding: "0.875rem 1rem", marginBottom: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Half Day
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--color-warning)" }}>
            {halfDayCount}
          </div>
        </div>
        <div className="card-panel" style={{ padding: "0.875rem 1rem", marginBottom: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Absent
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--color-danger)" }}>
            {absentCount}
          </div>
        </div>
        <div className="card-panel" style={{ padding: "0.875rem 1rem", marginBottom: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Single Punch / Anomaly
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {anomalyCount}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className="card-panel"
        style={{
          padding: "0.875rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "260px" }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.15rem" }}
          />
        </div>

        <input
          type="date"
          className="input"
          style={{ width: "auto" }}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Start date"
        />
        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>to</span>
        <input
          type="date"
          className="input"
          style={{ width: "auto" }}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-label="End date"
        />

        <select
          className="select"
          style={{ width: "auto", minWidth: "150px" }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="PRESENT">PRESENT</option>
          <option value="HALF_DAY">HALF_DAY</option>
          <option value="ABSENT">ABSENT</option>
          <option value="REST_DAY">REST_DAY</option>
          <option value="CANCELLED_PAID">CANCELLED_PAID</option>
          <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
        </select>

        <select
          className="select"
          style={{ width: "auto", minWidth: "160px" }}
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          <option value="ALL">All Departments</option>
          {departments
            .filter((d) => d.is_active)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </div>

      {/* Rollup Table */}
      {loading ? (
        <div className="table-container">
          <table className="data-table">
            <tbody>
              <LoadingRow cols={7} />
            </tbody>
          </table>
        </div>
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={36} />}
          title="No attendance records found"
          description="No evaluated daily attendance records match this date range or filter. Use Recalculate Day or Run Cutoff to evaluate scheduled shifts."
          action={
            can("attendance.daily.recalculate")
              ? {
                  label: "Recalculate Day",
                  onClick: () => setIsRecalcOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Worked / Sched</th>
                  <th>Late / Early</th>
                  <th>Overtime</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Audit</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => {
                  const emp = employeeMap.get(rec.employee_id);
                  const dept = emp?.department_id ? deptMap.get(emp.department_id) : null;
                  const ratioPct = Math.min(100, Math.round(rec.worked_ratio * 100));

                  return (
                    <tr key={rec.id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.825rem" }}>
                        {rec.calendar_date}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {emp ? emp.full_name : rec.employee_id.slice(0, 8)}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {emp?.employee_code || ""}
                          {dept ? ` • ${dept.name}` : ""}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                          {formatDuration(rec.worked_duration_minutes)} /{" "}
                          {formatDuration(rec.scheduled_duration_minutes)}
                        </div>
                        <div
                          style={{
                            marginTop: "0.25rem",
                            height: "5px",
                            width: "110px",
                            borderRadius: "999px",
                            background: "var(--bg-active)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${ratioPct}%`,
                              background:
                                rec.status === "PRESENT"
                                  ? "var(--color-success)"
                                  : rec.status === "HALF_DAY"
                                    ? "var(--color-warning)"
                                    : "var(--color-danger)",
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        {rec.late_minutes > 0 ? `+${rec.late_minutes}m late` : "0m"}
                        {rec.early_departure_minutes > 0
                          ? ` • -${rec.early_departure_minutes}m early`
                          : ""}
                      </td>
                      <td style={{ fontSize: "0.825rem", fontWeight: rec.overtime_minutes > 0 ? 600 : 400 }}>
                        {rec.overtime_minutes > 0 ? formatDuration(rec.overtime_minutes) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                          <Badge variant={statusBadgeVariant(rec.status)}>{rec.status}</Badge>
                          {rec.is_single_punch || rec.anomaly_code ? (
                            <span
                              title={rec.anomaly_code || "Single Punch Anomaly"}
                              style={{ display: "inline-flex", alignItems: "center" }}
                            >
                              <AlertTriangle size={14} color="var(--color-warning)" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                          {can("attendance.trace.read") ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<FileText size={14} />}
                              onClick={() => setTraceRecord(rec)}
                            >
                              Trace
                            </Button>
                          ) : null}
                          {can("attendance.daily.recalculate") ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Recalculate this record"
                              onClick={() => void handleQuickRecalculate(rec)}
                            >
                              <RefreshCw size={14} />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}

      {/* Explanation Trace Inspector Modal */}
      <TraceInspectorModal
        isOpen={Boolean(traceRecord)}
        onClose={() => setTraceRecord(null)}
        record={traceRecord}
        employee={traceRecord ? employeeMap.get(traceRecord.employee_id) || null : null}
      />

      {/* Recalculate Day Modal */}
      <RecalculateModal
        isOpen={isRecalcOpen}
        onClose={() => setIsRecalcOpen(false)}
        employees={employees}
        defaultDate={new Date().toISOString().slice(0, 10)}
        onRecalculated={loadData}
      />
    </div>
  );
}
