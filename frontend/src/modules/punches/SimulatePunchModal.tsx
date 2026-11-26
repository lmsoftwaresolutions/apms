import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, Employee, PunchIngestResult } from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";

export interface SimulatePunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onIngested: () => Promise<void>;
}

function defaultNowLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function SimulatePunchModal({
  isOpen,
  onClose,
  employees,
  onIngested,
}: SimulatePunchModalProps) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [punchDateTime, setPunchDateTime] = useState(defaultNowLocal());
  const [direction, setDirection] = useState<"IN" | "OUT" | "UNKNOWN">("IN");
  const [deviceIdentifier, setDeviceIdentifier] = useState("SIM-BIO-GATE-01");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PunchIngestResult | null>(null);

  const activeEmployees = employees.filter((e) => e.is_active);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setResult(null);
    setPunchDateTime(defaultNowLocal());
    if (activeEmployees.length > 0 && !employeeCode) {
      setEmployeeCode(activeEmployees[0].employee_code);
    }
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!employeeCode.trim() || !punchDateTime) return;

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const formattedTime = `${punchDateTime.replace("T", " ")}:00`;
      const csvText = `employee_code,punch_time,direction\n${employeeCode.trim()},${formattedTime},${direction}`;
      const res = await api.ingestPunches({
        source: "CSV_BULK",
        device_identifier: deviceIdentifier.trim() || "SIM-DEVICE",
        raw_payload: { csv_text: csvText },
      });
      setResult(res);
      await onIngested();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest simulated punch");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Simulate Biometric / Manual Punch"
      description="Inject a test punch into the immutable raw_envelope ledger to verify Rule N61 debouncing and attendance pairing."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          <Button
            type="submit"
            form="simulate-punch-form"
            variant="primary"
            loading={submitting}
            disabled={!employeeCode.trim()}
          >
            Ingest Punch
          </Button>
        </>
      }
    >
      <form id="simulate-punch-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        ) : null}

        {result ? (
          <div
            style={{
              padding: "0.75rem 0.875rem",
              borderRadius: "var(--radius)",
              background: "var(--color-success-bg)",
              border: "1px solid var(--color-success-border)",
              color: "var(--color-success-fg)",
              fontSize: "0.85rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>
                {result.is_duplicate
                  ? "Duplicate Payload Suppressed"
                  : result.duplicates_ignored > 0
                    ? "Debounced (Rule N61)"
                    : "Punch Accepted into Ledger"}
              </strong>
              <div style={{ marginTop: "0.15rem", fontSize: "0.8rem" }}>
                Active: {result.active_punches} • Debounced: {result.duplicates_ignored} • Envelope:{" "}
                <code>{result.raw_envelope_id.slice(0, 8)}</code>
              </div>
            </div>
          </div>
        ) : null}

        <Field label="Employee" required>
          <select
            className="select"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            required
          >
            <option value="">Select employee...</option>
            {activeEmployees.map((emp) => (
              <option key={emp.id} value={emp.employee_code}>
                {emp.employee_code} — {emp.full_name}
              </option>
            ))}
          </select>
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
        >
          <Field label="Punch Date & Time (IST)" required>
            <input
              type="datetime-local"
              className="input"
              value={punchDateTime}
              onChange={(e) => setPunchDateTime(e.target.value)}
              required
            />
          </Field>

          <Field label="Direction">
            <select
              className="select"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "IN" | "OUT" | "UNKNOWN")}
            >
              <option value="IN">IN (Check-In)</option>
              <option value="OUT">OUT (Check-Out)</option>
              <option value="UNKNOWN">UNKNOWN (Auto)</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Device Identifier" help="Hardware terminal or virtual gate ID">
            <input
              className="input"
              value={deviceIdentifier}
              onChange={(e) => setDeviceIdentifier(e.target.value)}
              maxLength={100}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
