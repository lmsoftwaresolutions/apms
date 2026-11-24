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
  ChevronDown,
  LogOut,
  User as UserIcon,
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
  const { me, can, logout } = useAuth();
  const initial = me?.tenant.display_name?.slice(0, 1).toUpperCase() || "A";

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("apms.sidebar.collapsed");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupName]: !prev[groupName] };
      try {
        localStorage.setItem("apms.sidebar.collapsed", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

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
          const isGroupCollapsed = !collapsed && !!collapsedGroups[group.group];

          return (
            <div key={group.group}>
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.group)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "none",
                    border: "none",
                    padding: "0.25rem 0.5rem 0.4rem",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    borderRadius: "0.25rem",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <span>{group.group}</span>
                  {isGroupCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : (
                <div
                  style={{
                    height: 1,
                    backgroundColor: "var(--border-subtle)",
                    margin: "0.5rem 0",
                  }}
                />
              )}

              {!isGroupCollapsed ? (
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
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* Bottom Footer: User Profile + Collapse Toggle */}
      <div
        style={{
          padding: collapsed ? "0.75rem 0.35rem" : "0.75rem",
          borderTop: "1px solid var(--border-default)",
          backgroundColor: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
          gap: "0.625rem",
        }}
      >
        {/* User profile card (img2 moved here) */}
        {!collapsed ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
              padding: "0.45rem 0.5rem",
              borderRadius: "0.5rem",
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
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
                  flexShrink: 0,
                }}
              >
                <UserIcon size={16} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.25 }}>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 650,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {me?.full_name || "User"}
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {me?.email}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              style={{
                background: "none",
                border: "none",
                padding: "0.35rem",
                borderRadius: "0.375rem",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-danger-fg, #f87171)";
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
            <div
              title={`${me?.full_name || "User"} (${me?.email})`}
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
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              style={{
                background: "none",
                border: "none",
                padding: "0.35rem",
                borderRadius: "0.25rem",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-danger-fg, #f87171)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        )}

        {/* Collapse Sidebar Button */}
        <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-end" }}>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "0.375rem",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
