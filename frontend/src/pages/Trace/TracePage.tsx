import React, { useEffect, useState } from "react";
import { api, AttendanceTrace, DailyAttendance, Employee } from "../../api";
import { Badge, Alert } from "../../components/common/UIComponents";
import { NavTab } from "../../components/layout/AppShell";
import { ArrowLeft, Search, FileJson, Copy, Check, RefreshCw } from "lucide-react";

export function TracePage({
  initialRecordId,
  onSelectTab,
}: {
  initialRecordId?: string | null;
  onSelectTab?: (tab: NavTab) => void;
}) {
  const [recordIdInput, setRecordIdInput] = useState(initialRecordId || "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [recentRecords, setRecentRecords] = useState<DailyAttendance[]>([]);

  const [trace, setTrace] = useState<AttendanceTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Load employee directory on mount
  useEffect(() => {
    api.employees()
      .then((emps) => {
        setEmployees(emps);
        if (emps.length > 0 && !selectedEmpId) {
          setSelectedEmpId(emps[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch initial trace if initialRecordId is provided
  useEffect(() => {
    if (initialRecordId) {
      setRecordIdInput(initialRecordId);
      loadTraceById(initialRecordId);
    }
  }, [initialRecordId]);

  const loadTraceById = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError("");
    try {
      const t = await api.getAttendanceTrace(id.trim());
      setTrace(t);
    } catch (err: any) {
      setTrace(null);
      setError(
        err?.message || "Explanation trace not found for this record. Recalculate attendance to generate an immutable trace."
      );
    } finally {
      setLoading(false);
    }
  };

  // Find attendance record by employee and date
  const handleLookupByEmpDate = async () => {
    if (!selectedEmpId || !selectedDate) return;
    setLoading(true);
    setError("");
    setTrace(null);
    try {
      const records = await api.dailyAttendance({
        employee_id: selectedEmpId,
        start_date: selectedDate,
        end_date: selectedDate,
      });
      setRecentRecords(records);
      if (records.length === 0) {
        setError(`No attendance record found for selected employee on ${selectedDate}.`);
      } else {
        const targetRec = records[0];
        setRecordIdInput(targetRec.id);
        await loadTraceById(targetRec.id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to search attendance record.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!selectedEmpId || !selectedDate) return;
    setRecalculating(true);
    setError("");
    try {
      const rec = await api.recalculateAttendance({
        employee_id: selectedEmpId,
        calendar_date: selectedDate,
      });
      setRecordIdInput(rec.id);
      await loadTraceById(rec.id);
    } catch (err: any) {
      setError(err?.message || "Recalculation failed.");
    } finally {
      setRecalculating(false);
    }
  };

  const copyJson = () => {
    if (!trace) return;
    navigator.clipboard.writeText(JSON.stringify(trace.trace_payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const p = trace?.trace_payload;
  const sessions = p?.sessions || [];
  const punches = p?.raw_punches || p?.punches || [];
  const rules = p?.policy_evaluated || p?.shift_policy || {};

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Deterministic Explanation Trace Inspector</h1>
          <p className="page-subtitle">
            Cryptographically sealed and immutable audit trail (Invariants #4, #5 &amp; #8)
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {onSelectTab && (
            <button
              className="ghost small"
              type="button"
              onClick={() => onSelectTab("attendance")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <ArrowLeft size={14} />
              <span>Back to Attendance</span>
            </button>
          )}
          <Badge variant="success">Deterministic Engine</Badge>
        </div>
      </div>

      {error ? (
        <Alert variant="warning" onDismiss={() => setError("")}>
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            {selectedEmpId && selectedDate && (
              <button
                className="primary small"
                type="button"
                onClick={handleRecalculate}
                disabled={recalculating}
              >
                {recalculating ? "Calculating…" : "Recalculate & Generate Trace"}
              </button>
            )}
          </div>
        </Alert>
      ) : null}

      {/* Lookup Controls */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="card-header">
          <h3 className="card-title">Select Attendance Record to Inspect</h3>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
            <div className="form-group">
              <label>Employee</label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Shift Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                className="primary"
                type="button"
                onClick={handleLookupByEmpDate}
                disabled={loading || !selectedEmpId || !selectedDate}
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}
              >
                <Search size={15} />
                <span>{loading ? "Searching…" : "Inspect Record"}</span>
              </button>

              <button
                className="ghost"
                type="button"
                onClick={handleRecalculate}
                disabled={recalculating || !selectedEmpId || !selectedDate}
                title="Force attendance recalculation"
              >
                <RefreshCw size={15} className={recalculating ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            <span>Or inspect directly by Attendance Record UUID:</span>
            <input
              type="text"
              value={recordIdInput}
              onChange={(e) => setRecordIdInput(e.target.value)}
              placeholder="e.g. 7f8c1920-4b2a-4632-901a-829b3f1190cd"
              style={{ flex: 1, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "var(--font-mono, monospace)" }}
            />
            <button
              className="ghost small"
              type="button"
              onClick={() => loadTraceById(recordIdInput)}
              disabled={loading || !recordIdInput}
            >
              Load
            </button>
          </div>
        </div>
      </div>

      {/* Main Trace Breakdown View */}
      {trace ? (
        <div className="trace-two-col">
          {/* Left: Step-by-step Execution Steps */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Rule Evaluation Pipeline</h3>
                <div className="mono text-secondary text-xs" style={{ marginTop: "0.2rem" }}>
                  Record ID: {trace.attendance_record_id} • Evaluated: {new Date(trace.evaluated_at).toLocaleString("en-IN")}
                </div>
              </div>
              <Badge variant="success">INVARIANT #5 SEALED</Badge>
            </div>
            <div className="card-body">
              <div className="trace-steps">
                {/* Step 1 */}
                <div className="trace-step">
                  <div className="trace-step-num">1</div>
                  <div>
                    <div className="font-semibold text-sm">Punch Discovery &amp; Envelope Binding</div>
                    <p className="text-secondary text-xs mt-1">
                      Raw punch envelopes bound to tenant shift date {trace.calendar_date}.
                      {punches.length > 0 ? ` Found ${punches.length} associated punch event(s).` : " Evaluated with recorded punches."}
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="trace-step">
                  <div className="trace-step-num">2</div>
                  <div>
                    <div className="font-semibold text-sm">Session Boundary &amp; Grace Evaluation</div>
                    <p className="text-secondary text-xs mt-1">
                      {sessions.length > 0
                        ? `Evaluated ${sessions.length} scheduled session(s). Grace period and arrival windows tested deterministically.`
                        : "Matched assigned shift template schedule and applied attendance threshold rules."}
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="trace-step">
                  <div className="trace-step-num">3</div>
                  <div>
                    <div className="font-semibold text-sm">Multi-Session Gap &amp; Break Deductions</div>
                    <p className="text-secondary text-xs mt-1">
                      Enforced <strong>Confirmed Invariant N65</strong>: Unscheduled mid-shift gaps strictly excluded from worked hours. Meal breaks deducted.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="trace-step trace-step--success">
                  <div className="trace-step-num trace-step-num--success">4</div>
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "var(--color-success, #10b981)" }}>
                      Final Status Classification
                    </div>
                    <p className="text-secondary text-xs mt-1">
                      Status: <strong>{p?.final_status || p?.status || "EVALUATED"}</strong>.
                      Worked: {p?.worked_duration_minutes ?? "—"} mins. Overtime: {p?.overtime_minutes ?? 0} mins.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Immutable JSON Viewer */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <FileJson size={16} />
                <span className="card-title">Immutable Trace JSON</span>
              </div>
              <button
                className="ghost small"
                type="button"
                onClick={copyJson}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              >
                {copied ? <Check size={14} style={{ color: "var(--color-success)" }} /> : <Copy size={14} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div className="card-body">
              <pre className="trace-json-viewer">
                {JSON.stringify(trace.trace_payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : !loading ? (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
          <p style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text-primary)" }}>
            Select an employee and shift date above to inspect their immutable explanation trace.
          </p>
          <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Traces are deterministically generated and cryptographically preserved during daily rollup.
          </p>
        </div>
      ) : null}
    </div>
  );
}
