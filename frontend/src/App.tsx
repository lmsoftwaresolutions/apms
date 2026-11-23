import React, { FormEvent, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./context/AuthContext";
import { AppShell, NavTab } from "./components/layout/AppShell";
import { AttendancePage } from "./pages/Attendance/AttendancePage";
import { RosterPage } from "./pages/Roster/RosterPage";
import { ShiftsPage } from "./pages/Shifts/ShiftsPage";
import { EmployeesPage } from "./pages/Employees/EmployeesPage";
import { OrganizationPage } from "./pages/Organization/OrganizationPage";
import { IAMPage } from "./pages/IAM/IAMPage";
import { SettingsPage } from "./pages/Settings/SettingsPage";

export function App() {
  const { me, token, loading, error, login } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>("attendance");

  // Determine initial valid tab based on permissions
  useEffect(() => {
    if (!me) return;
    if (me.permissions.includes("attendance.daily.read")) setCurrentTab("attendance");
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
      {currentTab === "attendance" && <AttendancePage />}
      {currentTab === "roster" && <RosterPage />}
      {currentTab === "shifts" && <ShiftsPage />}
      {currentTab === "employees" && <EmployeesPage />}
      {currentTab === "organization" && <OrganizationPage />}
      {currentTab === "iam" && <IAMPage />}
      {currentTab === "settings" && <SettingsPage />}
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await api.login(email.trim(), password);
      await onSignedIn(res.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please verify credentials.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="gate">
      <div className="login-card">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span
              style={{
                width: "28px",
                height: "28px",
                background: "var(--action-primary)",
                color: "var(--action-fg)",
                borderRadius: "4px",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              A
            </span>
            <span style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              APMS
            </span>
          </div>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Attendance Capture, Shift Rostering & Statutory Payroll Console
          </p>
        </div>

        {error ? (
          <div style={{ padding: "0.6rem 0.8rem", background: "var(--danger-bg)", color: "var(--danger-fg)", borderRadius: "4px", fontSize: "0.8rem" }}>
            {error}
          </div>
        ) : null}

        <form className="flex flex-col gap-3" style={{ width: "100%" }} onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Work Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@northmill.example"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="primary"
            type="submit"
            disabled={pending || !email || password.length < 6}
            style={{ marginTop: "0.25rem", width: "100%", padding: "0.6rem" }}
          >
            {pending ? "Signing in…" : "Sign in to Console"}
          </button>
        </form>

        {/* Quick Fill Credentials for Dev Testing */}
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600 }}>
            Quick Demo Credentials
          </span>
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <button
              className="ghost small"
              type="button"
              onClick={() => {
                setEmail("admin@northmill.example");
                setPassword("ChangeMe-Admin-1");
              }}
              title="Full tenant administrator"
            >
              Admin (North Mill)
            </button>
            <button
              className="ghost small"
              type="button"
              onClick={() => {
                setEmail("supervisor@northmill.example");
                setPassword("ChangeMe-Supervisor-1");
              }}
              title="Shift supervisor"
            >
              Supervisor
            </button>
          </div>
        </div>

        <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", textAlign: "center" }}>
          Protected by Row-Level Security & AES-256 Tenant Vault
        </div>
      </div>
    </main>
  );
}
