import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import {
  api,
  DatedShiftInstance,
  Department,
  Employee,
  RosterDayMapping,
  RosterPattern,
  ShiftTemplate,
} from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";
import { shiftDateStr } from "./rosterUtils";

export type ScheduleMode = "fixed" | "pattern" | "bulk";

export interface ScheduleShiftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ScheduleMode;
  defaultStartDate: string;
  defaultDays: number;
  employees: Employee[];
  departments: Department[];
  templates: ShiftTemplate[];
  patterns: RosterPattern[];
  existingInstances: DatedShiftInstance[];
  onSaved: () => Promise<void>;
}

const WEEK_DAY_LABELS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

export function ScheduleShiftsModal({
  isOpen,
  onClose,
  mode,
  defaultStartDate,
  defaultDays,
  employees,
  departments,
  templates,
  patterns,
  existingInstances,
  onSaved,
}: ScheduleShiftsModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [targetType, setTargetType] = useState<"department" | "employees">("department");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() =>
    shiftDateStr(defaultStartDate, Math.min(90, Math.max(1, defaultDays)) - 1),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedPatternId, setSelectedPatternId] = useState("");

  // Inline Pattern Creation
  const [creatingPattern, setCreatingPattern] = useState(false);
  const [patternCode, setPatternCode] = useState("");
  const [patternName, setPatternName] = useState("");
  const [cycleDays, setCycleDays] = useState(7);
  const [dayMappings, setDayMappings] = useState<RosterDayMapping[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeTemplates = templates.filter((t) => t.is_active);
  const activeEmployees = employees.filter((e) => e.is_active);

  const computedDays = (() => {
    if (!startDate || !endDate) return 0;
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    const sUtc = Date.UTC(sy, sm - 1, sd);
    const eUtc = Date.UTC(ey, em - 1, ed);
    return Math.round((eUtc - sUtc) / 86400000) + 1;
  })();
  const isDateRangeValid = computedDays >= 1 && computedDays <= 90;
  const days = isDateRangeValid ? computedDays : 1;

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setError("");
    setStartDate(defaultStartDate);
    setEndDate(
      shiftDateStr(defaultStartDate, Math.min(90, Math.max(1, defaultDays)) - 1),
    );
    setTargetType(departments.length > 0 ? "department" : "employees");
    setSelectedDeptId(departments[0]?.id || "");
    setSelectedEmpIds([]);
    setSelectedTemplateId(activeTemplates[0]?.id || "");
    setSelectedPatternId(patterns[0]?.id || "");
    setCreatingPattern(patterns.length === 0 && mode === "pattern");
    setPatternCode("");
    setPatternName("");
    setCycleDays(7);
    setDayMappings(
      Array.from({ length: 7 }, (_, i) => ({
        day_index: i,
        shift_template_id: activeTemplates[0]?.id || null,
        is_rest_day: false,
      })),
    );
  }, [isOpen, mode, defaultStartDate, defaultDays]);

  function getTargetEmployeeIds(): string[] {
    if (targetType === "department") {
      return activeEmployees
        .filter((e) => e.department_id === selectedDeptId)
        .map((e) => e.id);
    }
    return selectedEmpIds;
  }

  const targetEmpIds = getTargetEmployeeIds();

  // Compute 2-step impact preview for Fixed Default mode
  function computeImpactPreview() {
    let unassigned = 0;
    let changed = 0;
    let unchanged = 0;

    for (const empId of targetEmpIds) {
      const empInsts = existingInstances.filter((inst) => inst.employee_id === empId);
      if (empInsts.length === 0) {
        unassigned++;
      } else {
        const allSame = empInsts.every(
          (inst) => inst.is_rest_day || inst.shift_template_id === selectedTemplateId,
        );
        if (allSame) unchanged++;
        else changed++;
      }
    }
    return { unassigned, changed, unchanged };
  }

  function handleCycleLengthChange(len: number) {
    const clamped = Math.min(31, Math.max(1, len));
    setCycleDays(clamped);
    setDayMappings((prev) =>
      Array.from({ length: clamped }, (_, i) => {
        if (prev[i]) return prev[i];
        return {
          day_index: i,
          shift_template_id: activeTemplates[0]?.id || null,
          is_rest_day: false,
        };
      }),
    );
  }

  function toggleEmployeeSelection(empId: string) {
    setSelectedEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (targetEmpIds.length === 0) {
      setError("Select at least one active employee (or a department with active employees).");
      return;
    }

    if (mode === "fixed" && step === 1) {
      if (!selectedTemplateId) {
        setError("Select a shift template.");
        return;
      }
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      let patternIdToUse = selectedPatternId;

      if (mode === "pattern" && creatingPattern) {
        const cleanCode = patternCode.trim().toUpperCase();
        const cleanName = patternName.trim();
        if (!/^[A-Z0-9_-]{2,50}$/.test(cleanCode)) {
          setError("Pattern code must be 2–50 uppercase letters, numbers, hyphens, or underscores.");
          setSubmitting(false);
          return;
        }
        if (!cleanName) {
          setError("Pattern name is required.");
          setSubmitting(false);
          return;
        }
        const createdPattern = await api.createRosterPattern({
          code: cleanCode,
          name: cleanName,
          cycle_length_days: cycleDays,
          cycle_anchor_date: startDate,
          day_shift_mapping: dayMappings.map((m, idx) => ({
            day_index: idx,
            shift_template_id: m.is_rest_day ? null : m.shift_template_id || null,
            is_rest_day: m.is_rest_day,
          })),
        });
        patternIdToUse = createdPattern.id;
      }

      if (mode === "pattern") {
        if (!patternIdToUse) {
          setError("Select or create a roster pattern.");
          setSubmitting(false);
          return;
        }
        await api.materializeRoster({
          employee_ids: targetEmpIds,
          start_date: startDate,
          days,
          roster_pattern_id: patternIdToUse,
        });
      } else {
        if (!selectedTemplateId) {
          setError("Select a shift template.");
          setSubmitting(false);
          return;
        }
        await api.materializeRoster({
          employee_ids: targetEmpIds,
          start_date: startDate,
          days,
          shift_template_id: selectedTemplateId,
        });
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to materialize roster");
    } finally {
      setSubmitting(false);
    }
  }

  const titleMap: Record<ScheduleMode, string> = {
    fixed:
      step === 1
        ? "Set Fixed Default Shift — Step 1: Configure"
        : "Set Fixed Default Shift — Step 2: Impact Preview",
    pattern: "Assign Rotating Roster Pattern",
    bulk: "Bulk Assign Shift by Date Range",
  };

  const impact = mode === "fixed" && step === 2 ? computeImpactPreview() : null;
  const chosenTpl = activeTemplates.find((t) => t.id === selectedTemplateId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={titleMap[mode]}
      description={
        mode === "fixed"
          ? "Assign a standard fixed shift once; dated shift instances will be materialized for the selected horizon."
          : mode === "pattern"
            ? "Apply a cyclical rotation pattern (e.g., 6 days Morning + 1 Weekly Off) across employees."
            : "Materialize a specific shift template across a custom date range."
      }
      footer={
        <>
          {mode === "fixed" && step === 2 ? (
            <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}>
              &lt; Back to Edit
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            form="schedule-shifts-form"
            variant="primary"
            loading={submitting}
            disabled={targetEmpIds.length === 0 || !isDateRangeValid}
          >
            {mode === "fixed" && step === 1
              ? "Preview Impact >"
              : `Confirm & Apply to ${targetEmpIds.length}`}
          </Button>
        </>
      }
    >
      <form id="schedule-shifts-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        ) : null}

        {mode === "fixed" && step === 2 && impact ? (
          <div
            style={{
              padding: "1rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-subtle)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
              Proposed Default Shift Assignment Impact
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Shift: <strong>{chosenTpl ? `${chosenTpl.code} — ${chosenTpl.name}` : "—"}</strong> •{" "}
              {days} days starting <strong>{startDate}</strong> ({targetEmpIds.length} employees)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                <CheckCircle2 size={16} color="var(--color-success)" />
                <span>
                  <strong>{impact.unassigned}</strong> employees: Currently unassigned in window → Will be assigned
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                <AlertTriangle size={16} color="var(--color-warning)" />
                <span>
                  <strong>{impact.changed}</strong> employees: Currently on another schedule → Will be updated
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                <CheckCircle2 size={16} color="var(--text-muted)" />
                <span>
                  <strong>{impact.unchanged}</strong> employees: Already on {chosenTpl?.code} → No change
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Target Selection */}
            <div
              style={{
                padding: "0.875rem",
                borderRadius: "var(--radius)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
                marginBottom: "1rem",
              }}
            >
              <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                TARGET EMPLOYEES
              </div>
              <div style={{ display: "flex", gap: "0.75rem 1.25rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={targetType === "department"}
                    onChange={() => setTargetType("department")}
                  />
                  By Department
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={targetType === "employees"}
                    onChange={() => setTargetType("employees")}
                  />
                  Select Individual Employees
                </label>
              </div>

              {targetType === "department" ? (
                <select
                  className="select"
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                >
                  {departments.map((d) => {
                    const count = activeEmployees.filter((e) => e.department_id === d.id).length;
                    return (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code}) — {count} active employees
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div
                  style={{
                    maxHeight: "150px",
                    overflowY: "auto",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius)",
                    background: "var(--bg-card)",
                    padding: "0.5rem",
                  }}
                >
                  {activeEmployees.map((emp) => (
                    <label
                      key={emp.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.25rem 0.35rem",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmpIds.includes(emp.id)}
                        onChange={() => toggleEmployeeSelection(emp.id)}
                      />
                      <span>
                        <strong>{emp.employee_code}</strong> — {emp.full_name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Date Range */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <Field label="Effective Start Date" required>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStartDate(nextStart);
                    if (nextStart && endDate && endDate < nextStart) {
                      setEndDate(nextStart);
                    }
                  }}
                  required
                />
              </Field>
              <Field
                label="End Date"
                required
                error={
                  !isDateRangeValid
                    ? computedDays < 1
                      ? "End date must be on or after start date."
                      : `Range is ${computedDays} days (ADR-15 max 90 days).`
                    : null
                }
                help={isDateRangeValid ? `${computedDays} day(s) selected (max 90)` : null}
              >
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  min={startDate}
                  max={startDate ? shiftDateStr(startDate, 89) : undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            {/* Shift Template OR Pattern Picker */}
            {mode !== "pattern" ? (
              <Field label="Shift Template" required>
                <select
                  className="select"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  required
                >
                  <option value="">Select shift template...</option>
                  {activeTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.code} — {tpl.name} ({tpl.shift_type})
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {creatingPattern ? "Create New Rotating Pattern" : "Select Existing Pattern"}
                  </span>
                  {patterns.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={creatingPattern ? undefined : <Plus size={14} />}
                      onClick={() => setCreatingPattern((v) => !v)}
                    >
                      {creatingPattern ? "Use Existing Pattern" : "New Pattern"}
                    </Button>
                  ) : null}
                </div>

                {!creatingPattern ? (
                  <select
                    className="select"
                    value={selectedPatternId}
                    onChange={(e) => setSelectedPatternId(e.target.value)}
                    required
                  >
                    <option value="">Select roster pattern...</option>
                    {patterns.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name} ({p.cycle_length_days}-day cycle)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    style={{
                      padding: "0.875rem",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "0.65rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <Field label="Pattern Code" required>
                        <input
                          className="input"
                          placeholder="e.g. ROT-ABC"
                          value={patternCode}
                          onChange={(e) => setPatternCode(e.target.value.toUpperCase())}
                          required
                        />
                      </Field>
                      <Field label="Pattern Name" required>
                        <input
                          className="input"
                          placeholder="e.g. 6+1 Weekly Rotation"
                          value={patternName}
                          onChange={(e) => setPatternName(e.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Cycle Days">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className="input"
                          value={cycleDays}
                          onChange={(e) => handleCycleLengthChange(parseInt(e.target.value || "7", 10))}
                        />
                      </Field>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: "0.5rem",
                        maxHeight: "160px",
                        overflowY: "auto",
                      }}
                    >
                      {dayMappings.map((m, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: "0.45rem",
                            borderRadius: "var(--radius)",
                            border: "1px solid var(--border-subtle)",
                            background: "var(--bg-subtle)",
                            fontSize: "0.78rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                            <strong>{WEEK_DAY_LABELS[idx] || `Day ${idx + 1}`}</strong>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.2rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={m.is_rest_day}
                                onChange={(e) => {
                                  const rest = e.target.checked;
                                  setDayMappings((prev) =>
                                    prev.map((item, j) =>
                                      j === idx
                                        ? {
                                            ...item,
                                            is_rest_day: rest,
                                            shift_template_id: rest
                                              ? null
                                              : item.shift_template_id || activeTemplates[0]?.id || null,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              />
                              OFF
                            </label>
                          </div>
                          {!m.is_rest_day ? (
                            <select
                              className="select"
                              style={{ padding: "0.2rem 0.35rem", fontSize: "0.75rem" }}
                              value={m.shift_template_id || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDayMappings((prev) =>
                                  prev.map((item, j) =>
                                    j === idx ? { ...item, shift_template_id: val } : item,
                                  ),
                                );
                              }}
                            >
                              {activeTemplates.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>
                                  {tpl.name} ({tpl.code})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Weekly Off</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
