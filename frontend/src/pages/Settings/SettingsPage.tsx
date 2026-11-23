import React, { useState } from "react";
import { Settings, CheckCircle2 } from "lucide-react";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";

export function SettingsPage() {
  const { me, refreshMe } = useAuth();
  const [displayName, setDisplayName] = useState(me?.tenant.display_name || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await api.updateTenant(displayName);
      await refreshMe();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "600px" }}>
      <div>
        <h2>Tenant & Organization Settings</h2>
        <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
          Manage your organization name and tenant-level configurations.
        </p>
      </div>

      {error ? (
        <div style={{ padding: "0.6rem 0.8rem", background: "var(--danger-bg)", color: "var(--danger-fg)", borderRadius: "4px", fontSize: "0.82rem" }}>
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="flex items-center gap-2" style={{ padding: "0.6rem 0.8rem", background: "var(--success-bg)", color: "var(--success-fg)", borderRadius: "4px", fontSize: "0.82rem" }}>
          <CheckCircle2 size={16} /> Organization profile updated successfully.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-header">
          <h3>Organization Profile</h3>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSave}>
          <div className="form-group">
            <label>Tenant ID (Immutable UUID)</label>
            <input value={me?.tenant.id || ""} disabled className="tabular" />
          </div>

          <div className="form-group">
            <label>Organization Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Acme Corp Industries"
              required
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button className="primary" type="submit" disabled={saving || !displayName || displayName === me?.tenant.display_name}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
