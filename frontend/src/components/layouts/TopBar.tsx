import { useLocation } from "react-router-dom";
import { Sun, Moon, Monitor, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Badge } from "../common/Badge";

const ROUTE_TITLES: Record<string, { title: string; category: string }> = {
  "/attendance": { title: "Attendance Rollup", category: "Operations" },
  "/punches": { title: "Live Punch Ingest", category: "Operations" },
  "/muster": { title: "Muster Roll", category: "Operations" },
  "/anomalies": { title: "Punch Anomalies", category: "Operations" },
  "/devices": { title: "Biometric Devices", category: "Operations" },
  "/shifts": { title: "Shift Management", category: "Scheduling" },
  "/roster": { title: "Roster Matrix", category: "Scheduling" },
  "/policies": { title: "Attendance Policies", category: "Scheduling" },
  "/overtime": { title: "Overtime Requests", category: "Approvals" },
  "/requests": { title: "Leaves & Regularization", category: "Approvals" },
  "/employees": { title: "Employee Directory", category: "People" },
  "/admin/branches": { title: "Company Locations", category: "Administration" },
  "/org/branches": { title: "Company Locations", category: "Administration" },
  "/org/departments": { title: "Departments", category: "People" },
  "/org/designations": { title: "Designations", category: "People" },
  "/admin/roles": { title: "Roles & Permissions", category: "Administration" },
  "/admin/users": { title: "System Users", category: "Administration" },
};

export interface TopBarProps {
  onOpenMobileSidebar?: () => void;
}

export function TopBar({ onOpenMobileSidebar }: TopBarProps) {
  const location = useLocation();
  const { me } = useAuth();
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
      {/* Left: Mobile Menu Button + Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {onOpenMobileSidebar && (
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={onOpenMobileSidebar}
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        )}
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
          title={`Theme: ${theme} (effective: ${resolvedTheme}). Click to cycle.`}
          aria-label={`Toggle color theme. Current theme is ${theme}.`}
          style={{
            position: "relative",
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
            <Monitor size={17} aria-hidden="true" />
          ) : resolvedTheme === "dark" ? (
            <Moon size={17} aria-hidden="true" />
          ) : (
            <Sun size={17} aria-hidden="true" />
          )}
          <span
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            Toggle color theme (currently {theme})
          </span>
        </button>
      </div>
    </header>
  );
}
