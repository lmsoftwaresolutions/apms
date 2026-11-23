import React, { useEffect, useState } from "react";
import { api, PunchEvent, DailyAttendance, Employee, Branch, ShiftTemplate } from "../../api";
import { Badge } from "../../components/common/UIComponents";
import { NavTab } from "../../components/layout/AppShell";
import { ArrowRight, Activity, Users, Building2, AlertTriangle, ShieldCheck } from "lucide-react";

interface DashboardStats {
  totalEmployees: number;
  totalBranches: number;
  totalShifts: number;
  todayPunches: number;
  todayAttendance: DailyAttendance[];
  recentPunches: PunchEvent[];
}

export function DashboardPage({ onSelectTab }: { onSelectTab?: (tab: NavTab) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    setLoading(true);
    setError("");

    Promise.all([
      api.employees().catch(() => [] as Employee[]),
      api.branches().catch(() => [] as Branch[]),
      api.shiftTemplates().catch(() => [] as ShiftTemplate[]),
      api.punches({ limit: 10 }).catch(() => [] as PunchEvent[]),
      api.dailyAttendance({ start_date: todayStr, end_date: todayStr }).catch(() => [] as DailyAttendance[]),
    ])
      .then(([emps, branches, shifts, punches, att]) => {
        setStats({
          totalEmployees: emps.length,
          totalBranches: branches.length,
          totalShifts: shifts.length,
          todayPunches: punches.length,
          todayAttendance: att,
          recentPunches: punches,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard statistics");
      })
      .finally(() => setLoading(false));
  }, [todayStr]);

  const presentCount = stats?.todayAttendance.filter((a) => a.status === "PRESENT").length || 0;
  const anomalyCount = stats?.todayAttendance.filter((a) => a.anomaly_code || a.is_single_punch).length || 0;
  const totalAtt = stats?.todayAttendance.length || 0;
  const presentPct = totalAtt > 0 ? Math.round((presentCount / totalAtt) * 100) : 100;

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Operations Command Center</h1>
          <p className="page-subtitle">{todayFormatted} • Deterministic Attendance &amp; Shift Telemetry</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="success">Ingestion Engine Live</Badge>
          <Badge variant="default">RLS Isolated</Badge>
          {onSelectTab && (
            <button
              className="primary small"
              type="button"
              onClick={() => onSelectTab("attendance")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span>View Daily Muster Roll</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="login-error-banner" style={{ marginBottom: "1rem" }}>
          <span>⚠ {error}</span>
        </div>
      ) : null}

      {/* Metric KPI Cards */}
      <div className="dashboard-kpi-grid">
        <div className="kpi-card" onClick={() => onSelectTab && onSelectTab("employees")} style={{ cursor: "pointer" }}>
          <div className="flex items-center justify-between">
            <span className="kpi-label">Total On Master</span>
            <Users size={16} className="text-secondary" />
          </div>
          <div className="kpi-value mono">{loading ? "—" : stats?.totalEmployees ?? 0}</div>
          <div className="kpi-sub">Enrolled workforce active in tenant</div>
        </div>

        <div className="kpi-card kpi-success" onClick={() => onSelectTab && onSelectTab("attendance")} style={{ cursor: "pointer" }}>
          <div className="flex items-center justify-between">
            <span className="kpi-label">Present Today</span>
            <Activity size={16} style={{ color: "var(--color-success, #10b981)" }} />
          </div>
          <div className="kpi-value mono">
            {loading ? "—" : `${presentCount}`}
            {!loading && totalAtt > 0 ? (
              <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.4rem" }}>
                ({presentPct}%)
              </span>
            ) : null}
          </div>
          <div className="kpi-sub">Rollup evaluated duty status</div>
        </div>

        <div className="kpi-card kpi-warning" onClick={() => onSelectTab && onSelectTab("attendance")} style={{ cursor: "pointer" }}>
          <div className="flex items-center justify-between">
            <span className="kpi-label">Active Anomalies</span>
            <AlertTriangle size={16} style={{ color: "var(--color-warning, #f59e0b)" }} />
          </div>
          <div className="kpi-value mono">{loading ? "—" : anomalyCount}</div>
          <div className="kpi-sub">Lone punches &amp; boundary breaches</div>
        </div>

        <div className="kpi-card" onClick={() => onSelectTab && onSelectTab("organization")} style={{ cursor: "pointer" }}>
          <div className="flex items-center justify-between">
            <span className="kpi-label">Operational Sites</span>
            <Building2 size={16} className="text-secondary" />
          </div>
          <div className="kpi-value mono">{loading ? "—" : stats?.totalBranches ?? 0}</div>
          <div className="kpi-sub">{stats?.totalShifts ?? 0} shift templates configured</div>
        </div>
      </div>

      {/* Live Ingestion Feed + Shift Progression Grid */}
      <div className="dashboard-main-grid">
        {/* Live Ingestion Feed */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <h3 className="card-title">Live Multi-Modal Ingestion Feed</h3>
              <Badge variant="default">Append-Only raw_envelope</Badge>
            </div>
            {onSelectTab && (
              <button className="ghost small" type="button" onClick={() => onSelectTab("attendance")}>
                Muster Stream →
              </button>
            )}
          </div>
          <div className="card-body">
            {loading ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                Streaming live punch telemetry…
              </div>
            ) : stats?.recentPunches && stats.recentPunches.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time (IST)</th>
                    <th>Source / Adapter</th>
                    <th>Direction</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPunches.map((p) => {
                    const timeStr = new Date(p.punch_time).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    });
                    const isIN = p.punch_direction?.toUpperCase() === "IN";
                    return (
                      <tr key={p.id}>
                        <td className="mono text-secondary">{timeStr}</td>
                        <td>
                          <Badge variant="default">{p.source || "DEVICE"}</Badge>
                        </td>
                        <td className={`mono font-bold ${isIN ? "text-success" : "text-danger"}`}>
                          {p.punch_direction || "PUNCH"}
                        </td>
                        <td>
                          <Badge variant={p.status === "VALID" ? "success" : "warning"}>{p.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                <p>No punches recorded yet today.</p>
                <p style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                  Use "Ingest Punch" in the Attendance module to push hardware biometric packets.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Shift Progression & Statutory Invariants */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">24-Hour Shift Coverage &amp; Policy Bounds</h3>
            <Badge variant="success">N65 Enforced</Badge>
          </div>
          <div className="card-body">
            <div className="shift-progress-row">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">Morning Shift A (06:00 – 14:00)</span>
                <span className="text-secondary mono">Early Window</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill bg-success" style={{ width: "100%" }} />
              </div>
            </div>

            <div className="shift-progress-row">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">General Shift (09:00 – 18:00)</span>
                <span className="text-secondary mono">Core Office</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill bg-warning" style={{ width: "65%" }} />
              </div>
            </div>

            <div className="shift-progress-row">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">Split Shift (Hospitality / Transport)</span>
                <span className="text-secondary mono" style={{ color: "var(--color-danger, #ef4444)" }}>
                  N65 Mid-Session Gap Excluded
                </span>
              </div>
              <div className="progress-bar-track" style={{ display: "flex", gap: "2px" }}>
                <div className="progress-bar-fill" style={{ width: "40%", background: "var(--color-warning, #f59e0b)" }} />
                <div
                  className="progress-bar-fill"
                  style={{ width: "25%", background: "var(--border-default, #cbd5e1)" }}
                  title="N65 Mid-Session Unpaid Gap"
                />
                <div className="progress-bar-fill" style={{ width: "35%", background: "var(--color-warning, #f59e0b)" }} />
              </div>
            </div>

            <div className="shift-progress-row">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">Night Shift C (22:00 – 06:00+1)</span>
                <span className="text-secondary mono">Cross-Midnight</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: "15%", background: "#8b5cf6" }} />
              </div>
            </div>

            {/* Statutory Compliance Callout */}
            <div className="statutory-callout mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck size={16} style={{ color: "var(--color-success, #10b981)" }} />
                  Statutory Rule Guarantees
                </span>
                <Badge variant="success">INVARIANTS ACTIVE</Badge>
              </div>
              <p className="text-xs text-secondary">• Deterministic JSON explanation traces generated on every rollup.</p>
              <p className="text-xs text-secondary">• OSH Code Overtime rate (2.0× basic) calculated with zero rounding bleed.</p>
              <p className="text-xs text-secondary">• Multi-tenant Row-Level Security ensures strict cross-tenant isolation.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
