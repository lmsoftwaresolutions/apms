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
  Employee,
  MusterExportFormat,
  MusterExportTemplate,
  MusterLine,
} from "../../api";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { formatMonthYear, getMonthDays } from "../roster/rosterUtils";

interface CellRender {
  code: string;
  bg: string;
  fg: string;
  pInc: number;
  hdInc: number;
  aInc: number;
  woInc: number;
  lvInc: number;
}

function classifyCell(line: MusterLine | undefined): CellRender {
  if (!line) {
    return { code: "—", bg: "transparent", fg: "var(--text-muted)", pInc: 0, hdInc: 0, aInc: 0, woInc: 0, lvInc: 0 };
  }
  if (line.leave_type_code && line.leave_portion === "FULL") {
    const lv = parseFloat(line.leave_days || "1") || 1;
    return {
      code: line.leave_type_code.slice(0, 3),
      bg: "var(--color-info-bg)",
      fg: "var(--color-info-fg)",
      pInc: 0,
      hdInc: 0,
      aInc: 0,
      woInc: 0,
      lvInc: lv,
    };
  }
  if (line.leave_type_code) {
    const hasWork =
      line.attendance_status === "PRESENT" ||
      line.attendance_status === "HALF_DAY" ||
      line.worked_minutes > 0;
    return {
      code: "HD",
      bg: "var(--color-warning-bg)",
      fg: "var(--color-warning-fg)",
      pInc: hasWork ? 0.5 : 0,
      hdInc: 1,
      aInc: hasWork ? 0 : 0.5,
      woInc: 0,
      lvInc: 0.5,
    };
  }
  switch (line.attendance_status) {
    case "PRESENT":
    case "CANCELLED_PAID":
      return {
        code: "P",
        bg: "var(--color-success-bg)",
        fg: "var(--color-success-fg)",
        pInc: 1,
        hdInc: 0,
        aInc: 0,
        woInc: 0,
        lvInc: 0,
      };
    case "HALF_DAY":
      return {
        code: "HD",
        bg: "var(--color-warning-bg)",
        fg: "var(--color-warning-fg)",
        pInc: 0.5,
        hdInc: 1,
        aInc: 0.5,
        woInc: 0,
        lvInc: 0,
      };
    case "REST_DAY":
    case "WEEKLY_OFF":
      return {
        code: "WO",
        bg: "var(--bg-active)",
        fg: "var(--text-muted)",
        pInc: 0,
        hdInc: 0,
        aInc: 0,
        woInc: 1,
        lvInc: 0,
      };
    case "HOLIDAY":
    case "H":
      return {
        code: "H",
        bg: "var(--color-info-bg)",
        fg: "var(--color-info-fg)",
        pInc: 0,
        hdInc: 0,
        aInc: 0,
        woInc: 1,
        lvInc: 0,
      };
    case "ABSENT":
      return {
        code: "A",
        bg: "var(--color-danger-bg)",
        fg: "var(--color-danger-fg)",
        pInc: 0,
        hdInc: 0,
        aInc: 1,
        woInc: 0,
        lvInc: 0,
      };
    default:
      return {
        code: "NR",
        bg: "var(--color-warning-bg)",
        fg: "var(--color-warning-fg)",
        pInc: 0,
        hdInc: 0,
        aInc: 0,
        woInc: 0,
        lvInc: 0,
      };
  }
}

export function MusterRollPage() {
  const { can } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [lines, setLines] = useState<MusterLine[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
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
      const [lineList, empList, branchList, deptList] = await Promise.all([
        api.musterLines({
          year,
          month: apiMonth,
          branch_id: branchFilter !== "ALL" ? branchFilter : undefined,
          department_id: deptFilter !== "ALL" ? deptFilter : undefined,
        }),
        employees.length > 0 ? Promise.resolve(employees) : api.employeesList(),
        branches.length > 0 ? Promise.resolve(branches) : api.branches(),
        departments.length > 0 ? Promise.resolve(departments) : api.departments(),
      ]);
      setLines(lineList);
      if (employees.length === 0) setEmployees(empList);
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
      });
      setExportNotice(`Downloaded ${filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExportingFormat(null);
    }
  }

  const activeBranches = branches.filter((b) => b.is_active);
  const lineMap = new Map<string, MusterLine>();
  for (const l of lines) {
    lineMap.set(`${l.employee_id}::${l.calendar_date}`, l);
  }

  const filteredEmployees = employees.filter((emp) => {
    if (!emp.is_active) return false;
    if (branchFilter !== "ALL" && emp.branch_id !== branchFilter) return false;
    if (deptFilter !== "ALL" && (emp.department_id || "") !== deptFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !emp.full_name.toLowerCase().includes(q) &&
        !emp.employee_code.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
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
                  let pTotal = 0;
                  let hdTotal = 0;
                  let aTotal = 0;
                  let woTotal = 0;
                  let lvTotal = 0;

                  const renderedCells = days.map((d) => {
                    const line = lineMap.get(`${emp.id}::${d.dateStr}`);
                    const c = classifyCell(line);
                    pTotal += c.pInc;
                    hdTotal += c.hdInc;
                    aTotal += c.aInc;
                    woTotal += c.woInc;
                    lvTotal += c.lvInc;
                    return { d, c };
                  });

                  const paidTotal = pTotal + woTotal + lvTotal;

                  return (
                    <tr key={emp.id}>
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
                        <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{emp.full_name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {emp.employee_code}
                        </div>
                      </td>

                      {renderedCells.map(({ d, c }) => (
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
                              background: c.bg,
                              color: c.fg,
                            }}
                          >
                            {c.code}
                          </span>
                        </td>
                      ))}

                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {pTotal.toFixed(1).replace(/\.0$/, "")}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {hdTotal}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {aTotal.toFixed(1).replace(/\.0$/, "")}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {woTotal}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                        {lvTotal.toFixed(1).replace(/\.0$/, "")}
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
        <span><strong>PAID:</strong> P + WO + LV (Wage-Free Payable Days)</span>
      </div>
    </div>
  );
}
