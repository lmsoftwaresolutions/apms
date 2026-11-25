import { useEffect, useState } from "react";
import {
  X,
  Shield,
  ShieldAlert,
  Eye,
  EyeOff,
  Calendar,
  Building2,
  Briefcase,
  CreditCard,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit2,
  Lock,
} from "lucide-react";
import { api, Branch, Department, Designation, Employee } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";

export interface Employee360DrawerProps {
  employee: Employee | null;
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  onClose: () => void;
  onEdit: (employee: Employee) => void;
}

export function Employee360Drawer({
  employee,
  branches,
  departments,
  designations,
  onClose,
  onEdit,
}: Employee360DrawerProps) {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "statutory">("overview");

  // PII Unmasking state
  const [unmaskedValues, setUnmaskedValues] = useState<Record<string, string | null> | null>(null);
  const [unmaskLoading, setUnmaskLoading] = useState(false);
  const [unmaskError, setUnmaskError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<number | null>(null);

  // Auto-hide countdown
  useEffect(() => {
    if (autoHideTimer === null) return;
    if (autoHideTimer <= 0) {
      setUnmaskedValues(null);
      setAutoHideTimer(null);
      return;
    }
    const interval = setInterval(() => {
      setAutoHideTimer((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [autoHideTimer]);

  // Reset when drawer closes or employee changes
  useEffect(() => {
    setUnmaskedValues(null);
    setAutoHideTimer(null);
    setUnmaskError("");
    setActiveTab("overview");
  }, [employee?.id]);

  if (!employee) return null;

  const branch = branches.find((b) => b.id === employee.branch_id);
  const department = departments.find((d) => d.id === employee.department_id);
  const designation = designations.find((d) => d.id === employee.designation_id);

  const canEdit = can("employee.employee.update");
  const canUnmask = can("privacy.pii.unmask");

  const piiFields = ["pan", "aadhaar", "bank_account", "bank_ifsc", "epf_uan", "esic_number"];

  async function handleRevealConfirm() {
    if (!employee) return;
    setUnmaskLoading(true);
    setUnmaskError("");
    try {
      const result = await api.unmaskPii(employee.id, piiFields);
      setUnmaskedValues(result);
      setShowConfirmModal(false);
      setAutoHideTimer(30); // 30 second view window
    } catch (err) {
      setUnmaskError(err instanceof Error ? err.message : "Failed to unmask statutory identifiers");
      setShowConfirmModal(false);
    } finally {
      setUnmaskLoading(false);
    }
  }

  function handleHidePii() {
    setUnmaskedValues(null);
    setAutoHideTimer(null);
  }

  const initials =
    employee.full_name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      <div
        className="app-sidebar-backdrop"
        style={{ display: "block", zIndex: 60 }}
        onClick={onClose}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: "540px",
          backgroundColor: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
          zIndex: 65,
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: "var(--color-primary-bg)",
                border: "2px solid var(--color-primary-border)",
                color: "var(--color-primary-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "1.125rem",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {employee.full_name}
                </h3>
                <Badge variant={employee.is_active ? "success" : "neutral"} size="sm">
                  {employee.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    padding: "0.15rem 0.4rem",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "0.25rem",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {employee.employee_code}
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {designation?.name || employee.designation || "Staff"}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Edit2 size={15} />}
                onClick={() => onEdit(employee)}
                title="Edit Employee"
              >
                Edit
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "0.35rem",
                borderRadius: "0.375rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Close drawer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-default)",
            padding: "0 1.5rem",
            backgroundColor: "var(--bg-canvas)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "overview" ? "2px solid var(--color-primary)" : "2px solid transparent",
              color: activeTab === "overview" ? "var(--color-primary)" : "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Briefcase size={16} />
            Overview & Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("statutory")}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "statutory" ? "2px solid var(--color-primary)" : "2px solid transparent",
              color: activeTab === "statutory" ? "var(--color-primary)" : "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Shield size={16} />
            Statutory & PII Vault
          </button>
        </div>

        {/* Drawer Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {activeTab === "overview" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Organization Assignment Card */}
              <div
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "0.625rem",
                  padding: "1.25rem",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 1rem",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Building2 size={16} color="var(--color-primary)" />
                  Organization Structure
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Branch</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {branch ? `${branch.name} (${branch.code})` : "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Department</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {department ? `${department.name} (${department.code})` : "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Designation</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {designation?.name || employee.designation || "Not specified"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>User Account</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {employee.user_id ? "Linked to Portal" : "No Login Linked"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Employment Terms Card */}
              <div
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "0.625rem",
                  padding: "1.25rem",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 1rem",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Calendar size={16} color="var(--color-primary)" />
                  Employment Terms
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Employment Type</span>
                    <div style={{ marginTop: "0.25rem" }}>
                      <Badge variant="neutral" size="sm">
                        {employee.employment_type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Date of Joining (DOJ)</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {employee.date_of_joining || "—"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Date of Birth (DOB)</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {employee.date_of_birth || "—"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Probation End</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {employee.probation_end_date || "—"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Confirmation Date</span>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                      {employee.confirmation_date || "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* DPDP Act Biometric Consent Status Card */}
              <div
                style={{
                  backgroundColor: employee.biometric_consent_at ? "var(--color-success-bg)" : "var(--color-warning-bg)",
                  border: `1px solid ${
                    employee.biometric_consent_at ? "var(--color-success-border)" : "var(--color-warning-border)"
                  }`,
                  borderRadius: "0.625rem",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  {employee.biometric_consent_at ? (
                    <CheckCircle2 size={20} style={{ color: "var(--color-success-fg)", flexShrink: 0, marginTop: "0.1rem" }} />
                  ) : (
                    <AlertCircle size={20} style={{ color: "var(--color-warning-fg)", flexShrink: 0, marginTop: "0.1rem" }} />
                  )}
                  <div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        color: employee.biometric_consent_at ? "var(--color-success-fg)" : "var(--color-warning-fg)",
                      }}
                    >
                      {employee.biometric_consent_at ? "DPDP Biometric Consent Recorded" : "Biometric Consent Pending"}
                    </div>
                    <p
                      style={{
                        margin: "0.25rem 0 0.5rem",
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      {employee.biometric_consent_at
                        ? `Recorded on ${new Date(employee.biometric_consent_at).toLocaleDateString()}. Complies with DPDP Act 2023 consent standards.`
                        : "Worker has not yet provided explicit informed consent for biometric attendance logging."}
                    </p>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        display: "inline-block",
                      }}
                    >
                      Invariant: Biometric templates stay isolated on edge readers and are never uploaded to cloud storage.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Statutory & PII Vault Tab */
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Vault Security Header */}
              <div
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "0.625rem",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "0.375rem",
                        backgroundColor: "var(--color-primary-bg)",
                        border: "1px solid var(--color-primary-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-primary-fg)",
                        flexShrink: 0,
                      }}
                    >
                      <Lock size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        Envelope-Encrypted Statutory Vault
                      </h4>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Protected under AES-256-GCM. Unmasking is strictly audited (SEC-03).
                      </p>
                    </div>
                  </div>

                  {/* Reveal / Hide Controls */}
                  {canUnmask ? (
                    unmaskedValues ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--color-warning-fg)",
                            backgroundColor: "var(--color-warning-bg)",
                            border: "1px solid var(--color-warning-border)",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "0.25rem",
                          }}
                        >
                          <Clock size={12} />
                          {autoHideTimer}s
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<EyeOff size={14} />}
                          onClick={handleHidePii}
                          style={{ fontSize: "0.75rem" }}
                        >
                          Hide
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Eye size={14} />}
                        onClick={() => setShowConfirmModal(true)}
                        style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                      >
                        Reveal PII
                      </Button>
                    )
                  ) : (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                      Unmasking restricted
                    </span>
                  )}
                </div>

                {unmaskError && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "0.625rem",
                      backgroundColor: "var(--color-danger-bg)",
                      border: "1px solid var(--color-danger-border)",
                      borderRadius: "0.375rem",
                      color: "var(--color-danger-fg)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {unmaskError}
                  </div>
                )}
              </div>

              {/* Identifiers Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {/* PAN */}
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <FileText size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Permanent Account Number (PAN)</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: unmaskedValues?.pan ? "var(--color-primary-fg)" : "var(--text-primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {unmaskedValues ? unmaskedValues.pan || "Not provided" : employee.pan_masked || "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={employee.pan_masked ? "neutral" : "warning"} size="sm">
                    {employee.pan_masked ? (unmaskedValues ? "Audited Plaintext" : "Encrypted") : "Missing"}
                  </Badge>
                </div>

                {/* Aadhaar */}
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Shield size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Aadhaar Number (UIDAI)</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: unmaskedValues?.aadhaar ? "var(--color-primary-fg)" : "var(--text-primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {unmaskedValues ? unmaskedValues.aadhaar || "Not provided" : employee.aadhaar_masked || "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={employee.aadhaar_masked ? "neutral" : "warning"} size="sm">
                    {employee.aadhaar_masked ? (unmaskedValues ? "Audited Plaintext" : "Encrypted") : "Missing"}
                  </Badge>
                </div>

                {/* EPF UAN */}
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <FileText size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>EPF Universal Account Number (UAN)</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: unmaskedValues?.epf_uan ? "var(--color-primary-fg)" : "var(--text-primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {unmaskedValues ? unmaskedValues.epf_uan || "Not provided" : employee.epf_uan_masked || "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={employee.epf_uan_masked ? "neutral" : "neutral"} size="sm">
                    {employee.epf_uan_masked ? (unmaskedValues ? "Audited Plaintext" : "Encrypted") : "Optional"}
                  </Badge>
                </div>

                {/* ESIC */}
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <FileText size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>ESIC Insurance Number</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: unmaskedValues?.esic_number ? "var(--color-primary-fg)" : "var(--text-primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {unmaskedValues ? unmaskedValues.esic_number || "Not provided" : employee.esic_number_masked || "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={employee.esic_number_masked ? "neutral" : "neutral"} size="sm">
                    {employee.esic_number_masked ? (unmaskedValues ? "Audited Plaintext" : "Encrypted") : "Optional"}
                  </Badge>
                </div>

                {/* Bank Account */}
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <CreditCard size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Bank Account Number</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: unmaskedValues?.bank_account ? "var(--color-primary-fg)" : "var(--text-primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {unmaskedValues ? unmaskedValues.bank_account || "Not provided" : employee.bank_account_masked || "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={employee.bank_account_masked ? "neutral" : "warning"} size="sm">
                    {employee.bank_account_masked ? (unmaskedValues ? "Audited Plaintext" : "Encrypted") : "Missing"}
                  </Badge>
                </div>

                {/* Bank IFSC */}
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <CreditCard size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Bank IFSC Code</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: unmaskedValues?.bank_ifsc ? "var(--color-primary-fg)" : "var(--text-primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {unmaskedValues ? unmaskedValues.bank_ifsc || "Not provided" : employee.bank_ifsc_masked || "—"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={employee.bank_ifsc_masked ? "neutral" : "warning"} size="sm">
                    {employee.bank_ifsc_masked ? (unmaskedValues ? "Audited Plaintext" : "Encrypted") : "Missing"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Security Confirmation Modal for PII Unmasking */}
      {showConfirmModal && (
        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="DPDP Act Compliance Warning"
          size="md"
        >
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "1.25rem" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                backgroundColor: "var(--color-warning-bg)",
                border: "1px solid var(--color-warning-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-warning-fg)",
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={22} />
            </div>
            <div>
              <h4 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Audited Decryption Request
              </h4>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Under the Digital Personal Data Protection (DPDP) Act 2023, access to unmasked statutory identifiers (PAN,
                Aadhaar, Bank details) is restricted and audited.
              </p>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.4,
                }}
              >
                An immutable record will be appended to the tenant audit trail (<code>pii_access_audits</code>) detailing
                your user identity, employee ID, and access timestamp. The decrypted numbers will remain visible for 30
                seconds.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <Button variant="ghost" onClick={() => setShowConfirmModal(false)} disabled={unmaskLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRevealConfirm}
              loading={unmaskLoading}
              icon={<Eye size={15} />}
              style={{ backgroundColor: "var(--color-warning)", borderColor: "var(--color-warning)" }}
            >
              Confirm & Reveal Identifiers
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
