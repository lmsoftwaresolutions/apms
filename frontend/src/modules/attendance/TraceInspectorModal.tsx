import { useEffect, useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import { api, AttendanceTrace, DailyAttendanceRecord, Employee } from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { Spinner } from "../../components/common/Spinner";
import { formatDuration } from "../shifts/shiftUtils";

export interface TraceInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: DailyAttendanceRecord | null;
  employee: Employee | null;
}

export function TraceInspectorModal({
  isOpen,
  onClose,
  record,
  employee,
}: TraceInspectorModalProps) {
  const [trace, setTrace] = useState<AttendanceTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !record) return;
    setLoading(true);
    setError("");
    setTrace(null);
    setCopied(false);

    void api
      .attendanceTrace(record.id)
      .then((res) => setTrace(res))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load explanation trace"),
      )
      .finally(() => setLoading(false));
  }, [isOpen, record?.id]);

  if (!record) return null;

  async function handleCopyJson() {
    if (!trace) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(trace.trace_payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard failures */
    }
  }

  const ratioPct = Math.round(record.worked_ratio * 100);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FileText size={18} color="var(--color-primary)" />
          Audit Explanation Trace
        </span>
      }
      description={
        employee
          ? `${employee.full_name} (${employee.employee_code}) • ${record.calendar_date}`
          : record.calendar_date
      }
      footer={
        <>
          {trace ? (
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? <Check size={14} /> : <Copy size={14} />}
              onClick={() => void handleCopyJson()}
            >
              {copied ? "Copied JSON" : "Copy Raw JSON"}
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {/* Deterministic Rollup Summary Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "0.65rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            padding: "0.65rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Decision
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <Badge
              variant={
                record.status === "PRESENT"
                  ? "success"
                  : record.status === "HALF_DAY"
                    ? "warning"
                    : record.status === "ABSENT"
                      ? "danger"
                      : "info"
              }
            >
              {record.status}
            </Badge>
          </div>
        </div>

        <div
          style={{
            padding: "0.65rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Worked / Sched
          </div>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", marginTop: "0.2rem" }}>
            {formatDuration(record.worked_duration_minutes)} /{" "}
            {formatDuration(record.scheduled_duration_minutes)}
          </div>
        </div>

        <div
          style={{
            padding: "0.65rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Worked Ratio
          </div>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", marginTop: "0.2rem" }}>
            {ratioPct}% ({record.worked_ratio.toFixed(2)})
          </div>
        </div>

        <div
          style={{
            padding: "0.65rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Late / Early / OT
          </div>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginTop: "0.2rem" }}>
            {record.late_minutes}m / {record.early_departure_minutes}m / {record.overtime_minutes}m
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <Spinner size="md" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : trace ? (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.4rem",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
            }}
          >
            <span>IMMUTABLE JSON EXPLANATION TRACE</span>
            <span>Evaluated: {new Date(trace.evaluated_at).toLocaleString("en-IN")}</span>
          </div>
          <pre
            style={{
              margin: 0,
              padding: "0.875rem",
              borderRadius: "var(--radius)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-default)",
              fontSize: "0.78rem",
              maxHeight: "340px",
              overflow: "auto",
              fontFamily: "var(--font-mono)",
            }}
          >
            {JSON.stringify(trace.trace_payload, null, 2)}
          </pre>
        </div>
      ) : null}
    </Modal>
  );
}
