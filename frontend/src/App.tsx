import React, { FormEvent, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./context/AuthContext";
import { AppShell, NavTab } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { AttendancePage } from "./pages/Attendance/AttendancePage";
import { TracePage } from "./pages/Trace/TracePage";
import { ShiftAssignmentPage } from "./pages/ShiftAssignment/ShiftAssignmentPage";
import { RosterPage } from "./pages/Roster/RosterPage";
import { ShiftsPage } from "./pages/Shifts/ShiftsPage";
import { EmployeesPage } from "./pages/Employees/EmployeesPage";
import { OrganizationPage } from "./pages/Organization/OrganizationPage";
import { IAMPage } from "./pages/IAM/IAMPage";
import { SettingsPage } from "./pages/Settings/SettingsPage";
import { TenantsPage } from "./pages/Platform/TenantsPage";

export function App() {
  const { me, token, loading, error, login } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>("dashboard");
  const [traceRecordId, setTraceRecordId] = useState<string | null>(null);

  const handleOpenTrace = (recordId: string) => {
    setTraceRecordId(recordId);
    setCurrentTab("trace");
  };

  // Determine initial valid tab based on permissions
  useEffect(() => {
    if (!me) return;
    if (me.permissions.includes("attendance.daily.read") || me.permissions.includes("employee.employee.read")) setCurrentTab("dashboard");
    else if (me.permissions.includes("roster.instance.read")) setCurrentTab("roster");
    else if (me.permissions.includes("shift.template.read")) setCurrentTab("shifts");
    else if (me.permissions.includes("employee.employee.read")) setCurrentTab("employees");
    else if (me.permissions.includes("org.department.read") || me.permissions.includes("org.branch.read")) setCurrentTab("organization");
    else if (me.permissions.includes("iam.role.read")) setCurrentTab("iam");
    else if (me.permissions.includes("org.tenant.update")) setCurrentTab("settings");
  }, [me]);

  if (loading) {
    return (
      <div className="gate">
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Authenticating APMS tenant session…
        </div>
      </div>
    );
  }

  if (!token || !me) {
    return <SignIn initialError={error} onSignedIn={login} />;
  }

  return (
    <AppShell currentTab={currentTab} onSelectTab={setCurrentTab}>
      {currentTab === "dashboard" && <DashboardPage onSelectTab={setCurrentTab} />}
      {currentTab === "attendance" && <AttendancePage onOpenTrace={handleOpenTrace} />}
      {currentTab === "trace" && <TracePage initialRecordId={traceRecordId} onSelectTab={setCurrentTab} />}
      {currentTab === "shift-assignment" && <ShiftAssignmentPage />}
      {currentTab === "roster" && <RosterPage />}
      {currentTab === "shifts" && <ShiftsPage />}
      {currentTab === "employees" && <EmployeesPage />}
      {currentTab === "organization" && <OrganizationPage />}
      {currentTab === "iam" && <IAMPage />}
      {currentTab === "settings" && <SettingsPage />}
      {currentTab === "tenants" && me.permissions.includes("platform.tenant.create") && <TenantsPage />}
    </AppShell>
  );
}

function SignIn({
  initialError,
  onSignedIn,
}: {
  initialError: string;
  onSignedIn: (token: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  // Reset fields on mount to prevent browser-autofill or clipboard bleed
  useEffect(() => {
    setEmail("");
    setPassword("");
    setError(initialError);
  }, [initialError]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await api.login(email.trim(), password);
      await onSignedIn(res.access_token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed.";
      // Strip raw markdown/JSON that sometimes leaks from backend error strings
      setError(msg.replace(/^#+\s+.*$/gm, "").trim() || "Sign-in failed. Please verify credentials.");
    } finally {
      setPending(false);
    }
  };

  const fillCreds = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
    setError("");
  };

  return (
    <main className="gate">
      <div className="login-card">
        {/* Brand */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
            <span className="login-brand-mark">A</span>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>APMS</span>
          </div>
          <p className="text-secondary" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
            Attendance Capture, Shift Rostering &amp; Statutory Payroll Console
          </p>
        </div>

        {/* Error Banner */}
        {error ? (
          <div className="login-error-banner">
            <span>⚠ {error}</span>
            <button type="button" className="ghost small" style={{ padding: "0 0.25rem" }} onClick={() => setError("")}>✕</button>
          </div>
        ) : null}

        {/* Sign-in Form */}
        <form
          className="flex flex-col gap-3"
          style={{ width: "100%" }}
          onSubmit={handleSubmit}
          autoComplete="off"
        >
          <div className="form-group">
            <label htmlFor="login-email">Work Email</label>
            <input
              id="login-email"
              type="text"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@tenant.example"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="new-password"
              required
            />
          </div>

          <button
            className="primary"
            type="submit"
            disabled={pending || !email.includes("@") || password.length < 6}
            style={{ marginTop: "0.25rem", width: "100%", padding: "0.65rem" }}
          >
            {pending ? "Signing in…" : "Sign in to Console"}
          </button>
        </form>

        {/* Quick-fill Demo Buttons */}
        <div className="login-demo-section">
          <span className="login-demo-label">Dev Demo Credentials</span>
          <div className="flex gap-2 flex-wrap">
            <button
              className="ghost small"
              type="button"
              onClick={() => fillCreds("admin@northmill.example", "ChangeMe-Admin-1")}
              title="Full tenant administrator — North Mill Textiles"
            >
              Admin · North Mill
            </button>
            <button
              className="ghost small"
              type="button"
              onClick={() => fillCreds("supervisor@northmill.example", "ChangeMe-Supervisor-1")}
              title="Shift supervisor role"
            >
              Supervisor
            </button>
            <button
              className="ghost small"
              type="button"
              onClick={() => fillCreds("admin@eastmill.example", "ChangeMe-East-1")}
              title="East Mill Textile — newly provisioned"
            >
              Admin · East Mill
            </button>
          </div>
        </div>

        <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", textAlign: "center", paddingTop: "0.25rem" }}>
          Protected by Row-Level Security &amp; AES-256 Tenant Vault
        </div>
      </div>
    </main>
  );
}
