import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Ban, Copy, Info } from "lucide-react";
import { api, DatedShiftInstance, Employee, ShiftTemplate } from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";
import { formatDuration, formatTimeShort } from "../shifts/shiftUtils";
import { computeRestGapHours } from "./rosterUtils";

export type CellAssignMode = "single" | "fixed_autofill" | "rest_day" | "cancel";

export interface CopyPayload {
  employeeId: string;
  employeeName: string;
  shiftTemplateId: string | null;
  isRestDay: boolean;
  label: string;
  color: string;
}

export interface CellAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  dateStr: string;
  monthStart: string;
  monthDaysCount: number;
  dayIndex: number; // 0-indexed within month
  instance: DatedShiftInstance | undefined;
  prevInstance: DatedShiftInstance | undefined;
  templates: ShiftTemplate[];
  onSaved: (copyAfter?: CopyPayload) => Promise<void>;
}

const WEEKDAY_OPTIONS = [
  { pyWeekday: 0, label: "Mo" },
  { pyWeekday: 1, label: "Tu" },
  { pyWeekday: 2, label: "We" },
  { pyWeekday: 3, label: "Th" },
  { pyWeekday: 4, label: "Fr" },
  { pyWeekday: 5, label: "Sa" },
  { pyWeekday: 6, label: "Su" },
];

function getCompactTemplateLabel(tpl: ShiftTemplate): string {
  if (tpl.sessions.length > 0) {
    const sorted = [...tpl.sessions].sort((a, b) => a.session_order - b.session_order);
    return `${sorted[0].start_time.slice(0, 2)}-${sorted[sorted.length - 1].end_time.slice(0, 2)}`;
  }
  return tpl.code.slice(0, 5);
}

