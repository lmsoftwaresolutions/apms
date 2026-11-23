import React, { useEffect, useState } from "react";
import { Plus, Users, Upload, Search, Filter, ShieldCheck, CheckCircle2, AlertCircle, FileSpreadsheet, Eye } from "lucide-react";
import { api, Branch, Department, Employee, EmployeeCreateInput } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Badge, Drawer, Modal, EmptyState, SkeletonTable, Alert } from "../../components/common/UIComponents";
import { PRESET_DESIGNATIONS } from "../Organization/OrganizationPage";

export function EmployeesPage() {
  const { can } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterDeptId, setFilterDeptId] = useState("");
  const [filterActive, setFilterActive] = useState<string>("true");

  // Detail Modal state
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  // Drawer Create/Edit state & Tabs
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"identity" | "org" | "statutory" | "dpdp">("identity");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeCreateInput>({
    employee_code: "",
    full_name: "",
    branch_id: "",
    department_id: null,
    designation: "",
    date_of_joining: new Date().toISOString().slice(0, 10),
    date_of_birth: "",
    employment_type: "FULL_TIME",
    probation_end_date: "",
    confirmation_date: "",
    pan: "",
    aadhaar: "",
    bank_account: "",
    bank_ifsc: "",
    epf_uan: "",
    esic_number: "",
    biometric_consent: false,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  // Bulk Upload Modal state
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ total: number; done: number; failed: number } | null>(null);

  async function loadMetadata() {
    try {
      const [b, d] = await Promise.all([api.branches(), api.departments()]);
      setBranches(b);
      setDepartments(d);
    } catch {}
  }

  async function loadEmployees() {
    setLoading(true);
    setError("");
    try {
      const emps = await api.employees({
        branch_id: filterBranchId || undefined,
        department_id: filterDeptId || undefined,
        is_active: filterActive === "all" ? undefined : filterActive === "true",
      });
      setEmployees(emps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetadata();
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [filterBranchId, filterDeptId, filterActive]);

  const openCreate = () => {
    setEditingEmployee(null);
    setForm({
      employee_code: "",
      full_name: "",
      branch_id: branches[0]?.id || "",
      department_id: null,
      designation: "",
      date_of_joining: new Date().toISOString().slice(0, 10),
      date_of_birth: "",
      employment_type: "FULL_TIME",
      probation_end_date: "",
      confirmation_date: "",
      pan: "",
      aadhaar: "",
      bank_account: "",
      bank_ifsc: "",
      epf_uan: "",
      esic_number: "",
      biometric_consent: false,
      is_active: true,
    });
    setIsDrawerOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setForm({
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      branch_id: emp.branch_id,
      department_id: emp.department_id || null,
      designation: emp.designation || "",
      date_of_joining: emp.date_of_joining,
      date_of_birth: emp.date_of_birth || "",
      employment_type: emp.employment_type,
      probation_end_date: emp.probation_end_date || "",
      confirmation_date: emp.confirmation_date || "",
      pan: "", // Left blank on edit; re-enter only to change (PII vault protection)
      aadhaar: "",
      bank_account: "",
      bank_ifsc: "",
      epf_uan: emp.epf_uan || "",
      esic_number: emp.esic_number || "",
      biometric_consent: !!emp.biometric_consent_at,
      is_active: emp.is_active,
    });
    setIsDrawerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingEmployee) {
        // Send partial updates; exclude blank PII fields to avoid overwriting vault with null
        const updatePayload: any = {
          full_name: form.full_name,
          branch_id: form.branch_id,
          department_id: form.department_id || null,
          designation: form.designation || null,
          date_of_joining: form.date_of_joining,
          date_of_birth: form.date_of_birth || null,
          employment_type: form.employment_type,
          probation_end_date: form.employment_type === "PROBATION" ? form.probation_end_date || null : null,
          confirmation_date: form.employment_type === "PROBATION" ? form.confirmation_date || null : null,
          epf_uan: form.epf_uan || null,
          esic_number: form.esic_number || null,
          biometric_consent: form.biometric_consent,
          is_active: form.is_active,
        };
        if (form.pan) updatePayload.pan = form.pan;
        if (form.aadhaar) updatePayload.aadhaar = form.aadhaar;
        if (form.bank_account) updatePayload.bank_account = form.bank_account;
        if (form.bank_ifsc) updatePayload.bank_ifsc = form.bank_ifsc;

        await api.updateEmployee(editingEmployee.id, updatePayload);
      } else {
        // B6: Idempotency-Key is automatically sent by client.createEmployee
        await api.createEmployee({
          ...form,
          department_id: form.department_id || null,
          date_of_birth: form.date_of_birth || null,
          probation_end_date: form.employment_type === "PROBATION" ? form.probation_end_date || null : null,
          confirmation_date: form.employment_type === "PROBATION" ? form.confirmation_date || null : null,
          pan: form.pan || null,
          aadhaar: form.aadhaar || null,
          bank_account: form.bank_account || null,
          bank_ifsc: form.bank_ifsc || null,
          epf_uan: form.epf_uan || null,
          esic_number: form.esic_number || null,
        });
      }
      setIsDrawerOpen(false);
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  // CSV Bulk Wizard Logic (Gap 1 resolution)
  const downloadTemplate = () => {
    const csvContent =
      "employee_code,full_name,branch_code,department_code,designation,date_of_joining,employment_type,pan,aadhaar,epf_uan\n" +
      "EMP1001,John Doe,BLR01,ENG,Software Engineer,2026-01-15,FULL_TIME,ABCDE1234F,987654321012,100987654321\n" +
      "EMP1002,Jane Smith,BLR01,HR,HR Manager,2026-02-01,FULL_TIME,PQRS9876K,876543210987,100123456789";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "employee_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      setBulkErrors(["File contains no data rows"]);
      return;
    }
    const headers = lines[0].split(",").map((h) => h.trim());
    const branchMap = new Map(branches.map((b) => [b.code.toUpperCase(), b.id]));
    const deptMap = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));

    const parsed: any[] = [];
    const errs: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || "";
      });

      if (!row.employee_code || !row.full_name || !row.branch_code || !row.date_of_joining) {
        errs.push(`Row ${i}: Missing mandatory fields (code, name, branch_code, date_of_joining)`);
        continue;
      }

      const branchId = branchMap.get(row.branch_code.toUpperCase());
      if (!branchId) {
        errs.push(`Row ${i}: Unknown branch code '${row.branch_code}'`);
        continue;
      }

      const deptId = row.department_code ? deptMap.get(row.department_code.toUpperCase()) || null : null;

      parsed.push({
        employee_code: row.employee_code,
        full_name: row.full_name,
        branch_id: branchId,
        department_id: deptId,
        designation: row.designation || null,
        date_of_joining: row.date_of_joining,
        employment_type: row.employment_type || "FULL_TIME",
        pan: row.pan || null,
        aadhaar: row.aadhaar || null,
        epf_uan: row.epf_uan || null,
        biometric_consent: false,
        is_active: true,
      });
    }

    setBulkRows(parsed);
    setBulkErrors(errs);
  };

  const executeBulkUpload = async () => {
    setBulkProgress({ total: bulkRows.length, done: 0, failed: 0 });
    let done = 0;
    let failed = 0;

    for (const row of bulkRows) {
      try {
        await api.createEmployee(row);
        done++;
      } catch (err) {
        failed++;
      }
      setBulkProgress({ total: bulkRows.length, done, failed });
    }

    await loadEmployees();
    setTimeout(() => {
      setIsBulkOpen(false);
      setBulkFile(null);
      setBulkRows([]);
      setBulkProgress(null);
    }, 1500);
  };

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  // Search filter
  const filteredEmployees = employees.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.employee_code.toLowerCase().includes(q) ||
      e.full_name.toLowerCase().includes(q) ||
      (e.designation && e.designation.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Employee Master Directory</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Maintain employee profiles, encrypted PII vaults, and DPDP biometric consent registries.
          </p>
        </div>

        <div className="flex gap-2">
          {can("employee.employee.create") ? (
            <>
              <button className="ghost small" type="button" onClick={() => setIsBulkOpen(true)}>
                <Upload size={14} /> Bulk Upload CSV
              </button>
              <button className="primary" type="button" onClick={openCreate}>
                <Plus size={16} /> Add Employee
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="danger" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {/* Filter Bar */}
      <div className="panel" style={{ padding: "0.75rem 1rem", flexDirection: "row", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
        <div className="flex items-center gap-1" style={{ flex: 1, minWidth: "220px" }}>
          <Search size={16} className="text-muted" />
          <input
            placeholder="Search by code, name, designation…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: "none", background: "transparent" }}
          />
        </div>

        <div className="flex items-center gap-2">
          <select value={filterBranchId} onChange={(e) => setFilterBranchId(e.target.value)} style={{ width: "170px" }}>
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select value={filterDeptId} onChange={(e) => setFilterDeptId(e.target.value)} style={{ width: "170px" }}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} style={{ width: "130px" }}>
            <option value="true">Active Only</option>
            <option value="false">Inactive</option>
            <option value="all">All Statuses</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="panel" style={{ padding: 0 }}>
        {loading ? (
          <SkeletonTable rows={6} cols={9} />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees found"
            description="No employees match your search query or filter criteria. Add a new employee or upload a CSV."
          />
        ) : (
          <div className="table-container" style={{ border: "none" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Full Name</th>
                  <th>Designation</th>
                  <th>Branch / Department</th>
                  <th>Type</th>
                  <th>Joining Date</th>
                  <th>DPDP Consent</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setDetailEmployee(emp)}
                    title="Click row to view employee profile details"
                  >
                    <td style={{ fontWeight: 600 }}>{emp.employee_code}</td>
                    <td style={{ fontWeight: 500 }}>{emp.full_name}</td>
                    <td>{emp.designation || <span className="text-muted">—</span>}</td>
                    <td>
                      <div>{branchNameById.get(emp.branch_id) || "—"}</div>
                      <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
                        {emp.department_id ? deptNameById.get(emp.department_id) || "—" : "—"}
                      </div>
                    </td>
                    <td>
                      <Badge variant="neutral">{emp.employment_type}</Badge>
                    </td>
                    <td className="tabular">{emp.date_of_joining}</td>
                    <td>
                      {emp.biometric_consent_at ? (
                        <Badge variant="present">Consented</Badge>
                      ) : (
                        <Badge variant="neutral">Pending</Badge>
                      )}
                    </td>
                    <td>
                      <Badge variant={emp.is_active ? "present" : "absent"}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => setDetailEmployee(emp)}
                          title="View Profile Details"
                        >
                          <Eye size={13} />
                        </button>
                        {can("employee.employee.update") ? (
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => openEdit(emp)}
                            title="Edit Employee"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Create/Edit Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingEmployee ? `Employee Profile — ${editingEmployee.employee_code}` : "New Employee Registration"}
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={saving || !form.employee_code || !form.full_name || !form.branch_id}
              onClick={handleSave}
            >
              {saving ? "Saving…" : editingEmployee ? "Update Profile" : "Register Employee"}
            </button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={handleSave}>
          {/* Drawer Section Navigation Tabs */}
          <div className="form-tab-nav">
            <button
              type="button"
              className={`form-tab-btn ${drawerTab === "identity" ? "active" : ""}`}
              onClick={() => setDrawerTab("identity")}
            >
              1. Identity
            </button>
            <button
              type="button"
              className={`form-tab-btn ${drawerTab === "org" ? "active" : ""}`}
              onClick={() => setDrawerTab("org")}
            >
              2. Org Placement
            </button>
            <button
              type="button"
              className={`form-tab-btn ${drawerTab === "statutory" ? "active" : ""}`}
              onClick={() => setDrawerTab("statutory")}
            >
              3. Statutory &amp; PII
            </button>
            <button
              type="button"
              className={`form-tab-btn ${drawerTab === "dpdp" ? "active" : ""}`}
              onClick={() => setDrawerTab("dpdp")}
            >
              4. DPDP &amp; Lifecycle
            </button>
          </div>

          {/* Tab 1: Core Identity */}
          {drawerTab === "identity" ? (
            <div className="flex flex-col gap-3">
              <div className="form-grid">
                <div className="form-group">
                  <label>Employee Code</label>
                  <input
                    value={form.employee_code}
                    disabled={!!editingEmployee}
                    onChange={(e) => setForm({ ...form, employee_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. EMP1042"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="e.g. Anand Sharma"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Date of Joining</label>
                  <input
                    type="date"
                    value={form.date_of_joining}
                    onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Date of Birth (Optional)</label>
                  <input
                    type="date"
                    value={form.date_of_birth || ""}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Tab 2: Organization & Employment Placement */}
          {drawerTab === "org" ? (
            <div className="flex flex-col gap-3">
              <div className="form-grid">
                <div className="form-group">
                  <label>Branch</label>
                  <select
                    value={form.branch_id}
                    onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                    required
                  >
                    <option value="">Select branch…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Department</label>
                  <select
                    value={form.department_id || ""}
                    onChange={(e) => setForm({ ...form, department_id: e.target.value || null })}
                  >
                    <option value="">None / Unassigned</option>
                    {departments
                      .filter((d) => !form.branch_id || d.branch_id === form.branch_id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Designation</label>
                  <input
                    list="preset-designations"
                    value={form.designation || ""}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="Select or enter job title…"
                  />
                  <datalist id="preset-designations">
                    {PRESET_DESIGNATIONS.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group">
                  <label>Employment Type</label>
                  <select
                    value={form.employment_type}
                    onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                  >
                    <option value="FULL_TIME">Full Time</option>
                    <option value="PROBATION">Probation</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="INTERN">Intern</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {/* Tab 3: Statutory & PII Vault */}
          {drawerTab === "statutory" ? (
            <div className="flex flex-col gap-3">
              <p className="text-secondary" style={{ fontSize: "0.78rem", margin: 0 }}>
                Tax and banking details are encrypted in the tenant vault (AES-GCM). Only masked values are returned by the API.
              </p>

              <div className="form-grid">
                <div className="form-group">
                  <label>
                    PAN {editingEmployee?.pan_masked ? `(Saved: ${editingEmployee.pan_masked})` : ""}
                  </label>
                  <input
                    value={form.pan || ""}
                    onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                    placeholder={editingEmployee?.pan_masked ? "Re-enter to change" : "e.g. ABCDE1234F"}
                  />
                </div>

                <div className="form-group">
                  <label>
                    Aadhaar {editingEmployee?.aadhaar_masked ? `(Saved: ${editingEmployee.aadhaar_masked})` : ""}
                  </label>
                  <input
                    value={form.aadhaar || ""}
                    onChange={(e) => setForm({ ...form, aadhaar: e.target.value })}
                    placeholder={editingEmployee?.aadhaar_masked ? "Re-enter to change" : "12-digit Aadhaar"}
                  />
                </div>

                <div className="form-group">
                  <label>Bank Account Number</label>
                  <input
                    value={form.bank_account || ""}
                    onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                    placeholder={editingEmployee?.bank_account_masked ? "Re-enter to change" : "Account number"}
                  />
                </div>

                <div className="form-group">
                  <label>Bank IFSC Code</label>
                  <input
                    value={form.bank_ifsc || ""}
                    onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder={editingEmployee?.bank_ifsc_masked ? "Re-enter to change" : "e.g. HDFC0001234"}
                  />
                </div>

                <div className="form-group">
                  <label>EPF UAN</label>
                  <input
                    value={form.epf_uan || ""}
                    onChange={(e) => setForm({ ...form, epf_uan: e.target.value })}
                    placeholder="12-digit UAN"
                  />
                </div>

                <div className="form-group">
                  <label>ESIC Number</label>
                  <input
                    value={form.esic_number || ""}
                    onChange={(e) => setForm({ ...form, esic_number: e.target.value })}
                    placeholder="17-digit IP number"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Tab 4: DPDP Compliance & Lifecycle */}
          {drawerTab === "dpdp" ? (
            <div className="flex flex-col gap-3">
              {form.employment_type === "PROBATION" ? (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Probation End Date</label>
                    <input
                      type="date"
                      value={form.probation_end_date || ""}
                      onChange={(e) => setForm({ ...form, probation_end_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Target Confirmation Date</label>
                    <input
                      type="date"
                      value={form.confirmation_date || ""}
                      onChange={(e) => setForm({ ...form, confirmation_date: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}

              <div style={{ background: "var(--bg-subtle)", padding: "0.85rem", borderRadius: "6px" }}>
                <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.biometric_consent}
                    onChange={(e) => setForm({ ...form, biometric_consent: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                  <div>
                    <span style={{ fontWeight: 600 }}>DPDP Act 2023 Biometric Capture Consent</span>
                    <p className="text-secondary" style={{ fontSize: "0.74rem" }}>
                      Employee has provided affirmative biometric punch capture consent for attendance recording.
                    </p>
                  </div>
                </label>
              </div>

              <div>
                <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                  <span>Active Employee Record</span>
                </label>
              </div>
            </div>
          ) : null}
        </form>
      </Drawer>

      {/* Employee Read-Only Detail Modal */}
      <Modal
        isOpen={!!detailEmployee}
        onClose={() => setDetailEmployee(null)}
        title={detailEmployee ? `Employee Profile — ${detailEmployee.employee_code}` : "Profile"}
        footer={
          <div className="flex justify-between w-full">
            <button className="ghost small" type="button" onClick={() => setDetailEmployee(null)}>
              Close
            </button>
            {can("employee.employee.update") && detailEmployee ? (
              <button
                className="primary small"
                type="button"
                onClick={() => {
                  const emp = detailEmployee;
                  setDetailEmployee(null);
                  openEdit(emp);
                }}
              >
                Edit Profile
              </button>
            ) : null}
          </div>
        }
      >
        {detailEmployee ? (
          <div className="flex flex-col gap-3">
            <div style={{ background: "var(--bg-subtle)", padding: "0.85rem", borderRadius: "6px" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                Identity &amp; Status
              </div>
              <div className="grid-cols-2" style={{ fontSize: "0.8rem", gap: "0.5rem 1rem" }}>
                <div><strong>Code:</strong> {detailEmployee.employee_code}</div>
                <div><strong>Name:</strong> {detailEmployee.full_name}</div>
                <div><strong>Joining Date:</strong> {detailEmployee.date_of_joining}</div>
                <div><strong>DOB:</strong> {detailEmployee.date_of_birth || "—"}</div>
                <div><strong>Type:</strong> <Badge variant="neutral">{detailEmployee.employment_type}</Badge></div>
                <div>
                  <strong>Status:</strong>{" "}
                  <Badge variant={detailEmployee.is_active ? "present" : "absent"}>
                    {detailEmployee.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>

            <div style={{ background: "var(--bg-subtle)", padding: "0.85rem", borderRadius: "6px" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                Organization
              </div>
              <div className="grid-cols-2" style={{ fontSize: "0.8rem", gap: "0.5rem 1rem" }}>
                <div><strong>Branch:</strong> {branchNameById.get(detailEmployee.branch_id) || "—"}</div>
                <div><strong>Department:</strong> {detailEmployee.department_id ? deptNameById.get(detailEmployee.department_id) || "—" : "—"}</div>
                <div><strong>Designation:</strong> {detailEmployee.designation || "—"}</div>
              </div>
            </div>

            <div style={{ background: "var(--bg-subtle)", padding: "0.85rem", borderRadius: "6px" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                Statutory &amp; Encrypted Vault (AES-GCM)
              </div>
              <div className="grid-cols-2" style={{ fontSize: "0.8rem", gap: "0.5rem 1rem" }}>
                <div><strong>PAN:</strong> {detailEmployee.pan_masked || "—"}</div>
                <div><strong>Aadhaar:</strong> {detailEmployee.aadhaar_masked || "—"}</div>
                <div><strong>Bank Account:</strong> {detailEmployee.bank_account_masked || "—"}</div>
                <div><strong>Bank IFSC:</strong> {detailEmployee.bank_ifsc_masked || "—"}</div>
                <div><strong>EPF UAN:</strong> {detailEmployee.epf_uan || "—"}</div>
                <div><strong>ESIC Number:</strong> {detailEmployee.esic_number || "—"}</div>
              </div>
            </div>

            <div style={{ background: "var(--bg-subtle)", padding: "0.85rem", borderRadius: "6px" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                Compliance &amp; Lifecycle
              </div>
              <div className="grid-cols-2" style={{ fontSize: "0.8rem", gap: "0.5rem 1rem" }}>
                <div>
                  <strong>DPDP Consent:</strong>{" "}
                  {detailEmployee.biometric_consent_at ? (
                    <Badge variant="present">Consented ({new Date(detailEmployee.biometric_consent_at).toLocaleDateString()})</Badge>
                  ) : (
                    <Badge variant="neutral">Pending</Badge>
                  )}
                </div>
                <div><strong>Probation End:</strong> {detailEmployee.probation_end_date || "—"}</div>
                <div><strong>Target Confirmation:</strong> {detailEmployee.confirmation_date || "—"}</div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* CSV Bulk Upload Modal */}
      <Modal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        title="Bulk Employee Ingestion (CSV / Spreadsheet)"
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsBulkOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={bulkRows.length === 0 || !!bulkProgress}
              onClick={executeBulkUpload}
            >
              {bulkProgress ? `Ingesting (${bulkProgress.done}/${bulkProgress.total})…` : `Ingest ${bulkRows.length} Records`}
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="flex justify-between items-center" style={{ background: "var(--bg-subtle)", padding: "0.75rem", borderRadius: "4px" }}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-secondary" />
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Need the standardized format?</div>
                <div className="text-secondary" style={{ fontSize: "0.75rem" }}>Download the template with validated column headers.</div>
              </div>
            </div>
            <button className="ghost small" type="button" onClick={downloadTemplate}>
              Download CSV Template
            </button>
          </div>

          <div>
            <label>Select CSV File</label>
            <input type="file" accept=".csv" onChange={handleFileUpload} />
          </div>

          {bulkErrors.length > 0 ? (
            <div style={{ background: "var(--danger-bg)", color: "var(--danger-fg)", padding: "0.75rem", borderRadius: "4px", fontSize: "0.78rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Pre-flight Validation Warnings:</div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {bulkErrors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {bulkRows.length > 0 ? (
            <div style={{ border: "1px solid var(--border-default)", borderRadius: "4px", padding: "0.75rem" }}>
              <div className="flex justify-between items-center" style={{ marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>Validated Rows Ready ({bulkRows.length})</span>
                <Badge variant="present">Pre-flight Pass</Badge>
              </div>
              <div style={{ maxHeight: "160px", overflowY: "auto", fontSize: "0.78rem" }}>
                {bulkRows.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex justify-between" style={{ padding: "0.2rem 0", borderBottom: "1px solid var(--border-default)" }}>
                    <span>{r.employee_code} · {r.full_name}</span>
                    <span className="text-secondary">{r.designation || "No Designation"}</span>
                  </div>
                ))}
                {bulkRows.length > 5 ? <div className="text-muted" style={{ padding: "0.2rem 0" }}>+ {bulkRows.length - 5} more records…</div> : null}
              </div>
            </div>
          ) : null}

          {bulkProgress ? (
            <div style={{ background: "var(--bg-subtle)", padding: "0.75rem", borderRadius: "4px" }}>
              <div className="flex justify-between" style={{ fontSize: "0.82rem", marginBottom: "0.3rem" }}>
                <span>Uploading batch idempotently…</span>
                <span className="tabular">{bulkProgress.done} of {bulkProgress.total}</span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "var(--border-default)", borderRadius: "3px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
                    background: "var(--action-primary)",
                    transition: "width 150ms ease",
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
