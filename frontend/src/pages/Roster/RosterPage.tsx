import React, { useEffect, useState } from "react";
import { Plus, Calendar, Play, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import {
  api,
  Branch,
  Department,
  Employee,
  ShiftTemplate,
  RosterPattern,
  DatedShiftInstance,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Badge, Modal, EmptyState } from "../../components/common/UIComponents";

export function RosterPage() {
  const { can } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [rosterPatterns, setRosterPatterns] = useState<RosterPattern[]>([]);
  const [instances, setInstances] = useState<DatedShiftInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Date range state (default to current 30-day window)
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");

  // Materialization Modal state (ADR-15)
  const [isMatModalOpen, setIsMatModalOpen] = useState(false);
  const [matBranchId, setMatBranchId] = useState("");
  const [matDeptId, setMatDeptId] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [matStartDate, setMatStartDate] = useState(today);
  const [matDays, setMatDays] = useState(30);
  const [matMode, setMatMode] = useState<"static" | "dynamic">("static");
  const [matShiftTemplateId, setMatShiftTemplateId] = useState("");
  const [matPatternId, setMatPatternId] = useState("");
  const [materializing, setMaterializing] = useState(false);
  const [matResult, setMatResult] = useState<string | null>(null);

  // Cell Override Modal state (N67 & N66d)
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<DatedShiftInstance | null>(null);
  const [overrideShiftId, setOverrideShiftId] = useState<string>("");
  const [overrideIsRest, setOverrideIsRest] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideActionType, setOverrideActionType] = useState<"override" | "cancel">("override");
  const [savingOverride, setSavingOverride] = useState(false);

  async function loadMetadata() {
    try {
      const [b, d, tpls, pats] = await Promise.all([
        api.branches(),
        api.departments(),
        api.shiftTemplates(true),
        api.rosterPatterns(),
      ]);
      setBranches(b);
      setDepartments(d);
      setShiftTemplates(tpls);
      setRosterPatterns(pats);
      if (b.length > 0 && !selectedBranchId) {
        setSelectedBranchId(b[0].id);
        setMatBranchId(b[0].id);
      }
      if (tpls.length > 0) setMatShiftTemplateId(tpls[0].id);
      if (pats.length > 0) setMatPatternId(pats[0].id);
    } catch {}
  }

  async function loadGridData() {
    setLoading(true);
    setError("");
    try {
      // Calculate 30-day range from startDate
      const d = new Date(startDate);
      d.setDate(d.getDate() + 30);
      const endDate = d.toISOString().slice(0, 10);

      const [emps, insts] = await Promise.all([
        api.employees({
          branch_id: selectedBranchId || undefined,
          department_id: selectedDeptId || undefined,
          is_active: true,
        }),
        api.rosterInstances({
          start_date: startDate,
          end_date: endDate,
        }),
      ]);
      setEmployees(emps);
      setInstances(insts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shift roster grid");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetadata();
  }, []);

  useEffect(() => {
    void loadGridData();
  }, [startDate, selectedBranchId, selectedDeptId]);

  // Generate date columns for calendar grid
  const daysRange: string[] = [];
  const baseDate = new Date(startDate);
  for (let i = 0; i < 14; i++) {
    const cur = new Date(baseDate);
    cur.setDate(baseDate.getDate() + i);
    daysRange.push(cur.toISOString().slice(0, 10));
  }

  // Lookup map: `${employee_id}_${calendar_date}` -> instance
  const instanceMap = new Map<string, DatedShiftInstance>();
  instances.forEach((inst) => {
    instanceMap.set(`${inst.employee_id}_${inst.calendar_date}`, inst);
  });

  const shiftTemplateMap = new Map<string, ShiftTemplate>(
    shiftTemplates.map((t) => [t.id, t])
  );

  // Materialization Handler
  const handleMaterialize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmpIds.length === 0) return;
    setMaterializing(true);
    setError("");
    setMatResult(null);
    try {
      const res = await api.materializeRoster({
        employee_ids: selectedEmpIds,
        start_date: matStartDate,
        days: Number(matDays),
        shift_template_id: matMode === "static" ? matShiftTemplateId : null,
        roster_pattern_id: matMode === "dynamic" ? matPatternId : null,
      });
      setMatResult(`Materialized ${res.total_materialized} shift instances for ${res.employees_count} employees.`);
      await loadGridData();
      setTimeout(() => {
        setIsMatModalOpen(false);
        setMatResult(null);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to materialize roster");
    } finally {
      setMaterializing(false);
    }
  };

  // Cell click -> Override Dialog
  const handleCellClick = (inst?: DatedShiftInstance) => {
    if (!inst) return;
    setSelectedInstance(inst);
    setOverrideShiftId(inst.shift_template_id || shiftTemplates[0]?.id || "");
    setOverrideIsRest(inst.is_rest_day);
    setOverrideReason("");
    setOverrideActionType("override");
    setIsOverrideModalOpen(true);
  };

  const handleSaveOverride = async () => {
    if (!selectedInstance || overrideReason.length < 3) return;
    setSavingOverride(true);
    try {
      if (overrideActionType === "override") {
        await api.overrideShiftInstance(selectedInstance.id, {
          shift_template_id: overrideIsRest ? null : overrideShiftId,
          is_rest_day: overrideIsRest,
          reason: overrideReason,
        });
      } else {
        await api.cancelShiftInstance(selectedInstance.id, overrideReason);
      }
      setIsOverrideModalOpen(false);
      await loadGridData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply supervisor shift action");
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Shift Roster Matrix (ADR-15)</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Scheduled 30-day dated shift instances with same-day supervisor overrides (N67) and cancellations (N66d).
          </p>
        </div>

        <div className="flex gap-2">
          {can("roster.instance.create") ? (
            <button className="primary" type="button" onClick={() => setIsMatModalOpen(true)}>
              <Play size={16} /> Materialize 30-Day Window
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div style={{ padding: "0.6rem 0.8rem", background: "var(--danger-bg)", color: "var(--danger-fg)", borderRadius: "4px", fontSize: "0.82rem" }}>
          {error}
        </div>
      ) : null}

      {/* Filter / Date Navigator Bar */}
      <div className="panel" style={{ padding: "0.75rem 1rem", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div className="flex items-center gap-2">
          <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <span>Start Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "150px" }}
            />
          </label>

          <button
            className="ghost small"
            type="button"
            onClick={() => {
              const d = new Date(startDate);
              d.setDate(d.getDate() - 7);
              setStartDate(d.toISOString().slice(0, 10));
            }}
          >
            <ChevronLeft size={14} /> -7d
          </button>
          <button
            className="ghost small"
            type="button"
            onClick={() => {
              const d = new Date(startDate);
              d.setDate(d.getDate() + 7);
              setStartDate(d.toISOString().slice(0, 10));
            }}
          >
            +7d <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ width: "170px" }}>
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select value={selectedDeptId} onChange={(e) => setSelectedDeptId(e.target.value)} style={{ width: "170px" }}>
            <option value="">All Departments</option>
            {departments
              .filter((d) => !selectedBranchId || d.branch_id === selectedBranchId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Roster Calendar Matrix */}
      <div className="panel" style={{ padding: 0 }}>
        {employees.length === 0 && !loading ? (
          <EmptyState
            icon={Calendar}
            title="No employees found"
            description="No employees match the branch or department filter. Add employees or materialize shift schedules."
          />
        ) : (
          <div className="table-container" style={{ border: "none" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "200px", minWidth: "180px", position: "sticky", left: 0, background: "var(--bg-subtle)", zIndex: 10 }}>
                    Employee
                  </th>
                  {daysRange.map((dt) => {
                    const d = new Date(dt);
                    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                    const isSun = d.getDay() === 0;
                    return (
                      <th
                        key={dt}
                        style={{
                          textAlign: "center",
                          minWidth: "75px",
                          background: isSun ? "var(--bg-muted)" : "var(--bg-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.68rem" }}>{dayName}</div>
                        <div className="tabular" style={{ fontWeight: 700 }}>{dt.slice(8, 10)}/{dt.slice(5, 7)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ position: "sticky", left: 0, background: "var(--bg-surface)", zIndex: 9, fontWeight: 500 }}>
                      <div>{emp.full_name}</div>
                      <div className="text-secondary tabular" style={{ fontSize: "0.72rem" }}>
                        {emp.employee_code}
                      </div>
                    </td>

                    {daysRange.map((dt) => {
                      const inst = instanceMap.get(`${emp.id}_${dt}`);
                      const matchedShift = inst?.shift_template_id ? shiftTemplateMap.get(inst.shift_template_id) : null;
                      const isRest = inst?.is_rest_day;

                      return (
                        <td
                          key={dt}
                          style={{
                            textAlign: "center",
                            padding: "0.4rem 0.2rem",
                            cursor: inst ? "pointer" : "default",
                          }}
                          onClick={() => handleCellClick(inst)}
                          title={
                            inst
                              ? `Click to override schedule (Status: ${inst.status}, Modified: ${inst.is_adhoc_modified ? "Yes" : "No"})`
                              : "No shift materialized"
                          }
                        >
                          {inst ? (
                            <div
                              style={{
                                display: "inline-block",
                                width: "100%",
                                padding: "0.25rem 0.1rem",
                                borderRadius: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                background: isRest ? "var(--bg-muted)" : matchedShift?.color_code || "var(--action-primary)",
                                color: isRest ? "var(--text-secondary)" : "#ffffff",
                                position: "relative",
                              }}
                            >
                              {isRest ? "OFF" : matchedShift?.code || "SHIFT"}

                              {/* is_adhoc_modified indicator */}
                              {inst.is_adhoc_modified ? (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: "2px",
                                    right: "2px",
                                    width: "5px",
                                    height: "5px",
                                    borderRadius: "50%",
                                    background: "#fde047",
                                  }}
                                  title={`Ad-hoc modified: ${inst.modification_reason || ""}`}
                                />
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: "0.75rem" }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Materialization Modal (ADR-15) */}
      <Modal
        isOpen={isMatModalOpen}
        onClose={() => setIsMatModalOpen(false)}
        title="Materialize 30-Day Rolling Roster (ADR-15)"
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsMatModalOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={materializing || selectedEmpIds.length === 0}
              onClick={handleMaterialize}
            >
              {materializing ? "Materializing…" : `Materialize for ${selectedEmpIds.length} Employees`}
            </button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={handleMaterialize}>
          {matResult ? (
            <div className="flex items-center gap-2" style={{ background: "var(--success-bg)", color: "var(--success-fg)", padding: "0.6rem 0.8rem", borderRadius: "4px", fontSize: "0.82rem" }}>
              <CheckCircle2 size={16} /> {matResult}
            </div>
          ) : null}

          {/* B3: Employee Cascade & Multi-Select */}
          <div className="form-grid">
            <div className="form-group">
              <label>Filter by Branch</label>
              <select value={matBranchId} onChange={(e) => setMatBranchId(e.target.value)}>
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Filter by Department</label>
              <select value={matDeptId} onChange={(e) => setMatDeptId(e.target.value)}>
                <option value="">All Departments</option>
                {departments
                  .filter((d) => !matBranchId || d.branch_id === matBranchId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: "0.3rem" }}>
              <label>Target Employees ({selectedEmpIds.length} selected)</label>
              <button
                className="ghost small"
                type="button"
                onClick={() => {
                  const matchingEmps = employees.filter(
                    (e) => (!matBranchId || e.branch_id === matBranchId) && (!matDeptId || e.department_id === matDeptId)
                  );
                  if (selectedEmpIds.length === matchingEmps.length) {
                    setSelectedEmpIds([]);
                  } else {
                    setSelectedEmpIds(matchingEmps.map((e) => e.id));
                  }
                }}
              >
                Toggle Select All
              </button>
            </div>

            <div style={{ maxHeight: "130px", overflowY: "auto", border: "1px solid var(--border-default)", borderRadius: "4px", padding: "0.5rem" }}>
              {employees
                .filter((e) => (!matBranchId || e.branch_id === matBranchId) && (!matDeptId || e.department_id === matDeptId))
                .map((emp) => (
                  <label key={emp.id} style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0" }}>
                    <input
                      type="checkbox"
                      checked={selectedEmpIds.includes(emp.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedEmpIds([...selectedEmpIds, emp.id]);
                        else setSelectedEmpIds(selectedEmpIds.filter((id) => id !== emp.id));
                      }}
                      style={{ width: "auto" }}
                    />
                    <span style={{ fontSize: "0.82rem" }}>{emp.full_name} ({emp.employee_code})</span>
                  </label>
                ))}
            </div>
          </div>

          {/* Date & Horizon */}
          <div className="form-grid">
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" value={matStartDate} onChange={(e) => setMatStartDate(e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Horizon (Days, 1–90)</label>
              <input type="number" min="1" max="90" value={matDays} onChange={(e) => setMatDays(Number(e.target.value))} required />
            </div>
          </div>

          {/* Mutually Exclusive Mode: Static Shift vs Dynamic Pattern */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "0.75rem" }}>
            <label style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Assignment Mode</label>
            <div className="flex gap-4" style={{ marginBottom: "0.75rem" }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="radio"
                  name="matMode"
                  checked={matMode === "static"}
                  onChange={() => setMatMode("static")}
                  style={{ width: "auto" }}
                />
                <span>Static Shift Template</span>
              </label>

              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="radio"
                  name="matMode"
                  checked={matMode === "dynamic"}
                  onChange={() => setMatMode("dynamic")}
                  style={{ width: "auto" }}
                />
                <span>Dynamic Cyclic Pattern</span>
              </label>
            </div>

            {matMode === "static" ? (
              <div className="form-group">
                <label>Select Shift Template</label>
                <select value={matShiftTemplateId} onChange={(e) => setMatShiftTemplateId(e.target.value)}>
                  {shiftTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Select Roster Pattern</label>
                <select value={matPatternId} onChange={(e) => setMatPatternId(e.target.value)}>
                  {rosterPatterns.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.cycle_length_days} days cycle)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Ad-Hoc Supervisor Override Modal (N67 & N66d) */}
      <Modal
        isOpen={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        title={
          selectedInstance
            ? `Supervisor Shift Action — ${selectedInstance.calendar_date}`
            : "Shift Action"
        }
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsOverrideModalOpen(false)}>
              Cancel
            </button>
            <button
              className={overrideActionType === "cancel" ? "danger small" : "primary small"}
              type="button"
              disabled={savingOverride || overrideReason.length < 3}
              onClick={handleSaveOverride}
            >
              {savingOverride ? "Saving…" : overrideActionType === "cancel" ? "Cancel Shift Session" : "Apply Override"}
            </button>
          </>
        }
      >
        {selectedInstance ? (
          <div className="flex flex-col gap-3">
            <div style={{ background: "var(--bg-subtle)", padding: "0.75rem", borderRadius: "4px", fontSize: "0.82rem" }}>
              <div><strong>Date:</strong> {selectedInstance.calendar_date}</div>
              <div><strong>Current Status:</strong> {selectedInstance.status}</div>
              {selectedInstance.is_adhoc_modified ? (
                <div style={{ color: "var(--warning-fg)", marginTop: "0.25rem" }}>
                  <strong>Prior Override Reason:</strong> {selectedInstance.modification_reason}
                </div>
              ) : null}
            </div>

            <div className="flex gap-4">
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="radio"
                  name="actionType"
                  checked={overrideActionType === "override"}
                  onChange={() => setOverrideActionType("override")}
                  style={{ width: "auto" }}
                />
                <span>Ad-Hoc Shift Swap (N67)</span>
              </label>

              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="radio"
                  name="actionType"
                  checked={overrideActionType === "cancel"}
                  onChange={() => setOverrideActionType("cancel")}
                  style={{ width: "auto" }}
                />
                <span>Employer Cancellation (N66d)</span>
              </label>
            </div>

            {overrideActionType === "override" ? (
              <>
                <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={overrideIsRest}
                    onChange={(e) => setOverrideIsRest(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  <span>Mark as Rest Day / Weekly Off</span>
                </label>

                {!overrideIsRest ? (
                  <div className="form-group">
                    <label>Target Shift Template</label>
                    <select value={overrideShiftId} onChange={(e) => setOverrideShiftId(e.target.value)}>
                      {shiftTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-secondary" style={{ fontSize: "0.78rem" }}>
                Cancelling this scheduled shift marks it as employer-cancelled for the day.
              </p>
            )}

            <div className="form-group">
              <label>Mandatory Supervisor Audit Reason (min 3 chars)</label>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Same-day emergency plant machine line swap per manager request"
                required
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
