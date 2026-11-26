import { ChangeEvent, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Upload,
  Zap,
} from "lucide-react";
import { api, Employee, PunchEvent, PunchIngestResult } from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { ingestOutcome, istDateStamp, parseCsvPreview } from "./punchCsv";
import { SimulatePunchModal } from "./SimulatePunchModal";

type ActiveTab = "stream" | "csv";

export function PunchStreamPage() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("stream");
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Live Stream Controls & Filters
  const [livePolling, setLivePolling] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);

  // CSV Ingestion State
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvSubmitting, setCsvSubmitting] = useState(false);
  const [csvResult, setCsvResult] = useState<PunchIngestResult | null>(null);
  const [csvError, setCsvError] = useState("");

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [punchList, empList] = await Promise.all([
        api.punches({
          employee_id: employeeFilter || undefined,
          status: statusFilter || undefined,
          limit: 100,
        }),
        employees.length > 0 ? Promise.resolve(employees) : api.employeesList(),
      ]);
      setPunches(punchList);
      if (employees.length === 0) setEmployees(empList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load punch events");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [employeeFilter, statusFilter]);

  useEffect(() => {
    if (!livePolling) return;
    const timer = window.setInterval(() => {
      void loadData(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [livePolling, employeeFilter, statusFilter]);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  function formatIstTimestamp(iso: string): string {
    try {
      return new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return iso;
    }
  }

  function handleCsvFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvResult(null);
    setCsvError("");
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ""));
    };
    reader.readAsText(file);
  }

  function handleDownloadSampleCsv() {
    const sampleCode = employees[0]?.employee_code || "EMP001";
    const today = istDateStamp();
    const sample = `employee_code,punch_time,direction\n${sampleCode},${today} 09:02:15,IN\n${sampleCode},${today} 18:05:40,OUT\n`;
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apms_punch_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const csvRows = parseCsvPreview(csvText);
  const validCsvCount = csvRows.filter((r) => r.valid).length;
  const csvOutcome = csvResult ? ingestOutcome(csvResult) : null;

  async function handleCommitCsv() {
    if (!csvText.trim()) return;
    setCsvSubmitting(true);
    setCsvError("");
    setCsvResult(null);
    try {
      const res = await api.ingestPunches({
        source: "CSV_BULK",
        device_identifier: csvFileName || "web_csv_bulk_upload",
        raw_payload: { csv_text: csvText },
      });
      setCsvResult(res);
      await loadData(true);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Failed to ingest CSV batch");
    } finally {
      setCsvSubmitting(false);
    }
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
          <h2 className="card-title">Punch Stream &amp; Ingestion Center</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Real-time append-only hardware punch stream, Rule N61 debounce status, and bulk CSV ingestion.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant={livePolling ? "primary" : "secondary"}
            size="sm"
            icon={<Activity size={15} />}
            onClick={() => setLivePolling((v) => !v)}
          >
            {livePolling ? "Live Polling: ON" : "Live Polling: OFF"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={15} />}
            onClick={() => void loadData()}
          >
            Refresh
          </Button>
          {can("capture.punch.ingest") ? (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => setIsSimModalOpen(true)}
            >
              Simulate Punch
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <Button
          size="sm"
          variant={activeTab === "stream" ? "primary" : "secondary"}
          icon={<Zap size={15} />}
          onClick={() => setActiveTab("stream")}
        >
          Live Punch Feed ({punches.length})
        </Button>
        {can("capture.punch.ingest") ? (
          <Button
            size="sm"
            variant={activeTab === "csv" ? "primary" : "secondary"}
            icon={<FileSpreadsheet size={15} />}
            onClick={() => setActiveTab("csv")}
          >
            Bulk CSV Ingestion
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {activeTab === "stream" ? (
        <>
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
            <select
              className="select"
              style={{ flex: "1 1 200px", maxWidth: "280px" }}
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
            >
              <option value="">All Employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.full_name}
                </option>
              ))}
            </select>

            <select
              className="select"
              style={{ flex: "1 1 180px", maxWidth: "240px" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE (Accepted)</option>
              <option value="DUPLICATE_IGNORED">DUPLICATE_IGNORED (N61)</option>
              <option value="CONSENT_WITHDRAWN">CONSENT_WITHDRAWN</option>
            </select>
          </div>

          {/* Punch Feed Table */}
          {loading ? (
            <div className="table-container">
              <table className="data-table">
                <tbody>
                  <LoadingRow cols={5} />
                </tbody>
              </table>
            </div>
          ) : punches.length === 0 ? (
            <EmptyState
              icon={<Zap size={36} />}
              title="No punch events recorded"
              description="Use Simulate Punch or Bulk CSV Ingestion to ingest biometric or manual punches."
              action={
                can("capture.punch.ingest")
                  ? {
                      label: "Simulate Punch",
                      onClick: () => setIsSimModalOpen(true),
                      icon: <Plus size={15} />,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="table-container">
              <table className="data-table">
                  <thead>
                    <tr>
                      <th>Punch Time (IST)</th>
                      <th>Employee</th>
                      <th>Source / Device</th>
                      <th>Direction</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punches.map((p) => {
                      const emp = employeeMap.get(p.employee_id);
                      return (
                        <tr key={p.id}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.825rem" }}>
                            {formatIstTimestamp(p.punch_time)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>
                              {emp ? emp.full_name : p.employee_id.slice(0, 8)}
                            </div>
                            {emp ? (
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {emp.employee_code}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <Badge variant="neutral">{p.source}</Badge>
                          </td>
                          <td>
                            <Badge
                              variant={
                                p.punch_direction === "IN"
                                  ? "info"
                                  : p.punch_direction === "OUT"
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {p.punch_direction}
                            </Badge>
                          </td>
                          <td>
                            <Badge
                              variant={
                                p.status === "ACTIVE"
                                  ? "success"
                                  : p.status === "DUPLICATE_IGNORED"
                                    ? "warning"
                                    : "danger"
                              }
                            >
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
        </>
      ) : (
        /* Tab 2: Bulk CSV Ingestion */
        <div className="card-panel" style={{ padding: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Upload or Paste Biometric Log CSV</h3>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.825rem", color: "var(--text-muted)" }}>
                Required columns: <code>employee_code</code>, <code>punch_time</code> (IST{" "}
                <code>YYYY-MM-DD HH:MM:SS</code>), optional <code>direction</code> (IN/OUT).
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={15} />}
              onClick={handleDownloadSampleCsv}
            >
              Download Sample CSV
            </Button>
          </div>

          {csvError ? (
            <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
              {csvError}
            </div>
          ) : null}

          {csvResult ? (
            <div
              style={{
                padding: "0.875rem 1rem",
                borderRadius: "var(--radius)",
                background:
                  csvOutcome?.tone === "success"
                    ? "var(--color-success-bg)"
                    : "var(--color-warning-bg)",
                border:
                  csvOutcome?.tone === "success"
                    ? "1px solid var(--color-success-border)"
                    : "1px solid var(--color-warning-border)",
                color:
                  csvOutcome?.tone === "success"
                    ? "var(--color-success-fg)"
                    : "var(--color-warning-fg)",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
              }}
            >
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ fontSize: "0.85rem" }}>
                <strong>{csvOutcome?.title}</strong>
                <div style={{ marginTop: "0.2rem" }}>
                  Received: <strong>{csvResult.total_received}</strong> • Active:{" "}
                  <strong>{csvResult.active_punches}</strong> • Debounced (N61):{" "}
                  <strong>{csvResult.duplicates_ignored}</strong>
                  {csvResult.unmatched_employees.length > 0
                    ? ` • Unmatched codes: ${csvResult.unmatched_employees.join(", ")}`
                    : ""}
                </div>
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
              <Upload size={15} />
              Choose .csv File
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                style={{ display: "none" }}
              />
            </label>
            {csvFileName ? (
              <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Loaded: <strong>{csvFileName}</strong>
              </span>
            ) : null}
          </div>

          <textarea
            className="input"
            rows={6}
            placeholder={"employee_code,punch_time,direction\nEMP001,2026-11-26 09:02:00,IN\nEMP001,2026-11-26 18:04:00,OUT"}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setCsvResult(null);
            }}
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
          />

          {csvRows.length > 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.825rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                Pre-flight Summary: {csvRows.length} rows detected • {validCsvCount} valid •{" "}
                {csvRows.length - validCsvCount} malformed
              </div>
              <div className="table-container" style={{ maxHeight: "220px" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Emp Code</th>
                      <th>Punch Time</th>
                      <th>Direction</th>
                      <th>Valid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 15).map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>
                          <code>{r.employee_code || "—"}</code>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                          {r.punch_time || "—"}
                        </td>
                        <td>{r.direction}</td>
                        <td>
                          <Badge variant={r.valid ? "success" : "danger"}>
                            {r.valid ? "Valid" : "Invalid"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.65rem",
              marginTop: "1rem",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => {
                setCsvText("");
                setCsvFileName("");
                setCsvResult(null);
                setCsvError("");
              }}
              disabled={!csvText || csvSubmitting}
            >
              Clear
            </Button>
            <Button
              variant="primary"
              loading={csvSubmitting}
              disabled={validCsvCount === 0}
              onClick={handleCommitCsv}
            >
              Commit {validCsvCount} Rows to Ledger
            </Button>
          </div>
        </div>
      )}

      {/* Simulate Punch Modal */}
      <SimulatePunchModal
        isOpen={isSimModalOpen}
        onClose={() => setIsSimModalOpen(false)}
        employees={employees}
        onIngested={() => loadData(true)}
      />
    </div>
  );
}
