import { FormEvent, useEffect, useMemo, useState } from "react";
import { User, Building2, Shield, Calendar, CreditCard, AlertCircle, AlertTriangle } from "lucide-react";
import { api, Branch, Department, Designation, Employee, EmployeeCreateInput, EmployeeUpdateInput } from "../../api";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";

export interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (saved: Employee) => void;
  initialEmployee?: Employee | null;
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_REGEX = /^[0-9]{12}$/;
const UAN_REGEX = /^[0-9]{12}$/;
const ESIC_REGEX = /^([0-9]{10}|[0-9]{17})$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BANK_ACCOUNT_REGEX = /^[0-9]{9,18}$/;

export function EmployeeFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialEmployee,
  branches,
  departments,
  designations,
}: EmployeeFormModalProps) {
  const isEdit = Boolean(initialEmployee);

  // Form State
  const [employeeCode, setEmployeeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [customDesignation, setCustomDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [probationEndDate, setProbationEndDate] = useState("");
  const [confirmationDate, setConfirmationDate] = useState("");

  // Statutory PII fields
  const [pan, setPan] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [epfUan, setEpfUan] = useState("");
  const [esicNumber, setEsicNumber] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [biometricConsent, setBiometricConsent] = useState(false);

  // Validation & Submission
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Sync state on open/edit change
  useEffect(() => {
    if (initialEmployee) {
      setEmployeeCode(initialEmployee.employee_code);
      setFullName(initialEmployee.full_name);
      setBranchId(initialEmployee.branch_id);
      setDepartmentId(initialEmployee.department_id || "");
      setDesignationId(initialEmployee.designation_id || "");
      setCustomDesignation(initialEmployee.designation || "");
      setDateOfJoining(initialEmployee.date_of_joining || "");
      setDateOfBirth(initialEmployee.date_of_birth || "");
      setEmploymentType(initialEmployee.employment_type || "FULL_TIME");
      setProbationEndDate(initialEmployee.probation_end_date || "");
      setConfirmationDate(initialEmployee.confirmation_date || "");
      setBiometricConsent(Boolean(initialEmployee.biometric_consent_at));
      // Reset statutory plain inputs (they are encrypted in DB and not directly editable as plain values in edit mode unless overridden)
      setPan("");
      setAadhaar("");
      setEpfUan("");
      setEsicNumber("");
      setBankAccount("");
      setBankIfsc("");
    } else {
      setEmployeeCode("");
      setFullName("");
      setBranchId(branches[0]?.id || "");
      setDepartmentId("");
      setDesignationId("");
      setCustomDesignation("");
      setDateOfJoining(new Date().toISOString().slice(0, 10));
      setDateOfBirth("");
      setEmploymentType("FULL_TIME");
      setProbationEndDate("");
      setConfirmationDate("");
      setPan("");
      setAadhaar("");
      setEpfUan("");
      setEsicNumber("");
      setBankAccount("");
      setBankIfsc("");
      setBiometricConsent(false);
    }
    setFormError("");
  }, [initialEmployee, isOpen]);

  // Available branches: active branches + the employee's currently assigned branch if editing
  const availableBranches = useMemo(() => {
    return branches.filter((b) => b.is_active || b.id === initialEmployee?.branch_id);
  }, [branches, initialEmployee]);

  const selectedBranch = useMemo(() => branches.find((b) => b.id === branchId), [branches, branchId]);

  // Cascading filters: departments under selected branch (active + currently assigned if editing).
  // When the selected branch itself is deactivated, don't offer new department assignments inside it.
  const availableDepartments = useMemo(() => {
    if (!branchId) return [];
    if (selectedBranch && !selectedBranch.is_active) {
      return initialEmployee?.department_id
        ? departments.filter((d) => d.id === initialEmployee.department_id)
        : [];
    }
    return departments.filter(
      (d) => d.branch_id === branchId && (d.is_active || d.id === initialEmployee?.department_id)
    );
  }, [departments, branchId, selectedBranch, initialEmployee]);

  // Cascading filters: designations under selected department (active + currently assigned if editing)
  const availableDesignations = useMemo(() => {
    if (!departmentId) return [];
    return designations.filter(
      (des) => des.department_id === departmentId && (des.is_active || des.id === initialEmployee?.designation_id)
    );
  }, [designations, departmentId, initialEmployee]);

  function validate(): string | null {
    if (!fullName.trim()) return "Full name is required.";
    if (!employeeCode.trim()) return "Employee code is required.";
    if (!branchId) return "Branch selection is required.";
    if (!dateOfJoining) return "Date of joining is required.";

    // Guard: Prevent assigning newly created or reassigned employees to deactivated branches
    const chosenBranch = branches.find((b) => b.id === branchId);
    if (!isEdit && chosenBranch && !chosenBranch.is_active) {
      return "Cannot assign a new employee to a deactivated branch. Please select an active branch.";
    }
    if (isEdit && initialEmployee && branchId !== initialEmployee.branch_id) {
      if (chosenBranch && !chosenBranch.is_active) {
        return "Cannot reassign employee to a deactivated branch. Please select an active branch.";
      }
    }

    if (departmentId) {
      const chosenDept = departments.find((d) => d.id === departmentId);
      if (!isEdit && chosenDept && !chosenDept.is_active) {
        return "Cannot assign an employee to a deactivated department. Please select an active department.";
      }
      if (isEdit && initialEmployee && departmentId !== initialEmployee.department_id) {
        if (chosenDept && !chosenDept.is_active) {
          return "Cannot reassign employee to a deactivated department. Please select an active department.";
        }
      }
    }

    const panClean = pan.trim().toUpperCase();
    if (panClean && !PAN_REGEX.test(panClean)) {
      return "Invalid PAN format. Must be 5 uppercase letters, 4 digits, 1 letter (e.g. ABCDE1234F).";
    }

    const aadhaarClean = aadhaar.trim();
    if (aadhaarClean && !AADHAAR_REGEX.test(aadhaarClean)) {
      return "Invalid Aadhaar format. Must be exactly 12 digits.";
    }

    const uanClean = epfUan.trim();
    if (uanClean && !UAN_REGEX.test(uanClean)) {
      return "Invalid EPF UAN format. Must be exactly 12 digits.";
    }

    const esicClean = esicNumber.trim();
    if (esicClean && !ESIC_REGEX.test(esicClean)) {
      return "Invalid ESIC format. Must be 10 or 17 digits.";
    }

    const ifscClean = bankIfsc.trim().toUpperCase();
    if (ifscClean && !IFSC_REGEX.test(ifscClean)) {
      return "Invalid Bank IFSC code. Must be 4 letters, 0, and 6 alphanumeric characters (e.g. HDFC0001234).";
    }

    const bankAccountClean = bankAccount.trim();
    if (bankAccountClean && !BANK_ACCOUNT_REGEX.test(bankAccountClean)) {
      return "Invalid Bank Account format. Must be 9 to 18 digits.";
    }

    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errorMsg = validate();
    if (errorMsg) {
      setFormError(errorMsg);
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      if (isEdit && initialEmployee) {
        const updatePayload: EmployeeUpdateInput = {
          full_name: fullName.trim(),
          branch_id: branchId,
          department_id: departmentId || null,
          designation_id: designationId || null,
          designation: customDesignation.trim() || null,
          date_of_joining: dateOfJoining,
          date_of_birth: dateOfBirth || null,
          employment_type: employmentType,
          probation_end_date: probationEndDate || null,
          confirmation_date: confirmationDate || null,
          biometric_consent: biometricConsent,
        };
        // Only include statutory values if newly provided
        if (pan.trim()) updatePayload.pan = pan.trim().toUpperCase();
        if (aadhaar.trim()) updatePayload.aadhaar = aadhaar.trim();
        if (epfUan.trim()) updatePayload.epf_uan = epfUan.trim();
        if (esicNumber.trim()) updatePayload.esic_number = esicNumber.trim();
        if (bankAccount.trim()) updatePayload.bank_account = bankAccount.trim();
        if (bankIfsc.trim()) updatePayload.bank_ifsc = bankIfsc.trim().toUpperCase();

        const updated = await api.updateEmployee(initialEmployee.id, updatePayload);
        onSuccess(updated);
      } else {
        const createPayload: EmployeeCreateInput = {
          employee_code: employeeCode.trim().toUpperCase(),
          full_name: fullName.trim(),
          branch_id: branchId,
          department_id: departmentId || null,
          designation_id: designationId || null,
          designation: customDesignation.trim() || null,
          date_of_joining: dateOfJoining,
          date_of_birth: dateOfBirth || null,
          employment_type: employmentType,
          probation_end_date: probationEndDate || null,
          confirmation_date: confirmationDate || null,
          pan: pan.trim() ? pan.trim().toUpperCase() : null,
          aadhaar: aadhaar.trim() ? aadhaar.trim() : null,
          epf_uan: epfUan.trim() ? epfUan.trim() : null,
          esic_number: esicNumber.trim() ? esicNumber.trim() : null,
          bank_account: bankAccount.trim() ? bankAccount.trim() : null,
          bank_ifsc: bankIfsc.trim() ? bankIfsc.trim().toUpperCase() : null,
          biometric_consent: biometricConsent,
          is_active: true,
        };

        const created = await api.createEmployee(createPayload);
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save employee profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Employee (${initialEmployee?.employee_code})` : "Enroll New Employee"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        {formError && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "var(--color-danger-bg)",
              border: "1px solid var(--color-danger-border)",
              borderRadius: "0.5rem",
              color: "var(--color-danger-fg)",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Section 1: Personal & Employment Info */}
          <div>
            <h4
              style={{
                margin: "0 0 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <User size={15} color="var(--color-primary)" />
              Personal & Employment Profile
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
              <Field label="Full Name *" help="Official legal name">
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Priya Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Employee Code *" help="Unique workplace identifier">
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. EMP-0104"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  disabled={isEdit} // Code is immutable once issued
                  required
                />
              </Field>
              <Field label="Date of Joining (DOJ) *">
                <input
                  type="date"
                  className="input"
                  value={dateOfJoining}
                  onChange={(e) => setDateOfJoining(e.target.value)}
                  required
                />
              </Field>
              <Field label="Date of Birth (DOB)">
                <input
                  type="date"
                  className="input"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </Field>
              <Field label="Employment Type">
                <select
                  className="select"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACTOR">Contractor</option>
                  <option value="INTERN">Intern</option>
                  <option value="PROBATION">Probation</option>
                </select>
              </Field>
              <Field label="Probation End Date">
                <input
                  type="date"
                  className="input"
                  value={probationEndDate}
                  onChange={(e) => setProbationEndDate(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Section 2: Organization Placement */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "1.25rem" }}>
            <h4
              style={{
                margin: "0 0 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <Building2 size={15} color="var(--color-primary)" />
              Organization Placement
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
              <Field label="Branch Location *">
                <select
                  className="select"
                  value={branchId}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setDepartmentId(""); // Reset cascaded dept
                    setDesignationId("");
                    setCustomDesignation(""); // Reset custom designation
                  }}
                  required
                >
                  <option value="" disabled>
                    Select Branch
                  </option>
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}){!b.is_active ? " — (Deactivated)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Department">
                <select
                  className="select"
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    setDesignationId(""); // Reset cascaded designation
                    setCustomDesignation(""); // Reset custom designation
                  }}
                >
                  <option value="">No Department (Unassigned)</option>
                  {availableDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}){!d.is_active ? " — (Inactive)" : ""}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Warning when employee belongs to a deactivated branch */}
              {selectedBranch && !selectedBranch.is_active && (
                <div
                  style={{
                    gridColumn: "span 2",
                    padding: "0.625rem 0.875rem",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--color-warning-fg, #f59e0b)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Branch Deactivated:</strong> This employee belongs to a deactivated branch (
                    {selectedBranch.name}). Reassign to an active branch to ensure proper organizational placement.
                  </span>
                </div>
              )}

              <Field label="Designation (Master)">
                <select
                  className="select"
                  value={designationId}
                  onChange={(e) => setDesignationId(e.target.value)}
                >
                  <option value="">Select Predefined Designation</option>
                  {availableDesignations.map((des) => (
                    <option key={des.id} value={des.id}>
                      {des.name} ({des.code}){!des.is_active ? " — (Inactive)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Custom Designation Title" help="Optional display override">
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Lead Process Engineer"
                  value={customDesignation}
                  onChange={(e) => setCustomDesignation(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Section 3: Statutory & PII Identifiers */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "1.25rem" }}>
            <h4
              style={{
                margin: "0 0 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <Shield size={15} color="var(--color-primary)" />
              Statutory Vault Identifiers (Envelope Encrypted)
            </h4>
            <p style={{ margin: "0 0 1rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {isEdit
                ? "Leave blank to preserve existing encrypted statutory values. Entering a new value replaces the vault record."
                : "Entered values are AES-256-GCM encrypted immediately upon submission and masked in all standard views."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
              <Field
                label="Income Tax PAN"
                help={
                  isEdit && initialEmployee?.pan_masked
                    ? `On file: ${initialEmployee.pan_masked} (leave blank to keep)`
                    : "Format: 5 letters, 4 numbers, 1 letter"
                }
              >
                <input
                  type="text"
                  className="input"
                  placeholder="ABCDE1234F"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </Field>
              <Field
                label="Aadhaar Number (UIDAI)"
                help={
                  isEdit && initialEmployee?.aadhaar_masked
                    ? `On file: ${initialEmployee.aadhaar_masked} (leave blank to keep)`
                    : "Format: 12 digits"
                }
              >
                <input
                  type="text"
                  className="input"
                  placeholder="123456789012"
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))}
                  maxLength={12}
                />
              </Field>
              <Field
                label="EPF UAN"
                help={
                  isEdit && initialEmployee?.epf_uan_masked
                    ? `On file: ${initialEmployee.epf_uan_masked} (leave blank to keep)`
                    : "Format: 12 digits"
                }
              >
                <input
                  type="text"
                  className="input"
                  placeholder="100000000000"
                  value={epfUan}
                  onChange={(e) => setEpfUan(e.target.value.replace(/\D/g, ""))}
                  maxLength={12}
                />
              </Field>
              <Field
                label="ESIC Insurance Number"
                help={
                  isEdit && initialEmployee?.esic_number_masked
                    ? `On file: ${initialEmployee.esic_number_masked} (leave blank to keep)`
                    : "Format: 10 or 17 digits"
                }
              >
                <input
                  type="text"
                  className="input"
                  placeholder="31000000000000001"
                  value={esicNumber}
                  onChange={(e) => setEsicNumber(e.target.value.replace(/\D/g, ""))}
                  maxLength={17}
                />
              </Field>
              <Field
                label="Bank Account Number"
                help={
                  isEdit && initialEmployee?.bank_account_masked
                    ? `On file: ${initialEmployee.bank_account_masked} (leave blank to keep)`
                    : "Format: 9 to 18 digits"
                }
              >
                <input
                  type="text"
                  className="input"
                  placeholder="987654321012"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ""))}
                  maxLength={18}
                />
              </Field>
              <Field
                label="Bank IFSC Code"
                help={
                  isEdit && initialEmployee?.bank_ifsc_masked
                    ? `On file: ${initialEmployee.bank_ifsc_masked} (leave blank to keep)`
                    : "Format: 4 letters, 0, 6 chars"
                }
              >
                <input
                  type="text"
                  className="input"
                  placeholder="HDFC0001234"
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                  maxLength={11}
                />
              </Field>
            </div>
          </div>

          {/* Section 4: DPDP Act Consent */}
          <div
            style={{
              borderTop: "1px solid var(--border-default)",
              paddingTop: "1rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <input
              type="checkbox"
              id="biometricConsentCheckbox"
              checked={biometricConsent}
              onChange={(e) => setBiometricConsent(e.target.checked)}
              style={{ marginTop: "0.25rem", width: 16, height: 16, cursor: "pointer" }}
            />
            <label
              htmlFor="biometricConsentCheckbox"
              style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4, cursor: "pointer" }}
            >
              <strong>DPDP Act 2023 Biometric Consent:</strong> Worker has executed informed consent for biometric
              attendance capture. Physical biometric templates remain strictly on local edge devices and will not be
              stored in cloud storage (Invariant 10).
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-default)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
          }}
        >
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {isEdit ? "Update Employee" : "Enroll Employee"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
