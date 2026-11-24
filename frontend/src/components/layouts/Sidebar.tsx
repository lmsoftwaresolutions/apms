import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  CalendarCheck,
  Zap,
  FileSpreadsheet,
  CalendarRange,
  CalendarDays,
  Sliders,
  Timer,
  FileCheck,
  Users,
  Building2,
  Network,
  Briefcase,
  Shield,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Operations",
    items: [
      { label: "Attendance", to: "/attendance", icon: CalendarCheck },
      { label: "Live Punches", to: "/punches", icon: Zap },
      { label: "Muster Roll", to: "/muster", icon: FileSpreadsheet },
    ],
  },
  {
    group: "Scheduling",
    items: [
      { label: "Shifts", to: "/shifts", icon: CalendarRange },
      { label: "Roster Matrix", to: "/roster", icon: CalendarDays },
      { label: "Policies", to: "/policies", icon: Sliders },
    ],
  },
  {
    group: "Approvals",
    items: [
      { label: "Overtime", to: "/overtime", icon: Timer },
      { label: "Leaves & Regularization", to: "/requests", icon: FileCheck },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Employees", to: "/employees", icon: Users },
      { label: "Departments", to: "/org/departments", icon: Network, permission: "org.department.read" },
      { label: "Designations", to: "/org/designations", icon: Briefcase, permission: "org.designation.read" },
    ],
  },
  {
    group: "Administration",
    items: [
      { label: "Locations", to: "/admin/branches", icon: Building2 },
      { label: "Roles", to: "/admin/roles", icon: Shield, permission: "iam.role.read" },
      { label: "Users", to: "/admin/users", icon: UserCheck, permission: "iam.role.read" },
    ],
  },
];

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { me, can } = useAuth();
  const initial = me?.tenant.display_name?.slice(0, 1).toUpperCase() || "A";

  return (
    <aside
      className={`app-sidebar ${collapsed ? "collapsed" : ""}`}
      aria-label="Main Navigation"
    >
      {/* Brand Header */}
      <div
        style={{
          height: "var(--topbar-height)",
          padding: collapsed ? "0 0.75rem" : "0 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: "0.75rem",
          borderBottom: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        {me?.tenant.logo_url ? (
          <img
            src={me.tenant.logo_url}
            alt=""
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: "var(--color-primary)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: "1rem",
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
        )}
        {!collapsed ? (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "1rem",
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {me?.tenant.display_name || "APMS"}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              Enterprise Portal
            </div>
          </div>
        ) : null}
      </div>

      {/* Navigation Groups */}
      <nav
        style={{
          flex: 1,
          padding: collapsed ? "1rem 0.5rem" : "1rem 0.75rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {NAV_GROUPS.map((group) => {
          // Filter items based on permissions
          const visibleItems = group.items.filter(
            (item) => !item.permission || can(item.permission),
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.group}>
              {!collapsed ? (
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    padding: "0.25rem 0.5rem 0.5rem",
                  }}
                >
                  {group.group}
                </div>
              ) : (
                <div
                  style={{
                    height: 1,
                    backgroundColor: "var(--border-subtle)",
                    margin: "0.5rem 0",
                  }}
                />
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      style={({ isActive }) => ({
                        display: "flex",
                        alignItems: "center",
                        justifyContent: collapsed ? "center" : "flex-start",
                        gap: "0.75rem",
                        padding: collapsed ? "0.625rem" : "0.5rem 0.75rem",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? "var(--color-primary-fg)" : "var(--text-secondary)",
                        backgroundColor: isActive ? "var(--color-primary-bg)" : "transparent",
                        border: isActive ? "1px solid var(--color-primary-border)" : "1px solid transparent",
                        textDecoration: "none",
                        transition: "all 0.15s ease",
                      })}
                    >
                      <Icon size={18} style={{ flexShrink: 0 }} />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle Footer */}
      <div
        style={{
          padding: "0.75rem",
          borderTop: "1px solid var(--border-default)",
          display: "flex",
          justifyContent: collapsed ? "center" : "flex-end",
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: "0.375rem",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
