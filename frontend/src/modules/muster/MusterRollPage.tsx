import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
} from "lucide-react";
import {
  api,
  Branch,
  Department,
  MusterExportFormat,
  MusterExportTemplate,
  MusterRegisterEmployee,
} from "../../api";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { formatMonthYear, getMonthDays } from "../roster/rosterUtils";

function istYearMonth(): { year: number; month: number } {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [yearText, monthText] = today.split("-");
  return { year: Number(yearText), month: Number(monthText) - 1 };
}

function markStyle(mark: string): { bg: string; fg: string } {
  if (mark === "P") return { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" };
  if (mark === "HD" || mark === "NR") return { bg: "var(--color-warning-bg)", fg: "var(--color-warning-fg)" };
  if (mark === "A") return { bg: "var(--color-danger-bg)", fg: "var(--color-danger-fg)" };
  if (mark === "H" || (mark !== "WO" && mark !== "-" && mark !== "—")) {
    return { bg: "var(--color-info-bg)", fg: "var(--color-info-fg)" };
  }
  return { bg: "var(--bg-active)", fg: "var(--text-muted)" };
}

function formatCount(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function MusterRollPage() {
  const { can } = useAuth();
  const initialMonth = istYearMonth();
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);

  const [registerEmployees, setRegisterEmployees] = useState<MusterRegisterEmployee[]>([]);
  const [factoryName, setFactoryName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [exportingFormat, setExportingFormat] = useState<MusterExportFormat | null>(null);

  // Filters & Export Options
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [exportTemplate, setExportTemplate] = useState<MusterExportTemplate>("form_25");

  const days = getMonthDays(year, month);
  const apiMonth = month + 1;

  async function loadData() {
    setLoading(true);
    try {
      const [register, branchList, deptList] = await Promise.all([
        api.musterRegister({
          year,
          month: apiMonth,
          branch_id: branchFilter !== "ALL" ? branchFilter : undefined,
          department_id: deptFilter !== "ALL" ? deptFilter : undefined,
        }),
        branches.length > 0 ? Promise.resolve(branches) : api.branches(),
        departments.length > 0 ? Promise.resolve(departments) : api.departments(),
      ]);
      setRegisterEmployees(register.employees);
      setFactoryName(register.meta.factory_name || "");
      setRegistrationNumber(register.meta.registration_number || "");
      if (branches.length === 0) setBranches(branchList);
      if (departments.length === 0) setDepartments(deptList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load muster roll");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [year, month, branchFilter, deptFilter]);

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  async function handleExport(format: MusterExportFormat) {
    setExportingFormat(format);
    setExportNotice("");
    setError("");
    try {
      const filename = await api.downloadMusterExport({
        year,
        month: apiMonth,
        format,
        template: exportTemplate,
        department_id: deptFilter !== "ALL" ? deptFilter : undefined,
        branch_id: branchFilter !== "ALL" ? branchFilter : undefined,
      });
      setExportNotice(`Downloaded ${filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExportingFormat(null);
    }
  }

  const activeBranches = branches.filter((b) => b.is_active);
  const filteredEmployees = registerEmployees.filter((emp) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return emp.employee_name.toLowerCase().includes(q) || emp.employee_code.toLowerCase().includes(q);
  });

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
          <h2 className="card-title">Statutory Muster Roll (Form 25 / Form II)</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Wage-free statutory monthly attendance and leave register (ANA-01 / ANA-03).
            {factoryName ? ` ${factoryName}.` : ""}
            {registrationNumber ? ` Registration ${registrationNumber}.` : ""}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius)",
              background: "var(--bg-card)",
              overflow: "hidden",
            }}
          >
            <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Button>
            <span
              style={{
                padding: "0 0.75rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                minWidth: "135px",
                textAlign: "center",
              }}
            >
              {formatMonthYear(year, month)}
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={16} />
            </Button>
          </div>

          {can("muster.export.read") ? (
            <>
              <select
                className="select"
                style={{ width: "auto", minWidth: "135px" }}
                value={exportTemplate}
                onChange={(e) => setExportTemplate(e.target.value as MusterExportTemplate)}
                aria-label="Statutory Form Template"
              >
                <option value="form_25">Form 25</option>
                <option value="form_ii">Form II</option>
                <option value="form_t">Form T</option>
                <option value="standard">Standard</option>
              </select>
              <Button
                variant="primary"
                size="sm"
                icon={<FileSpreadsheet size={15} />}
                loading={exportingFormat === "xlsx"}
                onClick={() => void handleExport("xlsx")}
              >
                Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Download size={15} />}
                loading={exportingFormat === "csv"}
                onClick={() => void handleExport("csv")}
              >
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText size={15} />}
                loading={exportingFormat === "pdf"}
                onClick={() => void handleExport("pdf")}
              >
                PDF
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {exportNotice ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius)",
            background: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            color: "var(--color-success-fg)",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          <CheckCircle2 size={16} />
          <span>{exportNotice}</span>
        </div>
      ) : null}

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
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: "280px" }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.15rem" }}
          />
        </div>

        {activeBranches.length > 1 ? (
          <select
            className="select"
            style={{ width: "auto", minWidth: "160px" }}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="ALL">All Branches</option>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        ) : null}

        <select
          className="select"
          style={{ width: "auto", minWidth: "180px" }}
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          <option value="ALL">All Departments</option>
          {departments
            .filter((d) => d.is_active && (branchFilter === "ALL" || d.branch_id === branchFilter))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
        </select>
      </div>

      {/* Muster Matrix */}
      {loading ? (
        <div className="table-container">
          <table className="data-table">
            <tbody>
              <LoadingRow cols={8} />
            </tbody>
          </table>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet size={36} />}
          title="No employees in muster register"
          description="No active employees match the current filters."
        />
      ) : (
        <div className="table-container" style={{ position: "relative" }}>
          <table
            className="data-table"
            style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 20,
                    background: "var(--bg-subtle)",
                    minWidth: "155px",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.06)",
                  }}
                >
                  Employee
                </th>
                  {days.map((d) => (
                    <th
                      key={d.dateStr}
                      style={{
                        textAlign: "center",
                        minWidth: "38px",
                        padding: "0.45rem 0.2rem",
                        background: d.isWeekend ? "var(--bg-active)" : "var(--bg-subtle)",
                        fontSize: "0.72rem",
                      }}
                    >
                      {d.dayNum}
                    </th>
                  ))}
                  <th style={{ textAlign: "right", minWidth: "42px", background: "var(--bg-subtle)" }}>P</th>
                  <th style={{ textAlign: "right", minWidth: "42px", background: "var(--bg-subtle)" }}>HD</th>
                  <th style={{ textAlign: "right", minWidth: "42px", background: "var(--bg-subtle)" }}>A</th>
                  <th style={{ textAlign: "right", minWidth: "42px", background: "var(--bg-subtle)" }}>WO</th>
                  <th style={{ textAlign: "right", minWidth: "42px", background: "var(--bg-subtle)" }}>LV</th>
                  <th
                    style={{
                      textAlign: "right",
                      minWidth: "56px",
                      background: "var(--bg-subtle)",
                      fontWeight: 700,
                    }}
                  >
                    PAID
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  let halfDayCount = 0;
                  let weeklyOffCount = 0;
                  const renderedCells = days.map((d) => {
                    const mark = emp.daily_status[String(Number(d.dayNum))] || "—";
                    if (mark === "HD") halfDayCount += 1;
                    if (mark === "WO") weeklyOffCount += 1;
                    return { d, mark, style: markStyle(mark) };
                  });
                  const paidTotal = emp.summary.total_present + weeklyOffCount + emp.summary.total_leave;

                  return (
                    <tr key={emp.employee_id}>
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 10,
                          background: "var(--bg-surface)",
                          minWidth: "155px",
                          boxShadow: "2px 0 4px rgba(0,0,0,0.06)",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{emp.employee_name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {emp.employee_code}
                        </div>
                      </td>

                      {renderedCells.map(({ d, mark, style }) => (
                        <td
                          key={d.dateStr}
                          style={{
                            textAlign: "center",
                            padding: "0.35rem 0.15rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              minWidth: "26px",
                              padding: "0.15rem 0.2rem",
                              borderRadius: "4px",
                              background: style.bg,
                              color: style.fg,
                            }}
                          >
                            {mark}
                          </span>
                        </td>
                      ))}

                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {formatCount(emp.summary.total_present)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {halfDayCount}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {formatCount(emp.summary.total_absent)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {weeklyOffCount}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {formatCount(emp.summary.total_leave)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "var(--color-primary)",
                        }}
                      >
                        {paidTotal.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}

      {/* Statutory Code Legend */}
      <div
        style={{
          marginTop: "0.75rem",
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem 1.25rem",
        }}
      >
        <span><strong>P:</strong> Present</span>
        <span><strong>HD:</strong> Half Day</span>
        <span><strong>A:</strong> Absent</span>
        <span><strong>WO:</strong> Weekly Off</span>
        <span><strong>H:</strong> Holiday</span>
        <span><strong>CL / EL / SL:</strong> Approved Leave</span>
        <span><strong>NR:</strong> Needs Review</span>
        <span><strong>-:</strong> Before joining</span>
        <span><strong>PAID:</strong> P + WO + LV (Wage-Free Payable Days)</span>
      </div>
    </div>
  );
}
