import React, { useEffect, useState } from "react";
import { Plus, Globe, ShieldAlert, CheckCircle2, Building, Users, Copy, Check } from "lucide-react";
import { api, PlatformTenant, TenantProvisionInput } from "../../api";
import { Badge, Modal, EmptyState, SkeletonTable, Alert } from "../../components/common/UIComponents";

export function TenantsPage() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Provisioning Modal State
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [form, setForm] = useState<TenantProvisionInput>({
    name: "",
    subdomain: "",
    display_name: "",
    admin_email: "",
    admin_full_name: "",
    admin_password: "",
    branch_name: "Headquarters",
    branch_code: "HQ",
  });
  const [provisioning, setProvisioning] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; pass: string; org: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Status toggle state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadTenants() {
    setLoading(true);
    setError("");
    try {
      const list = await api.platformTenants();
      setTenants(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform tenants");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTenants();
  }, []);

  const openProvision = () => {
    setForm({
      name: "",
      subdomain: "",
      display_name: "",
      admin_email: "",
      admin_full_name: "",
      admin_password: "",
      branch_name: "Headquarters",
      branch_code: "HQ",
    });
    setIsProvisionOpen(true);
  };

  const handleNameChange = (val: string) => {
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    setForm((prev) => ({
      ...prev,
      display_name: val,
      name: slug,
      subdomain: slug,
    }));
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setError("");
    try {
      const created = await api.provisionTenant(form);
      setCreatedCreds({
        email: form.admin_email,
        pass: form.admin_password,
        org: created.display_name,
      });
      setIsProvisionOpen(false);
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to provision tenant");
    } finally {
      setProvisioning(false);
    }
  };

  const copyCreds = () => {
    if (!createdCreds) return;
    const text = `APMS Tenant Admin Credentials\nOrganization: ${createdCreds.org}\nLogin Email: ${createdCreds.email}\nPassword: ${createdCreds.pass}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleStatus = async (tenant: PlatformTenant) => {
    const nextStatus = !tenant.is_active;
    const action = nextStatus ? "activate" : "suspend";
    if (!confirm(`Are you sure you want to ${action} tenant '${tenant.display_name}'?`)) return;

    setTogglingId(tenant.id);
    try {
      await api.updateTenantStatus(tenant.id, nextStatus);
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} tenant`);
    } finally {
      setTogglingId(null);
    }
  };

  const totalEmployees = tenants.reduce((sum, t) => sum + (t.employee_count || 0), 0);
  const activeTenants = tenants.filter((t) => t.is_active).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Platform Super Admin & Tenant Management</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Provision and manage tenant organizations, subdomains, and primary administrator accounts.
          </p>
        </div>

        <button className="primary" type="button" onClick={openProvision}>
          <Plus size={16} /> Provision New Tenant
        </button>
      </div>

      {error ? (
        <Alert variant="danger" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {/* Newly Provisioned Credentials Success Modal */}
      <Modal
        isOpen={!!createdCreds}
        onClose={() => setCreatedCreds(null)}
        title="Tenant Organization Provisioned Successfully"
        footer={
          <div className="flex justify-between w-full">
            <button className="ghost small" type="button" onClick={() => setCreatedCreds(null)}>
              Done
            </button>
            <button className="primary small" type="button" onClick={copyCreds}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied to Clipboard!" : "Copy Admin Credentials"}
            </button>
          </div>
        }
      >
        {createdCreds && (
          <div className="flex flex-col gap-3">
            <div className="banner success flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Tenant <strong>{createdCreds.org}</strong> has been initialized with schema RLS and super admin role.</span>
            </div>

            <div style={{ background: "var(--bg-subtle)", padding: "1rem", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Initial Administrator Login:
              </div>
              <div className="grid-cols-2" style={{ fontSize: "0.85rem" }}>
                <div><strong>Work Email:</strong></div>
                <div><code>{createdCreds.email}</code></div>
                <div><strong>Password:</strong></div>
                <div><code>{createdCreds.pass}</code></div>
              </div>
            </div>

            <p className="text-secondary" style={{ fontSize: "0.78rem", margin: 0 }}>
              Save these credentials. The tenant admin can immediately sign in to configure operating branches and employees.
            </p>
          </div>
        )}
      </Modal>

      {/* Platform Summary Metrics */}
      <div className="grid-cols-4">
        <div className="stat-card">
          <span className="label">Total Organizations</span>
          <span className="value">{tenants.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">Active Tenants</span>
          <span className="value" style={{ color: "var(--success-fg)" }}>{activeTenants}</span>
        </div>
        <div className="stat-card">
          <span className="label">Total Employees Enrolled</span>
          <span className="value">{totalEmployees}</span>
        </div>
        <div className="stat-card">
          <span className="label">Isolation Engine</span>
          <span className="value" style={{ fontSize: "1.1rem", color: "var(--action-primary)" }}>PostgreSQL RLS</span>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="panel" style={{ padding: 0 }}>
        {loading ? (
          <SkeletonTable rows={4} cols={7} />
        ) : tenants.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No tenants found"
            description="No customer organizations exist on this APMS platform instance yet."
            action={
              <button className="primary small" type="button" onClick={openProvision}>
                <Plus size={14} /> Provision First Tenant
              </button>
            }
          />
        ) : (
          <div className="table-container" style={{ border: "none" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Organization Name</th>
                  <th>Subdomain Slug</th>
                  <th>Status</th>
                  <th>Enrolled Employees</th>
                  <th>Operating Branches</th>
                  <th>Created Date</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.display_name}</div>
                      <div className="text-secondary tabular" style={{ fontSize: "0.72rem" }}>{t.id}</div>
                    </td>
                    <td>
                      <code style={{ background: "var(--bg-subtle)", padding: "0.15rem 0.4rem", borderRadius: "3px", fontSize: "0.78rem" }}>
                        {t.subdomain}.apms.local
                      </code>
                    </td>
                    <td>
                      <Badge variant={t.is_active ? "present" : "absent"}>
                        {t.is_active ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td className="tabular">
                      <span style={{ fontWeight: 500 }}>{t.employee_count}</span> staff
                    </td>
                    <td className="tabular">
                      <span style={{ fontWeight: 500 }}>{t.branch_count}</span> sites
                    </td>
                    <td className="tabular text-secondary">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className={t.is_active ? "danger small" : "primary small"}
                        type="button"
                        disabled={togglingId === t.id}
                        onClick={() => handleToggleStatus(t)}
                        title={t.is_active ? "Suspend tenant access" : "Re-activate tenant"}
                      >
                        {t.is_active ? "Suspend" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provisioning Modal */}
      <Modal
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        title="Provision New Tenant Organization (M01)"
        maxWidth={620}
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsProvisionOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={
                provisioning ||
                !form.display_name ||
                !form.subdomain ||
                !form.admin_email ||
                form.admin_password.length < 8
              }
              onClick={handleProvision}
            >
              {provisioning ? "Provisioning Organization…" : "Provision Tenant"}
            </button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={handleProvision}>
          {/* Section 1: Company Profile */}
          <div>
            <h4 style={{ marginBottom: "0.5rem" }}>1. Organization Profile</h4>
            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Company Display Name</label>
                <input
                  value={form.display_name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Sterling Industries Ltd"
                  required
                />
              </div>

              <div className="form-group">
                <label>Subdomain Slug (URL Prefix)</label>
                <input
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                  placeholder="e.g. sterling"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tenant Routing URL</label>
                <input
                  value={`${form.subdomain || "acme"}.apms.local`}
                  disabled
                  className="tabular"
                  style={{ background: "var(--bg-subtle)" }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Primary Admin Credentials */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "0.75rem" }}>
            <h4 style={{ marginBottom: "0.5rem" }}>2. Primary Tenant Administrator</h4>
            <p className="text-secondary" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
              Initial user provisioned with full TENANT_ADMIN system capabilities across all modules.
            </p>

            <div className="form-grid">
              <div className="form-group">
                <label>Admin Full Name</label>
                <input
                  value={form.admin_full_name}
                  onChange={(e) => setForm({ ...form, admin_full_name: e.target.value })}
                  placeholder="e.g. Rajesh Kumar"
                  required
                />
              </div>

              <div className="form-group">
                <label>Work Email</label>
                <input
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  placeholder="admin@sterling.example"
                  required
                />
              </div>

              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <div className="flex justify-between items-center">
                  <label>Temporary Password (min 8 chars)</label>
                  {form.admin_password ? (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        color:
                          form.admin_password.length < 8
                            ? "var(--danger-fg)"
                            : form.admin_password.length < 10
                            ? "var(--warning-fg)"
                            : "var(--success-fg)",
                      }}
                    >
                      {form.admin_password.length < 8
                        ? "Too short (min 8)"
                        : form.admin_password.length < 10
                        ? "Fair (recommend 10+)"
                        : "Strong password"}
                    </span>
                  ) : null}
                </div>
                <input
                  type="password"
                  value={form.admin_password}
                  onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                  placeholder="••••••••••••"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 3: Initial Branch */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "0.75rem" }}>
            <h4 style={{ marginBottom: "0.5rem" }}>3. Default Operating Branch / Site</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Branch Name</label>
                <input
                  value={form.branch_name}
                  onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
                  placeholder="Headquarters"
                  required
                />
              </div>

              <div className="form-group">
                <label>Branch Code</label>
                <input
                  value={form.branch_code}
                  onChange={(e) => setForm({ ...form, branch_code: e.target.value.toUpperCase() })}
                  placeholder="HQ"
                  required
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
