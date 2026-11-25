import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../../api";
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
  ChevronRight,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Menu,
  AlertTriangle,
  Cpu,
  Activity,
  Calendar,
  ClipboardCheck,
  Settings,
  LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: string;
  badge?: string;
  badgeType?: "live" | "count" | "neutral";
}

interface NavGroup {
  group: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Operations",
    icon: Activity,
    items: [
      { label: "Attendance", to: "/attendance", icon: CalendarCheck },
      { label: "Live Punches", to: "/punches", icon: Zap, badge: "Live", badgeType: "live" },
      { label: "Muster Roll", to: "/muster", icon: FileSpreadsheet },
      { label: "Anomalies", to: "/anomalies", icon: AlertTriangle },
      { label: "Devices", to: "/devices", icon: Cpu },
    ],
  },
  {
    group: "Scheduling",
    icon: Calendar,
    items: [
      { label: "Shifts", to: "/shifts", icon: CalendarRange },
      { label: "Roster Matrix", to: "/roster", icon: CalendarDays },
      { label: "Policies", to: "/policies", icon: Sliders },
    ],
  },
  {
    group: "Approvals",
    icon: ClipboardCheck,
    items: [
      { label: "Overtime", to: "/overtime", icon: Timer },
      { label: "Leaves & Regularization", to: "/requests", icon: FileCheck },
    ],
  },
  {
    group: "People",
    icon: Users,
    items: [
      { label: "Action Center", to: "/admin/pending-actions", icon: AlertTriangle, permission: "pending_action:read" },
      { label: "Employees", to: "/employees", icon: Users },
      { label: "Departments", to: "/org/departments", icon: Network, permission: "org.department.read" },
      { label: "Designations", to: "/org/designations", icon: Briefcase, permission: "org.designation.read" },
    ],
  },
  {
    group: "Administration",
    icon: Settings,
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
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const { me, can, logout } = useAuth();
  const initial = me?.tenant.display_name?.slice(0, 1).toUpperCase() || "A";
  const location = useLocation();

  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    void api
      .pendingActionsCount()
      .then((res) => {
        if (mounted) setPendingCount(res.pending);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("apms.sidebar.collapsed");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // In collapsed rail mode (72px), track which group is opened by clicking its icon
  const [openCollapsedGroup, setOpenCollapsedGroup] = useState<string | null>(() => {
    const currentPath = window.location.pathname;
    const active = NAV_GROUPS.find((g) =>
      g.items.some((i) => currentPath === i.to || currentPath.startsWith(i.to + "/"))
    );
    return active ? active.group : null;
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
      className={`app-sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
      aria-label="Main Navigation"
    >
      {/* Brand Header */}
      <div
        style={{
          height: "var(--topbar-height)",
          padding: collapsed ? "0 0.5rem" : "0 0.875rem 0 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        {!collapsed ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, overflow: "hidden" }}>
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
            <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.9375rem",
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
          </div>
        ) : null}

        {/* 3-Line Hamburger Sidebar Toggle Button at Top Right */}
        <button
          type="button"
          onClick={() => {
            if (window.innerWidth <= 768) {
              onCloseMobile?.();
            } else {
              onToggleCollapse();
            }
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
            flexShrink: 0,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.borderColor = "var(--border-strong)";
            e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.backgroundColor = "var(--bg-surface)";
          }}
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav
        style={{
          flex: 1,
          padding: collapsed ? "0.75rem 0.25rem" : "1rem 0.75rem",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: collapsed ? "0.625rem" : "1.25rem",
        }}
      >
        {NAV_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          // Filter items based on permissions
          const visibleItems = group.items.filter(
            (item) => !item.permission || can(item.permission),
          );

          if (visibleItems.length === 0) return null;

          const isGroupActive = visibleItems.some(
            (item) => location.pathname === item.to || location.pathname.startsWith(item.to + "/")
          );

          // In collapsed rail mode, only show options for the currently selected group
          // In expanded mode, check the user's persisted collapsedGroups
          const isGroupCollapsed = collapsed
            ? openCollapsedGroup !== group.group
            : !!collapsedGroups[group.group];

          const handleToggle = () => {
            if (collapsed) {
              setOpenCollapsedGroup((prev) => (prev === group.group ? null : group.group));
            } else {
              toggleGroup(group.group);
            }
          };

          return (
            <div key={group.group} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {!collapsed ? (
                <button
                  type="button"
                  onClick={handleToggle}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "none",
                    border: "none",
                    padding: "0.35rem 0.5rem",
                    cursor: "pointer",
                    color: isGroupActive ? "var(--color-primary-fg)" : "var(--text-muted)",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    borderRadius: "0.375rem",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isGroupActive) e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isGroupActive) e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <GroupIcon size={14} style={{ flexShrink: 0 }} />
                    <span>{group.group}</span>
                  </div>
                  {isGroupCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggle}
                  title={`${group.group} (${isGroupCollapsed ? "Click to show options" : "Click to hide options"})`}
                  aria-label={group.group}
                  style={{
                    width: 42,
                    height: 42,
                    margin: "0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "0.5rem",
                    border: isGroupActive
                      ? "1.5px solid var(--color-primary-border, #3b82f6)"
                      : !isGroupCollapsed
                      ? "1px solid var(--border-default)"
                      : "1px solid transparent",
                    backgroundColor: isGroupActive
                      ? "var(--color-primary-bg, rgba(37, 99, 235, 0.12))"
                      : !isGroupCollapsed
                      ? "var(--bg-subtle)"
                      : "transparent",
                    color: isGroupActive
                      ? "var(--color-primary-fg, #2563eb)"
                      : !isGroupCollapsed
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isGroupActive && isGroupCollapsed) {
                      e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isGroupActive && isGroupCollapsed) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }
                  }}
                >
                  <GroupIcon size={19} />
                  {isGroupActive ? (
                    <span
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "var(--color-primary-fg, #2563eb)",
                      }}
                    />
                  ) : null}
                </button>
              )}

              {!isGroupCollapsed ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                    paddingLeft: collapsed ? 0 : 0,
                    marginTop: collapsed ? "0.15rem" : 0,
                    marginBottom: collapsed ? "0.35rem" : 0,
                  }}
                >
                  {visibleItems.map((rawItem) => {
                    const item =
                      rawItem.to === "/admin/pending-actions" && pendingCount > 0
                        ? { ...rawItem, badge: String(pendingCount), badgeType: "count" as const }
                        : rawItem;
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => onCloseMobile?.()}
                        title={collapsed ? item.label : undefined}
                        style={({ isActive }) => ({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: collapsed ? "center" : "flex-start",
                          gap: "0.75rem",
                          padding: collapsed ? "0.5rem" : "0.5rem 0.75rem",
                          width: collapsed ? 36 : "auto",
                          height: collapsed ? 36 : "auto",
                          margin: collapsed ? "0 auto" : 0,
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
                        <Icon size={collapsed ? 16 : 18} style={{ flexShrink: 0 }} />
                        {!collapsed ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                            {item.badge ? (
                              <span
                                style={{
                                  fontSize: "0.6875rem",
                                  fontWeight: 700,
                                  padding: "0.1rem 0.45rem",
                                  borderRadius: "9999px",
                                  backgroundColor:
                                    item.badgeType === "live"
                                      ? "rgba(16, 185, 129, 0.15)"
                                      : item.badgeType === "count"
                                        ? "var(--color-danger-bg)"
                                        : "var(--bg-subtle)",
                                  color:
                                    item.badgeType === "live"
                                      ? "#10b981"
                                      : item.badgeType === "count"
                                        ? "var(--color-danger-fg)"
                                        : "var(--text-muted)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  flexShrink: 0,
                                }}
                              >
                                {item.badgeType === "live" ? (
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      backgroundColor: "#10b981",
                                      display: "inline-block",
                                    }}
                                  />
                                ) : null}
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
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
      </div>
    </aside>
  );
}
