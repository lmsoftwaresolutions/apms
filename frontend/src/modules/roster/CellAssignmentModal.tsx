import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { api, DatedShiftInstance, Employee, ShiftTemplate } from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";
import { formatTimeShort } from "../shifts/shiftUtils";
import { computeRestGapHours, pythonWeekday } from "./rosterUtils";

export interface CellAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  dateStr: string;
  monthStart: string;
  monthDaysCount: number;
  dayIndex: number;
  instance: DatedShiftInstance | undefined;
  prevInstance: DatedShiftInstance | undefined;
  templates: ShiftTemplate[];
  onSaved: () => Promise<void>;
}

const REST_DAY_VALUE = "__REST_DAY__";

export function CellAssignmentModal({
  isOpen,
  onClose,
  employee,
  dateStr,
  monthStart,
  monthDaysCount,
  instance,
  prevInstance,
  templates,
  onSaved,
}: CellAssignmentModalProps) {
  const [applyTo, setApplyTo] = useState<"single" | "month">("single");
  const [shiftValue, setShiftValue] = useState("");
  const [weeklyOffPreset, setWeeklyOffPreset] = useState<"SUN" | "SAT_SUN" | "NONE">("NONE");
  const [cancelMode, setCancelMode] = useState(false);
  const [reason, setReason] = useState("");
  const [ackRestWarning, setAckRestWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeTemplates = templates.filter((t) => t.is_active);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setReason("");
    setAckRestWarning(false);
    setCancelMode(false);
    setApplyTo("single");
    setWeeklyOffPreset("NONE");

    if (instance?.is_rest_day) {
      setShiftValue(REST_DAY_VALUE);
    } else {
      setShiftValue(instance?.shift_template_id || activeTemplates[0]?.id || "");
    }
  }, [isOpen, dateStr, instance?.id]);

  if (!employee) return null;

  const isRestDaySelected = applyTo === "single" && shiftValue === REST_DAY_VALUE;
  const chosenTemplate = !isRestDaySelected
    ? activeTemplates.find((t) => t.id === shiftValue) || activeTemplates[0]
    : undefined;

  const needsReason = (applyTo === "single" && Boolean(instance)) || cancelMode;

  const restGapHours =
    applyTo === "single" && !cancelMode && chosenTemplate
      ? computeRestGapHours(prevInstance, chosenTemplate)
      : null;
  const hasRestGapWarning = restGapHours !== null && restGapHours < 11;

  const isSubmitDisabled =
    submitting ||
    (!cancelMode && !isRestDaySelected && !chosenTemplate) ||
    (needsReason && reason.trim().length < 3) ||
    (hasRestGapWarning && !ackRestWarning);

  function getRestWeekdays(): number[] {
    if (weeklyOffPreset === "SUN") return [6];
    if (weeklyOffPreset === "SAT_SUN") return [5, 6];
    return [];
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitDisabled || !employee) return;
    setSubmitting(true);
    setError("");

    try {
      if (cancelMode && instance) {
        await api.cancelShiftInstance(instance.id, { reason: reason.trim() });
      } else if (applyTo === "month" && chosenTemplate) {
        await api.materializeRoster({
          employee_ids: [employee.id],
          start_date: monthStart,
          days: monthDaysCount,
          shift_template_id: chosenTemplate.id,
          rest_weekdays: getRestWeekdays(),
        });
      } else if (isRestDaySelected) {
        if (instance) {
          await api.overrideShiftInstance(instance.id, {
            shift_template_id: null,
            is_rest_day: true,
            reason: reason.trim(),
          });
        } else if (activeTemplates[0]) {
          await api.materializeRoster({
            employee_ids: [employee.id],
            start_date: dateStr,
            days: 1,
            shift_template_id: activeTemplates[0].id,
            rest_weekdays: [pythonWeekday(dateStr)],
          });
        } else {
          setError("Add an active shift template before marking a weekly off.");
          return;
        }
      } else if (chosenTemplate) {
        if (instance) {
          await api.overrideShiftInstance(instance.id, {
            shift_template_id: chosenTemplate.id,
            is_rest_day: false,
            reason: reason.trim(),
          });
        } else {
          await api.materializeRoster({
            employee_ids: [employee.id],
            start_date: dateStr,
            days: 1,
            shift_template_id: chosenTemplate.id,
          });
        }
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update cell schedule");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={`Schedule Shift — ${employee.full_name}`}
      description={`${employee.employee_code} · ${dateStr}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="cell-assign-form"
            variant={cancelMode ? "danger" : "primary"}
            loading={submitting}
            disabled={isSubmitDisabled}
          >
            {cancelMode
              ? "Confirm Cancel"
              : applyTo === "month"
                ? `Auto-Fill (${monthDaysCount}d)`
                : "Apply"}
          </Button>
        </>
      }
    >
      <form id="cell-assign-form" onSubmit={handleFormSubmit}>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        ) : null}

        {!cancelMode ? (
          <>
            {/* Control 1: Apply To */}
            <div style={{ marginBottom: "1rem" }}>
              <div className="field-label" style={{ marginBottom: "0.4rem" }}>
                Apply to
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.35rem",
                  padding: "0.25rem",
                  borderRadius: "0.5rem",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setApplyTo("single")}
                  style={{
                    padding: "0.45rem 0.6rem",
                    borderRadius: "0.38rem",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    background: applyTo === "single" ? "var(--color-primary)" : "transparent",
                    color: applyTo === "single" ? "#ffffff" : "var(--text-secondary)",
                  }}
                >
                  Only {dateStr}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApplyTo("month");
                    if (shiftValue === REST_DAY_VALUE && activeTemplates[0]) {
                      setShiftValue(activeTemplates[0].id);
                    }
                  }}
                  style={{
                    padding: "0.45rem 0.6rem",
                    borderRadius: "0.38rem",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    background: applyTo === "month" ? "var(--color-primary)" : "transparent",
                    color: applyTo === "month" ? "#ffffff" : "var(--text-secondary)",
                  }}
                >
                  Entire Month (Fixed)
                </button>
              </div>
            </div>

            {/* Control 2: Shift Dropdown */}
            <Field label="Shift" required>
              <select
                className="select"
                value={applyTo === "single" ? shiftValue : chosenTemplate?.id || ""}
                onChange={(e) => setShiftValue(e.target.value)}
                required
              >
                {activeTemplates.map((tpl) => {
                  const s = tpl.sessions[0];
                  const timing = s
                    ? `${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)}`
                    : "";
                  return (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {timing ? `· ${timing}` : ""} ({tpl.shift_type})
                    </option>
                  );
                })}
                {applyTo === "single" ? (
                  <option value={REST_DAY_VALUE}>Weekly Off (OFF)</option>
                ) : null}
              </select>
            </Field>

            {/* Weekly Off Preset (only for Entire Month Fixed) */}
            {applyTo === "month" ? (
              <div style={{ marginTop: "0.875rem" }}>
                <Field label="Weekly Off">
                  <select
                    className="select"
                    value={weeklyOffPreset}
                    onChange={(e) =>
                      setWeeklyOffPreset(e.target.value as "SUN" | "SAT_SUN" | "NONE")
                    }
                  >
                    <option value="NONE">None (all days working)</option>
                    <option value="SUN">Sunday (Su)</option>
                    <option value="SAT_SUN">Saturday &amp; Sunday (Sa + Su)</option>
                  </select>
                </Field>
              </div>
            ) : null}
          </>
        ) : (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "var(--radius)",
              background: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning-border)",
              color: "var(--color-warning-fg)",
              fontSize: "0.82rem",
              display: "flex",
              gap: "0.5rem",
              marginBottom: "0.875rem",
            }}
          >
            <Ban size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Cancel Session (N66d Paid):</strong> Marks {dateStr} as{" "}
              <code>CANCELLED_PAID</code> with full paid credit.
            </div>
          </div>
        )}

        {/* Statutory <11h Rest Gap Warning */}
        {hasRestGapWarning ? (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "var(--radius)",
              background: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning-border)",
              color: "var(--color-warning-fg)",
              fontSize: "0.82rem",
              marginTop: "0.875rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>Rest Gap Warning ({restGapHours}h &lt; 11h minimum)</strong>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.45rem", fontWeight: 500, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ackRestWarning}
                onChange={(e) => setAckRestWarning(e.target.checked)}
              />
              I acknowledge the &lt;11h rest gap warning.
            </label>
          </div>
        ) : null}

        {/* Reason (only when modifying an existing scheduled cell) */}
        {needsReason ? (
          <div style={{ marginTop: "0.875rem" }}>
            <Field label="Reason" required>
              <input
                className="input"
                placeholder={
                  cancelMode ? "e.g. Machinery maintenance" : "e.g. Covering shift"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={3}
                maxLength={255}
              />
            </Field>
          </div>
        ) : null}

        {/* Subtle Cancel Session Toggle (only on scheduled cells) */}
        {instance && instance.status !== "CANCELLED_PAID" && !instance.is_rest_day ? (
          <div style={{ marginTop: "0.75rem", textAlign: "right" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.78rem", color: cancelMode ? "var(--text-secondary)" : "var(--color-danger)" }}
              onClick={() => setCancelMode((v) => !v)}
            >
              {cancelMode ? "Back to shift change" : "Cancel this shift (N66d Paid)"}
            </button>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
