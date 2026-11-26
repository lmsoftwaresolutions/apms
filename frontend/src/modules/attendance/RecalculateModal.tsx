import { FormEvent, useEffect, useState } from "react";
import { api, Employee } from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";

export interface RecalculateModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  defaultDate: string;
  onRecalculated: () => Promise<void>;
}

export function RecalculateModal({
  isOpen,
  onClose,
  employees,
  defaultDate,
  onRecalculated,
}: RecalculateModalProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [calendarDate, setCalendarDate] = useState(defaultDate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeEmployees = employees.filter((e) => e.is_active);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setCalendarDate(defaultDate);
    if (activeEmployees.length > 0 && !employeeId) {
      setEmployeeId(activeEmployees[0].id);
    }
  }, [isOpen, defaultDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!employeeId || !calendarDate) return;
    setSubmitting(true);
    setError("");
    try {
      await api.recalculateAttendance(employeeId, calendarDate);
      await onRecalculated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate attendance");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Recalculate Daily Attendance"
      description="Re-run deterministic session pairing and generate a fresh immutable explanation trace."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="recalc-attendance-form"
            variant="primary"
            loading={submitting}
            disabled={!employeeId || !calendarDate}
          >
            Run Recalculation
          </Button>
        </>
      }
    >
      <form id="recalc-attendance-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        ) : null}

        <Field label="Employee" required>
          <select
            className="select"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
          >
            <option value="">Select employee...</option>
            {activeEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.employee_code} — {emp.full_name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Calendar Date" required>
            <input
              type="date"
              className="input"
              value={calendarDate}
              onChange={(e) => setCalendarDate(e.target.value)}
              required
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
