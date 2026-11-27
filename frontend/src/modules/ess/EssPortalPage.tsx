import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  CalendarDays,
  Clock,
  Laptop,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import {
  api,
  EssCalendarDay,
  EssShiftDay,
  EssTodaySummary,
  LeaveBalance,
  LeaveRequestItem,
  LeaveType,
  RegularizationItem,
  WorkModeRequest,
} from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { Spinner } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { formatDuration, formatTimeShort } from "../shifts/shiftUtils";
import {
  ApplyLeaveModal,
  ApplyRegularizationModal,
  ApplyWorkModeModal,
} from "./EssActionModals";

type EssTab = "overview" | "calendar" | "shifts";

export function EssPortalPage() {
  const { me } = useAuth();
  const [activeTab, setActiveTab] = useState<EssTab>("overview");
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState("");

  const [today, setToday] = useState<EssTodaySummary | null>(null);
  const [calendarDays, setCalendarDays] = useState<EssCalendarDay[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<EssShiftDay[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [regRequests, setRegRequests] = useState<RegularizationItem[]>([]);
  const [workModeRequests, setWorkModeRequests] = useState<WorkModeRequest[]>([]);

  // Modals
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [workModeModalOpen, setWorkModeModalOpen] = useState(false);

  async function loadPortal() {
    setLoading(true);
    setProfileMissing(false);
    setError("");
    try {
      const todayRes = await api.essToday();
      setToday(todayRes);

      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const mm = String(m + 1).padStart(2, "0");
      const monthStart = `${y}-${mm}-01`;
      const monthEnd = `${y}-${mm}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, "0")}`;

      const [cal, shf, lt, lb, lr, reg, wm] = await Promise.all([
        api.essCalendar(monthStart, monthEnd),
        api.essShifts(todayRes.calendar_date, monthEnd),
        api.leaveTypes().catch(() => [] as LeaveType[]),
        api.leaveBalances(todayRes.employee_id).catch(() => [] as LeaveBalance[]),
        api.leaveRequests().catch(() => [] as LeaveRequestItem[]),
        api.regularizations().catch(() => [] as RegularizationItem[]),
        api.essMyWorkModeRequests().catch(() => [] as WorkModeRequest[]),
      ]);

      setCalendarDays(cal);
      setUpcomingShifts(shf);
      setLeaveTypes(lt);
      setLeaveBalances(lb);
      setLeaveRequests(lr.filter((r) => r.employee_id === todayRes.employee_id));
      setRegRequests(reg.filter((r) => r.employee_id === todayRes.employee_id));
      setWorkModeRequests(wm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load ESS portal";
      if (msg.toLowerCase().includes("employee profile") || msg.toLowerCase().includes("not linked")) {
        setProfileMissing(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortal();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "4rem", textAlign: "center" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (profileMissing) {
    return (
      <div style={{ maxWidth: "640px", margin: "2rem auto" }}>
        <div className="card-panel" style={{ padding: "2rem", textAlign: "center" }}>
          <EmptyState
            icon={<UserCheck size={40} />}
            title="No Employee Profile Linked"
            description={`Your account (${me?.email || "current user"}) is an administrative login and is not linked to an Employee record. Link a user_id to an employee in the Employees directory to preview the Worker Self-Service Portal.`}
          />
          <div style={{ marginTop: "1rem" }}>
            <Link to="/employees" className="btn btn-primary">
              Go to Employees Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const todayShift = upcomingShifts.find((s) => s.calendar_date === today?.calendar_date);
  const firstPunch = today?.punches[0]
    ? new Date(today.punches[0]).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const lastPunch =
    today && today.punches.length > 1
      ? new Date(today.punches[today.punches.length - 1]).toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const presentCount = calendarDays.filter((d) => d.status === "PRESENT").length;
  const halfDayCount = calendarDays.filter((d) => d.status === "HALF_DAY").length;
  const absentCount = calendarDays.filter((d) => d.status === "ABSENT").length;

  return (
    <div style={{ maxWidth: "920px", margin: "0 auto" }}>
      {/* Header */}
      <div
        className="card-header"
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2 className="card-title">Welcome back, {me?.full_name || "Employee"}</h2>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Employee Self-Service Portal (M15) • {today?.calendar_date}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => void loadPortal()}>
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {/* Today's Attendance Hero Card */}
      <div className="card-panel" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>
            Today&apos;s Attendance
          </span>
          <Badge
            variant={
              today?.status === "PRESENT"
                ? "success"
                : today?.status === "HALF_DAY"
                  ? "warning"
                  : today?.status === "ABSENT"
                    ? "danger"
                    : "info"
            }
          >
            {today?.status || "SCHEDULED / IN PROGRESS"}
          </Badge>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Scheduled Shift</div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginTop: "0.2rem" }}>
              {todayShift?.is_rest_day
                ? "Weekly Off (REST)"
                : todayShift?.sessions[0]
                  ? `${formatTimeShort(todayShift.sessions[0].start_time)} – ${formatTimeShort(todayShift.sessions[0].end_time)}`
                  : "Standard Schedule"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>First In</div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginTop: "0.2rem" }}>{firstPunch}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Last Out</div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginTop: "0.2rem" }}>{lastPunch}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Worked Duration</div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginTop: "0.2rem" }}>
              {today?.worked_duration_minutes !== null && today?.worked_duration_minutes !== undefined
                ? formatDuration(today.worked_duration_minutes)
                : `${today?.punches.length || 0} punch(es)`}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <button
          type="button"
          className="card-panel"
          onClick={() => setLeaveModalOpen(true)}
          style={{
            padding: "1rem",
            marginBottom: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Calendar size={20} color="var(--color-primary)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Apply Leave</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>CL / EL / Half-Day</div>
          </div>
        </button>

        <button
          type="button"
          className="card-panel"
          onClick={() => setRegModalOpen(true)}
          style={{
            padding: "1rem",
            marginBottom: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Clock size={20} color="var(--color-warning)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Regularize Punch</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Missed In / Out</div>
          </div>
        </button>

        <button
          type="button"
          className="card-panel"
          onClick={() => setWorkModeModalOpen(true)}
          style={{
            padding: "1rem",
            marginBottom: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Laptop size={20} color="var(--color-success)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Apply WFH / OD</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Remote / Client Site</div>
          </div>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <Button
          size="sm"
          variant={activeTab === "overview" ? "primary" : "secondary"}
          onClick={() => setActiveTab("overview")}
        >
          Overview &amp; Requests
        </Button>
        <Button
          size="sm"
          variant={activeTab === "calendar" ? "primary" : "secondary"}
          icon={<CalendarDays size={15} />}
          onClick={() => setActiveTab("calendar")}
        >
          Monthly Attendance ({calendarDays.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "shifts" ? "primary" : "secondary"}
          onClick={() => setActiveTab("shifts")}
        >
          Upcoming Shifts ({upcomingShifts.length})
        </Button>
      </div>

      {activeTab === "overview" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          {/* Monthly Summary & Leave Balances */}
          <div className="card-panel" style={{ padding: "1.1rem", marginBottom: 0 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.65rem" }}>
              This Month Summary &amp; Leave Balances
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: leaveBalances.length > 0 ? "0.75rem" : 0 }}>
              <Badge variant="success">{presentCount} Present</Badge>
              <Badge variant="warning">{halfDayCount} Half Day</Badge>
              <Badge variant="danger">{absentCount} Absent</Badge>
            </div>
            {leaveBalances.length > 0 ? (
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
                {leaveBalances.map((b) => (
                  <span key={b.leave_type_id}>
                    <strong>{b.code}:</strong> {b.balance} days
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Recent Requests */}
          <div className="card-panel" style={{ padding: "1.1rem", marginBottom: 0 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.65rem" }}>
              Recent Requests
            </div>
            {leaveRequests.length === 0 && regRequests.length === 0 && workModeRequests.length === 0 ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                No leave, regularization, or WFH/OD requests submitted yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {workModeRequests.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.85rem",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span>
                      <strong>{r.work_mode}</strong> ({r.calendar_date} • {r.session_target})
                    </span>
                    <Badge variant={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
                {leaveRequests.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.85rem",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span>
                      <strong>Leave</strong> ({r.start_date} to {r.end_date} • {r.days}d)
                    </span>
                    <Badge variant={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
                {regRequests.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.85rem",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span>
                      <strong>Regularization</strong> ({r.calendar_date} • {r.request_type})
                    </span>
                    <Badge variant={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "calendar" ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Worked</th>
                <th>Overtime</th>
              </tr>
            </thead>
            <tbody>
              {calendarDays.map((d) => (
                <tr key={d.calendar_date}>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{d.calendar_date}</td>
                  <td>
                    <Badge variant={d.status === "PRESENT" ? "success" : d.status === "HALF_DAY" ? "warning" : "danger"}>
                      {d.status}
                    </Badge>
                  </td>
                  <td>{formatDuration(d.worked_duration_minutes)}</td>
                  <td>{d.overtime_minutes > 0 ? formatDuration(d.overtime_minutes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Schedule</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingShifts.map((s) => (
                <tr key={s.calendar_date}>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{s.calendar_date}</td>
                  <td>
                    {s.is_rest_day
                      ? "Weekly Off (Rest Day)"
                      : s.sessions.map((sess) => `${formatTimeShort(sess.start_time)}–${formatTimeShort(sess.end_time)}`).join(", ") || "Scheduled"}
                  </td>
                  <td>
                    <Badge variant={s.is_rest_day ? "neutral" : "info"}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Modals */}
      {today ? (
        <>
          <ApplyLeaveModal
            isOpen={leaveModalOpen}
            onClose={() => setLeaveModalOpen(false)}
            employeeId={today.employee_id}
            leaveTypes={leaveTypes}
            onSubmitted={loadPortal}
          />
          <ApplyRegularizationModal
            isOpen={regModalOpen}
            onClose={() => setRegModalOpen(false)}
            employeeId={today.employee_id}
            onSubmitted={loadPortal}
          />
          <ApplyWorkModeModal
            isOpen={workModeModalOpen}
            onClose={() => setWorkModeModalOpen(false)}
            onSubmitted={loadPortal}
          />
        </>
      ) : null}
    </div>
  );
}
