import React, { useState } from "react";
import {
  Calendar,
  Clock,
  Users,
  Building2,
  ShieldCheck,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Menu,
  Globe,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export type NavTab = "attendance" | "roster" | "shifts" | "employees" | "organization" | "iam" | "settings" | "tenants";

export function AppShell({
  currentTab,
  onSelectTab,
  children,
}: {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  children: React.ReactNode;
}) {
  const { me, logout, can } = useAuth();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const initial = me?.tenant.display_name?.slice(0, 1).toUpperCase() || "A";

  const nextTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          {!collapsed ? (
            <div className="brand-title">
              <span className="brand-mark">{initial}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {me?.tenant.display_name || "APMS"}
              </span>
            </div>
          ) : (
            <span className="brand-mark" style={{ margin: "0 auto" }}>{initial}</span>
          )}
          <button
            className="ghost small"
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title="Toggle Sidebar"
          >
            <Menu size={16} />
          </button>
        </div>

        <ul className="nav-list">
          {can("attendance.daily.read") ? (
            <li
              className={`nav-item ${currentTab === "attendance" ? "active" : ""}`}
              onClick={() => onSelectTab("attendance")}
              title="Attendance"
            >
              <Calendar size={18} />
              {!collapsed && <span>Attendance</span>}
            </li>
          ) : null}

          {can("roster.instance.read") ? (
            <li
              className={`nav-item ${currentTab === "roster" ? "active" : ""}`}
              onClick={() => onSelectTab("roster")}
              title="Shift Roster"
            >
              <Clock size={18} />
              {!collapsed && <span>Shift Roster</span>}
            </li>
          ) : null}

          {can("shift.template.read") ? (
            <li
              className={`nav-item ${currentTab === "shifts" ? "active" : ""}`}
              onClick={() => onSelectTab("shifts")}
              title="Shift Templates"
            >
              <Clock size={18} />
              {!collapsed && <span>Shift Templates</span>}
            </li>
          ) : null}

          {can("employee.employee.read") ? (
            <li
              className={`nav-item ${currentTab === "employees" ? "active" : ""}`}
              onClick={() => onSelectTab("employees")}
              title="Employees"
            >
              <Users size={18} />
              {!collapsed && <span>Employees</span>}
            </li>
          ) : null}

          {can("org.department.read") || can("org.branch.read") ? (
            <li
              className={`nav-item ${currentTab === "organization" ? "active" : ""}`}
              onClick={() => onSelectTab("organization")}
              title="Organization"
            >
              <Building2 size={18} />
              {!collapsed && <span>Organization</span>}
            </li>
          ) : null}

          {can("iam.role.read") ? (
            <li
              className={`nav-item ${currentTab === "iam" ? "active" : ""}`}
              onClick={() => onSelectTab("iam")}
              title="IAM & RBAC"
            >
              <ShieldCheck size={18} />
              {!collapsed && <span>IAM & Roles</span>}
            </li>
          ) : null}

          {can("org.tenant.update") ? (
            <li
              className={`nav-item ${currentTab === "settings" ? "active" : ""}`}
              onClick={() => onSelectTab("settings")}
              title="Settings"
            >
              <Settings size={18} />
              {!collapsed && <span>Settings</span>}
            </li>
          ) : null}

          {can("org.tenant.update") ? (
            <li
              className={`nav-item ${currentTab === "tenants" ? "active" : ""}`}
              onClick={() => onSelectTab("tenants")}
              title="Platform Tenants"
            >
              <Globe size={18} />
              {!collapsed && <span>Platform Tenants</span>}
            </li>
          ) : null}
        </ul>
      </aside>

      {/* Main View Area */}
      <div className="main-content">
        <header className="topbar">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              {me?.tenant.display_name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 3-State Theme Toggle */}
            <button
              className="ghost small"
              type="button"
              onClick={nextTheme}
              title={`Theme: ${theme.toUpperCase()} (Click to toggle)`}
            >
              <ThemeIcon size={16} />
              <span style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>{theme}</span>
            </button>

            {/* User profile indicator */}
            <div className="flex items-center gap-2" style={{ borderLeft: "1px solid var(--border-default)", paddingLeft: "0.75rem" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{me?.full_name}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{me?.email}</div>
              </div>

              <button
                className="ghost small"
                type="button"
                onClick={logout}
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}
