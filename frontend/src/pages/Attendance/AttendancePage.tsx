import React, { useEffect, useState } from "react";
import { Calendar, RefreshCw, Eye, AlertTriangle, Clock, Activity, CheckCircle, FileJson } from "lucide-react";
import {
  api,
  DailyAttendance,
  AttendanceTrace,
  PunchEvent,
  Employee,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Badge, Drawer, EmptyState } from "../../components/common/UIComponents";

export const ANOMALY_LABELS: Record<string, string> = {
  SINGLE_PUNCH: "Single Punch",
  UNSCHEDULED_SHIFT: "Unscheduled Shift",
  NO_PUNCH: "No Punch",
  EARLY_DEPARTURE: "Early Departure",
  LATE_ARRIVAL: "Late Arrival",
};

export function AttendancePage() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<"register" | "punches">("register");
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedEmpId, setSelectedEmpId] = useState("");

  // Trace Drawer state (Invariant #5)
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DailyAttendance | null>(null);
  const [trace, setTrace] = useState<AttendanceTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  // Recalculate Inline Confirm state (B8)
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [confirmRecalcId, setConfirmRecalcId] = useState<string | null>(null);

  async function loadMetadata() {
    try {
      const emps = await api.employees({ is_active: true });
      setEmployees(emps);
    } catch {}
  }

  async function loadAttendanceData() {
    setLoading(true);
    setError("");
    try {
      const recs = await api.dailyAttendance({
        start_date: startDate,
        end_date: endDate,
        employee_id: selectedEmpId || undefined,
      });
      setRecords(recs);

      if (activeTab === "punches") {
        const pEvents = await api.punches({
          employee_id: selectedEmpId || undefined,
        });
        setPunches(pEvents);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetadata();
  }, []);

  useEffect(() => {
    void loadAttendanceData();
  }, [startDate, endDate, selectedEmpId, activeTab]);

  const empMap = new Map(employees.map((e) => [e.id, e]));

  // Metric rollups
  const totalRecords = records.length;
  const presentCount = records.filter((r) => r.status === "PRESENT").length;
  const halfDayCount = records.filter((r) => r.status === "HALF_DAY").length;
  const absentCount = records.filter((r) => r.status === "ABSENT").length;
  const anomalyCount = records.filter((r) => !!r.anomaly_code || r.is_single_punch).length;

  const openTraceDrawer = async (rec: DailyAttendance) => {
    setSelectedRecord(rec);
    setIsTraceOpen(true);
    setLoadingTrace(true);
    try {
      const t = await api.getAttendanceTrace(rec.id);
      setTrace(t);
    } catch (err) {
      setTrace(null);
    } finally {
      setLoadingTrace(false);
    }
  };

  const handleRecalculate = async (rec: DailyAttendance) => {
    setRecalculatingId(rec.id);
    setConfirmRecalcId(null);
    try {
      await api.recalculateAttendance({
        employee_id: rec.employee_id,
        calendar_date: rec.calendar_date,
      });
      await loadAttendanceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate attendance");
    } finally {
      setRecalculatingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Daily Attendance Register & Trace Audit</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Deterministic rollup calculations with immutable JSON explanation traces (Invariant #4 & #5).
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex gap-2">
          <button
            className={activeTab === "register" ? "primary small" : "ghost small"}
            type="button"
            onClick={() => setActiveTab("register")}
          >
            Daily Register
          </button>
          <button
            className={activeTab === "punches" ? "primary small" : "ghost small"}
            type="button"
            onClick={() => setActiveTab("punches")}
          >
            Raw Punch Stream
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ padding: "0.6rem 0.8rem", background: "var(--danger-bg)", color: "var(--danger-fg)", borderRadius: "4px", fontSize: "0.82rem" }}>
          {error}
        </div>
      ) : null}

      {/* Metric Cards Summary */}
      <div className="grid-cols-4">
        <div className="stat-card">
          <span className="label">Present</span>
          <span className="value" style={{ color: "var(--success-fg)" }}>{presentCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Half Day</span>
          <span className="value" style={{ color: "var(--warning-fg)" }}>{halfDayCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Absent</span>
          <span className="value" style={{ color: "var(--danger-fg)" }}>{absentCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Anomalies</span>
          <span className="value" style={{ color: anomalyCount > 0 ? "var(--warning-fg)" : "var(--text-muted)" }}>
            {anomalyCount}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="panel" style={{ padding: "0.75rem 1rem", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div className="flex items-center gap-2">
          <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem", margin: 0 }}>
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "140px" }}
            />
          </label>

          <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem", margin: 0 }}>
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: "140px" }}
            />
          </label>

          <button
            className="ghost small"
            type="button"
            onClick={() => {
              setStartDate(today);
              setEndDate(today);
            }}
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            style={{ width: "220px" }}
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name} ({e.employee_code})
              </option>
            ))}
          </select>

          <button className="ghost small" type="button" onClick={() => loadAttendanceData()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Tab: Daily Register */}
      {activeTab === "register" ? (
        <div className="panel" style={{ padding: 0 }}>
          {records.length === 0 && !loading ? (
            <EmptyState
              icon={Calendar}
              title="No attendance records found"
              description="No daily attendance rollups calculated for this date window. Ensure shifts have been materialized and punches ingested."
            />
          ) : (
            <div className="table-container" style={{ border: "none" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Worked / Scheduled</th>
                    <th>Ratio</th>
                    <th>Late (m)</th>
                    <th>Early Exit (m)</th>
                    <th>Overtime (m)</th>
                    <th>Anomaly Code</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => {
                    const emp = empMap.get(rec.employee_id);
                    const isRecalculating = recalculatingId === rec.id;
                    const isConfirming = confirmRecalcId === rec.id;

                    const statusVariant =
                      rec.status === "PRESENT"
                        ? "present"
                        : rec.status === "HALF_DAY"
                        ? "halfday"
                        : rec.status === "ABSENT"
                        ? "absent"
                        : "neutral";

                    return (
                      <tr key={rec.id}>
                        <td className="tabular" style={{ fontWeight: 600 }}>{rec.calendar_date}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{emp?.full_name || "—"}</div>
                          <div className="text-secondary tabular" style={{ fontSize: "0.72rem" }}>
                            {emp?.employee_code || rec.employee_id.slice(0, 8)}
                          </div>
                        </td>
                        <td>
                          <Badge variant={statusVariant}>{rec.status}</Badge>
                        </td>
                        <td className="tabular">
                          {Math.floor(rec.worked_duration_minutes / 60)}h {rec.worked_duration_minutes % 60}m /{" "}
                          {Math.floor(rec.scheduled_duration_minutes / 60)}h {rec.scheduled_duration_minutes % 60}m
                        </td>
                        <td className="tabular" style={{ fontWeight: 600 }}>
                          {(rec.worked_ratio * 100).toFixed(0)}%
                        </td>
                        <td className="tabular" style={{ color: rec.late_minutes > 0 ? "var(--warning-fg)" : "inherit" }}>
                          {rec.late_minutes > 0 ? `+${rec.late_minutes}` : "0"}
                        </td>
                        <td className="tabular" style={{ color: rec.early_departure_minutes > 0 ? "var(--warning-fg)" : "inherit" }}>
                          {rec.early_departure_minutes > 0 ? `-${rec.early_departure_minutes}` : "0"}
                        </td>
                        <td className="tabular" style={{ color: rec.overtime_minutes > 0 ? "var(--success-fg)" : "inherit", fontWeight: rec.overtime_minutes > 0 ? 600 : 400 }}>
                          {rec.overtime_minutes > 0 ? `+${rec.overtime_minutes}` : "0"}
                        </td>
                        {/* B4: Anomaly Label Mapping */}
                        <td>
                          {rec.anomaly_code ? (
                            <Badge variant="halfday">
                              {ANOMALY_LABELS[rec.anomaly_code] || rec.anomaly_code}
                            </Badge>
                          ) : rec.is_single_punch ? (
                            <Badge variant="halfday">Single Punch</Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="flex items-center" style={{ justifyContent: "flex-end", gap: "0.4rem" }}>
                            <button
                              className="ghost small"
                              type="button"
                              onClick={() => openTraceDrawer(rec)}
                              title="Inspect explanation audit trace"
                            >
                              <Eye size={14} /> Trace
                            </button>

                            {/* B8: Recalculate Inline Popconfirm */}
                            {can("attendance.daily.recalculate") ? (
                              isConfirming ? (
                                <div className="flex items-center gap-1">
                                  <span style={{ fontSize: "0.72rem", color: "var(--warning-fg)" }}>Overwrite?</span>
                                  <button
                                    className="danger small"
                                    type="button"
                                    onClick={() => handleRecalculate(rec)}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => setConfirmRecalcId(null)}
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="ghost small"
                                  type="button"
                                  disabled={isRecalculating}
                                  onClick={() => setConfirmRecalcId(rec.id)}
                                  title="Recalculate attendance record"
                                >
                                  <RefreshCw size={13} className={isRecalculating ? "spin" : ""} />
                                </button>
                              )
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
        </div>
      ) : null}

      {/* Raw Punch Stream Tab */}
      {activeTab === "punches" ? (
        <div className="panel" style={{ padding: 0 }}>
          {punches.length === 0 && !loading ? (
            <EmptyState
              icon={Activity}
              title="No raw punch events"
              description="No device, eTime, or CSV bulk punches ingested for this filter criteria."
            />
          ) : (
            <div className="table-container" style={{ border: "none" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Punch Timestamp</th>
                    <th>Employee</th>
                    <th>Direction</th>
                    <th>Source Device / Adapter</th>
                    <th>Ingestion Status</th>
                  </tr>
                </thead>
                <tbody>
                  {punches.map((p) => {
                    const emp = empMap.get(p.employee_id);
                    return (
                      <tr key={p.id}>
                        <td className="tabular" style={{ fontWeight: 600 }}>
                          {new Date(p.punch_time).toLocaleString()}
                        </td>
                        <td>{emp?.full_name || p.employee_id.slice(0, 8)}</td>
                        <td>
                          <Badge variant="neutral">{p.punch_direction}</Badge>
                        </td>
                        <td>
                          <Badge variant="info">{p.source}</Badge>
                        </td>
                        <td>
                          <Badge variant={p.status === "VALID" ? "present" : "halfday"}>
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Explanation Trace Drawer (Invariant #5) */}
      <Drawer
        isOpen={isTraceOpen}
        onClose={() => setIsTraceOpen(false)}
        title={
          selectedRecord
            ? `Attendance Rule Trace — ${selectedRecord.calendar_date}`
            : "Explanation Trace"
        }
        footer={
          <button className="primary small" type="button" onClick={() => setIsTraceOpen(false)}>
            Close
          </button>
        }
      >
        {selectedRecord ? (
          <div className="flex flex-col gap-4">
            <div style={{ background: "var(--bg-subtle)", padding: "0.85rem", borderRadius: "6px" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem" }}>Summary Evaluation</div>
              <div className="grid-cols-2" style={{ fontSize: "0.78rem" }}>
                <div><strong>Status:</strong> {selectedRecord.status}</div>
                <div><strong>Worked Ratio:</strong> {(selectedRecord.worked_ratio * 100).toFixed(0)}%</div>
                <div><strong>Worked Minutes:</strong> {selectedRecord.worked_duration_minutes} min</div>
                <div><strong>Scheduled Minutes:</strong> {selectedRecord.scheduled_duration_minutes} min</div>
              </div>
            </div>

            {loadingTrace ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                Loading immutable cryptographic trace…
              </div>
            ) : trace ? (
              <div className="flex flex-col gap-3">
                {/* Visual Timeline & Session Evaluation */}
                <div style={{ border: "1px solid var(--border-default)", borderRadius: "6px", padding: "0.85rem" }}>
                  <div className="flex items-center gap-2" style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                    <Clock size={15} />
                    <span>N65 Multi-Session Gap & Punch Window Check</span>
                  </div>
                  <p className="text-secondary" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                    Evaluated under Confirmed N65: Mid-session breaks are strictly non-working time and excluded from duration totals.
                  </p>

                  {trace.trace_payload?.sessions ? (
                    <div className="flex flex-col gap-2">
                      {trace.trace_payload.sessions.map((s: any, idx: number) => (
                        <div key={idx} style={{ background: "var(--bg-canvas)", padding: "0.5rem 0.75rem", borderRadius: "4px", fontSize: "0.75rem" }}>
                          <div><strong>Session #{idx + 1}:</strong> {s.window_start || s.start_time} to {s.window_end || s.end_time}</div>
                          <div className="text-secondary">Worked: {s.worked_minutes || 0}m | Late: {s.late_minutes || 0}m</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Trace evaluated with standard daily session boundaries.
                    </div>
                  )}
                </div>

                {/* Raw JSON Trace Viewer */}
                <div>
                  <div className="flex items-center gap-1" style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.3rem" }}>
                    <FileJson size={15} />
                    <span>Immutable Audit Trace Payload</span>
                  </div>
                  <pre
                    style={{
                      background: "var(--bg-canvas)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "4px",
                      padding: "0.75rem",
                      fontSize: "0.72rem",
                      overflowX: "auto",
                      maxHeight: "260px",
                    }}
                  >
                    {JSON.stringify(trace.trace_payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                No explanation trace registered for this attendance record.
              </div>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