export function CellAssignmentModal({
  isOpen,
  onClose,
  employee,
  dateStr,
  monthStart,
  monthDaysCount,
  dayIndex,
  instance,
  prevInstance,
  templates,
  onSaved,
}: CellAssignmentModalProps) {
  const [mode, setMode] = useState<CellAssignMode>("single");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [autofillScope, setAutofillScope] = useState<"full_month" | "from_date">("full_month");
  const [restWeekdays, setRestWeekdays] = useState<number[]>([6]); // Sunday default
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
    setTypeFilter("ALL");
    setAutofillScope("full_month");
    setRestWeekdays([6]);

    if (instance?.is_rest_day) {
      setMode("rest_day");
      setSelectedTemplateId(activeTemplates[0]?.id || "");
    } else {
      setMode("single");
      setSelectedTemplateId(instance?.shift_template_id || activeTemplates[0]?.id || "");
    }
  }, [isOpen, dateStr, instance?.id]);

  if (!employee) return null;

  const filteredTemplates = activeTemplates.filter((t) => {
    if (typeFilter === "ALL") return true;
    return t.shift_type.toUpperCase() === typeFilter;
  });

  const chosenTemplate =
    activeTemplates.find((t) => t.id === selectedTemplateId) || filteredTemplates[0];

  const needsOverrideReason =
    (mode === "single" && Boolean(instance)) ||
    (mode === "rest_day" && Boolean(instance)) ||
    mode === "cancel";

  const restGapHours =
    mode === "single" && chosenTemplate
      ? computeRestGapHours(prevInstance, chosenTemplate)
      : null;
  const hasRestGapWarning = restGapHours !== null && restGapHours < 11;

  const remainingDays = Math.max(1, monthDaysCount - dayIndex);
  const autofillDays = autofillScope === "full_month" ? monthDaysCount : remainingDays;

  const isSubmitDisabled =
    submitting ||
    ((mode === "single" || mode === "fixed_autofill") && !chosenTemplate) ||
    (needsOverrideReason && reason.trim().length < 3) ||
    (hasRestGapWarning && !ackRestWarning);

  function toggleWeekday(pyDay: number) {
    setRestWeekdays((prev) =>
      prev.includes(pyDay) ? prev.filter((d) => d !== pyDay) : [...prev, pyDay],
    );
  }

  async function executeSave(enterCopyMode: boolean) {
    if (isSubmitDisabled || !employee) return;
    setSubmitting(true);
    setError("");

    try {
      let copyPayload: CopyPayload | undefined;

      if (mode === "fixed_autofill" && chosenTemplate) {
        await api.materializeRoster({
          employee_ids: [employee.id],
          start_date: autofillScope === "full_month" ? monthStart : dateStr,
          days: autofillDays,
          shift_template_id: chosenTemplate.id,
          rest_weekdays: restWeekdays,
        });
      } else if (mode === "single" && chosenTemplate) {
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
        if (enterCopyMode) {
          copyPayload = {
            employeeId: employee.id,
            employeeName: employee.full_name,
            shiftTemplateId: chosenTemplate.id,
            isRestDay: false,
            label: getCompactTemplateLabel(chosenTemplate),
            color: chosenTemplate.color_code || "var(--color-primary)",
          };
        }
      } else if (mode === "rest_day") {
        if (instance) {
          await api.overrideShiftInstance(instance.id, {
            shift_template_id: null,
            is_rest_day: true,
            reason: reason.trim(),
          });
        } else if (activeTemplates[0]) {
          // Materialize a clean REST_DAY on an empty cell using rest_weekdays
          const [y, m, d] = dateStr.split("-").map(Number);
          const jsDay = new Date(y, m - 1, d).getDay();
          const pyWeekday = jsDay === 0 ? 6 : jsDay - 1;
          await api.materializeRoster({
            employee_ids: [employee.id],
            start_date: dateStr,
            days: 1,
            shift_template_id: activeTemplates[0].id,
            rest_weekdays: [pyWeekday],
          });
        }
        if (enterCopyMode) {
          copyPayload = {
            employeeId: employee.id,
            employeeName: employee.full_name,
            shiftTemplateId: null,
            isRestDay: true,
            label: "OFF",
            color: "var(--bg-active)",
          };
        }
      } else if (mode === "cancel" && instance) {
        await api.cancelShiftInstance(instance.id, {
          reason: reason.trim(),
        });
      }

      await onSaved(copyPayload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update cell schedule");
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void executeSave(false);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={`Schedule Shift — ${employee.full_name}`}
      description={`${employee.employee_code} · ${dateStr}${instance ? " (Currently scheduled)" : " (Unscheduled)"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {(mode === "single" || mode === "rest_day") ? (
            <Button
              type="button"
              variant="secondary"
              icon={<Copy size={14} />}
              disabled={isSubmitDisabled}
              loading={submitting}
              onClick={() => void executeSave(true)}
            >
              Save &amp; Copy to Cells
            </Button>
          ) : null}
          <Button
            type="submit"
            form="cell-assign-form"
            variant={mode === "cancel" ? "danger" : "primary"}
            loading={submitting}
            disabled={isSubmitDisabled}
          >
            {mode === "fixed_autofill"
              ? `Auto-Fill (${autofillDays}d)`
              : mode === "cancel"
                ? "Confirm Cancellation"
                : "Apply & Close"}
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

        {/* Assignment Mode Selector */}
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: "0.5rem",
            }}
          >
            Assignment Mode
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
              gap: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="cellMode"
                checked={mode === "single"}
                onChange={() => setMode("single")}
              />
              <span>Single Day / Override</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="cellMode"
                checked={mode === "fixed_autofill"}
                onChange={() => setMode("fixed_autofill")}
              />
              <span>Fixed Shift (Auto-fill all cells)</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="cellMode"
                checked={mode === "rest_day"}
                onChange={() => setMode("rest_day")}
              />
              <span>Weekly Off / Rest Day (OFF)</span>
            </label>

            {instance && instance.status !== "CANCELLED_PAID" && !instance.is_rest_day ? (
              <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="cellMode"
                  checked={mode === "cancel"}
                  onChange={() => setMode("cancel")}
                />
                <span>Cancel Session (N66d Paid)</span>
              </label>
            ) : null}
          </div>
        </div>

        {/* Shift Type Filter + Template Selector */}
        {mode === "single" || mode === "fixed_autofill" ? (
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
              {[
                { key: "ALL", label: "All" },
                { key: "FIXED", label: "Fixed" },
                { key: "SPLIT", label: "Split N65" },
                { key: "OVERNIGHT", label: "Overnight" },
              ].map((t) => (
                <Button
                  key={t.key}
                  type="button"
                  size="sm"
                  variant={typeFilter === t.key ? "primary" : "secondary"}
                  onClick={() => {
                    setTypeFilter(t.key);
                    const nextList = activeTemplates.filter(
                      (tpl) => t.key === "ALL" || tpl.shift_type.toUpperCase() === t.key,
                    );
                    if (nextList[0]) setSelectedTemplateId(nextList[0].id);
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            <Field label="Shift Template" required>
              <select
                className="select"
                value={chosenTemplate?.id || ""}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                required
              >
                {filteredTemplates.length === 0 ? (
                  <option value="">No templates match this type</option>
                ) : (
                  filteredTemplates.map((tpl) => {
                    const s = tpl.sessions[0];
                    const timing = s
                      ? `${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)}`
                      : "";
                    return (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.code}) {timing ? `· ${timing}` : ""}
                      </option>
                    );
                  })
                )}
              </select>
            </Field>

            {chosenTemplate && chosenTemplate.sessions.length > 0 ? (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                {chosenTemplate.sessions
                  .map(
                    (s) =>
                      `${s.name}: ${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)}`,
                  )
                  .join(" + ")}
                {" · "}Break:{" "}
                {formatDuration(
                  chosenTemplate.sessions.reduce((acc, s) => acc + s.break_duration_minutes, 0),
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Fixed Shift Auto-Fill Scope & Weekly Offs */}
        {mode === "fixed_autofill" ? (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Auto-Fill Range &amp; Weekly Offs
            </div>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.84rem", marginBottom: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={autofillScope === "full_month"}
                  onChange={() => setAutofillScope("full_month")}
                />
                Entire Month ({monthDaysCount} days)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={autofillScope === "from_date"}
                  onChange={() => setAutofillScope("from_date")}
                />
                From {dateStr} to Month End ({remainingDays} days)
              </label>
            </div>

            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
              Weekly Off Days (automatically marked OFF):
            </div>
            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", fontSize: "0.82rem" }}>
              {WEEKDAY_OPTIONS.map((w) => (
                <label
                  key={w.pyWeekday}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={restWeekdays.includes(w.pyWeekday)}
                    onChange={() => toggleWeekday(w.pyWeekday)}
                  />
                  {w.label}
                </label>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                marginTop: "0.65rem",
                fontSize: "0.76rem",
                color: "var(--text-muted)",
              }}
            >
              <Info size={14} color="var(--color-primary)" />
              <span>
                Working days receive this fixed shift; selected Weekly Off days receive clean{" "}
                <code>OFF</code> pills.
              </span>
            </div>
          </div>
        ) : null}

        {/* Cancel N66d Banner */}
        {mode === "cancel" ? (
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
              marginBottom: "1rem",
            }}
          >
            <Ban size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Employer Cancellation (N66d):</strong> Marks this date as{" "}
              <code>CANCELLED_PAID</code> with full paid attendance credit for salaried staff.
            </div>
          </div>
        ) : null}

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
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>
                  STATUTORY REST WARNING ({restGapHours}h gap &lt; 11h minimum)
                </strong>
                <div style={{ marginTop: "0.15rem" }}>
                  Factories Act §56 requires ≥11h rest between shifts.
                </div>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.5rem", fontWeight: 500, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ackRestWarning}
                onChange={(e) => setAckRestWarning(e.target.checked)}
              />
              I acknowledge the rest gap breach and confirm authorization.
            </label>
          </div>
        ) : null}

        {/* Override / Cancel Reason */}
        {needsOverrideReason ? (
          <Field
            label={mode === "cancel" ? "Cancellation Reason" : "Reason for N67 Override"}
            required
            help="Minimum 3 characters (audited on immutable trace)."
          >
            <textarea
              className="input"
              rows={2}
              placeholder={
                mode === "cancel"
                  ? "e.g. Machinery maintenance shutdown"
                  : "e.g. Covering shift due to colleague absence"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={255}
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  );
}
