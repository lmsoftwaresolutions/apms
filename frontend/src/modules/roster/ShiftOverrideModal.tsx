import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { api, DatedShiftInstance, Employee, ShiftTemplate } from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";
import { computeRestGapHours } from "./rosterUtils";

export interface ShiftOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "override" | "cancel";
  instance: DatedShiftInstance | null;
  prevInstance?: DatedShiftInstance;
  employee: Employee | null;
  templates: ShiftTemplate[];
  onSaved: () => Promise<void>;
}

export function ShiftOverrideModal({
  isOpen,
  onClose,
  mode,
  instance,
  prevInstance,
  employee,
  templates,
  onSaved,
}: ShiftOverrideModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isRestDay, setIsRestDay] = useState(false);
  const [reason, setReason] = useState("");
  const [ackRestWarning, setAckRestWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !instance) return;
    setError("");
    setReason("");
    setAckRestWarning(false);
    setIsRestDay(instance.is_rest_day);
    const activeTemplates = templates.filter((t) => t.is_active);
    setSelectedTemplateId(
      instance.shift_template_id || activeTemplates[0]?.id || "",
    );
  }, [isOpen, instance, templates]);

  if (!instance || !employee) return null;

  const activeTemplates = templates.filter((t) => t.is_active);
  const currentTpl = templates.find((t) => t.id === instance.shift_template_id);
  const nextTpl = !isRestDay
    ? templates.find((t) => t.id === selectedTemplateId)
    : undefined;

  const restGapHours =
    mode === "override" && !isRestDay
      ? computeRestGapHours(prevInstance, nextTpl)
      : null;
  const hasRestGapWarning = restGapHours !== null && restGapHours < 11;

  const isSubmitDisabled =
    submitting ||
    reason.trim().length < 3 ||
    (mode === "override" && !isRestDay && !selectedTemplateId) ||
    (hasRestGapWarning && !ackRestWarning);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!instance || isSubmitDisabled) return;

    setSubmitting(true);
    setError("");
    try {
      if (mode === "cancel") {
        await api.cancelShiftInstance(instance.id, {
          reason: reason.trim(),
        });
      } else {
        await api.overrideShiftInstance(instance.id, {
          shift_template_id: isRestDay ? null : selectedTemplateId,
          is_rest_day: isRestDay,
          reason: reason.trim(),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shift instance");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        mode === "cancel"
          ? "Cancel Scheduled Session (Rule N66d)"
          : "Override Shift for Date (Rule N67)"
      }
      description={
        mode === "cancel"
          ? "Employer-cancelled session defaults to CANCELLED_PAID with full attendance credit for salaried staff."
          : "Modify shift assignment for a specific calendar date without altering the employee's base pattern."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="shift-override-form"
            variant={mode === "cancel" ? "danger" : "primary"}
            loading={submitting}
            disabled={isSubmitDisabled}
          >
            {mode === "cancel" ? "Confirm Session Cancellation" : "Apply Dated Override"}
          </Button>
        </>
      }
    >
      <form id="shift-override-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        ) : null}

        {/* Context Banner */}
        <div
          style={{
            padding: "0.75rem 0.875rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
            <strong>
              {employee.full_name} ({employee.employee_code})
            </strong>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              {instance.calendar_date}
            </span>
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>
            Current Schedule:{" "}
            {instance.is_rest_day
              ? "Rest Day (OFF)"
              : currentTpl
                ? `${currentTpl.code} — ${currentTpl.name}`
                : "Scheduled Shift"}
          </div>
        </div>

        {mode === "cancel" ? (
          <div
            style={{
              padding: "0.75rem 0.875rem",
              borderRadius: "var(--radius)",
              background: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning-border)",
              color: "var(--color-warning-fg)",
              fontSize: "0.825rem",
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <Ban size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Employer Cancellation (N66d / ROS-10):</strong> Marking this session as{" "}
              <code>CANCELLED_PAID</code> preserves full paid attendance credit for salaried employees.
            </div>
          </div>
        ) : (
          <>
            {/* Factories Act Section 56 Rest Gap Warning */}
            {hasRestGapWarning ? (
              <div
                style={{
                  padding: "0.75rem 0.875rem",
                  borderRadius: "var(--radius)",
                  background: "var(--color-warning-bg)",
                  border: "1px solid var(--color-warning-border)",
                  color: "var(--color-warning-fg)",
                  fontSize: "0.825rem",
                  display: "flex",
                  gap: "0.6rem",
                  marginBottom: "1rem",
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>
                    STATUTORY REST INTERVAL WARNING ({restGapHours}h gap &lt; 11h minimum)
                  </strong>
                  <div style={{ marginTop: "0.2rem" }}>
                    Factories Act §56 requires at least 11 hours of continuous rest between shifts.
                    Document justification and acknowledge below before applying.
                  </div>
                </div>
              </div>
            ) : null}

            <Field label="New Override Shift" required={!isRestDay}>
              <select
                className="select"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={isRestDay}
                required={!isRestDay}
              >
                <option value="">Select shift template...</option>
                {activeTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.code} — {tpl.name} ({tpl.shift_type})
                  </option>
                ))}
              </select>
            </Field>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
                margin: "0.75rem 0 1rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isRestDay}
                onChange={(e) => setIsRestDay(e.target.checked)}
              />
              Mark as Weekly Off / Rest Day (OFF) instead
            </label>
          </>
        )}

        <Field
          label={mode === "cancel" ? "Cancellation Reason" : "Reason for Override"}
          required
          help="Minimum 3 characters (audited on immutable N67/N66d trace)."
        >
          <textarea
            className="input"
            rows={2}
            placeholder={
              mode === "cancel"
                ? "e.g. Unplanned power outage / maintenance shutdown"
                : "e.g. Covering night supervisor shift due to emergency absence"
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={255}
          />
        </Field>

        {hasRestGapWarning ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.825rem",
              marginTop: "0.75rem",
              fontWeight: 500,
              color: "var(--color-warning-fg)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={ackRestWarning}
              onChange={(e) => setAckRestWarning(e.target.checked)}
            />
            I acknowledge the &lt;11h rest gap warning and confirm emergency floor authorization.
          </label>
        ) : null}
      </form>
    </Modal>
  );
}
