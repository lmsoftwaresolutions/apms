import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Briefcase, Trash2, Power, Filter, UserCheck, ArrowRight, Pencil } from "lucide-react";
import { api, Branch, Department, Designation, EmployeeRow } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { Field } from "../../components/common/Field";
import { LoadingRow } from "../../components/common/Spinner";

export function DesignationsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add / Edit Designation Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete & Deactivate Modals
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Designation | null>(null);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  async function loadData(targetBranchId?: string, targetDeptId?: string) {
    setLoading(true);
    try {
      const branchList = await api.branches();
      setBranches(branchList);
      const defaultBranch = branchList.find((b) => b.is_active) || branchList[0];
      const activeBranchId =
        targetBranchId !== undefined
          ? targetBranchId
          : selectedBranchId || defaultBranch?.id || "";
      setSelectedBranchId(activeBranchId);

      const deptList = await api.departments(activeBranchId || undefined);
      setDepartments(deptList);

      const defaultDept = deptList.find((d) => d.is_active) || deptList[0];
      const activeDeptId =
        targetDeptId !== undefined && targetDeptId !== ""
          ? targetDeptId
          : selectedDeptId && deptList.some((d) => d.id === selectedDeptId)
            ? selectedDeptId
            : defaultDept?.id || "";
      setSelectedDeptId(activeDeptId);

      if (activeDeptId) {
        const desigList = await api.designations(activeDeptId);
        setDesignations(desigList);
        if (can("employee.employee.read")) {
          const empList = await api.employees(activeDeptId, true);
          setEmployees(empList);
        } else {
          setEmployees([]);
        }
      } else {
        setDesignations([]);
        setEmployees([]);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load designations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBranchChange(newBranchId: string) {
    setSelectedBranchId(newBranchId);
    await loadData(newBranchId, "");
  }

  async function handleDeptChange(newDeptId: string) {
    setSelectedDeptId(newDeptId);
    await loadData(selectedBranchId, newDeptId);
  }

  function openCreateModal() {
    setEditingDesig(null);
    setName("");
    setCode("");
    setDescription("");
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditModal(desig: Designation) {
    setEditingDesig(desig);
    setName(desig.name);
    setCode(desig.code);
    setDescription(desig.description || "");
    setFormError("");
    setIsFormOpen(true);
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setEditingDesig(null);
    setFormError("");
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedDesc = description.trim();
    if (!trimmedName || trimmedCode.length < 2) return;
    if (!editingDesig && !selectedDeptId) return;
    setFormSubmitting(true);
    setFormError("");
    try {
      if (editingDesig) {
        await api.updateDesignation(editingDesig.id, {
          name: trimmedName,
          code: trimmedCode,
          description: trimmedDesc || null,
        });
      } else {
        await api.createDesignation(selectedDeptId, trimmedName, trimmedCode, trimmedDesc || null);
      }
      setName("");
      setCode("");
      setDescription("");
      closeFormModal();
      await loadData(selectedBranchId, selectedDeptId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Failed to ${editingDesig ? "update" : "create"} designation`);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleActive(desig: Designation) {
    if (desig.is_active) {
      setDeactivateTarget(desig);
      return;
    }
    try {
      await api.updateDesignation(desig.id, { is_active: true });
      await loadData(selectedBranchId, selectedDeptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update designation status");
    }
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setDeactivateSubmitting(true);
    try {
      await api.updateDesignation(deactivateTarget.id, { is_active: false });
      setDeactivateTarget(null);
      await loadData(selectedBranchId, selectedDeptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate designation");
    } finally {
      setDeactivateSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await api.deleteDesignation(deleteTarget.id);
      setDeleteTarget(null);
      await loadData(selectedBranchId, selectedDeptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete designation");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleAssignEmployee(employeeId: string, designationId: string | null) {
    try {
      await api.assignDesignation(employeeId, designationId);
      await loadData(selectedBranchId, selectedDeptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign employee designation");
    }
  }

  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const selectedDept = departments.find((d) => d.id === selectedDeptId);
  const canCreateUnderSelection =
    Boolean(selectedDeptId) &&
    (selectedBranch ? selectedBranch.is_active : true) &&
    (selectedDept ? selectedDept.is_active : true);

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Designations</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Job positions, titles, and roles configured per department.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {/* Branch & Dept Filters */}
          {branches.length > 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Filter size={16} color="var(--text-muted)" />
              <select
                className="select"
                style={{ width: "auto", minWidth: "160px", padding: "0.45rem 0.75rem" }}
                value={selectedBranchId}
                onChange={(e) => void handleBranchChange(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}){!b.is_active ? " (Inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {departments.length > 0 ? (
            <select
              className="select"
              style={{ width: "auto", minWidth: "160px", padding: "0.45rem 0.75rem" }}
              value={selectedDeptId}
              onChange={(e) => void handleDeptChange(e.target.value)}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code}){!d.is_active ? " (Inactive)" : ""}
                </option>
              ))}
            </select>
          ) : null}

          {can("org.designation.create") ? (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={openCreateModal}
              disabled={!canCreateUnderSelection}
              title={
                !selectedDeptId
                  ? "Please create or select a department first"
                  : !canCreateUnderSelection
                    ? "Cannot add designations under a deactivated branch or department"
                    : undefined
              }
            >
              Add Designation
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-danger-bg)",
            color: "var(--color-danger-fg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {departments.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={24} />}
          title="No departments found"
          description={
            selectedBranch && !selectedBranch.is_active
              ? "This branch is deactivated. Switch to an active branch to create departments and designations."
              : "Designations belong to a department. Create a department first under this branch to begin adding job positions."
          }
          action={
            can("org.department.create") && (!selectedBranch || selectedBranch.is_active)
              ? {
                  label: "Create Department",
                  onClick: () => navigate("/org/departments"),
                  icon: <ArrowRight size={16} />,
                  variant: "primary",
                }
              : undefined
          }
        />
      ) : !loading && designations.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={24} />}
          title="No designations in this department"
          description={
            !canCreateUnderSelection
              ? "This branch or department is deactivated. Re-activate it or select an active department to add designations."
              : "Add job designations (e.g., Spinning Operator, Line Supervisor, QA Inspector)."
          }
          action={
            can("org.designation.create") && canCreateUnderSelection
              ? {
                  label: "Add Designation",
                  onClick: openCreateModal,
                  icon: <Plus size={16} />,
                }
              : undefined
          }
        />
      ) : (
        <div className="table-container" style={{ marginBottom: "2rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "120px" }}>Code</th>
                <th>Designation Title</th>
                <th>Department</th>
                <th>Description</th>
                <th style={{ width: "120px" }}>Status</th>
                <th style={{ width: "260px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow cols={6} rows={4} />
              ) : (
                designations.map((desig) => (
                  <tr key={desig.id}>
                    <td>
                      <code style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{desig.code}</code>
                    </td>
                    <td style={{ fontWeight: 550 }}>{desig.name}</td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {deptNameById.get(desig.department_id) || desig.department_id.slice(0, 8)}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      {desig.description || "—"}
                    </td>
                    <td>
                      <Badge variant={desig.is_active ? "success" : "neutral"}>
                        {desig.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        {can("org.designation.update") ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Pencil size={14} />}
                              onClick={() => openEditModal(desig)}
                              title="Edit designation"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Power size={14} />}
                              onClick={() => handleToggleActive(desig)}
                            >
                              {desig.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        ) : null}
                        {can("org.designation.delete") ? (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => setDeleteTarget(desig)}
                            title="Delete designation"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee Assignment Section */}
      {can("employee.employee.update") && employees.length > 0 ? (
        <div className="card-panel">
          <div className="card-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                Assign Designations to Employees
              </h3>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Map active designations to employees in this department.
              </p>
            </div>
            <Badge variant="info">
              {employees.length} employee{employees.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
            {employees.map((emp) => (
              <div
                key={emp.id}
                style={{
                  padding: "0.875rem 1rem",
                  border: "1px solid var(--border-default)",
                  borderRadius: "0.375rem",
                  backgroundColor: "var(--bg-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{emp.full_name}</span>
                  <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{emp.employee_code}</code>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <UserCheck size={16} color="var(--text-muted)" />
                  <select
                    className="select"
                    style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
                    value={emp.designation_id || ""}
                    onChange={(e) => void handleAssignEmployee(emp.id, e.target.value || null)}
                  >
                    <option value="">No Designation</option>
                    {designations
                      .filter((d) => d.is_active || d.id === emp.designation_id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code}){!d.is_active ? " (Inactive)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Add / Edit Designation Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        title={editingDesig ? "Edit Designation" : "Add Designation"}
        description={
          editingDesig
            ? `Update title, code, or scope for ${editingDesig.name} in ${deptNameById.get(editingDesig.department_id) || "department"}.`
            : `Add a job title to ${deptNameById.get(selectedDeptId) || "the department"}.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeFormModal} disabled={formSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => handleFormSubmit(e as unknown as FormEvent)}
              loading={formSubmitting}
              disabled={!name.trim() || code.trim().length < 2 || (!editingDesig && !selectedDeptId)}
            >
              {editingDesig ? "Save Changes" : "Create Designation"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {formError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {formError}
            </div>
          ) : null}

          <Field label="Designation Title" required help="e.g. Spinning Operator, Quality Assurance Inspector">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Technician"
              required
            />
          </Field>

          <Field label="Designation Code" required help="Unique identifier, e.g. TECH-SR">
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. OPR-SPIN"
              required
            />
          </Field>

          <Field label="Description (Optional)" help="Scope of duties, responsibility level">
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Responsible for first-line loom operation"
            />
          </Field>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Designation"
        message={
          <>
            Are you sure you want to delete designation <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
            This will fail if any employees are currently assigned to this position.
          </>
        }
        confirmText="Delete Designation"
        loading={deleteSubmitting}
      />

      {/* Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Designation"
        message={
          <>
            Are you sure you want to deactivate <strong>{deactivateTarget?.name} ({deactivateTarget?.code})</strong>?
            Deactivated designations cannot be assigned to new employees.
          </>
        }
        confirmText="Deactivate Designation"
        loading={deactivateSubmitting}
      />
    </div>
  );
}
