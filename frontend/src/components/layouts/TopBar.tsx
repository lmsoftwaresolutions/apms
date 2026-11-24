import { useLocation } from "react-router-dom";
import { Sun, Moon, Monitor, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";

const ROUTE_TITLES: Record<string, { title: string; category: string }> = {
  "/attendance": { title: "Attendance Rollup", category: "Operations" },
  "/punches": { title: "Live Punch Ingest", category: "Operations" },
  "/muster": { title: "Muster Roll", category: "Operations" },
  "/shifts": { title: "Shift Management", category: "Scheduling" },
  "/roster": { title: "Roster Matrix", category: "Scheduling" },
  "/policies": { title: "Attendance Policies", category: "Scheduling" },
  "/overtime": { title: "Overtime Requests", category: "Approvals" },
  "/requests": { title: "Leaves & Regularization", category: "Approvals" },
  "/employees": { title: "Employee Directory", category: "People" },
  "/org/branches": { title: "Branches", category: "Organization" },
  "/org/departments": { title: "Departments", category: "Organization" },
  "/org/designations": { title: "Designations", category: "Organization" },
  "/admin/roles": { title: "Roles & Permissions", category: "Administration" },
  "/admin/users": { title: "System Users", category: "Administration" },
};

export function TopBar() {
  const location = useLocation();
  const { me, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const currentRouteInfo = ROUTE_TITLES[location.pathname] || {
    title: "Console",
    category: "Portal",
  };

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <header className="app-topbar">
      {/* Breadcrumb / Title */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
            {currentRouteInfo.category}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--border-strong)" }}>/</span>
          <span style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: 650 }}>
            {currentRouteInfo.title}
          </span>
        </div>
      </div>

      {/* Right Actions: Tenant badge, Theme switcher, Profile, Logout */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {me?.tenant ? (
          <Badge variant="neutral" size="sm" style={{ fontWeight: 600 }}>
            {me.tenant.display_name}
          </Badge>
        ) : null}

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={cycleTheme}
          title={`Current theme: ${theme} (${resolvedTheme}). Click to cycle.`}
          aria-label="Toggle color theme"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: "0.375rem",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {theme === "system" ? (
            <Monitor size={17} />
          ) : resolvedTheme === "dark" ? (
            <Moon size={17} />
          ) : (
            <Sun size={17} />
          )}
        </button>

        {/* User profile */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            paddingLeft: "0.5rem",
            borderLeft: "1px solid var(--border-default)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-strong)",
              display: "grid",
              placeItems: "center",
              color: "var(--text-secondary)",
            }}
          >
            <UserIcon size={16} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
              {me?.full_name || "User"}
            </span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              {me?.email}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            style={{ marginLeft: "0.25rem", color: "var(--text-muted)" }}
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
}
