import { FormEvent, useEffect, useState } from "react";
import { api, LeaveType } from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ApplyLeaveModal({
  isOpen,
  onClose,
  employeeId,
  leaveTypes,
  onSubmitted,
}: {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  leaveTypes: LeaveType[];
  onSubmitted: () => Promise<void>;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [portion, setPortion] = useState("FULL");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setReason("");
    setStartDate(todayIso());
    setEndDate(todayIso());
    setPortion("FULL");
    if (leaveTypes.length > 0 && !leaveTypeId) {
      setLeaveTypeId(leaveTypes[0].id);
    }
  }, [isOpen, leaveTypes]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!leaveTypeId || reason.trim().length < 3) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createLeaveRequest({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: portion === "FULL" ? endDate : startDate,
        portion,
        reason: reason.trim(),
      });
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Apply for Leave"
      description="Submit a leave request against your double-entry leave ledger."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="ess-leave-form"
            variant="primary"
            loading={submitting}
            disabled={!leaveTypeId || reason.trim().length < 3}
          >
            Submit Leave
          </Button>
        </>
      }
    >
      <form id="ess-leave-form" onSubmit={handleSubmit}>
        {error ? <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div> : null}

        <Field label="Leave Type" required>
          <select
            className="select"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            required
          >
            <option value="">Select leave type...</option>
            {leaveTypes.map((lt) => (
              <option key={lt.id} value={lt.id}>
                {lt.code} — {lt.name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.65rem", marginTop: "0.75rem" }}>
          <Field label="Start Date" required>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </Field>
          <Field label="End Date" required>
            <input
              type="date"
              className="input"
              value={portion === "FULL" ? endDate : startDate}
              disabled={portion !== "FULL"}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Session Portion">
            <select className="select" value={portion} onChange={(e) => setPortion(e.target.value)}>
              <option value="FULL">Full Day</option>
              <option value="FIRST_HALF">First Half</option>
              <option value="SECOND_HALF">Second Half</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Reason" required>
            <textarea
              className="input"
              rows={2}
              placeholder="Reason for leave..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function ApplyRegularizationModal({
  isOpen,
  onClose,
  employeeId,
  onSubmitted,
}: {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  onSubmitted: () => Promise<void>;
}) {
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [requestType, setRequestType] = useState("MISSING_OUT");
  const [requestedIn, setRequestedIn] = useState("09:00");
  const [requestedOut, setRequestedOut] = useState("18:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setReason("");
    setCalendarDate(todayIso());
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createRegularization({
        employee_id: employeeId,
        calendar_date: calendarDate,
        request_type: requestType,
        requested_in: requestedIn ? `${calendarDate}T${requestedIn}:00+05:30` : null,
        requested_out: requestedOut ? `${calendarDate}T${requestedOut}:00+05:30` : null,
        reason: reason.trim(),
      });
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit regularization");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Regularize Missing / Incorrect Punch"
      description="Request supervisor approval for a missed or misrecorded punch."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="ess-reg-form"
            variant="primary"
            loading={submitting}
            disabled={reason.trim().length < 3}
          >
            Submit Request
          </Button>
        </>
      }
    >
      <form id="ess-reg-form" onSubmit={handleSubmit}>
        {error ? <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.65rem" }}>
          <Field label="Date" required>
            <input
              type="date"
              className="input"
              value={calendarDate}
              onChange={(e) => setCalendarDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Issue Type" required>
            <select
              className="select"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
            >
              <option value="MISSING_OUT">Missing Out Punch</option>
              <option value="MISSING_IN">Missing In Punch</option>
              <option value="CORRECTION">Time Correction</option>
            </select>
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.65rem", marginTop: "0.75rem" }}>
          <Field label="Actual In Time">
            <input
              type="time"
              className="input"
              value={requestedIn}
              onChange={(e) => setRequestedIn(e.target.value)}
            />
          </Field>
          <Field label="Actual Out Time">
            <input
              type="time"
              className="input"
              value={requestedOut}
              onChange={(e) => setRequestedOut(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Reason" required>
            <textarea
              className="input"
              rows={2}
              placeholder="e.g. Biometric terminal offline at gate"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function ApplyWorkModeModal({
  isOpen,
  onClose,
  onSubmitted,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const [workMode, setWorkMode] = useState<"WFH" | "ON_DUTY">("WFH");
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [sessionTarget, setSessionTarget] = useState<"FULL" | "FIRST_HALF" | "SECOND_HALF">("FULL");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setReason("");
    setCalendarDate(todayIso());
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    setError("");
    try {
      await api.essApplyWorkMode({
        work_mode: workMode,
        calendar_date: calendarDate,
        session_target: sessionTarget,
        reason: reason.trim(),
      });
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit work mode request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Apply WFH / On-Duty"
      description="Request Work From Home or Field On-Duty attendance credit."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="ess-workmode-form"
            variant="primary"
            loading={submitting}
            disabled={reason.trim().length < 3}
          >
            Submit Request
          </Button>
        </>
      }
    >
      <form id="ess-workmode-form" onSubmit={handleSubmit}>
        {error ? <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.65rem" }}>
          <Field label="Mode" required>
            <select
              className="select"
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as "WFH" | "ON_DUTY")}
            >
              <option value="WFH">Work From Home (WFH)</option>
              <option value="ON_DUTY">On Duty (Client / Field)</option>
            </select>
          </Field>
          <Field label="Date" required>
            <input
              type="date"
              className="input"
              value={calendarDate}
              onChange={(e) => setCalendarDate(e.target.value)}
              required
            />
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Session Target">
            <select
              className="select"
              value={sessionTarget}
              onChange={(e) =>
                setSessionTarget(e.target.value as "FULL" | "FIRST_HALF" | "SECOND_HALF")
              }
            >
              <option value="FULL">Full Day</option>
              <option value="FIRST_HALF">First Half</option>
              <option value="SECOND_HALF">Second Half</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Reason" required>
            <textarea
              className="input"
              rows={2}
              placeholder="e.g. Client site visit / Remote sprint work"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
