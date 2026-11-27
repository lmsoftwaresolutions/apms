import { FormEvent, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sun, Moon, Monitor, Menu, Pencil } from "lucide-react";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Field } from "../common/Field";
import { Modal } from "../common/Modal";

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
  "/admin/branches/geofence": { title: "Branch Geofence Registry", category: "Administration" },
  "/ess/mobile-punch": { title: "Mobile Geo Punch", category: "Self Service" },
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
  const { me, can, refreshMe } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const [isBrandingOpen, setIsBrandingOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandingSubmitting, setBrandingSubmitting] = useState(false);
  const [brandingError, setBrandingError] = useState("");

  function openBrandingModal() {
    if (!me?.tenant) return;
    setDisplayName(me.tenant.display_name);
    setLogoUrl(me.tenant.logo_url || "");
    setBrandingError("");
    setIsBrandingOpen(true);
  }

  async function handleBrandingSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedLogo = logoUrl.trim();
    if (!trimmedName) {
      setBrandingError("Organization display name cannot be blank.");
      return;
    }
    if (trimmedLogo && !/^(https?:\/\/|\/)/i.test(trimmedLogo)) {
      setBrandingError("Logo URL must start with https://, http://, or /.");
      return;
    }
    setBrandingSubmitting(true);
    setBrandingError("");
    try {
      await api.updateTenant({
        display_name: trimmedName,
        logo_url: trimmedLogo || null,
      });
      await refreshMe();
      setIsBrandingOpen(false);
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : "Failed to update workspace branding");
    } finally {
      setBrandingSubmitting(false);
    }
  }

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
          can("org.tenant.update") ? (
            <button
              type="button"
              onClick={openBrandingModal}
              title="Edit organization branding & workspace settings"
              aria-label="Edit organization branding"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.25rem 0.65rem",
                borderRadius: "9999px",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-primary)",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span>{me.tenant.display_name}</span>
              <Pencil size={12} color="var(--text-muted)" aria-hidden="true" />
            </button>
          ) : (
            <Badge variant="neutral" size="sm" style={{ fontWeight: 600 }}>
              {me.tenant.display_name}
            </Badge>
          )
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

      {/* Workspace Branding Modal */}
      <Modal
        isOpen={isBrandingOpen}
        onClose={() => {
          setIsBrandingOpen(false);
          setBrandingError("");
        }}
        title="Workspace Branding"
        description="Customize your organization display name and sidebar logo."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsBrandingOpen(false);
                setBrandingError("");
              }}
              disabled={brandingSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => handleBrandingSubmit(e as unknown as FormEvent)}
              loading={brandingSubmitting}
              disabled={!displayName.trim()}
            >
              Save Branding
            </Button>
          </>
        }
      >
        <form onSubmit={handleBrandingSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {brandingError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {brandingError}
            </div>
          ) : null}

          <Field label="Organization Display Name" required help="Shown in the sidebar brand header and reports">
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={200}
              required
            />
          </Field>

          <Field
            label="Logo Image URL (Optional)"
            help="Enter an https://, http://, or relative / image path. Leave blank to show the initial badge."
          >
            <input
              className="input"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              maxLength={500}
            />
          </Field>
        </form>
      </Modal>
    </header>
  );
}
